// 학생 계정 관리 (관리자 전용)
// 학생 계정 생성은 Admin SDK 로만 수행한다.
// 브라우저에서 createUserWithEmailAndPassword 를 쓰면 선생님 세션이 학생으로 바뀌기 때문이다.
import { methodGuard, readBody, ok, fail, requireAdmin } from '../_lib/http.js';
import { normalizeLoginName } from '../auth/resolve-student-login.js';

const EMAIL_DOMAIN = 'smartlab.local';

function newAuthEmail() {
  const rand = (globalThis.crypto?.randomUUID?.() || String(Math.random())).replace(/-/g, '').slice(0, 12);
  return `s-${rand}@${EMAIL_DOMAIN}`;
}

function validate({ displayName, loginName, password, requirePassword }) {
  if (!displayName || String(displayName).trim().length < 1) return '표시 이름을 입력해 주세요.';
  if (String(displayName).trim().length > 20) return '표시 이름이 너무 깁니다.';
  const key = normalizeLoginName(loginName);
  if (!key) return '로그인 이름을 입력해 주세요.';
  if (key.length > 40) return '로그인 이름이 너무 깁니다.';
  if (requirePassword || password) {
    if (!password || String(password).length < 6) return '비밀번호는 6자 이상이어야 합니다.';
    if (String(password).length > 72) return '비밀번호가 너무 깁니다.';
  }
  return null;
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const session = await requireAdmin(req, res);
  if (!session) return;
  const { admin } = session;
  const { db, auth } = admin;

  const body = await readBody(req);
  const action = body.action;

  try {
    if (action === 'create') {
      const err = validate({ ...body, requirePassword: true });
      if (err) return fail(res, 400, err);

      const key = normalizeLoginName(body.loginName);
      const aliasRef = db.collection('studentLoginAliases').doc(key);
      if ((await aliasRef.get()).exists) {
        return fail(res, 409, '이미 사용 중인 로그인 이름입니다. 다른 이름을 지정해 주세요.');
      }

      const authEmail = newAuthEmail();
      const user = await auth.createUser({
        email: authEmail,
        password: String(body.password),
        displayName: String(body.displayName).trim()
      });

      const doc = {
        displayName: String(body.displayName).trim(),
        loginName: String(body.loginName).trim(),
        loginNameKey: key,
        authEmail,
        studentNo: body.studentNo ? String(body.studentNo).trim() : '',
        year: Number(body.year) || new Date().getFullYear(),
        status: 'active',
        createdAt: new Date().toISOString()
      };

      const batch = db.batch();
      batch.set(db.collection('students').doc(user.uid), doc);
      batch.set(aliasRef, {
        uid: user.uid,
        authEmail,
        displayName: doc.displayName,
        status: 'active'
      });
      await batch.commit();

      return ok(res, { uid: user.uid, student: { uid: user.uid, ...doc } });
    }

    if (action === 'update') {
      const uid = String(body.uid || '');
      if (!uid) return fail(res, 400, '학생을 선택해 주세요.');
      const ref = db.collection('students').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) return fail(res, 404, '학생 정보를 찾을 수 없습니다.');
      const prev = snap.data();

      const err = validate({ displayName: body.displayName, loginName: body.loginName });
      if (err) return fail(res, 400, err);

      const key = normalizeLoginName(body.loginName);
      const status = body.status === 'inactive' ? 'inactive' : 'active';
      const batch = db.batch();

      if (key !== prev.loginNameKey) {
        const nextAlias = db.collection('studentLoginAliases').doc(key);
        if ((await nextAlias.get()).exists) {
          return fail(res, 409, '이미 사용 중인 로그인 이름입니다.');
        }
        batch.delete(db.collection('studentLoginAliases').doc(prev.loginNameKey));
        batch.set(nextAlias, {
          uid,
          authEmail: prev.authEmail,
          displayName: String(body.displayName).trim(),
          status
        });
      } else {
        batch.set(
          db.collection('studentLoginAliases').doc(key),
          { uid, authEmail: prev.authEmail, displayName: String(body.displayName).trim(), status },
          { merge: true }
        );
      }

      const patch = {
        displayName: String(body.displayName).trim(),
        loginName: String(body.loginName).trim(),
        loginNameKey: key,
        studentNo: body.studentNo ? String(body.studentNo).trim() : '',
        year: Number(body.year) || prev.year,
        status
      };
      batch.set(ref, patch, { merge: true });
      await batch.commit();

      await auth.updateUser(uid, { disabled: status === 'inactive', displayName: patch.displayName });
      return ok(res, { student: { uid, ...prev, ...patch } });
    }

    if (action === 'resetPassword') {
      const uid = String(body.uid || '');
      if (!uid) return fail(res, 400, '학생을 선택해 주세요.');
      if (!body.password || String(body.password).length < 6) {
        return fail(res, 400, '비밀번호는 6자 이상이어야 합니다.');
      }
      await auth.updateUser(uid, { password: String(body.password) });
      // 새 비밀번호는 어디에도 저장하지 않는다.
      return ok(res, {});
    }

    return fail(res, 400, '알 수 없는 요청입니다.');
  } catch (e) {
    if (e?.code === 'auth/email-already-exists') {
      return fail(res, 409, '계정 생성에 실패했습니다. 다시 시도해 주세요.', e);
    }
    return fail(res, 500, '학생 계정 처리 중 오류가 발생했습니다.', e);
  }
}
