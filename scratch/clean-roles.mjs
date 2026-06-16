import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function clean() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Replace actual newlines, carriage returns, and literal "\n" strings
    await pool.query("UPDATE \"user\" SET role = REPLACE(role, E'\\n', '')");
    await pool.query("UPDATE \"user\" SET role = REPLACE(role, E'\\r', '')");
    await pool.query("UPDATE \"user\" SET role = REPLACE(role, '\\n', '')");
    await pool.query("UPDATE \"user\" SET role = REPLACE(role, '\\r', '')");
    await pool.query("UPDATE \"user\" SET role = TRIM(BOTH FROM role)");
    
    console.log("Cleanup queries executed.");

    const resUsers = await pool.query('SELECT id, email, role, "agencyId" FROM "user"');
    console.log("Updated user records:");
    console.table(resUsers.rows);

  } catch (e) {
    console.error("Cleanup failed:", e);
  } finally {
    await pool.end();
  }
}

clean();
