// Built-in node:test runner — no external dependency.
// Run via `npm test`.

const test = require('node:test');
const assert = require('node:assert');

// Force in-memory backend (clear any Upstash env vars).
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const { createRateLimiter } = require('../middleware/rateLimit');

function fakeReqRes(ip = '1.2.3.4') {
  const headers = { 'x-forwarded-for': ip };
  let statusCode = 200;
  let body = null;
  const res = {
    set() { return res; },
    status(code) { statusCode = code; return res; },
    json(payload) { body = payload; return res; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
  const req = { headers, ip, socket: { remoteAddress: ip } };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, nextCalledRef: () => nextCalled };
}

test('rateLimit allows the first N requests', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, keyPrefix: 'unit-a' });
  for (let i = 0; i < 3; i++) {
    const { req, res, next, nextCalledRef } = fakeReqRes('10.0.0.1');
    await limiter(req, res, next);
    assert.strictEqual(nextCalledRef(), true, `request ${i + 1} should pass`);
    assert.strictEqual(res.body, null);
  }
});

test('rateLimit blocks request N+1 with 429 + RATE_LIMITED + Retry-After', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, keyPrefix: 'unit-b' });
  for (let i = 0; i < 2; i++) {
    const { req, res, next } = fakeReqRes('10.0.0.2');
    await limiter(req, res, next);
  }
  const { req, res, next, nextCalledRef } = fakeReqRes('10.0.0.2');
  await limiter(req, res, next);
  assert.strictEqual(nextCalledRef(), false);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(res.body.code, 'RATE_LIMITED');
  assert.ok(res.body.retryAfter > 0);
});

test('rateLimit keys are per-IP', async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyPrefix: 'unit-c' });
  {
    const { req, res, next, nextCalledRef } = fakeReqRes('1.1.1.1');
    await limiter(req, res, next);
    assert.strictEqual(nextCalledRef(), true);
  }
  {
    const { req, res, next, nextCalledRef } = fakeReqRes('2.2.2.2');
    await limiter(req, res, next);
    assert.strictEqual(nextCalledRef(), true, 'different IP should not share quota');
  }
});
