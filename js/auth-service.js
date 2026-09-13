/* ==========================================================================
   인증 계층
   --------------------------------------------------------------------------
   teacher.js / student.js 는 더 이상 이 파일을 쓰지 않는다. 둘 다 이름+
   비밀번호를 firebase-service.js(로컬 저장소)에 직접 대조해서 로그인한다.

   이 파일은 portfolio.html 이 아직 가져다 쓰는 watchAuth/renderSetupNotice
   같은 공용 도우미만 유지하기 위해 남아 있다. 아래 학생 Google 로그인
   관련 함수들은 실제로 호출되는 곳이 없는 예전 코드다.
   ========================================================================== */

import {
  initFirebase, getAuthInstance,
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, linkWithPopup,
  setPersistence, browserSessionPersistence,
  getStudentDoc, callApi, loadSettings, ApiError
} from './firebase-service.js';

/* ── 학생 ────────────────────────────────────────────────────────────── */

const GENERIC_LOGIN_ERROR = '이름 또는 비밀번호를 확인해 주세요.';

/**
 * 학생 로그인 (이름 + 비밀번호)
 * 1) 서버에서 loginName → 내부 인증 이메일 조회
 * 2) Firebase Email/Password 로그인
 */
export async function loginStudentWithPassword(loginName, password) {
  initFirebase();
  const auth = getAuthInstance();

  // 공용 기기를 고려해 탭을 닫으면 세션이 남지 않도록 한다.
  await setPersistence(auth, browserSessionPersistence);

  let authEmail;
  try {
    const res = await callApi(
      '/api/auth/resolve-student-login',
      { loginName },
      { auth: false }
    );
    authEmail = res.authEmail;
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) throw e;   // 서버 설정 안내는 그대로 노출
    throw new Error(GENERIC_LOGIN_ERROR);
  }
  if (!authEmail) throw new Error(GENERIC_LOGIN_ERROR);

  try {
    const cred = await signInWithEmailAndPassword(auth, authEmail, password);
    return cred.user;
  } catch (e) {
    console.warn('[auth] 학생 로그인 실패', e?.code);
    if (e?.code === 'auth/user-disabled') {
      throw new Error('현재 사용할 수 없는 계정입니다. 담당 선생님께 문의해 주세요.');
    }
    if (e?.code === 'auth/too-many-requests') {
      throw new Error('로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.');
    }
    throw new Error(GENERIC_LOGIN_ERROR);
  }
}

/**
 * (예정) 학생 Google 로그인.
 * 학교에서 Google Workspace 계정을 나눠주게 되면 이 경로를 사용한다.
 * students/{uid} 문서가 있어야 학생으로 인정된다.
 */
export async function loginStudentWithGoogle() {
  initFirebase();
  const auth = getAuthInstance();
  await setPersistence(auth, browserSessionPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);

  const student = await getStudentDoc(cred.user.uid);
  if (!student) {
    await signOut(auth);
    throw new Error('등록되지 않은 계정입니다. 담당 선생님께 문의해 주세요.');
  }
  return cred.user;
}

/**
 * (예정) 현재 로그인한 학생 계정에 Google 계정을 연결한다.
 * Firebase UID 가 유지되므로 기존 활동 기록이 그대로 남는다.
 */
export async function linkStudentGoogleAccount() {
  const auth = getAuthInstance();
  const user = auth.currentUser;
  if (!user) throw new Error('먼저 로그인해 주세요.');
  const provider = new GoogleAuthProvider();
  const cred = await linkWithPopup(user, provider);
  return cred.user;
}

/* ── 공통 ────────────────────────────────────────────────────────────── */

export async function logout() {
  try {
    await signOut(getAuthInstance());
  } finally {
    clearAutoLogout();
    // 로그아웃 후 브라우저에 개인 정보가 남지 않도록 정리한다.
    try {
      sessionStorage.removeItem('smartlab:student');
      localStorage.removeItem('smartlab:student');
    } catch { /* 저장소 접근 불가 환경 */ }
  }
}

export function watchAuth(callback) {
  initFirebase();
  return onAuthStateChanged(getAuthInstance(), callback);
}

export function currentUser() {
  try { return getAuthInstance().currentUser; } catch { return null; }
}

/* ── 자동 로그아웃 (공용 기기 대비) ──────────────────────────────────── */

let idleTimer = null;
let idleHandlers = null;

/**
 * 설정된 시간 동안 조작이 없으면 자동으로 로그아웃한다.
 * @param {number} minutes 0 이면 사용 안 함
 * @param {Function} onLogout 로그아웃 직전 호출
 */
export function startAutoLogout(minutes, onLogout) {
  clearAutoLogout();
  const ms = Number(minutes) * 60 * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return;

  const reset = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      await logout();
      onLogout?.();
    }, ms);
  };

  const events = ['click', 'keydown', 'touchstart', 'scroll', 'focus'];
  idleHandlers = { reset, events };
  events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
  reset();
}

export function clearAutoLogout() {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (idleHandlers) {
    idleHandlers.events.forEach(ev => window.removeEventListener(ev, idleHandlers.reset));
    idleHandlers = null;
  }
}

/** 설정값을 읽어 자동 로그아웃을 건다. */
export async function applyAutoLogout(onLogout) {
  const settings = await loadSettings();
  startAutoLogout(settings.studentLogoutMinutes, onLogout);
}

/* ── 설정 미완료 안내 화면 ───────────────────────────────────────────── */

export function renderSetupNotice(root) {
  root.innerHTML = `
    <div class="setup-screen">
      <div class="setup-box">
        <h1>Firebase 설정이 필요합니다</h1>
        <p class="muted" style="font-size:13px">
          <code>js/firebase-config.js</code> 파일의 <code>firebaseConfig</code> 값을
          실제 Firebase 프로젝트 값으로 바꿔 주세요.
        </p>
        <pre>Firebase Console
 → 프로젝트 설정(톱니)
 → 일반 탭
 → 내 앱 → 웹 앱
 → SDK 설정 및 구성 → "구성" 선택
 → 표시되는 firebaseConfig 객체를 복사</pre>
        <p class="muted" style="font-size:12.5px">
          이 값은 브라우저에 공개되어도 되는 값입니다.
          실제 데이터 보호는 <code>firestore.rules</code> 와 <code>storage.rules</code> 가 담당합니다.
        </p>
        <p class="mt-12"><a href="./index.html">← 처음 화면으로</a></p>
      </div>
    </div>`;
}
