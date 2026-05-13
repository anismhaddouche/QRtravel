// Rate limiter with two backends:
//
//   * In-memory (default) — per-Function-instance Map. Best-effort only;
//     warm Vercel instances do not share state. Acceptable for an
//     admin-only app of this size.
//   * Upstash Redis REST — auto-enabled when both
//     UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set.
//     Uses INCR + EXPIRE via REST — no SDK dependency.
//
// If the chosen backend errors at runtime we *fail open* (allow the
// request). A transient KV outage must never lock real users out.

const HAS_REDIS = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

function ipKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ── In-memory backend ─────────────────────────────────────────────
function makeMemoryBackend() {
  const buckets = new Map();
  return {
    name: 'memory',
    async increment(key, windowMs) {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        if (buckets.size > 1024) {
          for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
        }
        return { count: 1, resetAt: now + windowMs };
      }
      bucket.count += 1;
      return { count: bucket.count, resetAt: bucket.resetAt };
    },
  };
}

// ── Upstash REST backend ──────────────────────────────────────────
function makeUpstashBackend() {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  async function cmd(args) {
    const res = await fetch(`${url}/${args.map(encodeURIComponent).join('/')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const json = await res.json();
    return json.result;
  }

  return {
    name: 'upstash',
    async increment(key, windowMs) {
      const sec = Math.max(1, Math.ceil(windowMs / 1000));
      const count = await cmd(['INCR', key]);
      if (count === 1) {
        try { await cmd(['EXPIRE', key, String(sec)]); } catch { /* best-effort */ }
      }
      return { count, resetAt: Date.now() + windowMs };
    },
  };
}

let _backend = null;
function backend() {
  if (_backend) return _backend;
  _backend = HAS_REDIS ? makeUpstashBackend() : makeMemoryBackend();
  console.log(`[rateLimit] backend=${_backend.name}`);
  return _backend;
}

function createRateLimiter({ windowMs, max, keyPrefix = '', message = 'Too many requests' }) {
  return async function rateLimit(req, res, next) {
    const key = `rl:${keyPrefix}:${ipKey(req)}`;
    try {
      const { count, resetAt } = await backend().increment(key, windowMs);
      if (count > max) {
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
          error: message,
          code: 'RATE_LIMITED',
          retryAfter: retryAfterSec,
        });
      }
      return next();
    } catch (err) {
      console.warn('[rateLimit] backend error, failing open:', err.message);
      return next();
    }
  };
}

module.exports = { createRateLimiter };
