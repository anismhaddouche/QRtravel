import { verifyPassword } from '@better-auth/utils/password';
import bcrypt from 'bcryptjs';

async function test() {
  const hash2a = await bcrypt.hash("ADMIN", 10);
  const hash2b = hash2a.replace('$2a$', '$2b$');
  try {
    const ok = await verifyPassword({ password: "ADMIN", hash: hash2b });
    console.log("obj passed:", ok);
  } catch (e) {
    try {
      const ok = await verifyPassword("ADMIN", hash2b);
      console.log("args passed:", ok);
    } catch (e2) {
      console.log("both failed", e2.message);
    }
  }
}
test();
