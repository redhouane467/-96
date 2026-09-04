import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { pool } from "./db.js";

const email = "ess1994dz@outlook.sa";
const password = "Hh24071994@";

async function seedAdmin() {
  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email]
    );

    if (!result.rows[0]) {
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
          "0000000000",
          bcrypt.hashSync(password, 12),
          "admin",
          new Date().toISOString()
        ]
      );

      console.log("Admin account created successfully.");
    } else {
      console.log("Admin account already exists.");
    }
  } catch (error) {
    console.error("Failed to create admin account:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedAdmin();
