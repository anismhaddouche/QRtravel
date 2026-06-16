import { hashPassword } from '@better-auth/utils/password';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fix() {
  const newHash = await hashPassword("ADMIN123");
  await pool.query('UPDATE account SET password = $1', [newHash]);
  console.log("Updated all accounts to password ADMIN123");
  process.exit(0);
}
fix();
