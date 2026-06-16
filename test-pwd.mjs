import { verifyPassword, hashPassword } from '@better-auth/utils/password';
import bcrypt from 'bcryptjs';

async function test() {
  const hash2a = await bcrypt.hash("ADMIN", 10);
  console.log("bcryptjs hash:", hash2a);
  
  const hash2b = hash2a.replace('$2a$', '$2b$');
  console.log("modified hash:", hash2b);

  try {
    const ok = await verifyPassword({ password: "ADMIN", hash: hash2b });
    console.log("better-auth verify with 2b:", ok);
  } catch (e) {
    console.error("better-auth verify failed:", e);
  }
}
test();
