import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbDirectory = process.env.NODE_ENV === "production" ? "/tmp/data" : "data";
fs.mkdirSync(dbDirectory, { recursive: true });
export const db = new Database(path.join(dbDirectory, "wassli.sqlite"));
db.pragma("journal_mode=WAL");

db.exec(`
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

INSERT OR IGNORE INTO settings VALUES('base_price','150');
INSERT OR IGNORE INTO settings VALUES('base_distance_km','2');
INSERT OR IGNORE INTO settings VALUES('extra_km_price','50');
INSERT OR IGNORE INTO settings VALUES('commission_percent','20');
INSERT OR IGNORE INTO settings VALUES('search_radius_km','10');
`);

// --- Additive migrations for databases created by earlier versions of ---
// --- this schema (existing deployments must not lose their data). ---
function columnExists(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return rows.some((r) => r.name === column);
}
function addColumnIfMissing(table: string, column: string, def: string) {
  if (!columnExists(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}
addColumnIfMissing("users", "online", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("users", "approved", "INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("users", "lat", "REAL");
addColumnIfMissing("users", "lng", "REAL");
addColumnIfMissing("users", "location_updated_at", "TEXT");
addColumnIfMissing("orders", "pickup_lat", "REAL");
addColumnIfMissing("orders", "pickup_lng", "REAL");
addColumnIfMissing("orders", "delivery_lat", "REAL");
addColumnIfMissing("orders", "delivery_lng", "REAL");
addColumnIfMissing("orders", "package_description", "TEXT");
addColumnIfMissing("orders", "recipient_phone", "TEXT");
addColumnIfMissing("orders", "notes", "TEXT");

// Customers and admins are always considered "approved" (the approval
// gate only exists to let admins vet new couriers before they can accept
// orders). Existing couriers from before this feature default to
// unapproved until an admin reviews them, matching the new safety rule.
db.exec(`UPDATE users SET approved = 1 WHERE role IN ('customer','admin') AND approved = 0`);