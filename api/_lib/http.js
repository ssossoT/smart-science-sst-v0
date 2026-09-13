// API 공통 유틸 - 응답 형식, 인증 검증, 간단한 호출 제한
import { getAdmin } from './firebase-admin.js';

export function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

/**
 * 사용자에게 보여줄 안전한 메시지만 내려보낸다.
 * 원문 오류와 키 정보는 서버 로그에만 남긴다.
 */
export function fail(res, status, userMessage, internal) {
  if (internal) console.error('[api]', userMessage, internal);
  sendJson(res, status, { ok: false, error: userMessage });
}

export function ok(res, data) {
  sendJson(res, 200, { ok: true, ...data });
}

export function methodGuard(req, res, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(req.method)) {
    res.setHeader('Allow', list.join(', '));
    fail(res, 405, '허용되지 않은 요청 방식입니다.');
    return false;
  }
  return true;
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Firebase ID Token 검증 후 관리자(admins/{uid}) 여부까지 확인한다.
 * 실패하면 응답을 직접 내려보내고 null 을 반환한다.
 */
export async function requireAdmin(req, res) {
  const token = bearerToken(req);
  if (!token) {
    fail(res, 401, '로그인이 필요합니다.');
    return null;
  }
  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    fail(res, 503, '서버 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.', e);
    return null;
  }
  let decoded;
  try {
    decoded = await admin.auth.verifyIdToken(token, true);
  } catch (e) {
    fail(res, 401, '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.', e);
    return null;
  }
  try {
    const snap = await admin.db.collection('admins').doc(decoded.uid).get();
    if (!snap.exists) {
      fail(res, 403, '관리자 권한이 없습니다.');
      return null;
    }
  } catch (e) {
    fail(res, 500, '권한을 확인하지 못했습니다.', e);
    return null;
  }
  return { uid: decoded.uid, email: decoded.email || '', admin };
}

/** 인스턴스 메모리 기반의 가벼운 호출 제한(무차별 대입 완화용) */
const buckets = new Map();
export function rateLimit(key, { limit = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count += 1;
  if (buckets.size > 5000) buckets.clear();
  return entry.count <= limit;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
