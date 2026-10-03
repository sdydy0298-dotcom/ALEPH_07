import { query } from './_lib/db.js';
import { json, error, methodNotAllowed } from './_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const r = await query(`SELECT NOW() AS server_time, (NOW() AT TIME ZONE 'Asia/Seoul')::date AS kst_date`);
    return json(res, 200, { ok: true, database: 'postgres', serverTime: r.rows[0].server_time, kstDate: r.rows[0].kst_date });
  } catch (e) {
    console.error(e);
    return error(res, 503, 'DATABASE_UNAVAILABLE', '데이터베이스 연결을 확인해 주세요.');
  }
}
