// Production startup warning. Scream (in logs) if any credential is
// still the well-known default. Never crashes the app.

const DEFAULT_USERNAME = 'ADMIN';
const DEFAULT_PASSWORD = 'ADMIN123';

function warnIfDefaultCredentials() {
  if (process.env.NODE_ENV !== 'production') return;

  const problems = [];

  if (!process.env.ADMIN_USERNAME || process.env.ADMIN_USERNAME === DEFAULT_USERNAME) {
    problems.push('ADMIN_USERNAME is the default "ADMIN" — rotate it');
  }

  const hasHash = Boolean(process.env.ADMIN_PASSWORD_HASH);
  if (!hasHash) {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === DEFAULT_PASSWORD) {
      problems.push('ADMIN_PASSWORD is the default "ADMIN123" — rotate it (or set ADMIN_PASSWORD_HASH)');
    }
  }

  if (problems.length === 0) return;

  const bar = '!'.repeat(72);
  console.warn(bar);
  console.warn('!! SECURITY WARNING — production is running with default credentials !!');
  for (const p of problems) console.warn(`!!  - ${p}`);
  console.warn('!! Update Vercel → Project → Settings → Environment Variables, then redeploy.');
  console.warn(bar);
}

module.exports = { warnIfDefaultCredentials };
