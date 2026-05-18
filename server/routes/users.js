const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { all, get, run } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = new Set(['admin', 'staff']);

function sanitize(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const rows = await all(`SELECT id, email, role, "createdAt", "updatedAt" FROM users ORDER BY "createdAt" ASC`);
    res.json(rows.map(sanitize));
  } catch (err) {
    console.error('[USERS] list error:', err.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const role = typeof body.role === 'string' ? body.role : 'staff';

    if (!EMAIL_RE.test(email) || email.length > 200) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (!password || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must be 8–200 characters' });
    }
    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await get(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, 10);

    await run(
      `INSERT INTO users (id, email, "passwordHash", role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, email, passwordHash, role, now, now]
    );

    res.status(201).json(sanitize({ id, email, role, createdAt: now, updatedAt: now }));
  } catch (err) {
    console.error('[USERS] create error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!password || password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Password must be 8–200 characters' });
    }

    const user = await get(`SELECT id FROM users WHERE id = $1`, [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    await run(
      `UPDATE users SET "passwordHash" = $1, "updatedAt" = $2 WHERE id = $3`,
      [passwordHash, now, id]
    );

    // Invalidate any active sessions for that user so they must log in again.
    await run(`DELETE FROM sessions WHERE "userId" = $1`, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] reset-password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admins from deleting their own account.
    if (req.user?.id && req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await get(`SELECT id, role FROM users WHERE id = $1`, [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'admin') {
      const adminCount = await get(`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`);
      if (adminCount && adminCount.n <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last admin user' });
      }
    }

    await run(`DELETE FROM sessions WHERE "userId" = $1`, [id]);
    await run(`DELETE FROM users WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[USERS] delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
