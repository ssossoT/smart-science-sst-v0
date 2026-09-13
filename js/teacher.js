/* ==========================================================================
   선생님용 - 앱 셸과 화면 전환
   ========================================================================== */

import {
  firebaseReady, initFirebase, DEFAULT_SETTINGS
} from './firebase-service.js';
import {
  loginTeacherWithGoogle, verifyAdmin, logout, watchAuth, renderSetupNotice
} from './auth-service.js';
import { store, loadAll, onStoreChange } from './store.js';
import { applyBranding } from './common.js';
import {
  $, el, mount, clear, toast, toastError, emptyState, skeleton,
  confirmLeaveIfDirty, clearDirty
} from './ui.js';

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
const deniedScreen = $('#denied-screen');
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
  [bootScreen, loginScreen, deniedScreen, appEl].forEach(n => {
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

const loginError = $('#login-error');

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = !message;
}

$('#google-login')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  showLoginError('');
  btn.disabled = true;
  try {
    await loginTeacherWithGoogle();
    // 이후 처리는 watchAuth 에서 이어진다.
  } catch (err) {
    console.error('[auth] 로그인 실패', err);
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
      showLoginError('로그인 창이 닫혔습니다. 다시 시도해 주세요.');
    } else if (err?.code === 'auth/unauthorized-domain') {
      showLoginError('이 주소가 Firebase 승인된 도메인에 등록되어 있지 않습니다.');
    } else {
      showLoginError('로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  } finally {
    btn.disabled = false;
  }
});

$('#logout-btn')?.addEventListener('click', async () => {
  if (!(await confirmLeaveIfDirty())) return;
  clearDirty();
  await logout();
  location.reload();
});

$('#denied-logout')?.addEventListener('click', async () => {
  await logout();
  location.reload();
});

$('#denied-copy')?.addEventListener('click', async () => {
  const uid = $('#denied-uid').textContent;
  try {
    await navigator.clipboard.writeText(uid);
    toast('UID를 복사했습니다.', 'ok');
  } catch {
    toastError('복사하지 못했습니다. 직접 선택해 주세요.');
  }
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

// 데모 모드: 로그인 없이 샘플 데이터로 교사 화면 미리보기
const DEMO_USER = {
  displayName: '데모 선생님',
  email: 'demo@example.com',
  uid: 'demo',
  photoURL: null
};

// 데모용 샘플 데이터
// 필드 이름은 firebase-service.js 의 실제 문서 구조(DEFAULT_SETTINGS, sessions, students, inventory)와
// 반드시 맞춰야 한다. 다르면 화면에 값이 비어 보인다.
const DEMO_SETTINGS = {
  siteName: '스마트과학반 LAB',
  schoolName: '○○중학교',
  teacherName: '데모 선생님',
  year: new Date().getFullYear(),
  periodStart: `${new Date().getFullYear()}-09-02`,
  periodEnd: `${new Date().getFullYear()}-11-11`,
  totalBudget: 1000000,
  studentLogoutMinutes: 30,
  geminiEnabled: true,
  youtubeEnabled: true,
  intro: '실험으로 과학을 직접 확인하는 중학교 방과후 활동입니다.'
};

const DEMO_SESSIONS = [
  { id: 'demo-01', year: new Date().getFullYear(), date: `${new Date().getFullYear()}-09-02`, periodLabel: '1~2차시', title: 'OT + 그래비트랙스 ①', field: '물리', status: 'done', isPublic: true, order: 10 },
  { id: 'demo-02', year: new Date().getFullYear(), date: `${new Date().getFullYear()}-09-09`, periodLabel: '3~4차시', title: '그래비트랙스 ②', field: '물리', status: 'done', isPublic: true, order: 20 },
  { id: 'demo-03', year: new Date().getFullYear(), date: `${new Date().getFullYear()}-09-16`, periodLabel: '5~6차시', title: '코끼리 치약', field: '화학', status: 'published', isPublic: true, order: 30 },
  { id: 'demo-04', year: new Date().getFullYear(), date: `${new Date().getFullYear()}-09-23`, periodLabel: '', title: '창의적체험활동의 날 · 방과후 없음', field: '기타', noClass: true, status: 'draft', isPublic: false, order: 40 },
  { id: 'demo-05', year: new Date().getFullYear(), date: `${new Date().getFullYear()}-09-30`, periodLabel: '7~8차시', title: '아이스크림 만들기', field: '화학', status: 'draft', isPublic: false, order: 50 },
];

const DEMO_INVENTORY = [
  { id: 'inv-01', name: '페트병 (1L)', category: '소모품', quantity: 20, minQuantity: 10, unit: '개', location: '과학실 선반 A', expiry: '', memo: '' },
  { id: 'inv-02', name: '과산화수소수 (30%)', category: '시약', quantity: 2, minQuantity: 3, unit: '병', location: '약품 보관함', expiry: '', memo: '' },
  { id: 'inv-03', name: '드라이이스트', category: '식재료', quantity: 5, minQuantity: 2, unit: '봉', location: '냉장고', expiry: '', memo: '' },
];

const DEMO_STUDENTS = [
  { uid: 's1', displayName: '홍길동', loginName: 'gildong', studentNo: '10315', status: 'active', year: new Date().getFullYear(), createdAt: new Date().toISOString() },
  { uid: 's2', displayName: '김철수', loginName: 'chulsoo', studentNo: '20107', status: 'active', year: new Date().getFullYear(), createdAt: new Date().toISOString() },
  { uid: 's3', displayName: '이영희', loginName: 'younghee', studentNo: '10222', status: 'active', year: new Date().getFullYear(), createdAt: new Date().toISOString() }
];

let isDemoMode = false;

export function getIsDemoMode() { return isDemoMode; }

function enterDemoMode() {
  isDemoMode = true;

  // store에 데모 데이터 주입
  store.user = DEMO_USER;
  store.settings = { ...DEMO_SETTINGS };
  store.sessions = DEMO_SESSIONS.map(s => ({ ...s }));
  store.privates = new Map(DEMO_SESSIONS.map(s => [s.id, {
    goal: '', plan: '', runPlan: '', checklist: [], liveNotes: [], attendance: {},
    safety: '', planB: '', result: '', goodPoints: '', badPoints: '',
    nextTime: '', usage: '', estimatedCost: 8000, actualCost: 0,
    reflection: '', reflectionSummary: '', portfolioDraft: null, recommend: '',
    materials: [
      { id: 'dm1', name: '페트병', quantity: 20, unit: '개', category: '소모품', status: '준비 완료', estPrice: 8000, actualPrice: 8000, vendor: '', pub: true, note: '' },
      { id: 'dm2', name: '과산화수소수', quantity: 2, unit: '병', category: '시약', status: '구매 필요', estPrice: 12000, actualPrice: '', vendor: '', pub: true, note: '' }
    ]
  }]));
  store.students = DEMO_STUDENTS.map(s => ({ ...s }));
  store.reflections = [
    { id: 'demo-01_s1', sessionId: 'demo-01', studentUid: 's1', rating: 5, answers: [], updatedAt: new Date().toISOString() },
    { id: 'demo-01_s2', sessionId: 'demo-01', studentUid: 's2', rating: 4, answers: [], updatedAt: new Date().toISOString() }
  ];
  store.inventory = DEMO_INVENTORY.map(i => ({ ...i }));
  store.templates = [];
  store.loaded = true;

  // 데모 배너 표시
  const banner = el('div', {
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

async function boot() {
  if (!firebaseReady()) {
    renderSetupNotice(document.body);
    return;
  }
  initFirebase();

  // 로그인 화면에 데모 미리보기 버튼 추가
  const loginCard = loginScreen.querySelector('.auth-card');
  if (loginCard && !loginCard.querySelector('#demo-btn')) {
    const demoBtn = el('button', {
      id: 'demo-btn',
      type: 'button',
      style: 'margin-top:8px;width:100%;padding:10px;border:1.5px dashed #94a3b8;border-radius:8px;background:transparent;color:#64748b;font-size:14px;cursor:pointer;',
      onclick: () => enterDemoMode()
    }, ['👀 로그인 없이 미리보기 (데모 모드)']);
    loginCard.append(demoBtn);
  }

  watchAuth(async (user) => {
    if (!user) {
      showOnly(loginScreen);
      applyBranding(DEFAULT_SETTINGS, { suffix: '선생님용' });
      return;
    }

    showOnly(bootScreen);
    let isAdmin = false;
    try {
      isAdmin = await verifyAdmin(user);
    } catch (e) {
      console.error('[auth] 권한 확인 실패', e);
    }

    if (!isAdmin) {
      $('#denied-uid').textContent = user.uid;
      showOnly(deniedScreen);
      return;
    }

    store.user = user;
    try {
      await loadAll({ force: true });
    } catch (e) {
      console.error('[boot] 데이터 적재 실패', e);
      toastError('데이터를 불러오지 못했습니다. 보안 규칙 배포 상태를 확인해 주세요.');
      store.settings = store.settings || { ...DEFAULT_SETTINGS };
    }

    applyBranding(store.settings, { suffix: '선생님용' });
    fillTopbar(user, store.settings);
    showOnly(appEl);

    if (!location.hash) location.hash = '#/home';
    await renderRoute();
  });
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
