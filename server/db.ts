import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = pool;

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      online INTEGER NOT NULL DEFAULT 0,
      approved INTEGER NOT NULL DEFAULT 0,
      lat REAL,
      lng REAL,
      location_updated_at TEXT,
      id_card_data BYTEA,
      id_card_mime TEXT,
      courier_debt REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders(
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      courier_id TEXT,
      pickup_address TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      pickup_lat REAL,
      pickup_lng REAL,
      delivery_lat REAL,
      delivery_lng REAL,
      distance_km REAL NOT NULL,
      package_description TEXT,
      recipient_phone TEXT,
      notes TEXT,
      offered_price REAL,
      final_price REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      confirmation_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history(
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ratings(
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      courier_id TEXT NOT NULL,
      stars INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS complaints(
      id TEXT PRIMARY KEY,
      order_id TEXT,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      response TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings(
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await pool.query(
    "ALTER TABLE users ALTER COLUMN email DROP NOT NULL"
  );

  async function columnExists(
    table: string,
    column: string
  ): Promise<boolean> {
    const result = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = $1
         AND column_name = $2`,
      [table, column]
    );

    return result.rows.length > 0;
  }

  async function addColumnIfMissing(
    table: string,
    column: string,
    definition: string
  ) {
    if (!(await columnExists(table, column))) {
      await pool.query(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
      );
    }
  }

  await addColumnIfMissing(
    "users",
    "online",
    "INTEGER NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "users",
    "approved",
    "INTEGER NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "users",
    "lat",
    "REAL"
  );

  await addColumnIfMissing(
    "users",
    "lng",
    "REAL"
  );

  await addColumnIfMissing(
    "users",
    "location_updated_at",
    "TEXT"
  );

  await addColumnIfMissing(
    "users",
    "id_card_data",
    "BYTEA"
  );

  await addColumnIfMissing(
    "users",
    "id_card_mime",
    "TEXT"
  );

  await addColumnIfMissing(
    "users",
    "courier_debt",
    "REAL NOT NULL DEFAULT 0"
  );

  await addColumnIfMissing(
    "orders",
    "pickup_lat",
    "REAL"
  );

  await addColumnIfMissing(
    "orders",
    "pickup_lng",
    "REAL"
  );

  await addColumnIfMissing(
    "orders",
    "delivery_lat",
    "REAL"
  );

  await addColumnIfMissing(
    "orders",
    "package_description",
    "TEXT"
  );

  await addColumnIfMissing(
    "orders",
    "recipient_phone",
    "TEXT"
  );

  await addColumnIfMissing(
    "orders",
    "notes",
    "TEXT"
  );

  await pool.query(`
    INSERT INTO settings(key, value)
    VALUES('base_price', '150')
    ON CONFLICT(key) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO settings(key, value)
    VALUES('base_distance_km', '2')
    ON CONFLICT(key) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO settings(key, value)
    VALUES('extra_km_price', '50')
    ON CONFLICT(key) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO settings(key, value)
    VALUES('commission_percent', '20')
    ON CONFLICT(key) DO NOTHING
  `);

  await pool.query(`
    INSERT INTO settings(key, value)
    VALUES('search_radius_km', '10')
    ON CONFLICT(key) DO NOTHING
  `);

  await pool.query(`
    UPDATE users
    SET approved = 1
    WHERE role IN ('customer', 'admin')
      AND approved = 0
  `);

  /*
   * تهيئة ديون المندوبين مرة واحدة فقط.
   *
   * نحسب العمولة المستحقة للتطبيق من الطلبات
   * التي أصبحت مكتملة قبل إضافة نظام الديون.
   */
  const debtMarker = await pool.query(
    `SELECT value
     FROM settings
     WHERE key = 'courier_debt_initialized_v1'`
  );

  if (debtMarker.rows.length === 0) {
    const commissionResult = await pool.query(
      `SELECT value
       FROM settings
       WHERE key = 'commission_percent'`
    );

    const commissionPercent = Number(
      commissionResult.rows[0]?.value ?? 20
    );

    const completedOrders = await pool.query(
      `SELECT courier_id, final_price
       FROM orders
       WHERE status = 'completed'
         AND courier_id IS NOT NULL
         AND final_price IS NOT NULL`
    );

    for (const order of completedOrders.rows) {
      const courierId = String(order.courier_id);
      const finalPrice = Number(order.final_price);

      if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
        continue;
      }

      const commission =
        Math.round(
          (finalPrice * commissionPercent) / 100 * 100
        ) / 100;

      if (commission <= 0) {
        continue;
      }

      await pool.query(
        `UPDATE users
         SET courier_debt = COALESCE(courier_debt, 0) + $1
         WHERE id = $2
           AND role = 'courier'`,
        [commission, courierId]
      );
    }

    await pool.query(
      `INSERT INTO settings(key, value)
       VALUES('courier_debt_initialized_v1', '1')
       ON CONFLICT(key) DO NOTHING`
    );
  }
}

init().catch((error) => {
  console.error("Database initialization error:", error);
});
