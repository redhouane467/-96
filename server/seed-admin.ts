import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool } from "./db.js";

const email = process.env.ADMIN_EMAIL || "admin@wassli.local";
const password = process.env.ADMIN_PASSWORD || "Admin123456!";

async function seedAdmin() {
  const result = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
  if (!result.rows[0]) {
    await pool.query(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at,online,approved) VALUES($1,$2,$3,$4,$5,$6,$7,0,1)",
      [crypto.randomUUID(), "مشرف وصلي", email, "0000000000", bcrypt.hashSync(password, 12), "admin", new Date().toISOString()]
    );
    console.log(email, password);
  }
}

seedAdmin();