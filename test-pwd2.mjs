import { betterAuth } from 'better-auth';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const auth = betterAuth({
  database: new Pool(),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password) => await bcrypt.hash(password, 10),
      verify: async (args) => {
         console.log("verify called with:", args);
         return true;
      }
    }
  }
});
console.log("Password config registered");
