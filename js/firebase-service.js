/* ==========================================================================
   데이터 접근 계층 (이 브라우저의 localStorage 에 저장)
   --------------------------------------------------------------------------
   원래는 Firebase(Firestore/Auth)를 썼지만, 지금은 로그인이 정해진 계정
   (교사: 성소연/0000, 학생: 학생 관리 화면에서 등록) 하나뿐인 단일 사용자
   도구라 서버 없이 이 브라우저에만 실제로 저장한다.

   화면 코드(teacher.js, student.js, views/*.js)는 예전과 똑같은 함수
   이름으로 이 파일을 호출한다 — 저장 위치만 Firestore에서 localStorage로
   바뀌었을 뿐, 호출하는 쪽은 손댈 필요가 없다.

   ▶ 사진·활동지 업로드는 용량이 커서 브라우저 저장소에 그대로 담기 어렵다.
     1.5MB 이하 파일만 데이터 URL로 저장하고, 그보다 크면 안내 메시지를
     보여준다.
   ▶ Gemini(초안 생성)·YouTube(영상 검색) 기능은 서버 API 키가 필요해
     이 방식으로는 대신할 수 없다. 호출하면 "지금 사용할 수 없다"는
     안내가 뜬다.
   ========================================================================== */

import {
  TEACHER_ACCOUNT, INITIAL_SETTINGS, INITIAL_SESSIONS, INITIAL_PRIVATES,
  INITIAL_STUDENTS, INITIAL_INVENTORY
} from './demo-data.js';

/* ── 인증 관련 이름 재수출 (호환용 스텁) ────────────────────────────────
   auth-service.js / portfolio.html 이 이 이름들을 가져다 쓴다.
   실제 로그인은 teacher.js/student.js 가 이름+비밀번호로 직접 처리하므로
   여기서는 아무 것도 하지 않는 껍데기만 제공한다. */

export class GoogleAuthProvider { setCustomParameters() {} }
export async function signInWithPopup() { throw new Error('사용할 수 없습니다.'); }
export async function signInWithEmailAndPassword() { throw new Error('사용할 수 없습니다.'); }
export async function signOut() {}
export function onAuthStateChanged(auth, cb) { cb(null); return () => {}; }
export async function linkWithPopup() { throw new Error('사용할 수 없습니다.'); }
export async function setPersistence() {}
export const browserLocalPersistence = {};
export const browserSessionPersistence = {};

/* ── 초기화 (항상 준비된 상태) ───────────────────────────────────────── */

export function firebaseReady() { return true; }
export function initFirebase() { return {}; }
export function getDb() { return {}; }
export function getAuthInstance() { return { currentUser: null }; }
export function getStorageInstance() { return {}; }

/* ── 상수 ────────────────────────────────────────────────────────────── */

export const SESSION_STATUS = {
  draft:     { label: '작성중',    badge: '',       studentVisible: false },
  published: { label: '학생 공개', badge: 'accent', studentVisible: true  },
  done:      { label: '수업 완료', badge: 'ok',     studentVisible: true  },
  archived:  { label: '기록 보관', badge: 'info',   studentVisible: true  }
};

export const MATERIAL_STATUS = [
  '보유', '구매 필요', '주문 완료', '수령 완료', '준비 완료', '사용 완료'
];

/** 구매 흐름에서 '아직 처리할 일이 남은' 상태 */
export const PENDING_PURCHASE = ['구매 필요', '주문 완료', '수령 완료'];

export const FIELDS = ['물리', '화학', '생명', '지구과학', '천문', '디지털', '제작', '기타'];

export const MATERIAL_CATEGORIES = ['소모품', '실험기구', '안전용품', '기타'];

export const DEFAULT_REPORT_QUESTIONS = [
  { id: 'q1', text: '오늘 활동에서 어떤 결과가 나타났나요?', type: 'long' },
  { id: 'q2', text: '왜 이런 결과가 나타났다고 생각하나요?', type: 'long' },
  { id: 'q3', text: '오늘 새롭게 알게 된 점은 무엇인가요?', type: 'long' },
  { id: 'q4', text: '한 줄 소감', type: 'short' }
];

export const DEFAULT_SETTINGS = {
  siteName: '스마트과학반 LAB',
  schoolName: '동대문중학교',
  teacherName: '성소연',
  year: 2026,
  periodStart: '2026-09-02',
  periodEnd: '2026-11-11',
  totalBudget: 1000000,
  contactEmail: '',
  studentLogoutMinutes: 60,
  geminiEnabled: true,
  youtubeEnabled: true,
  intro: '실험으로 과학을 직접 확인하는 중학교 방과후 활동입니다.'
};

/* ── 로컬 저장소 ─────────────────────────────────────────────────────── */

const DB_KEY = 'smartlab:db:v1';

function freshDb() {
  const sessions = {};
  INITIAL_SESSIONS.forEach(s => { sessions[s.id] = { ...s }; });
  const privates = {};
  INITIAL_PRIVATES.forEach((p, id) => { privates[id] = { ...p, materials: (p.materials || []).map(m => ({ ...m })) }; });
  const students = {};
  INITIAL_STUDENTS.forEach(s => { students[s.uid] = { ...s }; });
  const inventory = {};
  INITIAL_INVENTORY.forEach(i => { inventory[i.id] = { ...i }; });
  return {
    settings: { ...INITIAL_SETTINGS },
    sessions, privates, students,
    reflections: {},
    inventory,
    templates: {}
  };
}

let dbCache = null;

function loadDb() {
  if (dbCache) return dbCache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) { dbCache = JSON.parse(raw); return dbCache; }
  } catch { /* 저장소 접근 불가 환경 */ }
  dbCache = freshDb();
  persistDb();
  return dbCache;
}

function persistDb() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(dbCache)); } catch { /* 저장소 접근 불가 환경 */ }
}

function nowIso() { return new Date().toISOString(); }
function newId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function withoutPassword(s) { const { password, ...rest } = s; return rest; }

const byDate = (a, b) =>
  String(a.date || '').localeCompare(String(b.date || '')) ||
  (Number(a.order || 0) - Number(b.order || 0));

/* ── 설정 ────────────────────────────────────────────────────────────── */

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...loadDb().settings };
}

export function cachedSettings() {
  const db = loadDb();
  return { ...DEFAULT_SETTINGS, ...db.settings };
}

export async function saveSettings(patch) {
  const db = loadDb();
  db.settings = { ...db.settings, ...patch };
  persistDb();
  return cachedSettings();
}

/* ── 권한 / 학생 계정 조회 ───────────────────────────────────────────── */

/** 지금은 관리자 개념이 없다 (교사 계정이 하나뿐). */
export async function isAdminUid() { return false; }

export async function getStudentDoc(uid) {
  const s = loadDb().students[uid];
  return s ? withoutPassword(s) : null;
}

/** 학생 로그인 확인: teacher.js 의 성소연/0000 처럼, 이름+비밀번호를 직접 대조한다. */
export async function checkStudentLogin(displayName, password) {
  const db = loadDb();
  const match = Object.values(db.students).find(s => s.displayName === displayName);
  if (!match || match.password !== password || match.status === 'inactive') return null;
  return withoutPassword(match);
}

/* ── 수업(공개 영역) ─────────────────────────────────────────────────── */

/** 교사용: 전체 수업 */
export async function listSessions(year) {
  const db = loadDb();
  return Object.values(db.sessions)
    .filter(s => !year || Number(s.year) === Number(year))
    .sort(byDate);
}

/** 학생용: 공개된 수업만 */
export async function listPublicSessions(year) {
  const db = loadDb();
  return Object.values(db.sessions)
    .filter(s => s.isPublic === true)
    .filter(s => !year || Number(s.year) === Number(year))
    .sort(byDate);
}

export async function getSession(id) {
  const s = loadDb().sessions[id];
  return s ? { ...s } : null;
}

/** 공개 영역 저장. status 에 따라 isPublic 을 항상 함께 갱신한다. */
export async function saveSessionPublic(id, data) {
  const db = loadDb();
  const status = data.status || 'draft';
  const payload = {
    ...data,
    id,
    status,
    isPublic: status !== 'draft',
    updatedAt: nowIso()
  };
  db.sessions[id] = { ...(db.sessions[id] || {}), ...payload };
  persistDb();
  return { ...db.sessions[id] };
}

export async function deleteSession(id) {
  const db = loadDb();
  delete db.sessions[id];
  delete db.privates[id];
  persistDb();
}

/* ── 수업(교사 전용 영역) ────────────────────────────────────────────── */

export const EMPTY_PRIVATE = {
  plan: '',
  runPlan: '',
  goal: '',
  materials: [],
  checklist: [],
  safety: '',
  planB: '',
  liveNotes: [],
  attendance: {},
  contestRows: [],
  result: '',
  goodPoints: '',
  badPoints: '',
  nextTime: '',
  usage: '',
  estimatedCost: 0,
  actualCost: 0,
  reflection: '',
  reflectionSummary: '',
  portfolioDraft: null,
  recommend: '',
  successCount: null,
  failCount: null,
  retryCount: null
};

export async function getSessionPrivate(sessionId) {
  const p = loadDb().privates[sessionId];
  return p ? { ...EMPTY_PRIVATE, ...p } : { ...EMPTY_PRIVATE };
}

export async function saveSessionPrivate(sessionId, data) {
  const db = loadDb();
  db.privates[sessionId] = { ...(db.privates[sessionId] || {}), ...data, updatedAt: nowIso() };
  persistDb();
}

/** 모든 수업의 교사 전용 문서를 한 번에 가져온다 (준비물/구매 통합 화면용) */
export async function listAllPrivate(sessionIds) {
  const db = loadDb();
  return new Map(sessionIds.map(id => [
    id, db.privates[id] ? { ...EMPTY_PRIVATE, ...db.privates[id] } : { ...EMPTY_PRIVATE }
  ]));
}

/* ── 학생 ────────────────────────────────────────────────────────────── */

export async function listStudents(year) {
  const db = loadDb();
  return Object.values(db.students)
    .filter(s => !year || Number(s.year) === Number(year))
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ko'))
    .map(withoutPassword);
}

/* ── 간이보고서 ──────────────────────────────────────────────────────── */

export function reflectionId(sessionId, studentUid) {
  return `${sessionId}_${studentUid}`;
}

/** 교사용: 특정 수업의 모든 보고서 */
export async function listReflectionsBySession(sessionId) {
  return Object.values(loadDb().reflections).filter(r => r.sessionId === sessionId);
}

/** 교사용: 전체 보고서 (제출 현황 집계) */
export async function listAllReflections() {
  return Object.values(loadDb().reflections);
}

/** 학생용: 내 보고서만 */
export async function listMyReflections(uid) {
  return Object.values(loadDb().reflections).filter(r => r.studentUid === uid);
}

export async function getReflection(sessionId, studentUid) {
  const id = reflectionId(sessionId, studentUid);
  const r = loadDb().reflections[id];
  return r ? { id, ...r } : null;
}

export async function saveReflection(sessionId, studentUid, payload) {
  const db = loadDb();
  const id = reflectionId(sessionId, studentUid);
  const existing = db.reflections[id];
  const now = nowIso();
  const body = {
    sessionId,
    studentUid,
    answers: payload.answers || [],
    rating: Number(payload.rating) || 0,
    updatedAt: now,
    createdAt: existing?.createdAt || now
  };
  db.reflections[id] = body;
  persistDb();
  return { id, ...body };
}

/* ── 재고 ────────────────────────────────────────────────────────────── */

export async function listInventory() {
  const db = loadDb();
  return Object.values(db.inventory).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

export async function saveInventoryItem(id, data) {
  const db = loadDb();
  const useId = id || newId('inv');
  db.inventory[useId] = { ...(db.inventory[useId] || {}), ...data, id: useId, updatedAt: nowIso() };
  persistDb();
  return { ...db.inventory[useId] };
}

export async function deleteInventoryItem(id) {
  const db = loadDb();
  delete db.inventory[id];
  persistDb();
}

/* ── 실험 보관함 ─────────────────────────────────────────────────────── */

export async function listTemplates() {
  const db = loadDb();
  return Object.values(db.templates).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

export async function saveTemplate(id, data) {
  const db = loadDb();
  const useId = id || newId('tpl');
  db.templates[useId] = { ...(db.templates[useId] || {}), ...data, id: useId };
  persistDb();
}

export async function deleteTemplate(id) {
  const db = loadDb();
  delete db.templates[id];
  persistDb();
}

/* ── 파일 업로드 ─────────────────────────────────────────────────────── */
/* 서버 저장소가 없어 브라우저에 데이터 URL로 담는다. 용량이 크면 담을 수
   없어 안내만 하고 실패시킨다. */

const MAX_LOCAL_UPLOAD = 1.5 * 1024 * 1024;

export async function uploadFile(file, scope, subPath) {
  if (!file) throw new Error('파일이 없습니다.');
  if (file.size > MAX_LOCAL_UPLOAD) {
    throw new Error('이 브라우저 저장 모드에서는 1.5MB 이하 파일만 업로드할 수 있습니다.');
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
  const path = `${scope}/${subPath}/${Date.now()}_${file.name}`;
  return { url: dataUrl, path, name: file.name, size: file.size, type: file.type };
}

export async function deleteFile() {
  // 데이터 URL은 세션 문서에서 참조를 지우기만 하면 된다. 별도 삭제가 필요 없다.
}

/* ── 서버 API (Gemini · YouTube · 학생 계정 관리) ───────────────────── */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function localAdminStudents(body) {
  const db = loadDb();
  const { action, uid, displayName, loginName, studentNo, year, status, password } = body;

  if (action === 'create') {
    if (!displayName || !loginName) throw new ApiError('이름을 모두 입력해 주세요.', 400);
    if (!password || password.length < 6) throw new ApiError('비밀번호는 6자 이상이어야 합니다.', 400);
    const newUid = newId('s');
    db.students[newUid] = {
      uid: newUid, displayName, loginName,
      studentNo: studentNo || '', year: year || db.settings.year,
      status: status || 'active', password, createdAt: nowIso()
    };
    persistDb();
    return { ok: true, uid: newUid };
  }

  if (action === 'update') {
    const s = db.students[uid];
    if (!s) throw new ApiError('학생을 찾을 수 없습니다.', 404);
    db.students[uid] = { ...s, displayName, loginName, studentNo, year, status };
    persistDb();
    return { ok: true };
  }

  if (action === 'resetPassword') {
    const s = db.students[uid];
    if (!s) throw new ApiError('학생을 찾을 수 없습니다.', 404);
    if (!password || password.length < 6) throw new ApiError('비밀번호는 6자 이상이어야 합니다.', 400);
    db.students[uid] = { ...s, password };
    persistDb();
    return { ok: true };
  }

  throw new ApiError('알 수 없는 요청입니다.', 400);
}

/**
 * 학생 계정 관리는 서버 없이 이 브라우저에서 바로 처리한다.
 * Gemini(초안 생성)·YouTube(영상 검색)는 서버의 API 키가 있어야 해서
 * 이 방식으로는 대신할 수 없다 — 호출하면 안내 메시지를 던진다.
 */
export async function callApi(path, body) {
  if (path === '/api/admin/students') {
    return localAdminStudents(body || {});
  }
  throw new ApiError('이 기능은 지금 사용할 수 없습니다. (서버 연결 없이 브라우저에만 저장하는 모드)', 501);
}
