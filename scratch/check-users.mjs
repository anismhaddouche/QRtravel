import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const resUsers = await pool.query('SELECT id, email, role, "agencyId" FROM "user"');
    console.log("--- USERS IN 'user' TABLE ---");
    console.table(resUsers.rows);

    const resAgencies = await pool.query('SELECT id, name FROM agencies');
    console.log("\n--- AGENCIES ---");
    console.table(resAgencies.rows);

  } catch (e) {
    console.error("Query failed:", e);
  } finally {
    await pool.end();
  }
}

check();
