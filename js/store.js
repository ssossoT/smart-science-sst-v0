/* ==========================================================================
   선생님 화면 공용 상태 저장소
   화면을 옮길 때마다 Firestore 를 다시 읽지 않도록 한 곳에 모아둔다.
   ========================================================================== */

import {
  loadSettings, listSessions, listAllPrivate, listStudents,
  listAllReflections, listInventory, listTemplates,
  getSessionPrivate, saveSessionPrivate, saveSessionPublic
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
 * 첫 화면(index.html)은 이제 이 브라우저의 같은 저장소를 직접 읽으므로
 * 별도로 "공개용" 문서를 복사해 둘 필요가 없다. 예전 호출부가 남아 있어
 * 함수는 그대로 두되 아무 일도 하지 않는다.
 */
export async function syncPublicSettings() {}
