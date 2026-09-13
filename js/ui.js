/* ==========================================================================
   UI 공통 유틸 - DOM 생성, 토스트, 모달, 포맷터
   ========================================================================== */

/* ── DOM ─────────────────────────────────────────────────────────────── */

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/**
 * 요소 생성 헬퍼.
 *   el('div', { class:'card', onclick: fn }, [ el('h2', {}, '제목') ])
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k in node && k !== 'list' && typeof v !== 'object') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** 문자열을 HTML 에 안전하게 넣기 위한 이스케이프 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function mount(node, ...children) {
  clear(node);
  children.flat().forEach(c => { if (c) node.append(c); });
  return node;
}

/* ── 포맷터 ──────────────────────────────────────────────────────────── */

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

/** 1234567 -> "1,234,567" */
export function won(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return Math.round(v).toLocaleString('ko-KR');
}

export function wonLabel(n) { return won(n) + '원'; }

/** "2026-09-16" -> Date (로컬 자정) */
export function toDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function fmtDate(ymd, { withYear = false, withWeek = true } = {}) {
  const d = toDate(ymd);
  if (!d) return '';
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const base = withYear ? `${d.getFullYear()}년 ${md}` : md;
  return withWeek ? `${base}(${WEEK[d.getDay()]})` : base;
}

export function fmtDateDot(ymd) {
  const d = toDate(ymd);
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function weekdayOf(ymd) {
  const d = toDate(ymd);
  return d ? WEEK[d.getDay()] : '';
}

export function todayYmd() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 날짜 차이 (일). 미래면 양수. */
export function daysFromToday(ymd) {
  const d = toDate(ymd);
  if (!d) return null;
  const t = toDate(todayYmd());
  return Math.round((d - t) / 86400000);
}

/** 같은 주(월~일)에 속하는지 */
export function isThisWeek(ymd) {
  const diff = daysFromToday(ymd);
  if (diff == null) return false;
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 월=0
  return diff >= -dow && diff <= 6 - dow;
}

export function relativeDay(ymd) {
  const diff = daysFromToday(ymd);
  if (diff == null) return '';
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  if (diff > 0) return `${diff}일 뒤`;
  return `${-diff}일 전`;
}

export function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function pct(a, b) {
  if (!b) return 0;
  return Math.max(0, Math.min(100, Math.round((a / b) * 100)));
}

/* ── 토스트 ──────────────────────────────────────────────────────────── */

function toastRoot() {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = el('div', { id: 'toast-root' });
    document.body.append(root);
  }
  return root;
}

export function toast(message, type = '', ms = 2600) {
  const node = el('div', { class: `toast ${type}`, role: 'status' }, [String(message)]);
  toastRoot().append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, ms);
  return node;
}

export const toastOk = m => toast(m, 'ok');
export const toastError = m => toast(m, 'error');
export const toastWarn = m => toast(m, 'warn');

/* ── 모달 ────────────────────────────────────────────────────────────── */

let openModals = 0;

/**
 * 모달 열기.
 * @returns {{ close:(v?:any)=>void, body:HTMLElement, foot:HTMLElement, done:Promise }}
 */
export function openModal({ title, body, footer, size = '', closable = true, onClose } = {}) {
  const bodyEl = el('div', { class: 'modal-body' });
  if (body) mount(bodyEl, body);
  const footEl = el('div', { class: 'modal-foot' });
  if (footer) mount(footEl, footer);

  let resolve;
  const done = new Promise(r => { resolve = r; });

  const closeBtn = el('button', {
    class: 'btn-icon', type: 'button', 'aria-label': '닫기', title: '닫기'
  }, ['✕']);

  const modal = el('div', { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true' }, [
    el('div', { class: 'modal-head' }, [
      el('h2', { text: title || '' }),
      el('div', { class: 'spacer' }),
      closable ? closeBtn : null
    ]),
    bodyEl,
    footer ? footEl : null
  ]);

  const backdrop = el('div', { class: 'modal-backdrop' }, [modal]);

  function close(value) {
    if (!backdrop.isConnected) return;
    backdrop.remove();
    openModals = Math.max(0, openModals - 1);
    if (!openModals) document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    onClose?.(value);
    resolve(value);
  }

  function onKey(e) {
    if (e.key === 'Escape' && closable) { e.stopPropagation(); close(undefined); }
  }

  closeBtn.addEventListener('click', () => close(undefined));
  backdrop.addEventListener('mousedown', e => {
    if (e.target === backdrop && closable) close(undefined);
  });
  document.addEventListener('keydown', onKey, true);

  document.body.append(backdrop);
  openModals += 1;
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    const first = modal.querySelector('input, textarea, select, button.btn-primary');
    first?.focus();
  }, 30);

  return { close, body: bodyEl, foot: footEl, modal, done };
}

/** 확인 모달. 삭제처럼 되돌릴 수 없는 동작에 사용한다. */
export function confirmDialog({
  title = '확인',
  message = '',
  confirmText = '확인',
  cancelText = '취소',
  danger = false
} = {}) {
  return new Promise(resolve => {
    const cancel = el('button', { class: 'btn', type: 'button' }, [cancelText]);
    const okBtn = el('button', {
      class: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button'
    }, [confirmText]);

    const m = openModal({
      title,
      size: '',
      body: el('div', { class: 'pre-wrap', style: { fontSize: '13.5px', lineHeight: '1.7' } }, [message]),
      footer: [cancel, okBtn],
      onClose: v => resolve(v === true)
    });

    cancel.addEventListener('click', () => m.close(false));
    okBtn.addEventListener('click', () => m.close(true));
    setTimeout(() => okBtn.focus(), 30);
  });
}

/** 한 줄 입력 모달 */
export function promptDialog({ title = '입력', label = '', value = '', placeholder = '', multiline = false } = {}) {
  return new Promise(resolve => {
    const input = multiline
      ? el('textarea', { class: 'textarea', placeholder, rows: 4 })
      : el('input', { class: 'input', placeholder, type: 'text' });
    input.value = value || '';

    const cancel = el('button', { class: 'btn', type: 'button' }, ['취소']);
    const okBtn = el('button', { class: 'btn btn-primary', type: 'button' }, ['확인']);

    const m = openModal({
      title,
      body: el('div', { class: 'field' }, [
        label ? el('label', { text: label }) : null,
        input
      ]),
      footer: [cancel, okBtn],
      onClose: v => resolve(typeof v === 'string' ? v : null)
    });

    const submit = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      m.close(v);
    };
    okBtn.addEventListener('click', submit);
    cancel.addEventListener('click', () => m.close(null));
    if (!multiline) input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 30);
  });
}

/* ── 상태 표시 ───────────────────────────────────────────────────────── */

/** 버튼을 처리중 상태로 만들고, 복구 함수를 반환한다. */
export function busy(button, label = '처리 중') {
  if (!button) return () => {};
  const original = button.innerHTML;
  button.dataset.busy = '1';
  button.innerHTML = '';
  button.append(el('span', { class: 'spinner' }), document.createTextNode(label));
  return () => {
    delete button.dataset.busy;
    button.innerHTML = original;
  };
}

export function skeleton(lines = 3) {
  return el('div', { class: 'card-body' },
    Array.from({ length: lines }, (_, i) =>
      el('div', { class: 'skeleton sk-line', style: { width: i % 3 === 2 ? '60%' : '100%' } })
    )
  );
}

export function emptyState(message, sub, action) {
  return el('div', { class: 'empty' }, [
    el('strong', { text: message }),
    sub ? el('div', { text: sub }) : null,
    action || null
  ]);
}

/** 안전한 외부 링크 (새 탭) */
export function extLink(href, text, cls = '') {
  const safe = /^https?:\/\//i.test(String(href || '')) ? href : null;
  if (!safe) return el('span', { class: 'muted', text: text || '' });
  return el('a', {
    class: cls, href: safe, target: '_blank', rel: 'noopener noreferrer', text: text || safe
  });
}

/** 별점 표시(읽기 전용) */
export function starsStatic(n) {
  const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return el('span', { class: 'stars-static', text: '★'.repeat(v) + '☆'.repeat(5 - v) });
}

/* ── 저장되지 않은 변경 경고 ─────────────────────────────────────────── */

const dirtyOwners = new Set();

export function setDirty(key, on) {
  if (on) dirtyOwners.add(key); else dirtyOwners.delete(key);
  updateBeforeUnload();
}
export function isDirty() { return dirtyOwners.size > 0; }
export function clearDirty() { dirtyOwners.clear(); updateBeforeUnload(); }

function beforeUnloadHandler(e) {
  e.preventDefault();
  e.returnValue = '';
}
let beforeUnloadBound = false;
function updateBeforeUnload() {
  const need = dirtyOwners.size > 0;
  if (need && !beforeUnloadBound) {
    window.addEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadBound = true;
  } else if (!need && beforeUnloadBound) {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
    beforeUnloadBound = false;
  }
}

/** 화면 이동 전에 저장되지 않은 변경을 확인한다. */
export async function confirmLeaveIfDirty() {
  if (!isDirty()) return true;
  const go = await confirmDialog({
    title: '저장하지 않은 변경이 있습니다',
    message: '저장하지 않고 이동하면 입력한 내용이 사라집니다.\n이동할까요?',
    confirmText: '저장하지 않고 이동',
    cancelText: '계속 편집',
    danger: true
  });
  if (go) clearDirty();
  return go;
}

/* ── 기타 ────────────────────────────────────────────────────────────── */

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function uid(prefix = 'i') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

/** 배열을 특정 키로 묶는다. */
export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}
