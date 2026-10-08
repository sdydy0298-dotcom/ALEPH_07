import { query } from './_lib/db.js';
import {
  clearSessionCookie,
  createSession,
  changePasswordAndRotateSession,
  hashPassword,
  normalizeEmail,
  requireUser,
  revokeCurrentSession,
  validateEmail,
  validatePassword,
  verifyPassword,
  getSession
} from './_lib/auth.js';
import { json, failure, error, methodNotAllowed, readBody, text } from './_lib/http.js';

function actionOf(req) {
  const value = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  return String(value || '').toLowerCase();
}

async function signup(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = readBody(req);
  const email = normalizeEmail(body.email);
  const displayName = text(body.displayName, 40);
  const password = String(body.password ?? '');
  if (!validateEmail(email)) return failure(res, 400, 'INVALID_EMAIL', '올바른 이메일 주소를 입력해 주세요.');
  if (!displayName) return failure(res, 400, 'INVALID_NAME', '이름을 입력해 주세요.');
  const passwordError = validatePassword(password);
  if (passwordError) return failure(res, 400, 'WEAK_PASSWORD', passwordError);

  try {
    const passwordHash = await hashPassword(password);
    const created = await query(
      `INSERT INTO app_users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, created_at`,
      [email, displayName, passwordHash]
    );
    return json(res, 201, { ok: true, user: created.rows[0] });
  } catch (e) {
    if (e?.code === '23505') return failure(res, 409, 'EMAIL_EXISTS', '이미 사용 중인 이메일입니다.');
    console.error(e);
    return error(res, 500, 'SIGNUP_FAILED', '계정을 만들지 못했습니다.');
  }
}

async function login(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = readBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? '');
  if (!validateEmail(email) || !password) return failure(res, 401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해 주세요.');

  try {
    const found = await query(
      `SELECT id, email, display_name, password_hash, failed_attempts, lock_until, created_at
         FROM app_users WHERE email = $1 LIMIT 1`,
      [email]
    );
    const user = found.rows[0];
    if (!user) return failure(res, 401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해 주세요.');

    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      const minutes = Math.max(1, Math.ceil((new Date(user.lock_until).getTime() - Date.now()) / 60000));
      return failure(res, 429, 'ACCOUNT_TEMPORARILY_LOCKED', '이메일 또는 비밀번호를 확인해 주세요.', { retryAfterMinutes: minutes });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const attempt = Number(user.failed_attempts || 0) + 1;
      if (attempt >= 5) {
        await query(`UPDATE app_users SET failed_attempts = 0, lock_until = NOW() + INTERVAL '10 minutes', updated_at = NOW() WHERE id = $1`, [user.id]);
      } else {
        await query('UPDATE app_users SET failed_attempts = $2, updated_at = NOW() WHERE id = $1', [user.id, attempt]);
      }
      return failure(res, 401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해 주세요.');
    }

    await query('UPDATE app_users SET failed_attempts = 0, lock_until = NULL, updated_at = NOW() WHERE id = $1', [user.id]);
    const expiresAt = await createSession(req, res, user.id);
    return json(res, 200, {
      ok: true,
      user: { id: user.id, email: user.email, display_name: user.display_name, created_at: user.created_at },
      session: { expiresAt, durationHours: 8 }
    });
  } catch (e) {
    console.error(e);
    return error(res, 500, 'LOGIN_FAILED', '로그인 처리 중 오류가 발생했습니다.');
  }
}

async function me(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const s = await getSession(req);
  if (!s) return json(res, 200, { ok: true, authenticated: false, user: null, session: null });
  return json(res, 200, {
    ok: true,
    authenticated: true,
    user: { id: s.id, email: s.email, displayName: s.display_name, createdAt: s.created_at },
    session: { expiresAt: s.expires_at, durationHours: 8 }
  });
}

async function logout(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  await revokeCurrentSession(req).catch(() => {});
  clearSessionCookie(req, res);
  return json(res, 200, { ok: true });
}

async function password(req, res) {
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
  const session = await requireUser(req, res); if (!session) return;
  const body = readBody(req);
  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');
  const passwordError = validatePassword(newPassword);
  if (passwordError) return failure(res, 400, 'WEAK_PASSWORD', passwordError);
  if (currentPassword === newPassword) return failure(res, 400, 'PASSWORD_UNCHANGED', '새 비밀번호는 기존 비밀번호와 달라야 합니다.');

  const r = await query('SELECT password_hash FROM app_users WHERE id = $1', [session.id]);
  if (!r.rows[0] || !(await verifyPassword(currentPassword, r.rows[0].password_hash))) {
    return failure(res, 401, 'CURRENT_PASSWORD_INVALID', '현재 비밀번호가 올바르지 않습니다.');
  }
  const newHash = await hashPassword(newPassword);
  const expiresAt = await changePasswordAndRotateSession(req, res, session.id, newHash);
  return json(res, 200, { ok: true, session: { expiresAt, durationHours: 8 }, message: '비밀번호를 변경했고 기존 세션을 모두 무효화했습니다.' });
}

async function account(req, res) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);
  const session = await requireUser(req, res); if (!session) return;
  const password = String(readBody(req).password ?? '');
  const r = await query('SELECT password_hash FROM app_users WHERE id = $1', [session.id]);
  if (!r.rows[0] || !(await verifyPassword(password, r.rows[0].password_hash))) {
    return failure(res, 401, 'PASSWORD_INVALID', '비밀번호가 올바르지 않습니다.');
  }
  await query('DELETE FROM app_users WHERE id = $1', [session.id]);
  clearSessionCookie(req, res);
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  try {
    const action = actionOf(req);
    if (action === 'signup') return signup(req, res);
    if (action === 'login') return login(req, res);
    if (action === 'me') return me(req, res);
    if (action === 'logout') return logout(req, res);
    if (action === 'password') return password(req, res);
    if (action === 'account') return account(req, res);
    return failure(res, 404, 'AUTH_ACTION_NOT_FOUND', '지원하지 않는 인증 요청입니다.');
  } catch (e) {
    console.error(e);
    return error(res, 500, 'AUTH_REQUEST_FAILED', '인증 요청을 처리하지 못했습니다.');
  }
}
