/* ==========================================================================
   학생용 화면
   --------------------------------------------------------------------------
   학생에게 보이지 않는 것: 구매, 가격, 재고, 예산, 구매처, 교사 메모,
   준비 진행률, Plan B, 교사 성찰, 다른 학생의 보고서
   (보안 규칙에서 Firestore 문서 자체를 읽을 수 없게 막혀 있다.)
   ========================================================================== */

import {
  DEFAULT_REPORT_QUESTIONS, DEFAULT_SETTINGS, checkStudentLogin, getStudentDoc,
  loadSettings, listPublicSessions, listMyReflections, saveReflection
} from './firebase-service.js';
import { applyBranding, sessionTitle, pickCurrentSession } from './common.js';
import {
  $, el, mount, clear, toastOk, toastError, emptyState, fmtDate,
  relativeDay, starsStatic, busy, fmtStamp, setDirty, confirmLeaveIfDirty,
  daysFromToday
} from './ui.js';

/* ── 상태 ────────────────────────────────────────────────────────────── */

const state = {
  student: null,
  settings: null,
  sessions: [],
  myReflections: [],
  current: null,
  tab: 'home'
};

const TABS = [
  ['home',     '홈'],
  ['schedule', '전체 일정'],
  ['current',  '이번 활동'],
  ['materials', '활동자료'],
  ['photos',   '활동사진'],
  ['result',   '활동 결과'],
  ['report',   '간이보고서'],
  ['mine',     '내 기록']
];

const bootScreen = $('#boot-screen');
const loginScreen = $('#login-screen');
const appEl = $('#app');
const navEl = $('#nav');
const viewEl = $('#view');

function showOnly(node) {
  [bootScreen, loginScreen, appEl].forEach(n => { if (n) n.hidden = n !== node; });
}

/* ── 로그인 ──────────────────────────────────────────────────────────── */

const loginForm = $('#login-form');
const loginError = $('#login-error');

function showLoginError(message) {
  loginError.textContent = message || '';
  loginError.hidden = !message;
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showLoginError('');
  const name = $('#login-name').value.trim();
  const pw = $('#login-pw').value;
  if (!name || !pw) { showLoginError('이름과 비밀번호를 모두 입력해 주세요.'); return; }

  const btn = $('#login-submit');
  const restore = busy(btn, '로그인 중');
  try {
    const student = await checkStudentLogin(name, pw);
    if (!student) {
      showLoginError('이름 또는 비밀번호를 확인해 주세요.');
      $('#login-pw').value = '';
      return;
    }
    $('#login-pw').value = '';
    loginForm.reset();
    await enterApp(student);
  } finally {
    restore();
  }
});

$('#logout-btn')?.addEventListener('click', async () => {
  if (!(await confirmLeaveIfDirty())) return;
  location.href = './index.html';
});

/* ── 화면 ────────────────────────────────────────────────────────────── */

function buildNav() {
  clear(navEl);
  TABS.forEach(([key, label]) => {
    navEl.append(el('button', {
      class: state.tab === key ? 'on' : '', type: 'button',
      onclick: async () => {
        if (!(await confirmLeaveIfDirty())) return;
        state.tab = key;
        buildNav();
        renderView();
      }
    }, [label]));
  });
}

function card(title, children, aside) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h2', { text: title }), el('div', { class: 'spacer' }), aside || null
    ]),
    el('div', { class: 'card-body' }, children)
  ]);
}

function noCurrentSession() {
  return emptyState('아직 공개된 활동이 없습니다.', '선생님이 활동을 공개하면 이곳에 표시됩니다.');
}

function renderView() {
  const inner = el('div', { class: 's-inner' });
  const s = state.current;

  switch (state.tab) {
    case 'home':      mount(inner, ...homeView(s)); break;
    case 'schedule':  mount(inner, scheduleView()); break;
    case 'current':   mount(inner, ...currentView(s)); break;
    case 'materials': mount(inner, materialsView(s)); break;
    case 'photos':    mount(inner, photosView(s)); break;
    case 'result':    mount(inner, ...resultView(s)); break;
    case 'report':    mount(inner, reportView(s)); break;
    case 'mine':      mount(inner, mineView()); break;
  }

  const s2 = state.settings || DEFAULT_SETTINGS;
  mount(viewEl, inner, el('footer', {
    class: 'site-footer', style: { background: 'transparent', border: 'none', textAlign: 'center' }
  }, [`© ${s2.year || ''} ${s2.siteName || ''} · ${s2.schoolName || ''}`]));
  viewEl.scrollTop = 0;
}

/* ── 홈 ──────────────────────────────────────────────────────────────── */

function homeView(s) {
  if (!s) return [noCurrentSession()];

  const myRef = state.myReflections.find(r => r.sessionId === s.id);
  const canReport = ['done', 'archived'].includes(s.status);
  const days = daysFromToday(s.date);

  const todos = [
    { label: '활동 안내 읽기', done: true, hint: '이번 활동' },
    (s.worksheets || []).length ? { label: '활동지 확인하기', done: true, hint: '활동자료' } : null,
    (s.videos || []).length ? { label: '참고 영상 보기', done: true, hint: '활동자료' } : null,
    canReport ? { label: '간이보고서 작성하기', done: Boolean(myRef), hint: '간이보고서' } : null
  ].filter(Boolean);

  return [
    el('div', { class: 'today-card' }, [
      el('div', { class: 'k', text: days === 0 ? '오늘의 활동' : '이번 활동' }),
      el('h1', { text: sessionTitle(s) }),
      el('div', { class: 'today-meta' }, [
        el('span', { class: 'badge accent', text: fmtDate(s.date, { withYear: true }) }),
        s.periodLabel ? el('span', { class: 'badge', text: s.periodLabel }) : null,
        s.field ? el('span', { class: 'tag', text: s.field }) : null,
        el('span', { class: 'muted small', text: relativeDay(s.date) })
      ]),
      s.studentGuide
        ? el('div', { class: 'today-guide', text: s.studentGuide })
        : el('div', { class: 'today-guide muted', text: '활동 안내가 아직 등록되지 않았습니다.' })
    ]),

    card('오늘 해야 할 것', el('div', { class: 'todo-card' }, todos.map(t =>
      el('div', { class: 'todo-item' }, [
        el('span', { text: t.label }),
        el('span', { class: 'state' }, [
          el('span', { class: `badge ${t.done ? 'ok' : 'warn'}`, text: t.done ? '확인' : '해야 함' })
        ])
      ])
    ))),

    canReport
      ? card('간이보고서', [
          el('div', { class: 'flex items-center gap-12 wrap' }, [
            el('span', { class: `badge ${myRef ? 'ok' : 'warn'}`, text: myRef ? '제출 완료' : '미제출' }),
            myRef && Number(myRef.rating) ? starsStatic(myRef.rating) : null,
            el('div', { class: 'spacer grow' }),
            el('button', {
              class: 'btn btn-primary',
              onclick: () => { state.tab = 'report'; buildNav(); renderView(); }
            }, [myRef ? '보고서 수정하기' : '보고서 작성하기'])
          ])
        ])
      : null,

    (s.publicMaterials || []).length
      ? card('준비물', el('div', { class: 'flex gap-8 wrap' }, s.publicMaterials.map(m =>
          el('span', { class: 'chip chip-static', text: `${m.name} ${m.quantity || ''}${m.unit || ''}`.trim() })
        )))
      : null
  ].filter(Boolean);
}

/* ── 전체 일정 ───────────────────────────────────────────────────────── */

function scheduleView() {
  if (!state.sessions.length) return noCurrentSession();
  return card(`${(state.settings || DEFAULT_SETTINGS).year || ''} 전체 일정`,
    el('div', { class: 's-sched' }, state.sessions.map(s => {
      const diff = daysFromToday(s.date);
      const cls = s.id === state.current?.id ? 'now' : (diff != null && diff < 0 ? 'past' : '');
      return el('div', { class: `s-sched-row ${cls}` }, [
        el('div', { class: 'd' }, [
          el('b', { text: s.date ? `${Number(s.date.slice(5, 7))}/${Number(s.date.slice(8, 10))}` : '—' }),
          el('span', { text: fmtDate(s.date).slice(-3) })
        ]),
        el('div', { style: { minWidth: 0 } }, [
          el('div', { class: 't truncate', text: sessionTitle(s) }),
          el('div', { class: 's', text: [s.periodLabel, s.field].filter(Boolean).join(' · ') })
        ]),
        s.noClass
          ? el('span', { class: 'badge', text: '방과후 없음' })
          : el('span', { class: `badge ${diff === 0 ? 'accent' : diff < 0 ? 'ok' : ''}`, text: relativeDay(s.date) })
      ]);
    }))
  );
}

/* ── 이번 활동 ───────────────────────────────────────────────────────── */

function currentView(s) {
  if (!s) return [noCurrentSession()];
  return [
    el('div', { class: 'today-card' }, [
      el('div', { class: 'k', text: '이번 활동' }),
      el('h1', { text: sessionTitle(s) }),
      el('div', { class: 'today-meta' }, [
        el('span', { class: 'badge accent', text: fmtDate(s.date, { withYear: true }) }),
        s.periodLabel ? el('span', { class: 'badge', text: s.periodLabel }) : null,
        s.field ? el('span', { class: 'tag', text: s.field }) : null
      ]),
      s.studentGuide
        ? el('div', { class: 'today-guide', text: s.studentGuide })
        : el('div', { class: 'today-guide muted', text: '활동 안내가 아직 등록되지 않았습니다.' })
    ]),
    (s.publicMaterials || []).length
      ? card('준비물', el('div', { class: 'flex gap-8 wrap' }, s.publicMaterials.map(m =>
          el('span', { class: 'chip chip-static', text: `${m.name} ${m.quantity || ''}${m.unit || ''}`.trim() })
        )))
      : null
  ].filter(Boolean);
}

/* ── 활동자료 ────────────────────────────────────────────────────────── */

function materialsView(s) {
  if (!s) return noCurrentSession();
  const sheets = s.worksheets || [];
  const videos = s.videos || [];

  if (!sheets.length && !videos.length) {
    return card('활동자료', emptyState('등록된 활동자료가 없습니다.'));
  }

  return el('div', { style: { display: 'grid', gap: '12px' } }, [
    sheets.length ? card('활동지', el('div', { class: 'res-list' }, sheets.map(w =>
      el('a', { class: 'res-item', href: w.url, target: '_blank', rel: 'noopener noreferrer' }, [
        el('span', { text: w.name || '활동지' }),
        el('span', { class: 'ext', text: '새 창에서 열기' })
      ])
    ))) : null,

    videos.length ? card('참고 영상', el('div', { class: 'res-list' }, videos.map(v =>
      el('a', { class: 'res-item', href: v.url, target: '_blank', rel: 'noopener noreferrer' }, [
        v.thumbnail ? el('img', {
          src: v.thumbnail, alt: '', loading: 'lazy',
          style: { width: '76px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '5px', flex: 'none' }
        }) : null,
        el('span', { class: 'grow truncate', text: v.title || v.url }),
        el('span', { class: 'ext', text: v.duration || 'YouTube' })
      ])
    ))) : null
  ].filter(Boolean));
}

/* ── 활동사진 ────────────────────────────────────────────────────────── */

function photosView(s) {
  if (!s) return noCurrentSession();
  const photos = s.photos || [];

  return el('div', { style: { display: 'grid', gap: '12px' } }, [
    s.driveLink ? card('전체 사진 보기', [
      el('a', { class: 'res-item', href: s.driveLink, target: '_blank', rel: 'noopener noreferrer' }, [
        el('span', { text: 'Google Drive 앨범 열기' }),
        el('span', { class: 'ext', text: '새 창에서 열기' })
      ])
    ]) : null,

    card('대표 사진', photos.length
      ? el('div', { class: 's-photos' }, photos.map(p =>
          el('a', { class: 's-photo', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, [
            el('img', { src: p.url, alt: p.caption || '활동 사진', loading: 'lazy' })
          ])
        ))
      : emptyState('등록된 사진이 없습니다.')
    )
  ].filter(Boolean));
}

/* ── 활동 결과 ───────────────────────────────────────────────────────── */

function resultView(s) {
  if (!s) return [noCurrentSession()];
  const contest = s.contest;
  const showContest = contest?.enabled && contest?.visible && (contest.rows || []).length;

  const blocks = [
    s.publicResult ? card('활동 결과', el('div', { class: 'pre-wrap', style: { fontSize: '14.5px', lineHeight: '1.75' }, text: s.publicResult })) : null,
    s.principle ? card('과학적 원리', el('div', { class: 'pre-wrap', style: { fontSize: '14.5px', lineHeight: '1.75' }, text: s.principle })) : null,
    showContest ? card('대회 결과', el('div', { style: { display: 'grid', gap: '8px' } },
      (contest.rows || [])
        .slice()
        .sort((a, b) => (Number(a.rank) || 99) - (Number(b.rank) || 99))
        .map(r => el('div', { class: `rank-row ${Number(r.rank) === 1 ? 'top1' : ''}` }, [
          el('div', { class: 'rk', text: `${r.rank || '-'}위` }),
          el('div', { style: { minWidth: 0 } }, [
            el('div', { class: 'strong truncate', text: r.name || '' }),
            r.note ? el('div', { class: 'xsmall muted truncate', text: r.note }) : null
          ]),
          el('div', { class: 'rec', text: `${r.record ?? ''}${r.unit || contest.unit || ''}` })
        ]))
    )) : null
  ].filter(Boolean);

  return blocks.length ? blocks : [card('활동 결과', emptyState('아직 공개된 결과가 없습니다.'))];
}

/* ── 간이보고서 ──────────────────────────────────────────────────────── */

function reportView(s) {
  if (!s) return noCurrentSession();
  if (!['done', 'archived'].includes(s.status)) {
    return card('간이보고서', emptyState('아직 보고서를 작성할 수 없습니다.', '수업이 끝나면 작성할 수 있습니다.'));
  }

  const questions = (s.reportQuestions || []).length
    ? s.reportQuestions
    : DEFAULT_REPORT_QUESTIONS;
  const existing = state.myReflections.find(r => r.sessionId === s.id);

  const answers = questions.map((q, i) => {
    const prev = existing?.answers?.find(a => a.id === q.id) || existing?.answers?.[i];
    return { id: q.id || `q${i + 1}`, question: q.text, value: prev?.value || '' };
  });
  let rating = Number(existing?.rating) || 0;

  const markDirty = () => setDirty('report', true);

  const qNodes = questions.map((q, i) => {
    const input = q.type === 'short'
      ? el('input', { class: 'input', maxlength: 200, placeholder: '한 줄로 적어 주세요.' })
      : el('textarea', { class: 'textarea', rows: 3, maxlength: 1500, placeholder: '자유롭게 적어 주세요.' });
    input.value = answers[i].value;
    input.addEventListener('input', () => { answers[i].value = input.value; markDirty(); });

    return el('div', { class: 'report-q' }, [
      el('div', { class: 'q' }, [
        el('span', { class: 'n', text: String(i + 1) }),
        q.text
      ]),
      input
    ]);
  });

  const starButtons = [];
  const starsEl = el('div', { class: 'stars' }, Array.from({ length: 5 }, (_, i) => {
    const b = el('button', { type: 'button', 'aria-label': `${i + 1}점` }, ['★']);
    b.addEventListener('click', () => { rating = i + 1; paintStars(); markDirty(); });
    starButtons.push(b);
    return b;
  }));
  function paintStars() {
    starButtons.forEach((b, i) => b.classList.toggle('on', i < rating));
    ratingLabel.textContent = rating ? `${rating} / 5` : '별을 눌러 주세요';
  }
  const ratingLabel = el('span', { class: 'muted small' });
  paintStars();

  const saveBtn = el('button', { class: 'btn btn-primary btn-lg grow' }, [existing ? '수정 저장' : '제출하기']);
  const statusLabel = el('span', { class: 'small muted', text: existing ? `마지막 저장 ${fmtStamp(existing.updatedAt)}` : '' });

  saveBtn.addEventListener('click', async () => {
    const filled = answers.filter(a => a.value.trim()).length;
    if (!filled && !rating) { toastError('내용을 입력해 주세요.'); return; }

    const restore = busy(saveBtn, '저장 중');
    try {
      const saved = await saveReflection(s.id, state.student.uid, { answers, rating });
      state.myReflections = state.myReflections.filter(r => r.sessionId !== s.id).concat(saved);
      setDirty('report', false);
      statusLabel.textContent = `마지막 저장 ${fmtStamp(saved.updatedAt)}`;
      toastOk('저장했습니다.');
    } catch (e) {
      console.error('[student] 보고서 저장 실패', e);
      toastError('저장하지 못했습니다.');
    } finally { restore(); }
  });

  return el('div', { style: { display: 'grid', gap: '12px' } }, [
    el('div', { class: 'notice accent' },
      `${sessionTitle(s)} · ${fmtDate(s.date, { withYear: true })} 활동 보고서입니다. 쓴 내용은 담당 선생님만 볼 수 있습니다.`),
    ...qNodes,
    el('div', { class: 'report-q' }, [
      el('div', { class: 'q' }, [
        el('span', { class: 'n', text: String(questions.length + 1) }),
        '오늘 활동 만족도'
      ]),
      el('div', { class: 'flex items-center gap-12' }, [starsEl, ratingLabel])
    ]),
    el('div', { class: 'report-bar' }, [statusLabel, el('div', { class: 'spacer grow' }), saveBtn])
  ]);
}

/* ── 내 기록 ─────────────────────────────────────────────────────────── */

function mineView() {
  const refs = state.myReflections.slice().sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  );
  const byId = new Map(state.sessions.map(s => [s.id, s]));

  if (!refs.length) {
    return card('내 기록', emptyState('아직 작성한 보고서가 없습니다.', '수업이 끝나면 간이보고서를 작성할 수 있습니다.'));
  }

  return card('내 기록', el('div', { style: { display: 'grid', gap: '10px' } }, refs.map(r => {
    const s = byId.get(r.sessionId);
    const open = el('button', {
      class: 'btn btn-sm',
      onclick: () => {
        if (!s) return;
        state.current = s;
        state.tab = 'report';
        buildNav(); renderView();
      }
    }, ['보기']);

    return el('div', { class: 'my-row' }, [
      el('div', { style: { minWidth: 0 } }, [
        el('div', { class: 'strong truncate', text: s ? sessionTitle(s) : '(지난 활동)' }),
        el('div', { class: 'xsmall muted', text: [s ? fmtDate(s.date, { withYear: true }) : '', `저장 ${fmtStamp(r.updatedAt)}`].filter(Boolean).join(' · ') })
      ]),
      el('div', { class: 'flex items-center gap-8' }, [
        Number(r.rating) ? starsStatic(r.rating) : null,
        s ? open : null
      ])
    ]);
  })), el('span', { class: 'badge', text: `${refs.length}건` }));
}

/* ── 적재 ────────────────────────────────────────────────────────────── */
/* 실제 데이터는 firebase-service.js 를 통해 이 브라우저에 저장된 값을
   그대로 불러온다. 선생님 화면에서 저장한 내용이 여기에도 그대로
   보이고, 새로고침해도 유지된다. */

async function enterApp(student) {
  state.student = student;
  state.settings = await loadSettings();
  applyBranding(state.settings, { suffix: '학생용' });
  $('#me-name').textContent = student.displayName || '';

  const [sessions, myReflections] = await Promise.all([
    listPublicSessions(state.settings.year),
    listMyReflections(student.uid)
  ]);
  state.sessions = sessions;
  state.myReflections = myReflections;
  state.current = pickCurrentSession(sessions);

  // 첫 화면의 바로가기(예: student.html#/schedule)로 들어온 경우 해당 탭에서 시작한다.
  const wanted = (location.hash || '').replace(/^#\/?/, '');
  if (TABS.some(([key]) => key === wanted)) state.tab = wanted;
  history.replaceState(null, '', location.pathname);

  buildNav();
  renderView();
  showOnly(appEl);
}

/* ── 시작 ────────────────────────────────────────────────────────────── */

/** 첫 화면(index.html) 팝업에서 이미 로그인을 확인했다면 그 학생으로 바로 들어간다. */
async function consumeAutoLogin() {
  const raw = sessionStorage.getItem('smartlab:auto-login');
  sessionStorage.removeItem('smartlab:auto-login');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data?.role !== 'student' || !data.uid) return null;
    return await getStudentDoc(data.uid);
  } catch {
    return null;
  }
}

async function boot() {
  applyBranding(DEFAULT_SETTINGS, { suffix: '학생용' });

  const student = await consumeAutoLogin();
  if (student) {
    await enterApp(student);
    return;
  }

  showOnly(loginScreen);
  setTimeout(() => $('#login-name')?.focus(), 60);
}

boot();
