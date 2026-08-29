import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { db } from "./db.js";

const email = process.env.ADMIN_EMAIL || "admin@wassli.local";
const password = process.env.ADMIN_PASSWORD || "Admin123456!";

if (!db.prepare("SELECT id FROM users WHERE email=?").get(email)) {
  db.prepare(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at,online,approved) VALUES(?,?,?,?,?,?,?,0,1)"
  ).run(crypto.randomUUID(), "مشرف وصلي", email, "0000000000", bcrypt.hashSync(password, 12), "admin", new Date().toISOString());
  console.log(email, password);
}