/* ==========================================================================
   선생님용 - 앱 셸과 화면 전환
   ========================================================================== */

import { store, loadAll, onStoreChange } from './store.js';
import { applyBranding } from './common.js';
import {
  $, el, mount, clear, emptyState, skeleton,
  confirmLeaveIfDirty, clearDirty
} from './ui.js';
import {
  DEMO_TEACHER, DEMO_SETTINGS, DEMO_SESSIONS, DEMO_PRIVATES, DEMO_STUDENTS, DEMO_INVENTORY
} from './demo-data.js';

import { renderHome } from './views/home.js';
import { renderPlan } from './views/plan.js';
import { renderSession } from './views/session.js';
import { renderPurchase } from './views/purchase.js';
import { renderInventory } from './views/inventory.js';
import { renderStudents } from './views/students.js';
import { renderRecords } from './views/records.js';
import { renderArchive } from './views/archive.js';
import { renderPortfolioView } from './views/portfolio-view.js';
import { renderSettings } from './views/settings.js';

/* ── 라우트 정의 ─────────────────────────────────────────────────────── */

const ROUTES = {
  home:      { label: '홈',         icon: '⌂', render: renderHome },
  plan:      { label: '전체 계획',   icon: '☰', render: renderPlan },
  session:   { label: '주차별 활동', icon: '▤', render: renderSession },
  purchase:  { label: '준비물·구매', icon: '◲', render: renderPurchase },
  inventory: { label: '재고',        icon: '▩', render: renderInventory },
  students:  { label: '학생 관리',   icon: '◉', render: renderStudents },
  records:   { label: '학생 기록',   icon: '✎', render: renderRecords },
  archive:   { label: '실험 보관함', icon: '⎘', render: renderArchive },
  portfolio: { label: '포트폴리오',  icon: '▣', render: renderPortfolioView },
  settings:  { label: '설정',        icon: '⚙', render: renderSettings }
};

const NAV_GROUPS = [
  { label: '운영',     items: ['home', 'plan', 'session'] },
  { label: '준비',     items: ['purchase', 'inventory'] },
  { label: '학생',     items: ['students', 'records'] },
  { label: '기록',     items: ['archive', 'portfolio'] },
  { label: '관리',     items: ['settings'] }
];

/* ── 요소 ────────────────────────────────────────────────────────────── */

const bootScreen  = $('#boot-screen');
const loginScreen = $('#login-screen');
const appEl      = $('#app');
const navEl      = $('#nav');
const viewEl     = $('#view');
const viewHeadEl = $('#view-head');
const sidebarEl  = $('#sidebar');

let currentRoute = 'home';
let currentParam = null;
let navigating = false;

/* ── 화면 전환 ───────────────────────────────────────────────────────── */

function showOnly(node) {
  [bootScreen, loginScreen, appEl].forEach(n => {
    if (n) n.hidden = n !== node;
  });
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [route, param] = raw.split('/');
  return {
    route: ROUTES[route] ? route : 'home',
    param: param ? decodeURIComponent(param) : null
  };
}

export function go(route, param) {
  const next = param ? `#/${route}/${encodeURIComponent(param)}` : `#/${route}`;
  if (location.hash === next) { renderRoute(); return; }
  location.hash = next;
}

const ctx = {
  go,
  get params() { return currentParam; },
  refresh: () => renderRoute(),
  reload: async () => { await loadAll({ force: true }); renderRoute(); }
};

async function renderRoute() {
  const { route, param } = parseHash();
  currentRoute = route;
  currentParam = param;

  buildNav();
  closeSidebarOnMobile();

  const def = ROUTES[route];
  mount(viewHeadEl, el('h1', { text: def.label }));
  mount(viewEl, skeleton(4));
  viewEl.classList.remove('fixed');

  try {
    const result = await def.render(ctx);
    if (currentRoute !== route || currentParam !== param) return; // 그 사이 다른 화면으로 이동
    mount(viewHeadEl, ...(Array.isArray(result.head) ? result.head : [result.head]).filter(Boolean));
    mount(viewEl, result.body);
    if (result.fixed) viewEl.classList.add('fixed');
    viewEl.scrollTop = 0;
  } catch (e) {
    console.error('[view] 렌더 오류', route, e);
    mount(viewEl, el('div', { class: 'card' }, [
      emptyState('화면을 불러오지 못했습니다.', '잠시 후 다시 시도해 주세요.',
        el('button', { class: 'btn btn-primary mt-8', onclick: () => renderRoute() }, ['다시 시도']))
    ]));
  }
}

/* ── 사이드바 ────────────────────────────────────────────────────────── */

function navCounts() {
  const counts = {};
  let needPurchase = 0;
  store.privates.forEach(p => {
    (p.materials || []).forEach(m => { if (m.status === '구매 필요') needPurchase += 1; });
  });
  if (needPurchase) counts.purchase = { n: needPurchase, alert: true };

  const lowStock = store.inventory.filter(i => {
    const min = Number(i.minQuantity) || 0;
    return min > 0 && (Number(i.quantity) || 0) < min;
  }).length;
  if (lowStock) counts.inventory = { n: lowStock, alert: true };

  return counts;
}

function buildNav() {
  const counts = navCounts();
  clear(navEl);

  NAV_GROUPS.forEach(group => {
    navEl.append(el('div', { class: 'nav-group-label', text: group.label }));
    group.items.forEach(key => {
      const def = ROUTES[key];
      const badge = counts[key];
      navEl.append(el('button', {
        class: `nav-item ${currentRoute === key ? 'on' : ''}`,
        type: 'button',
        onclick: async () => {
          if (!(await confirmLeaveIfDirty())) return;
          go(key);
        }
      }, [
        el('span', { class: 'ico', text: def.icon }),
        el('span', { text: def.label }),
        badge ? el('span', { class: `count ${badge.alert ? 'alert' : ''}`, text: String(badge.n) }) : null
      ]));
    });
  });
}

function closeSidebarOnMobile() {
  sidebarEl.classList.remove('open');
  document.querySelector('.scrim')?.remove();
}

$('#menu-toggle')?.addEventListener('click', () => {
  const open = sidebarEl.classList.toggle('open');
  document.querySelector('.scrim')?.remove();
  if (open) {
    const scrim = el('div', { class: 'scrim', onclick: closeSidebarOnMobile });
    document.querySelector('.app-body').append(scrim);
  }
});

/* ── 인증 흐름 ───────────────────────────────────────────────────────── */
/* 데모용 화면이므로 실제 Firebase 계정이 아니라 정해진 이름+비밀번호로만
   들어갈 수 있다. (예전 Google 로그인 · 관리자 확인 흐름은 제거했다.) */

const loginForm = $('#login-form');
const loginError = $('#login-error');

function showLoginError(message) {
  loginError.textContent = message || '';
  loginError.hidden = !message;
}

loginForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  showLoginError('');
  const name = $('#login-name').value.trim();
  const pw = $('#login-pw').value;

  if (name === DEMO_TEACHER.name && pw === DEMO_TEACHER.password) {
    $('#login-pw').value = '';
    loginForm.reset();
    enterDemoMode();
  } else {
    showLoginError('이름 또는 비밀번호를 확인해 주세요.');
    $('#login-pw').value = '';
  }
});

$('#logout-btn')?.addEventListener('click', async () => {
  if (!(await confirmLeaveIfDirty())) return;
  clearDirty();
  document.getElementById('demo-banner')?.remove();
  showOnly(loginScreen);
  location.hash = '';
  setTimeout(() => $('#login-name')?.focus(), 60);
});

function fillTopbar(user, settings) {
  $('#top-name').textContent = user.displayName || user.email || '';
  $('#top-year').textContent = settings.year ? `${settings.year}학년도` : '';
  const avatar = $('#top-avatar');
  avatar.textContent = (user.displayName || user.email || '?').slice(0, 1).toUpperCase();
  if (user.photoURL) {
    avatar.style.backgroundImage = `url(${user.photoURL})`;
    avatar.style.backgroundSize = 'cover';
    avatar.textContent = '';
  }
}

/* ── 데모 모드 ───────────────────────────────────────────────────────── */
/* 이름+비밀번호(성소연/0000)로 로그인하면 js/demo-data.js 의 샘플 데이터로
   교사 화면을 미리 볼 수 있다. 실제 Firebase 계정이 아니므로 저장·수정은
   이 브라우저 화면에만 반영되고 새로고침하면 사라진다. */

const DEMO_USER = {
  displayName: DEMO_TEACHER.name,
  email: '',
  uid: 'demo-teacher',
  photoURL: null
};

function enterDemoMode() {
  // store에 데모 데이터 주입
  store.user = DEMO_USER;
  store.settings = { ...DEMO_SETTINGS };
  store.sessions = DEMO_SESSIONS.map(s => ({ ...s }));
  store.privates = new Map([...DEMO_PRIVATES].map(([id, p]) => [id, { ...p, materials: p.materials.map(m => ({ ...m })) }]));
  store.students = DEMO_STUDENTS.map(s => ({ ...s }));
  store.reflections = [
    { id: 'demo-01_s1', sessionId: 'demo-01', studentUid: 's1', rating: 5, answers: [], updatedAt: new Date().toISOString() },
    { id: 'demo-01_s2', sessionId: 'demo-01', studentUid: 's2', rating: 4, answers: [], updatedAt: new Date().toISOString() }
  ];
  store.inventory = DEMO_INVENTORY.map(i => ({ ...i }));
  store.templates = [];
  store.loaded = true;

  // 데모 배너 표시 (중복 방지)
  document.getElementById('demo-banner')?.remove();
  const banner = el('div', {
    id: 'demo-banner',
    style: 'background:#f59e0b;color:#1c1c1c;text-align:center;padding:6px 12px;font-size:13px;font-weight:600;letter-spacing:.02em;'
  }, ['🔒 데모 미리보기 모드 — 저장·수정 기능은 비활성화됩니다.']);
  document.body.prepend(banner);

  applyBranding(store.settings, { suffix: '선생님용' });
  fillTopbar(DEMO_USER, store.settings);
  showOnly(appEl);
  if (!location.hash) location.hash = '#/home';
  renderRoute();
}

/* ── 시작 ────────────────────────────────────────────────────────────── */

function boot() {
  showOnly(loginScreen);
  setTimeout(() => $('#login-name')?.focus(), 60);
}

window.addEventListener('hashchange', () => {
  if (navigating) return;
  navigating = true;
  renderRoute().finally(() => { navigating = false; });
});

onStoreChange(reason => {
  if (reason === 'private' || reason === 'inventory') buildNav();
});

boot();
