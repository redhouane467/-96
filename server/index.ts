import express from "express";
import path from "path";
import crypto from "crypto";
import { pool } from "./db";
import {
  auth,
  role,
  sign,
} from "./auth";
import bcrypt from "bcryptjs";

const app = express();

app.use(
  express.json({
    limit: "8mb",
  })
);

function id() {
  return crypto.randomUUID();
}

async function getSettings() {
  const result = await pool.query(
    "SELECT key, value FROM settings"
  );

  const settings: Record<string, string> = {};

  for (const row of result.rows) {
    settings[row.key] = row.value;
  }

  return settings;
}

async function calcPrice(
  distanceKm: number
) {
  const settings = await getSettings();

  const basePrice =
    Number(settings.base_price ?? 150);

  const baseDistance =
    Number(settings.base_distance_km ?? 2);

  const extraKmPrice =
    Number(settings.extra_km_price ?? 50);

  const extraDistance = Math.max(
    0,
    Math.ceil(distanceKm - baseDistance)
  );

  return (
    basePrice +
    extraDistance * extraKmPrice
  );
}

function sanitizeForCourier(
  order: any
) {
  const copy = { ...order };

  delete copy.confirmation_code;

  return copy;
}

async function recordStatus(
  orderId: string,
  status: string
) {
  await pool.query(
    `INSERT INTO order_status_history
     (id, order_id, status, created_at)
     VALUES ($1,$2,$3,$4)`,
    [
      id(),
      orderId,
      status,
      new Date().toISOString(),
    ]
  );
}

async function attachCourierInfo(
  order: any
) {
  if (!order.courier_id) {
    return order;
  }

  const result = await pool.query(
    `SELECT
       id,
       name,
       phone,
       online,
       lat,
       lng,
       location_updated_at
     FROM users
     WHERE id=$1
       AND role='courier'`,
    [order.courier_id]
  );

  if (!result.rows.length) {
    return order;
  }

  return {
    ...order,
    courier: result.rows[0],
  };
}

/* =========================
   OLD DELIVERED ORDERS
   تحويل الطلبات القديمة التي
   بقيت delivered إلى completed
   وحساب العمولة مرة واحدة
========================= */

async function migrateOldDeliveredOrders() {
  const markerKey =
    "courier_delivered_migration_v1";

  try {
    const marker =
      await pool.query(
        `SELECT value
         FROM settings
         WHERE key=$1
         LIMIT 1`,
        [markerKey]
      );

    if (marker.rows.length) {
      return;
    }

    const settings =
      await getSettings();

    const commissionPercent =
      Number(
        settings.commission_percent ??
          20
      );

    const delivered =
      await pool.query(
        `SELECT
           id,
           courier_id,
           final_price
         FROM orders
         WHERE status='delivered'
           AND courier_id IS NOT NULL
           AND final_price IS NOT NULL`
      );

    for (const order of delivered.rows) {
      const client =
        await pool.connect();

      try {
        await client.query(
          "BEGIN"
        );

        const locked =
          await client.query(
            `SELECT
               id,
               courier_id,
               final_price,
               status
             FROM orders
             WHERE id=$1
             FOR UPDATE`,
            [order.id]
          );

        if (
          !locked.rows.length ||
          locked.rows[0].status !==
            "delivered"
        ) {
          await client.query(
            "ROLLBACK"
          );
          client.release();
          continue;
        }

        const courierId =
          locked.rows[0].courier_id;

        const finalPrice =
          Number(
            locked.rows[0].final_price ||
              0
          );

        if (
          courierId &&
          finalPrice > 0
        ) {
          const commission =
            Math.round(
              (
                (finalPrice *
                  commissionPercent) /
                100
              ) * 100
            ) / 100;

          if (commission > 0) {
            await client.query(
              `UPDATE users
               SET
                 courier_debt =
                   COALESCE(
                     courier_debt,
                     0
                   ) + $1
               WHERE id=$2
                 AND role='courier'`,
              [
                commission,
                courierId,
              ]
            );
          }
        }

        const now =
          new Date().toISOString();

        const completed =
          await client.query(
            `UPDATE orders
             SET
               status='completed',
               updated_at=$1
             WHERE id=$2
               AND status='delivered'
             RETURNING *`,
            [
              now,
              order.id,
            ]
          );

        if (completed.rows.length) {
          await client.query(
            `INSERT INTO order_status_history
             (id, order_id, status, created_at)
             VALUES ($1,$2,$3,$4)`,
            [
              id(),
              order.id,
              "completed",
              now,
            ]
          );
        }

        await client.query(
          "COMMIT"
        );
      } catch (error) {
        await client.query(
          "ROLLBACK"
        );

        console.error(
          "old delivered migration error:",
          error
        );
      } finally {
        client.release();
      }
    }

    await pool.query(
      `INSERT INTO settings
       (key,value)
       VALUES ($1,$2)
       ON CONFLICT(key)
       DO NOTHING`,
      [
        markerKey,
        "1",
      ]
    );

    console.log(
      `Old delivered orders migration completed: ${delivered.rows.length}`
    );
  } catch (error) {
    console.error(
      "old delivered orders migration failed:",
      error
    );
  }
}

/* =========================
   AUTH
========================= */

app.post(
  "/api/auth/register",
  async (req, res) => {
    try {
      const {
        name,
        phone,
        password,
        role: requestedRole,
        idCard,
      } = req.body;

      if (
        !name ||
        !phone ||
        !password ||
        !requestedRole
      ) {
        return res.status(400).json({
          error:
            "الاسم ورقم الهاتف وكلمة المرور مطلوبة",
        });
      }

      if (
        !["customer", "courier"].includes(
          requestedRole
        )
      ) {
        return res.status(400).json({
          error: "نوع الحساب غير صالح",
        });
      }

      const normalizedPhone =
        String(phone).trim();

      if (password.length < 6) {
        return res.status(400).json({
          error:
            "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
        });
      }

      if (
        requestedRole === "courier" &&
        (!idCard ||
          !idCard.data ||
          !idCard.mime)
      ) {
        return res.status(400).json({
          error:
            "بطاقة التعريف مطلوبة للمندوب",
        });
      }

      const existing =
        await pool.query(
          `SELECT id
           FROM users
           WHERE phone=$1
           LIMIT 1`,
          [normalizedPhone]
        );

      if (existing.rows.length) {
        return res.status(409).json({
          error:
            "رقم الهاتف مسجل مسبقًا",
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      const userId = id();

      let cardData: Buffer | null =
        null;

      let cardMime: string | null =
        null;

      if (
        requestedRole === "courier"
      ) {
        try {
          cardData = Buffer.from(
            idCard.data,
            "base64"
          );

          cardMime = String(
            idCard.mime
          );
        } catch {
          return res.status(400).json({
            error:
              "صورة بطاقة التعريف غير صالحة",
          });
        }
      }

      const approved =
        requestedRole === "customer"
          ? 1
          : 0;

      const result =
        await pool.query(
          `INSERT INTO users
           (
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
             id_card_mime,
             courier_debt
           )
           VALUES
           (
             $1,$2,$3,$4,$5,$6,$7,
             0,$8,$9,$10,0
           )
           RETURNING
             id,
             name,
             email,
             phone,
             role`,
          [
            userId,
            String(name).trim(),
            null,
            normalizedPhone,
            passwordHash,
            requestedRole,
            new Date().toISOString(),
            approved,
            cardData,
            cardMime,
          ]
        );

      const user = result.rows[0];

      const token = sign({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      });

      return res.status(201).json({
        token,
        user,
      });
    } catch (error) {
      console.error(
        "register error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء إنشاء الحساب",
      });
    }
  }
);

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const {
        phone,
        password,
      } = req.body;

      if (!phone || !password) {
        return res.status(400).json({
          error:
            "رقم الهاتف وكلمة المرور مطلوبان",
        });
      }

      const result =
        await pool.query(
          `SELECT
             id,
             name,
             email,
             phone,
             password_hash,
             role,
             approved
           FROM users
           WHERE phone=$1
           LIMIT 1`,
          [String(phone).trim()]
        );

      if (!result.rows.length) {
        return res.status(401).json({
          error:
            "بيانات الدخول غير صحيحة",
        });
      }

      const user = result.rows[0];

      const valid =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "بيانات الدخول غير صحيحة",
        });
      }

      if (
        user.role === "courier" &&
        Number(user.approved) !== 1
      ) {
        return res.status(403).json({
          error:
            "حساب المندوب في انتظار موافقة الإدارة",
        });
      }

      const token = sign({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      });

      return res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      });
    } catch (error) {
      console.error(
        "login error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء تسجيل الدخول",
      });
    }
  }
);

app.get(
  "/api/auth/me",
  auth,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `SELECT
             id,
             name,
             email,
             phone,
             role,
             approved,
             online,
             COALESCE(
               courier_debt,
               0
             ) AS courier_debt
           FROM users
           WHERE id=$1`,
          [req.user!.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "المستخدم غير موجود",
        });
      }

      return res.json({
        user: result.rows[0],
      });
    } catch (error) {
      console.error(
        "me error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

/* =========================
   COURIER
========================= */

app.post(
  "/api/courier/online",
  auth,
  role("courier"),
  async (req, res) => {
    try {
      const { online } = req.body;

      const result =
        await pool.query(
          `UPDATE users
           SET online=$1
           WHERE id=$2
             AND role='courier'
           RETURNING
             id,
             name,
             phone,
             role,
             approved,
             online`,
          [
  online ? 1 : 0,
  req.user!.id,
]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "المندوب غير موجود",
        });
      }

      return res.json({
        user: result.rows[0],
      });
    } catch (error) {
      console.error(
        "courier online error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

app.post(
  "/api/courier/location",
  auth,
  role("courier"),
  async (req, res) => {
    try {
      const {
        lat,
        lng,
      } = req.body;

      if (
        lat === undefined ||
        lng === undefined
      ) {
        return res.status(400).json({
          error:
            "الموقع غير صالح",
        });
      }

      const latitude =
        Number(lat);

      const longitude =
        Number(lng);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return res.status(400).json({
          error:
            "الموقع غير صالح",
        });
      }

      const result =
        await pool.query(
          `UPDATE users
           SET
             lat=$1,
             lng=$2,
             location_updated_at=$3
           WHERE id=$4
             AND role='courier'
           RETURNING
             id,
             lat,
             lng,
             location_updated_at`,
          [
            latitude,
            longitude,
            new Date().toISOString(),
            req.user!.id,
          ]
        );

      return res.json({
        location:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "courier location error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

app.get(
  "/api/courier/stats",
  auth,
  role("courier"),
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `SELECT
             COUNT(*) FILTER (
               WHERE status='completed'
             ) AS completed,
             COUNT(*) FILTER (
               WHERE status NOT IN
               ('completed','cancelled')
             ) AS active,
             COALESCE(
               SUM(
                 CASE
                   WHEN status='completed'
                   THEN final_price
                   ELSE 0
                 END
               ),
               0
             ) AS earnings
           FROM orders
           WHERE courier_id=$1`,
          [req.user!.id]
        );

      const debt =
        await pool.query(
          `SELECT
             COALESCE(
               courier_debt,
               0
             ) AS debt
           FROM users
           WHERE id=$1`,
          [req.user!.id]
        );

      return res.json({
        stats: {
          completed:
            Number(
              result.rows[0]?.completed ||
                0
            ),
          active:
            Number(
              result.rows[0]?.active ||
                0
            ),
          earnings:
            Number(
              result.rows[0]?.earnings ||
                0
            ),
          debt:
            Number(
              debt.rows[0]?.debt ||
                0
            ),
        },
      });
    } catch (error) {
      console.error(
        "courier stats error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

/* =========================
   ORDERS
========================= */

app.get(
  "/api/orders",
  auth,
  async (req, res) => {
    try {
      let result;

      if (
        req.user!.role ===
        "customer"
      ) {
        result =
          await pool.query(
            `SELECT *
             FROM orders
             WHERE customer_id=$1
             ORDER BY created_at DESC`,
            [req.user!.id]
          );
      } else if (
        req.user!.role ===
        "courier"
      ) {
        result =
          await pool.query(
            `SELECT *
             FROM orders
             WHERE
               courier_id=$1
               OR (
                 status='pending'
                 AND courier_id IS NULL
               )
             ORDER BY created_at DESC`,
            [req.user!.id]
          );
      } else {
        result =
          await pool.query(
            `SELECT *
             FROM orders
             ORDER BY created_at DESC`
          );
      }

      const orders = [];

      for (const order of result.rows) {
        let item =
          await attachCourierInfo(
            order
          );

        if (
          req.user!.role ===
          "courier"
        ) {
          item =
            sanitizeForCourier(
              item
            );
        }

        orders.push(item);
      }

      return res.json({
        orders,
      });
    } catch (error) {
      console.error(
        "orders get error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في جلب الطلبات",
      });
    }
  }
);

app.post(
  "/api/orders",
  auth,
  role("customer"),
  async (req, res) => {
    try {
      const {
        pickup_address,
        delivery_address,
        pickup_lat,
        pickup_lng,
        delivery_lat,
        delivery_lng,
        distance_km,
        package_description,
        notes,
        offered_price,
      } = req.body;

      if (
        !pickup_address ||
        !delivery_address
      ) {
        return res.status(400).json({
          error:
            "عنوان الاستلام والتوصيل مطلوبان",
        });
      }

      const distance =
        Number(distance_km);

      if (
        !Number.isFinite(
          distance
        ) ||
        distance <= 0
      ) {
        return res.status(400).json({
          error:
            "المسافة غير صالحة",
        });
      }

      const finalPrice =
        Number.isFinite(
          Number(offered_price)
        ) &&
        Number(offered_price) > 0
          ? Number(offered_price)
          : await calcPrice(
              distance
            );

      const customer =
        await pool.query(
          `SELECT phone
           FROM users
           WHERE id=$1`,
          [req.user!.id]
        );

      const recipientPhone =
        customer.rows[0]?.phone ||
        null;

      const orderId = id();

      const now =
        new Date().toISOString();

      const result =
        await pool.query(
          `INSERT INTO orders
           (
             id,
             customer_id,
             courier_id,
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
           VALUES
           (
             $1,$2,NULL,$3,$4,
             $5,$6,$7,$8,$9,
             $10,$11,$12,$13,$14,
             'pending',NULL,$15,$15
           )
           RETURNING *`,
          [
            orderId,
            req.user!.id,
            pickup_address,
            delivery_address,
            pickup_lat ??
              null,
            pickup_lng ??
              null,
            delivery_lat ??
              null,
            delivery_lng ??
              null,
            distance,
            package_description ??
              null,
            recipientPhone,
            notes ?? null,
            offered_price ??
              null,
            finalPrice,
            now,
          ]
        );

      await recordStatus(
        orderId,
        "pending"
      );

      return res.status(201).json({
        order: result.rows[0],
      });
    } catch (error) {
      console.error(
        "order create error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء إنشاء الطلب",
      });
    }
  }
);

/* =========================
   ACCEPT ORDER
========================= */

app.post(
  "/api/orders/:id/accept",
  auth,
  role("courier"),
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `UPDATE orders
           SET
             courier_id=$1,
             status='accepted',
             updated_at=$2
           WHERE id=$3
             AND status='pending'
             AND courier_id IS NULL
           RETURNING *`,
          [
            req.user!.id,
            new Date().toISOString(),
            req.params.id,
          ]
        );

      if (!result.rows.length) {
        return res.status(409).json({
          error:
            "الطلب لم يعد متاحًا",
        });
      }

      await recordStatus(
        req.params.id,
        "accepted"
      );

      return res.json({
        order: result.rows[0],
      });
    } catch (error) {
      console.error(
        "accept error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

/* =========================
   PICKUP
========================= */

app.post(
  "/api/orders/:id/pickup",
  auth,
  role("courier"),
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `UPDATE orders
           SET
             status='picked_up',
             updated_at=$1
           WHERE id=$2
             AND courier_id=$3
             AND status='accepted'
           RETURNING *`,
          [
            new Date().toISOString(),
            req.params.id,
            req.user!.id,
          ]
        );

      if (!result.rows.length) {
        return res.status(409).json({
          error:
            "لا يمكن استلام هذا الطلب الآن",
        });
      }

      await recordStatus(
        req.params.id,
        "picked_up"
      );

      return res.json({
        order: result.rows[0],
      });
    } catch (error) {
      console.error(
        "pickup error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

/* =========================
   DELIVER
   التوصيل = إكمال الطلب
   + حساب العمولة مباشرة
   + إضافة الدين للمندوب
========================= */

app.post(
  "/api/orders/:id/deliver",
  auth,
  role("courier"),
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN"
      );

      const orderResult =
        await client.query(
          `SELECT *
           FROM orders
           WHERE id=$1
             AND courier_id=$2
             AND status='picked_up'
           FOR UPDATE`,
          [
            req.params.id,
            req.user!.id,
          ]
        );

      if (
        !orderResult.rows.length
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "لا يمكن إنهاء التوصيل الآن",
        });
      }

      const order =
        orderResult.rows[0];

      const settings =
        await getSettings();

      const commissionPercent =
        Number(
          settings.commission_percent ??
            20
        );

      const finalPrice =
        Number(
          order.final_price || 0
        );

      const commission =
        Math.round(
          (
            (finalPrice *
              commissionPercent) /
            100
          ) * 100
        ) / 100;

      const now =
        new Date().toISOString();

      const completed =
        await client.query(
          `UPDATE orders
           SET
             status='completed',
             updated_at=$1
           WHERE id=$2
             AND courier_id=$3
             AND status='picked_up'
           RETURNING *`,
          [
            now,
            req.params.id,
            req.user!.id,
          ]
        );

      if (
        !completed.rows.length
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          error:
            "تعذر إكمال الطلب",
        });
      }

      /*
       * نسجل مرحلتي التسليم والإكمال.
       * الطلب أصبح completed مباشرة.
       */

      await client.query(
        `INSERT INTO order_status_history
         (id, order_id, status, created_at)
         VALUES ($1,$2,$3,$4)`,
        [
          id(),
          req.params.id,
          "delivered",
          now,
        ]
      );

      await client.query(
        `INSERT INTO order_status_history
         (id, order_id, status, created_at)
         VALUES ($1,$2,$3,$4)`,
        [
          id(),
          req.params.id,
          "completed",
          now,
        ]
      );

      if (commission > 0) {
        await client.query(
          `UPDATE users
           SET
             courier_debt =
               COALESCE(
                 courier_debt,
                 0
               ) + $1
           WHERE id=$2
             AND role='courier'`,
          [
            commission,
            req.user!.id,
          ]
        );
      }

      const debtResult =
        await client.query(
          `SELECT
             COALESCE(
               courier_debt,
               0
             ) AS courier_debt
           FROM users
           WHERE id=$1
             AND role='courier'`,
          [req.user!.id]
        );

      await client.query(
        "COMMIT"
      );

      return res.json({
        order:
          completed.rows[0],
        commission,
        courier_debt:
          Number(
            debtResult.rows[0]
              ?.courier_debt || 0
          ),
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {
        // ignore rollback error
      }

      console.error(
        "deliver error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء إنهاء التوصيل وحساب العمولة",
      });
    } finally {
      client.release();
    }
  }
);

/* =========================
   CANCEL
========================= */

app.post(
  "/api/orders/:id/cancel",
  auth,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `UPDATE orders
           SET
             status='cancelled',
             updated_at=$1
           WHERE id=$2
             AND (
               customer_id=$3
               OR courier_id=$3
             )
             AND status NOT IN
             ('completed','cancelled')
           RETURNING *`,
          [
            new Date().toISOString(),
            req.params.id,
            req.user!.id,
          ]
        );

      if (!result.rows.length) {
        return res.status(409).json({
          error:
            "لا يمكن إلغاء هذا الطلب",
        });
      }

      await recordStatus(
        req.params.id,
        "cancelled"
      );

      return res.json({
        order: result.rows[0],
      });
    } catch (error) {
      console.error(
        "cancel error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

/* =========================
   RATING
   التقييم اختياري ولا يحسب
   العمولة ولا يكمل الطلب
========================= */

app.post(
  "/api/orders/:id/rating",
  auth,
  role("customer"),
  async (req, res) => {
    try {
      const {
        stars,
        comment,
      } = req.body;

      const rating =
        Number(stars);

      if (
        !Number.isInteger(
          rating
        ) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            "التقييم يجب أن يكون من 1 إلى 5",
        });
      }

      const orderResult =
        await pool.query(
          `SELECT *
           FROM orders
           WHERE id=$1
             AND customer_id=$2`,
          [
            req.params.id,
            req.user!.id,
          ]
        );

      if (
        !orderResult.rows.length
      ) {
        return res.status(404).json({
          error:
            "الطلب غير موجود",
        });
      }

      const order =
        orderResult.rows[0];

      /*
       * بعد التعديل الطلب يصبح completed
       * مباشرة عند ضغط المندوب على تم التوصيل.
       *
       * نسمح أيضًا بـ delivered للطلبات
       * القديمة التي ربما لم تتم هجرتها بعد.
       */

      if (
        order.status !==
          "completed" &&
        order.status !==
          "delivered"
      ) {
        return res.status(400).json({
          error:
            "يمكن تقييم الطلب بعد اكتمال التوصيل",
        });
      }

      if (!order.courier_id) {
        return res.status(400).json({
          error:
            "لا يوجد مندوب لهذا الطلب",
        });
      }

      const oldRating =
        await pool.query(
          `SELECT id
           FROM ratings
           WHERE order_id=$1
           LIMIT 1`,
          [req.params.id]
        );

      if (oldRating.rows.length) {
        return res.status(409).json({
          error:
            "تم تقييم هذا الطلب مسبقًا",
        });
      }

      const ratingResult =
        await pool.query(
          `INSERT INTO ratings
           (
             id,
             order_id,
             customer_id,
             courier_id,
             stars,
             comment,
             created_at
           )
           VALUES
           ($1,$2,$3,$4,$5,$6,$7)
           RETURNING *`,
          [
            id(),
            req.params.id,
            req.user!.id,
            order.courier_id,
            rating,
            comment ??
              null,
            new Date().toISOString(),
          ]
        );

      /*
       * مهم:
       * لا نحسب العمولة هنا.
       * لا نضيف دينًا هنا.
       * لا نغير حالة الطلب هنا.
       *
       * العمولة والدين تم حسابهما عند
       * ضغط المندوب على "تم التوصيل".
       */

      return res.json({
        order,
        rating:
          ratingResult.rows[0],
      });
    } catch (error) {
      console.error(
        "rating error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء تسجيل التقييم",
      });
    }
  }
);

/* =========================
   COMPLAINTS
========================= */

app.post(
  "/api/complaints",
  auth,
  async (req, res) => {
    try {
      const {
        order_id,
        message,
      } = req.body;

      if (!message) {
        return res.status(400).json({
          error:
            "الشكوى مطلوبة",
        });
      }

      const now =
        new Date().toISOString();

      const result =
        await pool.query(
          `INSERT INTO complaints
           (
             id,
             order_id,
             user_id,
             message,
             status,
             response,
             created_at,
             updated_at
           )
           VALUES
           (
             $1,$2,$3,$4,
             'pending',
             NULL,$5,$5
           )
           RETURNING *`,
          [
            id(),
            order_id ??
              null,
            req.user!.id,
            message,
            now,
          ]
        );

      return res.status(201).json({
        complaint:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "complaint error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء إرسال الشكوى",
      });
    }
  }
);

/* =========================
   ADMIN - USERS
========================= */

app.get(
  "/api/admin/users",
  auth,
  role("admin"),
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `SELECT
             id,
             name,
             email,
             phone,
             role,
             approved,
             online,
             created_at
           FROM users
           ORDER BY created_at DESC`
        );

      return res.json({
        users:
          result.rows,
      });
    } catch (error) {
      console.error(
        "admin users error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في جلب المستخدمين",
      });
    }
  }
);

/* =========================
   ADMIN - COURIERS
========================= */

app.get(
  "/api/admin/couriers",
  auth,
  role("admin"),
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `SELECT
             id,
             name,
             email,
             phone,
             role,
             approved,
             online,
             lat,
             lng,
             location_updated_at,
             created_at,
             (
               id_card_data IS NOT NULL
             ) AS has_id_card,
             COALESCE(
               courier_debt,
               0
             ) AS courier_debt
           FROM users
           WHERE role='courier'
           ORDER BY created_at DESC`
        );

      return res.json({
        couriers:
          result.rows,
      });
    } catch (error) {
      console.error(
        "admin couriers error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في جلب المندوبين",
      });
    }
  }
);

/* =========================
   ADMIN - ID CARD
========================= */

app.get(
  "/api/admin/couriers/:id/id-card",
  auth,
  role("admin"),
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `SELECT
             id_card_data,
             id_card_mime
           FROM users
           WHERE id=$1
             AND role='courier'`,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "المندوب غير موجود",
        });
      }

      const row =
        result.rows[0];

      if (!row.id_card_data) {
        return res.status(404).json({
          error:
            "بطاقة التعريف غير موجودة",
        });
      }

      res.setHeader(
        "Content-Type",
        row.id_card_mime ||
          "image/jpeg"
      );

      return res.send(
        row.id_card_data
      );
    } catch (error) {
      console.error(
        "id card error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

/* =========================
   ADMIN - APPROVE COURIER
========================= */

app.post(
  "/api/admin/couriers/:id/approve",
  auth,
  role("admin"),
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `UPDATE users
           SET approved=1
           WHERE id=$1
             AND role='courier'
           RETURNING
             id,
             name,
             phone,
             role,
             approved,
             online`,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "المندوب غير موجود",
        });
      }

      return res.json({
        user:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "approve error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في الخادم",
      });
    }
  }
);

/* =========================
   ADMIN - DEBT PAID
========================= */

app.patch(
  "/api/admin/couriers/:id/debt/paid",
  auth,
  role("admin"),
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `UPDATE users
           SET courier_debt=0
           WHERE id=$1
             AND role='courier'
           RETURNING
             id,
             name,
             COALESCE(
               courier_debt,
               0
             ) AS courier_debt`,
          [req.params.id]
        );

      if (!result.rowCount) {
        return res.status(404).json({
          error:
            "المندوب غير موجود",
        });
      }

      return res.json({
        ok: true,
        courier_debt:
          Number(
            result.rows[0]
              .courier_debt || 0
          ),
      });
    } catch (error) {
      console.error(
        "debt paid error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء تحديث الدين",
      });
    }
  }
);

/* =========================
   ADMIN - SETTINGS
========================= */

app.get(
  "/api/admin/settings",
  auth,
  role("admin"),
  async (_req, res) => {
    try {
      return res.json({
        settings:
          await getSettings(),
      });
    } catch (error) {
      console.error(
        "settings get error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في جلب الإعدادات",
      });
    }
  }
);

app.patch(
  "/api/admin/settings",
  auth,
  role("admin"),
  async (req, res) => {
    try {
      const settings =
        req.body?.settings ||
        req.body ||
        {};

      for (const [
        key,
        value,
      ] of Object.entries(
        settings
      )) {
        if (
          typeof value ===
          "object"
        ) {
          continue;
        }

        await pool.query(
          `INSERT INTO settings
           (key,value)
           VALUES ($1,$2)
           ON CONFLICT(key)
           DO UPDATE SET
             value=EXCLUDED.value`,
          [
            key,
            String(value),
          ]
        );
      }

      return res.json({
        settings:
          await getSettings(),
      });
    } catch (error) {
      console.error(
        "settings update error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء حفظ الإعدادات",
      });
    }
  }
);

/* =========================
   ADMIN - STATS
========================= */

app.get(
  "/api/admin/stats",
  auth,
  role("admin"),
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `SELECT
             COUNT(*) AS orders,
             COUNT(*) FILTER (
               WHERE status NOT IN
               ('completed','cancelled')
             ) AS active_orders,
             COUNT(*) FILTER (
               WHERE status='completed'
             ) AS completed,
             COALESCE(
               SUM(
                 CASE
                   WHEN status='completed'
                   THEN final_price
                   ELSE 0
                 END
               ),
               0
             ) AS revenue
           FROM orders`
        );

      const users =
        await pool.query(
          `SELECT
             COUNT(*) AS users,
             COUNT(*) FILTER (
               WHERE role='customer'
             ) AS customers,
             COUNT(*) FILTER (
               WHERE role='courier'
             ) AS couriers,
             COUNT(*) FILTER (
               WHERE role='courier'
               AND approved=1
             ) AS approved_couriers
           FROM users`
        );

      return res.json({
        stats: {
          users:
            Number(
              users.rows[0]
                ?.users || 0
            ),
          customers:
            Number(
              users.rows[0]
                ?.customers || 0
            ),
          couriers:
            Number(
              users.rows[0]
                ?.couriers || 0
            ),
          approvedCouriers:
            Number(
              users.rows[0]
                ?.approved_couriers ||
                0
            ),
          orders:
            Number(
              result.rows[0]
                ?.orders || 0
            ),
          activeOrders:
            Number(
              result.rows[0]
                ?.active_orders ||
                0
            ),
          completed:
            Number(
              result.rows[0]
                ?.completed || 0
            ),
          revenue:
            Number(
              result.rows[0]
                ?.revenue || 0
            ),
        },
      });
    } catch (error) {
      console.error(
        "admin stats error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في جلب الإحصائيات",
      });
    }
  }
);

/* =========================
   ADMIN - COMPLAINTS
========================= */

app.get(
  "/api/admin/complaints",
  auth,
  role("admin"),
  async (_req, res) => {
    try {
      const result =
        await pool.query(
          `SELECT
             c.*,
             u.name AS user_name,
             u.phone AS user_phone
           FROM complaints c
           LEFT JOIN users u
             ON u.id=c.user_id
           ORDER BY
             c.created_at DESC`
        );

      return res.json({
        complaints:
          result.rows,
      });
    } catch (error) {
      console.error(
        "admin complaints error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ في جلب الشكاوى",
      });
    }
  }
);

app.patch(
  "/api/admin/complaints/:id",
  auth,
  role("admin"),
  async (req, res) => {
    try {
      const {
        status,
        response,
      } = req.body;

      const result =
        await pool.query(
          `UPDATE complaints
           SET
             status=$1,
             response=$2,
             updated_at=$3
           WHERE id=$4
           RETURNING *`,
          [
            status ||
              "resolved",
            response ??
              null,
            new Date().toISOString(),
            req.params.id,
          ]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "الشكوى غير موجودة",
        });
      }

      return res.json({
        complaint:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "complaint update error:",
        error
      );

      return res.status(500).json({
        error:
          "حدث خطأ أثناء تحديث الشكوى",
      });
    }
  }
);

/* =========================
   STATIC FRONTEND
========================= */

const distPath = path.join(
  process.cwd(),
  "dist"
);

app.use(
  express.static(distPath)
);

app.get(
  "/*splat",
  (_req, res) => {
    res.sendFile(
      path.join(
        distPath,
        "index.html"
      )
    );
  }
);

/* =========================
   SERVER
========================= */

const PORT =
  Number(
    process.env.PORT
  ) || 3000;

/*
 * نشغل معالجة الطلبات القديمة أولاً
 * ثم نفتح السيرفر.
 */
migrateOldDeliveredOrders()
  .catch((error) => {
    console.error(
      "startup migration error:",
      error
    );
  })
  .finally(() => {
    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `وصلي يعمل على المنفذ ${PORT}`
        );
      }
    );
  });
