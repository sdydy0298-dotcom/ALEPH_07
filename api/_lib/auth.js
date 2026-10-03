import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from './db.js';
import { error } from './http.js';

export const SESSION_COOKIE = 'pds_session';
export const SESSION_HOURS = 8;
const BCRYPT_COST = 12;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function validatePassword(password) {
  if (typeof password !== 'string') return '비밀번호를 입력해 주세요.';
  if (password.length < 12) return '비밀번호는 12자 이상이어야 합니다.';
  if (Buffer.byteLength(password, 'utf8') > 72) return '비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return '영문 대/소문자, 숫자, 특수문자를 각각 1개 이상 포함해 주세요.';
  }
  return null;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password, hash) {
  try { return await bcrypt.compare(password, hash); } catch { return false; }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  for (const chunk of raw.split(';')) {
    const idx = chunk.indexOf('=');
    if (idx < 0) continue;
    const key = chunk.slice(0, idx).trim();
    const value = chunk.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookieSecure(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '');
  return proto === 'https' || process.env.VERCEL === '1';
}

function cookieHeader(req, token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (cookieSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
}

export async function createSession(req, res, userId, client = null) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const executor = client ?? { query };
  const result = await executor.query(
    `INSERT INTO app_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)
     RETURNING expires_at`,
    [userId, tokenHash, String(SESSION_HOURS)]
  );
  res.setHeader('Set-Cookie', cookieHeader(req, token, SESSION_HOURS * 3600));
  return result.rows[0].expires_at;
}

export async function revokeCurrentSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return;
  await query('DELETE FROM app_sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const result = await query(
    `SELECT s.id AS session_id, s.expires_at,
            u.id, u.email, u.display_name, u.created_at
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()
      LIMIT 1`,
    [tokenHash]
  );
  if (!result.rows[0]) {
    await query('DELETE FROM app_sessions WHERE token_hash = $1', [tokenHash]).catch(() => {});
    return null;
  }
  await query('UPDATE app_sessions SET last_seen_at = NOW() WHERE id = $1', [result.rows[0].session_id]).catch(() => {});
  return result.rows[0];
}

export async function requireUser(req, res) {
  const session = await getSession(req);
  if (!session) {
    error(res, 401, 'AUTH_REQUIRED', '로그인이 필요한 요청입니다.');
    return null;
  }
  return session;
}

export async function changePasswordAndRotateSession(req, res, userId, newPasswordHash) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE app_users
          SET password_hash = $2, password_changed_at = NOW(), failed_attempts = 0,
              lock_until = NULL, updated_at = NOW()
        WHERE id = $1`,
      [userId, newPasswordHash]
    );
    await client.query('DELETE FROM app_sessions WHERE user_id = $1', [userId]);
    return createSession(req, res, userId, client);
  });
}
