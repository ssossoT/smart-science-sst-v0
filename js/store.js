/* ==========================================================================
   선생님 화면 공용 상태 저장소
   화면을 옮길 때마다 Firestore 를 다시 읽지 않도록 한 곳에 모아둔다.
   ========================================================================== */

import {
  loadSettings, listSessions, listAllPrivate, listStudents,
  listAllReflections, listInventory, listTemplates,
  getSessionPrivate, saveSessionPrivate, saveSessionPublic,
  getDb, doc, setDoc
} from './firebase-service.js';

export const store = {
  user: null,
  settings: null,
  sessions: [],
  /** Map<sessionId, privateDoc> */
  privates: new Map(),
  students: [],
  reflections: [],
  inventory: [],
  templates: [],
  loaded: false
};

const listeners = new Set();

export function onStoreChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(reason) {
  listeners.forEach(fn => {
    try { fn(reason); } catch (e) { console.error('[store] 리스너 오류', e); }
  });
}

/* ── 초기 적재 ───────────────────────────────────────────────────────── */

export async function loadAll({ force = false } = {}) {
  if (store.loaded && !force) return store;

  store.settings = await loadSettings({ force });
  const year = Number(store.settings.year) || new Date().getFullYear();

  const [sessions, students, reflections, inventory, templates] = await Promise.all([
    listSessions(year),
    listStudents(year),
    listAllReflections(),
    listInventory(),
    listTemplates()
  ]);

  store.sessions = sessions;
  store.students = students;
  store.reflections = reflections;
  store.inventory = inventory;
  store.templates = templates;
  store.privates = await listAllPrivate(sessions.map(s => s.id));
  store.loaded = true;

  notify('load');
  return store;
}

/* ── 조회 도우미 ─────────────────────────────────────────────────────── */

export function sessionById(id) {
  return store.sessions.find(s => s.id === id) || null;
}

export function privateOf(id) {
  return store.privates.get(id) || null;
}

export function inventoryById() {
  return new Map(store.inventory.map(i => [i.id, i]));
}

export function studentByUid(uid) {
  return store.students.find(s => s.uid === uid) || null;
}

export function activeStudents() {
  return store.students.filter(s => s.status !== 'inactive');
}

export function reflectionsOf(sessionId) {
  return store.reflections.filter(r => r.sessionId === sessionId);
}

/* ── 갱신 ────────────────────────────────────────────────────────────── */

export async function refreshPrivate(sessionId) {
  const priv = await getSessionPrivate(sessionId);
  store.privates.set(sessionId, priv);
  return priv;
}

export async function updateSessionPublic(id, patch) {
  const current = sessionById(id) || {};
  const merged = { ...current, ...patch };
  delete merged.id;
  const saved = await saveSessionPublic(id, merged);
  const next = { id, ...current, ...saved };
  const idx = store.sessions.findIndex(s => s.id === id);
  if (idx >= 0) store.sessions[idx] = next;
  else upsertSessionLocal(next);
  notify('session');
  return next;
}

export async function updateSessionPrivate(id, patch) {
  const current = privateOf(id) || {};
  const merged = { ...current, ...patch };
  await saveSessionPrivate(id, merged);
  store.privates.set(id, merged);
  notify('private');
  return merged;
}

export function upsertSessionLocal(session) {
  const idx = store.sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) store.sessions[idx] = session;
  else store.sessions.push(session);
  store.sessions.sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || '')) ||
    (Number(a.order || 0) - Number(b.order || 0))
  );
  notify('session');
}

export function removeSessionLocal(id) {
  store.sessions = store.sessions.filter(s => s.id !== id);
  store.privates.delete(id);
  notify('session');
}

export async function refreshStudents() {
  store.students = await listStudents(Number(store.settings?.year));
  notify('students');
  return store.students;
}

export async function refreshReflections() {
  store.reflections = await listAllReflections();
  notify('reflections');
  return store.reflections;
}

export async function refreshInventory() {
  store.inventory = await listInventory();
  notify('inventory');
  return store.inventory;
}

export async function refreshTemplates() {
  store.templates = await listTemplates();
  notify('templates');
  return store.templates;
}

/**
 * 첫 화면(로그인 전)에서 읽는 공개 안내 문서를 갱신한다.
 * 사이트명·학교명·운영기간·다음 일정만 담는다. 예산 등 운영 정보는 넣지 않는다.
 */
let lastPublicPayload = '';

export async function syncPublicSettings(nextSession) {
  const s = store.settings || {};
  const payload = {
    siteName: s.siteName || '',
    schoolName: s.schoolName || '',
    teacherName: s.teacherName || '',
    year: s.year || null,
    periodStart: s.periodStart || '',
    periodEnd: s.periodEnd || '',
    intro: s.intro || '',
    nextSession: nextSession
      ? { date: nextSession.date || '', periodLabel: nextSession.periodLabel || '' }
      : null
  };

  // 내용이 바뀌지 않았으면 쓰지 않는다 (화면을 열 때마다 쓰기가 발생하지 않도록)
  const signature = JSON.stringify(payload);
  if (signature === lastPublicPayload) return;
  lastPublicPayload = signature;

  try {
    await setDoc(
      doc(getDb(), 'settings', 'public'),
      { ...payload, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  } catch (e) {
    console.warn('[store] 공개 안내 갱신 실패', e);
    lastPublicPayload = '';
  }
}
