import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync("data", { recursive: true });
export const db = new Database(path.resolve("data/wassli.sqlite"));
db.pragma("journal_mode=WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders(
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  courier_id TEXT,
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  distance_km REAL NOT NULL,
  offered_price REAL,
  final_price REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  confirmation_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
