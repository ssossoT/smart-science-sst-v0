// 학생 로그인 이름 -> 내부 인증 이메일 변환
// 학생은 이름과 비밀번호만 입력한다. 비밀번호는 이 서버를 거치지 않는다.
import { getAdmin } from '../_lib/firebase-admin.js';
import { methodGuard, readBody, ok, fail, rateLimit, clientIp } from '../_lib/http.js';

const GENERIC = '이름 또는 비밀번호를 확인해 주세요.';

/**
 * 로그인 이름을 Firestore 문서 ID 로 쓸 수 있는 형태로 정규화한다.
 * 로그인할 때와 계정을 만들 때 같은 함수를 쓰므로 항상 일치한다.
 * 공백과 대소문자는 무시하므로 "홍길동" 과 "홍 길동" 은 같은 계정이다.
 */
export function normalizeLoginName(value) {
  const key = String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, '')
    .replace(/[/\\.#$[\]]/g, '')   // 문서 ID 에 쓸 수 없는 문자 제거
    .toLowerCase();
  // __name__ 형태는 Firestore 예약어라 쓸 수 없다.
  return /^__.*__$/.test(key) ? '' : key;
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  const ip = clientIp(req);
  if (!rateLimit('resolve:' + ip, { limit: 20, windowMs: 60_000 })) {
    return fail(res, 429, '잠시 후 다시 시도해 주세요.');
  }

  const body = await readBody(req);
  const alias = normalizeLoginName(body.loginName);
  if (!alias || alias.length > 40) return fail(res, 400, GENERIC);

  let admin;
  try {
    admin = getAdmin();
  } catch (e) {
    return fail(res, 503, '학생 로그인 서버 설정이 완료되지 않았습니다. 담당 선생님께 문의해 주세요.', e);
  }

  try {
    const snap = await admin.db.collection('studentLoginAliases').doc(alias).get();
    if (!snap.exists) return fail(res, 404, GENERIC);

    const data = snap.data() || {};
    if (data.status && data.status !== 'active') {
      return fail(res, 403, '현재 사용할 수 없는 계정입니다. 담당 선생님께 문의해 주세요.');
    }
    if (!data.authEmail) return fail(res, 404, GENERIC);

    // 표시 이름은 로그인 후 인사말에만 쓰이며, 학번/UID 등은 내려보내지 않는다.
    return ok(res, { authEmail: data.authEmail, displayName: data.displayName || '' });
  } catch (e) {
    return fail(res, 500, '로그인 처리 중 오류가 발생했습니다.', e);
  }
}
