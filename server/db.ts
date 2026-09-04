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
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      online INTEGER NOT NULL DEFAULT 0,
      approved INTEGER NOT NULL DEFAULT 0,
      lat REAL,
      lng REAL,
      location_updated_at TEXT
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
    "INSERT INTO settings(key,value) VALUES('base_price','150') ON CONFLICT(key) DO NOTHING"
  );
  await pool.query(
    "INSERT INTO settings(key,value) VALUES('base_distance_km','2') ON CONFLICT(key) DO NOTHING"
  );
  await pool.query(
    "INSERT INTO settings(key,value) VALUES('extra_km_price','50') ON CONFLICT(key) DO NOTHING"
  );
  await pool.query(
    "INSERT INTO settings(key,value) VALUES('commission_percent','20') ON CONFLICT(key) DO NOTHING"
  );
  await pool.query(
    "INSERT INTO settings(key,value) VALUES('search_radius_km','10') ON CONFLICT(key) DO NOTHING"
  );

  // --- Additive migrations for databases created by earlier versions of ---
  // --- this schema (existing deployments must not lose their data). ---
  async function columnExists(table: string, column: string): Promise<boolean> {
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
      [table, column]
    );
    return result.rows.length > 0;
  }
  async function addColumnIfMissing(table: string, column: string, def: string) {
    if (!(await columnExists(table, column))) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  }
  await addColumnIfMissing("users", "online", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "approved", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "lat", "REAL");
  await addColumnIfMissing("users", "lng", "REAL");
  await addColumnIfMissing("users", "location_updated_at", "TEXT");
  await addColumnIfMissing("orders", "pickup_lat", "REAL");
  await addColumnIfMissing("orders", "pickup_lng", "REAL");
  await addColumnIfMissing("orders", "delivery_lat", "REAL");
  await addColumnIfMissing("orders", "delivery_lng", "REAL");
  await addColumnIfMissing("orders", "package_description", "TEXT");
  await addColumnIfMissing("orders", "recipient_phone", "TEXT");
  await addColumnIfMissing("orders", "notes", "TEXT");

  // Customers and admins are always considered "approved" (the approval
  // gate only exists to let admins vet new couriers before they can accept
  // orders). Existing couriers from before this feature default to
  // unapproved until an admin reviews them, matching the new safety rule.
  await pool.query(
    "UPDATE users SET approved = 1 WHERE role IN ('customer','admin') AND approved = 0"
  );
}

init().catch(console.error);