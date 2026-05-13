// Lightweight in-memory rate limiter (no external dependency).
//
// LIMITATIONS — read before assuming this is "real" rate limiting:
//   * State is per-Function-instance. Vercel may run several warm
//     instances in parallel; an attacker hitting different instances
//     can multiply the effective limit. Acceptable as defense-in-depth
//     for an admin-only app of this size.
//   * No persistence across cold starts — counters reset.
//   * For production-grade defense, layer a managed solution
//     (Vercel KV / Upstash Redis) behind this same interface.
//
// Returns an Express middleware. On limit-exceed it sends a clean JSON
// 429 with a Retry-After header.

function ipKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({ windowMs, max, keyPrefix = '', message = 'Too many requests' }) {
  const buckets = new Map();

  function gc(now) {
    if (buckets.size < 1024) return;
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = `${keyPrefix}:${ipKey(req)}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      gc(now);
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMITED',
        retryAfter: retryAfterSec,
      });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
