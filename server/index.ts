import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { auth, role, sign } from "./auth.js";
import { haversineKm, round1 } from "./geo.js";

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Auto-Initialize Admin Account ----------
async function initAdmin() {
  try {
    const adminEmail = "ess1994dz@outlook.sa";
    const rawPassword = "Hh24071994@";

    const existingAdmin: any = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);

    if (!existingAdmin) {
      const hashedPassword = bcrypt.hashSync(rawPassword, 12);
      db.prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, created_at, online, approved)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
      `).run(
        crypto.randomUUID(),
        "Administrator",
        adminEmail,
        "0000000000",
        hashedPassword,
        "admin",
        new Date().toISOString()
      );
      console.log("✅ Admin account created successfully!");
    } else {
      const hashedPassword = bcrypt.hashSync(rawPassword, 12);
      db.prepare(`
        UPDATE users 
        SET password_hash = ?, role = 'admin', approved = 1 
        WHERE email = ?
      `).run(hashedPassword, adminEmail);
      console.log("ℹ️ Admin account verified and updated.");
    }
  } catch (error) {
    console.error("❌ Error initializing admin user:", error);
  }
}

// Execute admin check upon startup
initAdmin();

function getSettings() {
  const rows = db.prepare("SELECT key,value FROM settings").all() as any[];
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
}

function calcPrice(distanceKm: number, offeredPrice?: number | null) {
  if (offeredPrice !== null && offeredPrice !== undefined) return Number(offeredPrice);
  const s = getSettings();
  return s.base_price + Math.max(0, distanceKm - s.base_distance_km) * s.extra_km_price;
}

// Couriers must never see the confirmation code before delivery is confirmed.
function sanitizeForCourier(rows: any[]) {
  return rows.map(({ confirmation_code, ...rest }) => rest);
}

function recordStatus(orderId: string, status: string) {
  db.prepare("INSERT INTO order_status_history VALUES(?,?,?,?)").run(
    crypto.randomUUID(),
    orderId,
    status,
    new Date().toISOString()
  );
}

// Attaches assigned-courier contact + live location to an order, ONLY for
// the customer who owns it, and ONLY once a courier is actually assigned
// (never for still-pending orders — there is no assigned courier to show,
// and we must never leak an unrelated courier's location).
function attachCourierInfo(order: any) {
  if (!order.courier_id) return order;
  const c: any = db
    .prepare("SELECT name, phone, online, lat, lng, location_updated_at FROM users WHERE id=?")
    .get(order.courier_id);
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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---------- Auth ----------
app.post("/api/auth/register", (req, res) => {
  const { name, email, password, phone, role: r = "customer" } = req.body;
  if (!name || !email || !password || !phone || password.length < 6)
    return res.status(400).json({ error: "تحقق من البيانات" });
  if (!["customer", "courier"].includes(r)) return res.status(400).json({ error: "الدور غير صالح" });
  try {
    const id = crypto.randomUUID();
    // Couriers must be approved by an admin before they can accept orders;
    // customers (and admins, seeded separately) are approved by default.
    const approved = r === "customer" ? 1 : 0;
    db.prepare(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at,online,approved) VALUES(?,?,?,?,?,?,?,0,?)"
    ).run(
      id,
      name,
      String(email).toLowerCase(),
      phone,
      bcrypt.hashSync(password, 12),
      r,
      new Date().toISOString(),
      approved
    );
    const user = { id, name, email: String(email).toLowerCase(), phone, role: r };
    res.json({ token: sign(user as any), user, approved: !!approved });
  } catch {
    res.status(409).json({ error: "البريد مستخدم بالفعل" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const row: any = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(String(req.body.email || "").toLowerCase());
  if (!row || !bcrypt.compareSync(req.body.password || "", row.password_hash))
    return res.status(401).json({ error: "البريد أو كلمة المرور غير صحيحة" });
  const user = { id: row.id, name: row.name, email: row.email, phone: row.phone, role: row.role };
  res.json({ token: sign(user as any), user, approved: !!row.approved });
});

app.get("/api/auth/me", auth, (req, res) => {
  const row: any = db.prepare("SELECT approved, online FROM users WHERE id=?").get(req.user!.id);
  res.json({ user: req.user, approved: !!row?.approved, online: !!row?.online });
});

// ---------- Courier presence & location ----------
app.patch("/api/couriers/me/status", auth, role("courier"), (req, res) => {
  const online = req.body.online ? 1 : 0;
  db.prepare("UPDATE users SET online=? WHERE id=?").run(online, req.user!.id);
  res.json({ ok: true, online: !!online });
});

app.patch("/api/couriers/me/location", auth, role("courier"), (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "إحداثيات غير صالحة" });
  db.prepare("UPDATE users SET lat=?,lng=?,location_updated_at=? WHERE id=?").run(
    lat,
    lng,
    new Date().toISOString(),
    req.user!.id
  );
  res.json({ ok: true });
});

// ---------- Orders ----------
app.get("/api/orders", auth, (req, res) => {
  const u = req.user!;
  let rows: any[];
  if (u.role === "customer") {
    rows = db.prepare("SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC").all(u.id);
    rows = rows.map(attachCourierInfo);
  } else if (u.role === "courier") {
    rows = db
      .prepare("SELECT * FROM orders WHERE status='pending' OR courier_id=? ORDER BY created_at DESC")
      .all(u.id);
    const me: any = db.prepare("SELECT lat,lng FROM users WHERE id=?").get(u.id);
    if (me?.lat != null && me?.lng != null) {
      rows = rows.map((o) => {
        if (o.pickup_lat != null && o.pickup_lng != null) {
          return { ...o, distance_from_me_km: round1(haversineKm(me.lat, me.lng, o.pickup_lat, o.pickup_lng)) };
        }
        return o;
      });
      rows.sort((a, b) => {
        if (a.status === "pending" && b.status === "pending") {
          const da = a.distance_from_me_km ?? Infinity;
          const db_ = b.distance_from_me_km ?? Infinity;
          return da - db_;
        }
        return 0;
      });
    }
    rows = sanitizeForCourier(rows);
  } else {
    rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  }
  res.json({ orders: rows });
});

app.get("/api/orders/:id", auth, (req, res) => {
  const o: any = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
  const u = req.user!;
  if (u.role === "customer") {
    if (o.customer_id !== u.id) return res.status(403).json({ error: "غير مصرح" });
    return res.json({ order: attachCourierInfo(o) });
  }
  if (u.role === "courier") {
    if (o.status !== "pending" && o.courier_id !== u.id) return res.status(403).json({ error: "غير مصرح" });
    return res.json({ order: sanitizeForCourier([o])[0] });
  }
  res.json({ order: attachCourierInfo(o) });
});

app.get("/api/orders/:id/timeline", auth, (req, res) => {
  const o: any = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
  const u = req.user!;
  const allowed = u.role === "admin" || o.customer_id === u.id || o.courier_id === u.id;
  if (!allowed) return res.status(403).json({ error: "غير مصرح" });
  const history = db
    .prepare("SELECT status, created_at FROM order_status_history WHERE order_id=? ORDER BY created_at ASC")
    .all(req.params.id);
  res.json({ history });
});

// Privacy-safe: while an order is still pending, the customer can see HOW
// MANY online/approved couriers are near the pickup point, but never who
// they are or where exactly — matching "no location of an unrelated
// courier is ever shown to the customer".
app.get("/api/orders/:id/nearby-couriers-count", auth, role("customer"), (req, res) => {
  const o: any = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o || o.customer_id !== req.user!.id) return res.status(404).json({ error: "الطلب غير موجود" });
  if (o.pickup_lat == null || o.pickup_lng == null) return res.json({ count: null });
  const s = getSettings();
  const couriers: any[] = db
    .prepare("SELECT lat,lng FROM users WHERE role='courier' AND online=1 AND approved=1 AND lat IS NOT NULL")
    .all();
  const count = couriers.filter((c) => haversineKm(o.pickup_lat, o.pickup_lng, c.lat, c.lng) <= s.search_radius_km).length;
  res.json({ count });
});

app.post("/api/orders", auth, role("customer"), (req, res) => {
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
  if (!pickup_address || !delivery_address) return res.status(400).json({ error: "العناوين مطلوبة" });

  let d: number;
  const hasCoords = [pickup_lat, pickup_lng, delivery_lat, delivery_lng].every(
    (v) => v !== undefined && v !== null && Number.isFinite(Number(v))
  );
  if (hasCoords) {
    d = round1(haversineKm(Number(pickup_lat), Number(pickup_lng), Number(delivery_lat), Number(delivery_lng)));
  } else if (distance_km !== undefined && distance_km !== null) {
    d = Number(distance_km);
  } else {
    return res.status(400).json({ error: "حدّد الموقعين على الخريطة أو أدخل المسافة" });
  }

  const price = calcPrice(d, offered_price);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare(
    `INSERT INTO orders(
      id,customer_id,pickup_address,delivery_address,pickup_lat,pickup_lng,delivery_lat,delivery_lng,
      distance_km,package_description,recipient_phone,notes,offered_price,final_price,status,
      confirmation_code,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    req.user!.id,
    pickup_address,
    delivery_address,
    hasCoords ? Number(pickup_lat) : null,
    hasCoords ? Number(pickup_lng) : null,
    hasCoords ? Number(delivery_lat) : null,
    hasCoords ? Number(delivery_lng) : null,
    d,
    package_description || null,
    recipient_phone || null,
    notes || null,
    offered_price ?? null,
    price,
    "pending",
    code,
    now,
    now
  );
  recordStatus(id, "pending");
  res.json({ ok: true, id, final_price: price, distance_km: d, confirmation_code: code });
});

app.post("/api/orders/:id/accept", auth, role("courier"), (req, res) => {
  const me: any = db.prepare("SELECT approved FROM users WHERE id=?").get(req.user!.id);
  if (!me?.approved) return res.status(403).json({ error: "حسابك بانتظار اعتماد الإدارة قبل قبول الطلبات" });
  const r = db
    .prepare("UPDATE orders SET courier_id=?,status='accepted',updated_at=? WHERE id=? AND status='pending'")
    .run(req.user!.id, new Date().toISOString(), req.params.id);
  if (!r.changes) return res.status(409).json({ error: "الطلب غير متاح" });
  recordStatus(req.params.id, "accepted");
  res.json({ ok: true });
});

app.post("/api/orders/:id/pickup", auth, role("courier"), (req, res) => {
  const o: any = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o || o.courier_id !== req.user!.id) return res.status(404).json({ error: "الطلب غير موجود" });
  if (o.status !== "accepted") return res.status(409).json({ error: "حالة الطلب غير صالحة" });
  db.prepare("UPDATE orders SET status='picked_up',updated_at=? WHERE id=?").run(new Date().toISOString(), req.params.id);
  recordStatus(req.params.id, "picked_up");
  res.json({ ok: true });
});

app.post("/api/orders/:id/cancel", auth, (req, res) => {
  const o: any = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
  const u = req.user!;
  const allowed = u.role === "admin" || (u.role === "customer" && o.customer_id === u.id);
  if (!allowed) return res.status(403).json({ error: "غير مصرح" });
  if (!["pending", "accepted"].includes(o.status)) return res.status(409).json({ error: "لا يمكن إلغاء هذا الطلب" });
  db.prepare("UPDATE orders SET status='cancelled',updated_at=? WHERE id=?").run(new Date().toISOString(), req.params.id);
  recordStatus(req.params.id, "cancelled");
  res.json({ ok: true });
});

// ✅ تم تعديل هذا المسار: تم إلغاء فحص الرمز ليتأكد التوصيل مباشرة
app.post("/api/orders/:id/deliver", auth, role("courier"), (req, res) => {
  const o: any = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o || o.courier_id !== req.user!.id) return res.status(404).json({ error: "الطلب غير موجود" });
  if (o.status !== "picked_up") return res.status(409).json({ error: "حالة الطلب غير صالحة" });

  db.prepare("UPDATE orders SET status='delivered',updated_at=? WHERE id=?").run(new Date().toISOString(), req.params.id);
  recordStatus(req.params.id, "delivered");
  res.json({ ok: true });
});

// ---------- Ratings ----------
app.post("/api/orders/:id/rate", auth, role("customer"), (req, res) => {
  const o: any = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o || o.customer_id !== req.user!.id) return res.status(404).json({ error: "الطلب غير موجود" });
  if (o.status !== "delivered") return res.status(409).json({ error: "لا يمكن التقييم الآن" });
  const stars = Number(req.body.stars);
  if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: "التقييم غير صالح" });
  const existing = db.prepare("SELECT id FROM ratings WHERE order_id=?").get(o.id);
  if (existing) return res.status(409).json({ error: "تم التقييم مسبقًا" });
  db.prepare("INSERT INTO ratings VALUES(?,?,?,?,?,?,?)").run(
    crypto.randomUUID(),
    o.id,
    o.customer_id,
    o.courier_id,
    stars,
    req.body.comment || null,
    new Date().toISOString()
  );
  db.prepare("UPDATE orders SET status='completed',updated_at=? WHERE id=?").run(new Date().toISOString(), o.id);
  recordStatus(o.id, "completed");
  res.json({ ok: true });
});

app.get("/api/couriers/:id/ratings", auth, (req, res) => {
  const rows: any[] = db
    .prepare("SELECT stars,comment,created_at FROM ratings WHERE courier_id=? ORDER BY created_at DESC")
    .all(req.params.id);
  const avg = rows.length ? rows.reduce((s, x) => s + x.stars, 0) / rows.length : 0;
  res.json({ ratings: rows, average: Math.round(avg * 10) / 10, count: rows.length });
});

// ---------- Complaints ----------
app.post("/api/complaints", auth, (req, res) => {
  const { order_id, message } = req.body;
  if (!message) return res.status(400).json({ error: "الرسالة مطلوبة" });
  const now = new Date().toISOString();
  db.prepare("INSERT INTO complaints VALUES(?,?,?,?,?,?,?,?)").run(
    crypto.randomUUID(),
    order_id || null,
    req.user!.id,
    message,
    "pending",
    null,
    now,
    now
  );
  res.json({ ok: true });
});

app.get("/api/complaints", auth, (req, res) => {
  const u = req.user!;
  const rows =
    u.role === "admin"
      ? db.prepare("SELECT * FROM complaints ORDER BY created_at DESC").all()
      : db.prepare("SELECT * FROM complaints WHERE user_id=? ORDER BY created_at DESC").all(u.id);
  res.json({ complaints: rows });
});

app.patch("/api/complaints/:id", auth, role("admin"), (req, res) => {
  const { status, response } = req.body;
  db.prepare("UPDATE complaints SET status=?,response=?,updated_at=? WHERE id=?").run(
    status || "resolved",
    response || null,
    new Date().toISOString(),
    req.params.id
  );
  res.json({ ok: true });
});

// ---------- Admin ----------
app.get("/api/admin/users", auth, role("admin"), (_req, res) => {
  const rows = db
    .prepare("SELECT id,name,email,phone,role,created_at,online,approved FROM users ORDER BY created_at DESC")
    .all();
  res.json({ users: rows });
});

app.get("/api/admin/couriers", auth, role("admin"), (_req, res) => {
  const rows = db
    .prepare(
      "SELECT id,name,email,phone,created_at,online,approved,lat,lng,location_updated_at FROM users WHERE role='courier' ORDER BY created_at DESC"
    )
    .all();
  res.json({ couriers: rows });
});

app.patch("/api/admin/couriers/:id/approve", auth, role("admin"), (req, res) => {
  const approved = req.body.approved ? 1 : 0;
  const r = db.prepare("UPDATE users SET approved=? WHERE id=? AND role='courier'").run(approved, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "المندوب غير موجود" });
  res.json({ ok: true, approved: !!approved });
});

app.get("/api/admin/settings", auth, role("admin"), (_req, res) => {
  res.json({ settings: getSettings() });
});

app.patch("/api/admin/settings", auth, role("admin"), (req, res) => {
  const updates = req.body as Record<string, number>;
  const stmt = db.prepare(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  );
  for (const [k, v] of Object.entries(updates)) stmt.run(k, String(v));
  res.json({ ok: true, settings: getSettings() });
});

app.get("/api/admin/stats", auth, role("admin"), (_req, res) => {
  const ordersByStatus = db.prepare("SELECT status, COUNT(*) c FROM orders GROUP BY status").all();
  const usersByRole = db.prepare("SELECT role, COUNT(*) c FROM users GROUP BY role").all();
  const revenue: any = db.prepare("SELECT COALESCE(SUM(final_price),0) r FROM orders WHERE status='completed'").get();
  const activeOrders: any = db
    .prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('pending','accepted','picked_up')")
    .get();
  const couriersOnline: any = db
    .prepare("SELECT COUNT(*) c FROM users WHERE role='courier' AND online=1 AND approved=1")
    .get();
  const couriersApproved: any = db.prepare("SELECT COUNT(*) c FROM users WHERE role='courier' AND approved=1").get();
  const couriersPending: any = db.prepare("SELECT COUNT(*) c FROM users WHERE role='courier' AND approved=0").get();
  res.json({
    ordersByStatus,
    usersByRole,
    revenue: revenue.r,
    activeOrders: activeOrders.c,
    couriersOnline: couriersOnline.c,
    couriersApproved: couriersApproved.c,
    couriersPending: couriersPending.c,
  });
});

// ---------- Serve the built frontend (Vite's dist/) ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "..", "dist");

app.use(express.static(distPath));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(Number(process.env.PORT) || 4000, "0.0.0.0", () => console.log("Wassli API running"));
