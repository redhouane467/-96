import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool } from "./db.js";

const email = "ess1994dz@outlook.sa";
const password = "Hh24071994@";
const phone = "0559388440";

async function seedAdmin() {
  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (result.rows[0]) {
      await pool.query(
        `UPDATE users
         SET phone=$1, role='admin', approved=1
         WHERE email=$2`,
        [phone, email]
      );

      console.log("Existing admin account updated successfully.");
    } else {
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
          approved
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,0,1)`,
        [
          crypto.randomUUID(),
          "مشرف وصلي",
          email,
          phone,
          bcrypt.hashSync(password, 12),
          "admin",
          new Date().toISOString()
        ]
      );

      console.log("Admin account created successfully.");
    }
  } catch (error) {
    console.error("Failed to create/update admin account:", error);
    process.exitCode = 1;
  }
}

seedAdmin();
