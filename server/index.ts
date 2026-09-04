import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";
import { auth, role, sign } from "./auth.js";
import { haversineKm, round1 } from "./geo.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "8mb" }));

async function getSettings() {
  const result = await pool.query("SELECT key,value FROM settings");
  const rows = result.rows as any[];
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
}

async function calcPrice(
  distanceKm: number,
  offeredPrice?: number | null
) {
  if (offeredPrice !== null && offeredPrice !== undefined) {
    return Number(offeredPrice);
  }

  const s = await getSettings();

  return (
    s.base_price +
    Math.max(0, distanceKm - s.base_distance_km) *
      s.extra_km_price
  );
}

function sanitizeForCourier(rows: any[]) {
  return rows.map(({ confirmation_code, ...rest }) => rest);
}

async function recordStatus(orderId: string, status: string) {
  await pool.query(
    "INSERT INTO order_status_history VALUES($1,$2,$3,$4)",
    [
      crypto.randomUUID(),
      orderId,
      status,
      new Date().toISOString(),
    ]
  );
}

async function attachCourierInfo(order: any) {
  if (!order.courier_id) return order;

  const c: any = (
    await pool.query(
      `SELECT
        name,
        phone,
        online,
        lat,
        lng,
        location_updated_at
       FROM users
       WHERE id=$1`,
      [order.courier_id]
    )
  ).rows[0];

  if (!c) return order;

  return {
    ...order,
    courier: {
      name: c.name,
      phone: c.phone,
      online: !!c.online,
      lat: c.lat,
      lng: c.lng,
      location_updated_at: c.location_updated_at,
    },
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// =====================================================
// AUTH
// =====================================================

app.post("/api/auth/register", async (req, res) => {
  const {
    name,
    password,
    phone,
    role: r = "customer",
    idCard,
  } = req.body;

  const normalizedPhone = String(phone || "").trim();

  if (
    !name ||
    !normalizedPhone ||
    !password ||
    password.length < 6
  ) {
    return res.status(400).json({
      error:
        "تحقق من الاسم ورقم الهاتف وكلمة المرور",
    });
  }

  if (!["customer", "courier"].includes(r)) {
    return res.status(400).json({
      error: "الدور غير صالح",
    });
  }

  let idCardBuffer: Buffer | null = null;
  let idCardMime: string | null = null;

  // بطاقة التعريف مطلوبة للمندوب
  if (r === "courier") {
    if (!idCard?.data || !idCard?.mime) {
      return res.status(400).json({
        error: "بطاقة التعريف مطلوبة للمندوب",
      });
    }

    const allowedMime = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedMime.includes(idCard.mime)) {
      return res.status(400).json({
        error: "صيغة بطاقة التعريف غير مدعومة",
      });
    }

    try {
      idCardBuffer = Buffer.from(
        idCard.data,
        "base64"
      );
    } catch {
      return res.status(400).json({
        error: "ملف بطاقة التعريف غير صالح",
      });
    }

    // الحد الأقصى 4 ميغابايت
    if (idCardBuffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({
        error:
          "حجم بطاقة التعريف يجب ألا يتجاوز 4MB",
      });
    }

    idCardMime = idCard.mime;
  }

  try {
    const existing = (
      await pool.query(
        "SELECT id FROM users WHERE phone=$1",
        [normalizedPhone]
      )
    ).rows[0];

    if (existing) {
      return res.status(409).json({
        error: "رقم الهاتف مستخدم بالفعل",
      });
    }

    const id = crypto.randomUUID();

    // العميل يعتمد مباشرة
    // المندوب يحتاج موافقة الإدارة
    const approved = r === "customer" ? 1 : 0;

    await pool.query(
      `INSERT INTO users(
        id,
        name,
        email,
        phone,
        password_hash,
        role,
        created_at,
        online,
        approved,
        id_card_data,
        id_card_mime
      )
      VALUES(
        $1,
        $2,
        NULL,
        $3,
        $4,
        $5,
        $6,
        0,
        $7,
        $8,
        $9
      )`,
      [
        id,
        String(name).trim(),
        normalizedPhone,
        bcrypt.hashSync(password, 12),
        r,
        new Date().toISOString(),
        approved,
        idCardBuffer,
        idCardMime,
      ]
    );

    const user = {
      id,
      name: String(name).trim(),
      email: null,
      phone: normalizedPhone,
      role: r,
    };

    res.json({
      token: sign(user as any),
      user,
      approved: !!approved,
    });
  } catch (err) {
    console.error("Register error:", err);

    res.status(500).json({
      error: "تعذر إنشاء الحساب",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const phone = String(
    req.body.phone || ""
  ).trim();

  const row: any = (
    await pool.query(
      "SELECT * FROM users WHERE phone=$1",
      [phone]
    )
  ).rows[0];

  if (
    !row ||
    !bcrypt.compareSync(
      req.body.password || "",
      row.password_hash
    )
  ) {
    return res.status(401).json({
      error:
        "رقم الهاتف أو كلمة المرور غير صحيحة",
    });
  }

  const user = {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone,
    role: row.role,
  };

  res.json({
    token: sign(user as any),
    user,
    approved: !!row.approved,
  });
});

app.get("/api/auth/me", auth, async (req, res) => {
  const row: any = (
    await pool.query(
      "SELECT approved, online FROM users WHERE id=$1",
      [req.user!.id]
    )
  ).rows[0];

  res.json({
    user: req.user,
    approved: !!row?.approved,
    online: !!row?.online,
  });
});

// =====================================================
// COURIER PRESENCE & LOCATION
// =====================================================

app.patch(
  "/api/couriers/me/status",
  auth,
  role("courier"),
  async (req, res) => {
    const online = req.body.online ? 1 : 0;

    await pool.query(
      "UPDATE users SET online=$1 WHERE id=$2",
      [online, req.user!.id]
    );

    res.json({
      ok: true,
      online: !!online,
    });
  }
);

app.patch(
  "/api/couriers/me/location",
  auth,
  role("courier"),
  async (req, res) => {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return res.status(400).json({
        error: "إحداثيات غير صالحة",
      });
    }

    await pool.query(
      `UPDATE users
       SET lat=$1,
           lng=$2,
           location_updated_at=$3
       WHERE id=$4`,
      [
        lat,
        lng,
        new Date().toISOString(),
        req.user!.id,
      ]
    );

    res.json({ ok: true });
  }
);

app.get(
  "/api/couriers/me/stats",
  auth,
  role("courier"),
  async (req, res) => {
    const row: any = (
      await pool.query(
        `SELECT
          COUNT(*) c,
          COALESCE(SUM(final_price),0) r
         FROM orders
         WHERE courier_id=$1
           AND status='completed'`,
        [req.user!.id]
      )
    ).rows[0];

    const s = await getSettings();

    const commissionPercent =
      s.commission_percent ?? 20;

    const totalRevenue = row.r;

    const appCommission = Math.round(
      totalRevenue *
        (commissionPercent / 100)
    );

    const courierEarnings =
      totalRevenue - appCommission;

    res.json({
      ordersCount: row.c,
      totalRevenue,
      appCommission,
      courierEarnings,
    });
  }
);

// =====================================================
// ORDERS
// =====================================================

app.get("/api/orders", auth, async (req, res) => {
  const u = req.user!;

  let rows: any[];

  if (u.role === "customer") {
    rows = (
      await pool.query(
        `SELECT *
         FROM orders
         WHERE customer_id=$1
         ORDER BY created_at DESC`,
        [u.id]
      )
    ).rows;

    rows = await Promise.all(
      rows.map(attachCourierInfo)
    );
  } else if (u.role === "courier") {
    rows = (
      await pool.query(
        `SELECT *
         FROM orders
         WHERE status='pending'
            OR courier_id=$1
         ORDER BY created_at DESC`,
        [u.id]
      )
    ).rows;

    const me: any = (
      await pool.query(
        "SELECT lat,lng FROM users WHERE id=$1",
        [u.id]
      )
    ).rows[0];

    if (
      me?.lat != null &&
      me?.lng != null
    ) {
      rows = rows.map((o) => {
        if (
          o.pickup_lat != null &&
          o.pickup_lng != null
        ) {
          return {
            ...o,
            distance_from_me_km:
              round1(
                haversineKm(
                  me.lat,
                  me.lng,
                  o.pickup_lat,
                  o.pickup_lng
                )
              ),
          };
        }

        return o;
      });

      rows.sort((a, b) => {
        if (
          a.status === "pending" &&
          b.status === "pending"
        ) {
          const da =
            a.distance_from_me_km ??
            Infinity;

          const db_ =
            b.distance_from_me_km ??
            Infinity;

          return da - db_;
        }

        return 0;
      });
    }

    rows = sanitizeForCourier(rows);
  } else {
    rows = (
      await pool.query(
        "SELECT * FROM orders ORDER BY created_at DESC"
      )
    ).rows;
  }

  res.json({ orders: rows });
});

app.get(
  "/api/orders/:id",
  auth,
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (!o) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    const u = req.user!;

    if (u.role === "customer") {
      if (o.customer_id !== u.id) {
        return res.status(403).json({
          error: "غير مصرح",
        });
      }

      return res.json({
        order: await attachCourierInfo(o),
      });
    }

    if (u.role === "courier") {
      if (
        o.status !== "pending" &&
        o.courier_id !== u.id
      ) {
        return res.status(403).json({
          error: "غير مصرح",
        });
      }

      return res.json({
        order:
          sanitizeForCourier([o])[0],
      });
    }

    res.json({
      order: await attachCourierInfo(o),
    });
  }
);

app.get(
  "/api/orders/:id/timeline",
  auth,
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (!o) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    const u = req.user!;

    const allowed =
      u.role === "admin" ||
      o.customer_id === u.id ||
      o.courier_id === u.id;

    if (!allowed) {
      return res.status(403).json({
        error: "غير مصرح",
      });
    }

    const history = (
      await pool.query(
        `SELECT status, created_at
         FROM order_status_history
         WHERE order_id=$1
         ORDER BY created_at ASC`,
        [req.params.id]
      )
    ).rows;

    res.json({ history });
  }
);

app.get(
  "/api/orders/:id/nearby-couriers-count",
  auth,
  role("customer"),
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (
      !o ||
      o.customer_id !== req.user!.id
    ) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    if (
      o.pickup_lat == null ||
      o.pickup_lng == null
    ) {
      return res.json({
        count: null,
      });
    }

    const s = await getSettings();

    const couriers: any[] = (
      await pool.query(
        `SELECT lat,lng
         FROM users
         WHERE role='courier'
           AND online=1
           AND approved=1
           AND lat IS NOT NULL`
      )
    ).rows;

    const count = couriers.filter(
      (c) =>
        haversineKm(
          o.pickup_lat,
          o.pickup_lng,
          c.lat,
          c.lng
        ) <= s.search_radius_km
    ).length;

    res.json({ count });
  }
);

app.post(
  "/api/orders",
  auth,
  role("customer"),
  async (req, res) => {
    const {
      pickup_address,
      delivery_address,
      pickup_lat,
      pickup_lng,
      delivery_lat,
      delivery_lng,
      distance_km,
      offered_price,
      package_description,
      recipient_phone,
      notes,
    } = req.body;

    if (
      !pickup_address ||
      !delivery_address
    ) {
      return res.status(400).json({
        error: "العناوين مطلوبة",
      });
    }

    let d: number;

    const hasCoords = [
      pickup_lat,
      pickup_lng,
      delivery_lat,
      delivery_lng,
    ].every(
      (v) =>
        v !== undefined &&
        v !== null &&
        Number.isFinite(Number(v))
    );

    if (hasCoords) {
      d = round1(
        haversineKm(
          Number(pickup_lat),
          Number(pickup_lng),
          Number(delivery_lat),
          Number(delivery_lng)
        )
      );
    } else if (
      distance_km !== undefined &&
      distance_km !== null
    ) {
      d = Number(distance_km);
    } else {
      return res.status(400).json({
        error:
          "حدّد الموقعين على الخريطة أو أدخل المسافة",
      });
    }

    const price = await calcPrice(
      d,
      offered_price
    );

    const id = crypto.randomUUID();

    const now =
      new Date().toISOString();

    const code = String(
      Math.floor(
        100000 +
          Math.random() * 900000
      )
    );

    await pool.query(
      `INSERT INTO orders(
        id,
        customer_id,
        pickup_address,
        delivery_address,
        pickup_lat,
        pickup_lng,
        delivery_lat,
        delivery_lng,
        distance_km,
        package_description,
        recipient_phone,
        notes,
        offered_price,
        final_price,
        status,
        confirmation_code,
        created_at,
        updated_at
      )
      VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18
      )`,
      [
        id,
        req.user!.id,
        pickup_address,
        delivery_address,
        hasCoords
          ? Number(pickup_lat)
          : null,
        hasCoords
          ? Number(pickup_lng)
          : null,
        hasCoords
          ? Number(delivery_lat)
          : null,
        hasCoords
          ? Number(delivery_lng)
          : null,
        d,
        package_description || null,
        recipient_phone || null,
        notes || null,
        offered_price ?? null,
        price,
        "pending",
        code,
        now,
        now,
      ]
    );

    await recordStatus(
      id,
      "pending"
    );

    res.json({
      ok: true,
      id,
      final_price: price,
      distance_km: d,
      confirmation_code: code,
    });
  }
);

app.post(
  "/api/orders/:id/accept",
  auth,
  role("courier"),
  async (req, res) => {
    const me: any = (
      await pool.query(
        "SELECT approved FROM users WHERE id=$1",
        [req.user!.id]
      )
    ).rows[0];

    if (!me?.approved) {
      return res.status(403).json({
        error:
          "حسابك بانتظار اعتماد الإدارة قبل قبول الطلبات",
      });
    }

    const r = await pool.query(
      `UPDATE orders
       SET courier_id=$1,
           status='accepted',
           updated_at=$2
       WHERE id=$3
         AND status='pending'`,
      [
        req.user!.id,
        new Date().toISOString(),
        req.params.id,
      ]
    );

    if (!r.rowCount) {
      return res.status(409).json({
        error: "الطلب غير متاح",
      });
    }

    await recordStatus(
      req.params.id as string,
      "accepted"
    );

    res.json({ ok: true });
  }
);

app.post(
  "/api/orders/:id/pickup",
  auth,
  role("courier"),
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (
      !o ||
      o.courier_id !== req.user!.id
    ) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    if (o.status !== "accepted") {
      return res.status(409).json({
        error: "حالة الطلب غير صالحة",
      });
    }

    await pool.query(
      `UPDATE orders
       SET status='picked_up',
           updated_at=$1
       WHERE id=$2`,
      [
        new Date().toISOString(),
        req.params.id,
      ]
    );

    await recordStatus(
      req.params.id as string,
      "picked_up"
    );

    res.json({ ok: true });
  }
);

app.post(
  "/api/orders/:id/unassign",
  auth,
  role("courier"),
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (
      !o ||
      o.courier_id !== req.user!.id
    ) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    if (o.status !== "accepted") {
      return res.status(409).json({
        error:
          "لا يمكن التراجع عن هذا الطلب الآن",
      });
    }

    await pool.query(
      `UPDATE orders
       SET courier_id=NULL,
           status='pending',
           updated_at=$1
       WHERE id=$2`,
      [
        new Date().toISOString(),
        req.params.id,
      ]
    );

    await recordStatus(
      req.params.id as string,
      "pending"
    );

    res.json({ ok: true });
  }
);

app.post(
  "/api/orders/:id/cancel",
  auth,
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (!o) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    const u = req.user!;

    const allowed =
      u.role === "admin" ||
      (u.role === "customer" &&
        o.customer_id === u.id);

    if (!allowed) {
      return res.status(403).json({
        error: "غير مصرح",
      });
    }

    if (
      !["pending", "accepted"].includes(
        o.status
      )
    ) {
      return res.status(409).json({
        error:
          "لا يمكن إلغاء هذا الطلب",
      });
    }

    await pool.query(
      `UPDATE orders
       SET status='cancelled',
           updated_at=$1
       WHERE id=$2`,
      [
        new Date().toISOString(),
        req.params.id,
      ]
    );

    await recordStatus(
      req.params.id as string,
      "cancelled"
    );

    res.json({ ok: true });
  }
);

app.post(
  "/api/orders/:id/deliver",
  auth,
  role("courier"),
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (
      !o ||
      o.courier_id !== req.user!.id
    ) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    if (o.status !== "picked_up") {
      return res.status(409).json({
        error: "حالة الطلب غير صالحة",
      });
    }

    await pool.query(
      `UPDATE orders
       SET status='delivered',
           updated_at=$1
       WHERE id=$2`,
      [
        new Date().toISOString(),
        req.params.id,
      ]
    );

    await recordStatus(
      req.params.id as string,
      "delivered"
    );

    res.json({ ok: true });
  }
);

// =====================================================
// RATINGS
// =====================================================

app.post(
  "/api/orders/:id/rate",
  auth,
  role("customer"),
  async (req, res) => {
    const o: any = (
      await pool.query(
        "SELECT * FROM orders WHERE id=$1",
        [req.params.id]
      )
    ).rows[0];

    if (
      !o ||
      o.customer_id !== req.user!.id
    ) {
      return res.status(404).json({
        error: "الطلب غير موجود",
      });
    }

    if (o.status !== "delivered") {
      return res.status(409).json({
        error: "لا يمكن التقييم الآن",
      });
    }

    const stars = Number(
      req.body.stars
    );

    if (
      !stars ||
      stars < 1 ||
      stars > 5
    ) {
      return res.status(400).json({
        error: "التقييم غير صالح",
      });
    }

    const existing = (
      await pool.query(
        "SELECT id FROM ratings WHERE order_id=$1",
        [o.id]
      )
    ).rows[0];

    if (existing) {
      return res.status(409).json({
        error: "تم التقييم مسبقًا",
      });
    }

    await pool.query(
      "INSERT INTO ratings VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        crypto.randomUUID(),
        o.id,
        o.customer_id,
        o.courier_id,
        stars,
        req.body.comment || null,
        new Date().toISOString(),
      ]
    );

    await pool.query(
      `UPDATE orders
       SET status='completed',
           updated_at=$1
       WHERE id=$2`,
      [
        new Date().toISOString(),
        o.id,
      ]
    );

    await recordStatus(
      o.id,
      "completed"
    );

    res.json({ ok: true });
  }
);

app.get(
  "/api/couriers/:id/ratings",
  auth,
  async (req, res) => {
    const rows: any[] = (
      await pool.query(
        `SELECT stars,comment,created_at
         FROM ratings
         WHERE courier_id=$1
         ORDER BY created_at DESC`,
        [req.params.id]
      )
    ).rows;

    const avg = rows.length
      ? rows.reduce(
          (s, x) => s + x.stars,
          0
        ) / rows.length
      : 0;

    res.json({
      ratings: rows,
      average:
        Math.round(avg * 10) / 10,
      count: rows.length,
    });
  }
);

// =====================================================
// COMPLAINTS
// =====================================================

app.post(
  "/api/complaints",
  auth,
  async (req, res) => {
    const {
      order_id,
      message,
    } = req.body;

    if (!message) {
      return res.status(400).json({
        error: "الرسالة مطلوبة",
      });
    }

    const now =
      new Date().toISOString();

    await pool.query(
      "INSERT INTO complaints VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        crypto.randomUUID(),
        order_id || null,
        req.user!.id,
        message,
        "pending",
        null,
        now,
        now,
      ]
    );

    res.json({ ok: true });
  }
);

app.get(
  "/api/complaints",
  auth,
  async (req, res) => {
    const u = req.user!;

    const rows =
      u.role === "admin"
        ? (
            await pool.query(
              `SELECT *
               FROM complaints
               ORDER BY created_at DESC`
            )
          ).rows
        : (
            await pool.query(
              `SELECT *
               FROM complaints
               WHERE user_id=$1
               ORDER BY created_at DESC`,
              [u.id]
            )
          ).rows;

    res.json({ complaints: rows });
  }
);

app.patch(
  "/api/complaints/:id",
  auth,
  role("admin"),
  async (req, res) => {
    const {
      status,
      response,
    } = req.body;

    await pool.query(
      `UPDATE complaints
       SET status=$1,
           response=$2,
           updated_at=$3
       WHERE id=$4`,
      [
        status || "resolved",
        response || null,
        new Date().toISOString(),
        req.params.id,
      ]
    );

    res.json({ ok: true });
  }
);

// =====================================================
// ADMIN
// =====================================================

app.get(
  "/api/admin/users",
  auth,
  role("admin"),
  async (_req, res) => {
    const rows = (
      await pool.query(
        `SELECT
          id,
          name,
          email,
          phone,
          role,
          created_at,
          online,
          approved
         FROM users
         ORDER BY created_at DESC`
      )
    ).rows;

    res.json({ users: rows });
  }
);

app.get(
  "/api/admin/couriers",
  auth,
  role("admin"),
  async (_req, res) => {
    const rows = (
      await pool.query(
        `SELECT
          id,
          name,
          email,
          phone,
          created_at,
          online,
          approved,
          lat,
          lng,
          location_updated_at,
          (id_card_data IS NOT NULL) AS has_id_card
         FROM users
         WHERE role='courier'
         ORDER BY created_at DESC`
      )
    ).rows;

    res.json({ couriers: rows });
  }
);

// عرض بطاقة تعريف المندوب للأدمن فقط
app.get(
  "/api/admin/couriers/:id/id-card",
  auth,
  role("admin"),
  async (req, res) => {
    const row: any = (
      await pool.query(
        `SELECT
          id_card_data,
          id_card_mime
         FROM users
         WHERE id=$1
           AND role='courier'`,
        [req.params.id]
      )
    ).rows[0];

    if (!row?.id_card_data) {
      return res.status(404).json({
        error:
          "بطاقة التعريف غير موجودة",
      });
    }

    res.setHeader(
      "Content-Type",
      row.id_card_mime ||
        "application/octet-stream"
    );

    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    res.send(row.id_card_data);
  }
);

app.patch(
  "/api/admin/couriers/:id/approve",
  auth,
  role("admin"),
  async (req, res) => {
    const approved =
      req.body.approved ? 1 : 0;

    const r = await pool.query(
      `UPDATE users
       SET approved=$1
       WHERE id=$2
         AND role='courier'`,
      [
        approved,
        req.params.id,
      ]
    );

    if (!r.rowCount) {
      return res.status(404).json({
        error: "المندوب غير موجود",
      });
    }

    res.json({
      ok: true,
      approved: !!approved,
    });
  }
);

app.get(
  "/api/admin/settings",
  auth,
  role("admin"),
  async (_req, res) => {
    res.json({
      settings: await getSettings(),
    });
  }
);

app.patch(
  "/api/admin/settings",
  auth,
  role("admin"),
  async (req, res) => {
    const updates =
      req.body as Record<
        string,
        number
      >;

    const stmt =
      `INSERT INTO settings(key,value)
       VALUES($1,$2)
       ON CONFLICT(key)
       DO UPDATE SET value=excluded.value`;

    for (const [
      k,
      v,
    ] of Object.entries(updates)) {
      await pool.query(
        stmt,
        [k, String(v)]
      );
    }

    res.json({
      ok: true,
      settings:
        await getSettings(),
    });
  }
);

app.get(
  "/api/admin/stats",
  auth,
  role("admin"),
  async (_req, res) => {
    const ordersByStatus = (
      await pool.query(
        `SELECT status, COUNT(*) c
         FROM orders
         GROUP BY status`
      )
    ).rows;

    const usersByRole = (
      await pool.query(
        `SELECT role, COUNT(*) c
         FROM users
         GROUP BY role`
      )
    ).rows;

    const revenue: any = (
      await pool.query(
        `SELECT
          COALESCE(SUM(final_price),0) r
         FROM orders
         WHERE status='completed'`
      )
    ).rows[0];

    const activeOrders: any = (
      await pool.query(
        `SELECT COUNT(*) c
         FROM orders
         WHERE status IN
           ('pending','accepted','picked_up')`
      )
    ).rows[0];

    const couriersOnline: any = (
      await pool.query(
        `SELECT COUNT(*) c
         FROM users
         WHERE role='courier'
           AND online=1
           AND approved=1`
      )
    ).rows[0];

    const couriersApproved: any = (
      await pool.query(
        `SELECT COUNT(*) c
         FROM users
         WHERE role='courier'
           AND approved=1`
      )
    ).rows[0];

    const couriersPending: any = (
      await pool.query(
        `SELECT COUNT(*) c
         FROM users
         WHERE role='courier'
           AND approved=0`
      )
    ).rows[0];

    res.json({
      ordersByStatus,
      usersByRole,
      revenue: revenue.r,
      activeOrders:
        activeOrders.c,
      couriersOnline:
        couriersOnline.c,
      couriersApproved:
        couriersApproved.c,
      couriersPending:
        couriersPending.c,
    });
  }
);

// =====================================================
// SERVE FRONTEND
// =====================================================

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const distPath = path.resolve(
  __dirname,
  "..",
  "dist"
);

app.use(
  express.static(distPath)
);

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      error: "Not found",
    });
  }

  res.sendFile(
    path.join(
      distPath,
      "index.html"
    )
  );
});

app.listen(
  Number(process.env.PORT) || 4000,
  "0.0.0.0",
  () =>
    console.log(
      "Wassli API running"
    )
);
