/* ==========================================================================
   Firebase 초기화 + Firestore/Storage 접근 계층
   화면 코드는 이 파일을 통해서만 데이터에 접근한다.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, browserLocalPersistence, browserSessionPersistence, setPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, linkWithPopup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

export {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, writeBatch, serverTimestamp,
  GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, linkWithPopup,
  setPersistence, browserLocalPersistence, browserSessionPersistence
};

/* ── 초기화 ──────────────────────────────────────────────────────────── */

let app = null, auth = null, db = null, storage = null;

export function firebaseReady() { return isFirebaseConfigured(); }

export function initFirebase() {
  if (app) return { app, auth, db, storage };
  if (!isFirebaseConfigured()) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  return { app, auth, db, storage };
}

export function getDb() { if (!db) initFirebase(); return db; }
export function getAuthInstance() { if (!auth) initFirebase(); return auth; }
export function getStorageInstance() { if (!storage) initFirebase(); return storage; }

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

/* ── 설정 ────────────────────────────────────────────────────────────── */

let settingsCache = null;

export async function loadSettings({ force = false } = {}) {
  if (settingsCache && !force) return settingsCache;
  try {
    const snap = await getDoc(doc(getDb(), 'settings', 'site'));
    settingsCache = snap.exists()
      ? { ...DEFAULT_SETTINGS, ...snap.data() }
      : { ...DEFAULT_SETTINGS };
  } catch (e) {
    console.warn('[settings] 불러오기 실패, 기본값 사용', e);
    settingsCache = { ...DEFAULT_SETTINGS };
  }
  return settingsCache;
}

export function cachedSettings() { return settingsCache || { ...DEFAULT_SETTINGS }; }

export async function saveSettings(patch) {
  await setDoc(doc(getDb(), 'settings', 'site'), patch, { merge: true });
  settingsCache = { ...cachedSettings(), ...patch };
  return settingsCache;
}

/* ── 권한 ────────────────────────────────────────────────────────────── */

export async function isAdminUid(uid) {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(getDb(), 'admins', uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function getStudentDoc(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(getDb(), 'students', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/* ── 수업(공개 영역) ─────────────────────────────────────────────────── */

const byDate = (a, b) =>
  String(a.date || '').localeCompare(String(b.date || '')) ||
  (Number(a.order || 0) - Number(b.order || 0));

/** 교사용: 전체 수업 */
export async function listSessions(year) {
  const base = collection(getDb(), 'sessions');
  const q = year ? query(base, where('year', '==', Number(year))) : base;
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(byDate);
}

/** 학생용: 공개된 수업만. 보안 규칙이 isPublic 조건을 요구한다. */
export async function listPublicSessions(year) {
  const base = collection(getDb(), 'sessions');
  const snap = await getDocs(query(base, where('isPublic', '==', true)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => !year || Number(s.year) === Number(year))
    .sort(byDate);
}

export async function getSession(id) {
  const snap = await getDoc(doc(getDb(), 'sessions', id));
  return snap.exists() ? { id, ...snap.data() } : null;
}

/** 공개 영역 저장. status 에 따라 isPublic 을 항상 함께 갱신한다. */
export async function saveSessionPublic(id, data) {
  const status = data.status || 'draft';
  const payload = {
    ...data,
    status,
    isPublic: status !== 'draft',
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(getDb(), 'sessions', id), payload, { merge: true });
  return payload;
}

export async function deleteSession(id) {
  const db = getDb();
  // 교사 전용 하위 문서를 먼저 지운다.
  await deleteDoc(doc(db, 'sessions', id, 'private', 'teacher')).catch(() => {});
  await deleteDoc(doc(db, 'sessions', id));
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
  const snap = await getDoc(doc(getDb(), 'sessions', sessionId, 'private', 'teacher'));
  return snap.exists() ? { ...EMPTY_PRIVATE, ...snap.data() } : { ...EMPTY_PRIVATE };
}

export async function saveSessionPrivate(sessionId, data) {
  await setDoc(
    doc(getDb(), 'sessions', sessionId, 'private', 'teacher'),
    { ...data, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/** 모든 수업의 교사 전용 문서를 한 번에 가져온다 (준비물/구매 통합 화면용) */
export async function listAllPrivate(sessionIds) {
  const db = getDb();
  const results = await Promise.all(
    sessionIds.map(async id => {
      try {
        const snap = await getDoc(doc(db, 'sessions', id, 'private', 'teacher'));
        return [id, snap.exists() ? { ...EMPTY_PRIVATE, ...snap.data() } : { ...EMPTY_PRIVATE }];
      } catch {
        return [id, { ...EMPTY_PRIVATE }];
      }
    })
  );
  return new Map(results);
}

/* ── 학생 ────────────────────────────────────────────────────────────── */

export async function listStudents(year) {
  const snap = await getDocs(collection(getDb(), 'students'));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(s => !year || Number(s.year) === Number(year))
    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'ko'));
}

/* ── 간이보고서 ──────────────────────────────────────────────────────── */

export function reflectionId(sessionId, studentUid) {
  return `${sessionId}_${studentUid}`;
}

/** 교사용: 특정 수업의 모든 보고서 */
export async function listReflectionsBySession(sessionId) {
  const snap = await getDocs(
    query(collection(getDb(), 'reflections'), where('sessionId', '==', sessionId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** 교사용: 전체 보고서 (제출 현황 집계) */
export async function listAllReflections() {
  const snap = await getDocs(collection(getDb(), 'reflections'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** 학생용: 내 보고서만. 규칙이 studentUid 조건을 요구한다. */
export async function listMyReflections(uid) {
  const snap = await getDocs(
    query(collection(getDb(), 'reflections'), where('studentUid', '==', uid))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getReflection(sessionId, studentUid) {
  const id = reflectionId(sessionId, studentUid);
  const snap = await getDoc(doc(getDb(), 'reflections', id));
  return snap.exists() ? { id, ...snap.data() } : null;
}

export async function saveReflection(sessionId, studentUid, payload) {
  const id = reflectionId(sessionId, studentUid);
  const ref = doc(getDb(), 'reflections', id);
  const existing = await getDoc(ref);
  const now = new Date().toISOString();
  const body = {
    sessionId,
    studentUid,
    answers: payload.answers || [],
    rating: Number(payload.rating) || 0,
    updatedAt: now,
    createdAt: existing.exists() ? (existing.data().createdAt || now) : now
  };
  await setDoc(ref, body, { merge: true });
  return { id, ...body };
}

/* ── 재고 ────────────────────────────────────────────────────────────── */

export async function listInventory() {
  const snap = await getDocs(collection(getDb(), 'inventory'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

export async function saveInventoryItem(id, data) {
  await setDoc(doc(getDb(), 'inventory', id), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function deleteInventoryItem(id) {
  await deleteDoc(doc(getDb(), 'inventory', id));
}

/* ── 실험 보관함 ─────────────────────────────────────────────────────── */

export async function listTemplates() {
  const snap = await getDocs(collection(getDb(), 'templates'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

export async function saveTemplate(id, data) {
  await setDoc(doc(getDb(), 'templates', id), data, { merge: true });
}

export async function deleteTemplate(id) {
  await deleteDoc(doc(getDb(), 'templates', id));
}

/* ── Storage ─────────────────────────────────────────────────────────── */

const MAX_UPLOAD = 20 * 1024 * 1024;

/**
 * 파일 업로드.
 * @param {'public'|'teacher'} scope 학생에게 보여줄 자료는 public
 */
export async function uploadFile(file, scope, subPath) {
  if (!file) throw new Error('파일이 없습니다.');
  if (file.size > MAX_UPLOAD) throw new Error('파일 크기는 20MB 이하만 업로드할 수 있습니다.');
  const safeName = file.name.replace(/[^\w.가-힣\- ]/g, '_').slice(-80);
  const path = `${scope}/${subPath}/${Date.now()}_${safeName}`;
  const r = storageRef(getStorageInstance(), path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  const url = await getDownloadURL(r);
  return { url, path, name: file.name, size: file.size, type: file.type };
}

export async function deleteFile(path) {
  if (!path) return;
  await deleteObject(storageRef(getStorageInstance(), path)).catch(err => {
    console.warn('[storage] 삭제 실패', err);
  });
}

/* ── 서버 API 호출 ───────────────────────────────────────────────────── */

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Firebase ID Token 을 붙여 /api 를 호출한다.
 * 실패 시 서버가 내려준 사용자용 메시지를 그대로 던진다.
 */
export async function callApi(path, body, { auth: needAuth = true, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (needAuth) {
    const user = getAuthInstance().currentUser;
    if (!user) throw new ApiError('로그인이 필요합니다.', 401);
    const token = await user.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }

  let resp;
  try {
    resp = await fetch(path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    });
  } catch (e) {
    console.error('[api] 네트워크 오류', path, e);
    throw new ApiError('네트워크 연결을 확인해 주세요.', 0);
  }

  let payload = null;
  try { payload = await resp.json(); } catch { /* 본문 없음 */ }

  if (!resp.ok || !payload?.ok) {
    const msg = payload?.error || '요청을 처리하지 못했습니다.';
    console.error('[api] 실패', path, resp.status, msg);
    throw new ApiError(msg, resp.status);
  }
  return payload;
}
