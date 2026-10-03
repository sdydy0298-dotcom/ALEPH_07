export function setSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export function json(res, status, data) {
  setSecurityHeaders(res);
  return res.status(status).json(data);
}

export function error(res, status, code, message, extra = {}) {
  return json(res, status, { ok: false, error: { code, message, ...extra } });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return error(res, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식입니다.');
}

export function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

export function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function integer(value, min = 0, max = 1_000_000) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

export function isoDate(value) {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return s;
}
