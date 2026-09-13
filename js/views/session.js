/* ==========================================================================
   주차별 활동 - 실험 전 / 실험 중 / 실험 후
   한 페이지 안에서 탭으로 이동하며, 저장은 공개 문서와 교사 전용 문서에
   나누어 기록한다.
   ========================================================================== */

import {
  el, mount, clear, toast, toastOk, toastError, toastWarn, confirmDialog,
  emptyState, fmtDate, weekdayOf, isThisWeek, uid, wonLabel, busy,
  setDirty, extLink, starsStatic, fmtStamp, promptDialog
} from '../ui.js';
import {
  store, privateOf, sessionById, updateSessionPublic, updateSessionPrivate,
  reflectionsOf, inventoryById, activeStudents, refreshInventory, refreshTemplates,
  studentByUid
} from '../store.js';
import {
  statusBadge, readinessOf, costOf, sessionTitle, pickCurrentSession
} from '../common.js';
import {
  MATERIAL_STATUS, MATERIAL_CATEGORIES, FIELDS, SESSION_STATUS,
  DEFAULT_REPORT_QUESTIONS, uploadFile, saveTemplate
} from '../firebase-service.js';
import { consumeFromInventory } from '../inventory-service.js';
import { openMaterialsDraft, openLessonPlanDraft, openReportQuestionsDraft,
         openReflectionSummary, openPortfolioDraft } from './assist.js';
import { openVideoSearch } from './video-search.js';

const DIRTY_KEY = 'session';

/* ── 작은 도우미 ─────────────────────────────────────────────────────── */

function section(title, children, { open = true, aside = null } = {}) {
  const det = el('details', { class: 'section' });
  if (open) det.open = true;
  det.append(
    el('summary', {}, [
      el('span', { text: title }),
      el('span', { class: 'spacer' }),
      aside
    ]),
    el('div', { class: 'section-body' }, children)
  );
  return det;
}

function field(label, node, hint) {
  return el('div', { class: 'field' }, [
    el('label', { text: label }),
    node,
    hint ? el('span', { class: 'hint', text: hint }) : null
  ]);
}

/* ── 메인 ────────────────────────────────────────────────────────────── */

export async function renderSession(ctx) {
  const listCard = el('div', { class: 'card' });
  const paneCard = el('div', { class: 'card session-pane' });

  let selectedId =
    ctx.params ||
    pickCurrentSession(store.sessions)?.id ||
    store.sessions[0]?.id ||
    null;
  let tab = 'before';

  /* 편집 중인 초안 */
  let pub = null;     // 공개 문서 초안
  let prv = null;     // 교사 전용 초안
  let dirty = false;

  const stateEl = el('span', { class: 'save-state' });
  const saveBtn = el('button', { class: 'btn btn-primary', disabled: true }, ['저장']);

  function markDirty() {
    dirty = true;
    setDirty(DIRTY_KEY, true);
    saveBtn.disabled = false;
    stateEl.textContent = '저장하지 않은 변경';
    stateEl.className = 'save-state dirty';
  }
  function markClean(text = '저장됨') {
    dirty = false;
    setDirty(DIRTY_KEY, false);
    saveBtn.disabled = true;
    stateEl.textContent = text;
    stateEl.className = 'save-state saved';
  }

  /** 입력 요소를 초안 객체에 연결한다. */
  function bindTo(target, key, node, transform = v => v) {
    const handler = () => {
      target[key] = transform(node.type === 'checkbox' ? node.checked : node.value);
      markDirty();
    };
    node.addEventListener('input', handler);
    node.addEventListener('change', handler);
    return node;
  }

  function loadDraft(session) {
    pub = JSON.parse(JSON.stringify({
      studentGuide: '', publicMaterials: [], worksheets: [], videos: [],
      driveLink: '', photos: [], coverPhoto: '', publicResult: '',
      principle: '', relatedVideos: [],
      contest: { enabled: false, visible: false, unit: '초', rows: [] },
      reportQuestions: DEFAULT_REPORT_QUESTIONS.map(q => ({ ...q })),
      status: 'draft', title: '', date: '', periodLabel: '', field: '기타', noClass: false,
      ...session
    }));
    const p = privateOf(session.id) || {};
    prv = JSON.parse(JSON.stringify({
      goal: '', plan: '', runPlan: '', materials: [], checklist: [],
      safety: '', planB: '', liveNotes: [], attendance: {},
      result: '', goodPoints: '', badPoints: '', nextTime: '', usage: '',
      estimatedCost: 0, actualCost: 0, reflection: '', reflectionSummary: '',
      portfolioDraft: null, recommend: '', memo: '',
      successCount: null, failCount: null, retryCount: null,
      ...p
    }));
    markClean('');
    stateEl.textContent = '';
    stateEl.className = 'save-state';
  }

  async function save() {
    const restore = busy(saveBtn, '저장 중');
    stateEl.textContent = '저장 중…';
    stateEl.className = 'save-state saving';
    try {
      // 학생에게 공개할 준비물은 체크된 항목에서 자동으로 만든다 (두 번 입력하지 않도록)
      pub.publicMaterials = (prv.materials || [])
        .filter(m => m.pub)
        .map(m => ({ name: m.name, quantity: m.quantity || '', unit: m.unit || '' }));

      const cost = costOf(prv);
      prv.estimatedCost = cost.materialEstimated;
      prv.actualCost = cost.materialActual;

      const { id, createdAt, ...publicPatch } = pub;
      await Promise.all([
        updateSessionPublic(selectedId, publicPatch),
        updateSessionPrivate(selectedId, prv)
      ]);
      markClean();
      toastOk('저장했습니다.');
      renderList();
    } catch (e) {
      console.error('[session] 저장 실패', e);
      toastError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      stateEl.textContent = '저장 실패';
      stateEl.className = 'save-state dirty';
    } finally {
      restore();
    }
  }
  saveBtn.addEventListener('click', save);

  async function switchTo(id) {
    if (dirty) {
      const go = await confirmDialog({
        title: '저장하지 않은 변경이 있습니다',
        message: '저장하지 않고 다른 활동으로 이동하면 입력한 내용이 사라집니다.\n이동할까요?',
        confirmText: '저장하지 않고 이동', cancelText: '계속 편집', danger: true
      });
      if (!go) return;
      setDirty(DIRTY_KEY, false);
      dirty = false;
    }
    selectedId = id;
    tab = 'before';
    renderList();
    renderPane();
  }

  /* ── 왼쪽 목록 ─────────────────────────────────────────────────────── */
  function renderList() {
    const rows = store.sessions.map(s => {
      const ready = readinessOf(privateOf(s.id));
      return el('div', {
        class: ['plan-row', s.id === selectedId ? 'on' : '', isThisWeek(s.date) ? 'this-week' : '',
                s.noClass ? 'no-class' : ''].filter(Boolean).join(' '),
        onclick: () => switchTo(s.id)
      }, [
        el('div', { class: 'plan-date' }, [
          el('div', { class: 'md', text: s.date ? `${Number(s.date.slice(5, 7))}/${Number(s.date.slice(8, 10))}` : '—' }),
          el('div', { class: 'dw', text: weekdayOf(s.date) })
        ]),
        el('div', { style: { minWidth: 0 } }, [
          el('div', { class: 'p-title truncate', text: sessionTitle(s) }),
          el('div', { class: 'p-sub truncate', text: s.periodLabel || '—' })
        ]),
        !s.noClass && ready.total
          ? el('span', { class: 'xsmall num muted', text: `${ready.percent}%` })
          : statusBadge(s.status)
      ]);
    });

    mount(listCard,
      el('div', { class: 'card-head' }, [el('h2', { text: '활동 목록' })]),
      rows.length
        ? el('div', { class: 'card-body flush scroll-y' }, rows)
        : emptyState('등록된 활동이 없습니다.')
    );
  }

  /* ── 오른쪽 상세 ───────────────────────────────────────────────────── */
  function renderPane() {
    const s = sessionById(selectedId);
    if (!s) {
      mount(paneCard, emptyState('왼쪽에서 활동을 선택해 주세요.'));
      return;
    }
    loadDraft(s);
    paintPane();
  }

  function paintPane() {
    const s = sessionById(selectedId);
    const tabsEl = el('div', { class: 'tabs' }, [
      ['before', '실험 전'], ['during', '실험 중'], ['after', '실험 후']
    ].map(([k, label]) =>
      el('button', {
        class: tab === k ? 'on' : '', type: 'button',
        onclick: () => { tab = k; paintPane(); }
      }, [label])
    ));

    const bodyEl = el('div', { class: 'pane-body' });
    if (tab === 'before') mount(bodyEl, ...beforeTab(s));
    else if (tab === 'during') mount(bodyEl, ...duringTab(s));
    else mount(bodyEl, ...afterTab(s));

    const statusSelect = el('select', { class: 'select input-sm', style: { width: 'auto' } },
      Object.entries(SESSION_STATUS).map(([k, v]) =>
        el('option', { value: k, selected: pub.status === k, text: v.label })
      ));
    statusSelect.addEventListener('change', () => { pub.status = statusSelect.value; markDirty(); });

    mount(paneCard,
      el('div', { class: 'card-head' }, [
        el('div', { style: { minWidth: 0 } }, [
          el('h2', { class: 'truncate', text: sessionTitle(s) }),
          el('div', { class: 'xsmall muted', text: [fmtDate(s.date, { withYear: true }), s.periodLabel, s.field].filter(Boolean).join(' · ') })
        ]),
        el('div', { class: 'spacer' }),
        statusSelect,
        stateEl,
        saveBtn
      ]),
      tabsEl,
      bodyEl
    );
  }

  /* ══ 실험 전 ═══════════════════════════════════════════════════════ */
  function beforeTab(s) {
    const out = [];

    /* 기본 정보 */
    const titleInput = bindTo(pub, 'title', el('input', { class: 'input', value: pub.title || '' }));
    const dateInput = bindTo(pub, 'date', el('input', { class: 'input', type: 'date', value: pub.date || '' }));
    const periodInput = bindTo(pub, 'periodLabel', el('input', { class: 'input', value: pub.periodLabel || '' }));
    const fieldSel = bindTo(pub, 'field', el('select', { class: 'select' },
      FIELDS.map(v => el('option', { value: v, selected: pub.field === v, text: v }))));
    const goalArea = bindTo(prv, 'goal', el('textarea', { class: 'textarea', rows: 2, placeholder: '이 활동에서 학생이 알게 되었으면 하는 것' }));
    goalArea.value = prv.goal || '';

    out.push(section('기본 정보', [
      el('div', { class: 'form-grid cols-4' }, [
        el('div', { class: 'field span-2' }, [el('label', { text: '활동명' }), titleInput]),
        field('날짜', dateInput),
        field('차시', periodInput),
        field('분야', fieldSel),
        el('div', { class: 'field span-full' }, [el('label', { text: '활동 목표' }), goalArea])
      ])
    ]));

    /* 학생용 안내 / 교사용 계획 */
    const guideArea = bindTo(pub, 'studentGuide', el('textarea', { class: 'textarea', rows: 4, placeholder: '학생 화면에 그대로 표시됩니다.' }));
    guideArea.value = pub.studentGuide || '';
    const planArea = bindTo(prv, 'plan', el('textarea', { class: 'textarea', rows: 4, placeholder: '교사만 봅니다.' }));
    planArea.value = prv.plan || '';
    const runArea = bindTo(prv, 'runPlan', el('textarea', { class: 'textarea', rows: 6, placeholder: '도입 / 주요 활동 / 마무리 시간 배분' }));
    runArea.value = prv.runPlan || '';

    const planBtn = el('button', { class: 'btn btn-sm' }, ['수업 계획 초안 만들기']);
    planBtn.addEventListener('click', () => openLessonPlanDraft({
      session: pub, priv: prv, button: planBtn,
      onApply: ({ runPlan, safety, planB, goal }) => {
        if (runPlan) { runArea.value = runPlan; prv.runPlan = runPlan; }
        if (safety) { safetyArea.value = safety; prv.safety = safety; }
        if (planB) { planBArea.value = planB; prv.planB = planB; }
        if (goal && !prv.goal) { goalArea.value = goal; prv.goal = goal; }
        markDirty();
        toastOk('초안을 반영했습니다. 내용을 확인한 뒤 저장해 주세요.');
      }
    }));

    out.push(section('학생 안내 · 수업 계획', [
      el('div', { class: 'form-grid cols-2' }, [
        el('div', { class: 'field' }, [el('label', { text: '학생용 활동 안내 (학생 화면 공개)' }), guideArea]),
        el('div', { class: 'field' }, [el('label', { text: '교사용 상세계획' }), planArea]),
        el('div', { class: 'field span-2' }, [
          el('div', { class: 'flex items-center gap-8' }, [
            el('label', { class: 'label grow', text: '90분 운영계획' }),
            store.settings?.geminiEnabled !== false ? planBtn : null
          ]),
          runArea
        ])
      ])
    ]));

    /* 준비물 */
    const matWrap = el('div');
    const invMap = inventoryById();

    function renderMaterials() {
      const list = prv.materials || [];
      clear(matWrap);

      matWrap.append(el('div', { class: 'mat-head' }, [
        el('span', { text: '공개', title: '학생 화면에 준비물로 표시' }),
        el('span', { text: '물품명' }),
        el('span', { text: '수량' }),
        el('span', { text: '단위' }),
        el('span', { text: '상태' }),
        el('span', { text: '재고 연결' }),
        el('span', { text: '예상가' }),
        el('span', { text: '실제가' }),
        el('span', { text: '구매처' }),
        el('span', { text: '' })
      ]));

      if (!list.length) {
        matWrap.append(emptyState('등록된 준비물이 없습니다.'));
      }

      list.forEach((m, i) => {
        const pubCheck = el('input', { type: 'checkbox', checked: Boolean(m.pub), title: '학생에게 공개' });
        pubCheck.addEventListener('change', () => { m.pub = pubCheck.checked; markDirty(); });

        const name = el('input', { class: 'input input-sm', value: m.name || '', placeholder: '물품명' });
        name.addEventListener('input', () => { m.name = name.value; markDirty(); });

        const qty = el('input', { class: 'input input-sm', type: 'number', min: 0, step: 'any', value: m.quantity ?? '' });
        qty.addEventListener('input', () => { m.quantity = qty.value === '' ? '' : Number(qty.value); markDirty(); });

        const unit = el('input', { class: 'input input-sm', value: m.unit || '', placeholder: '개' });
        unit.addEventListener('input', () => { m.unit = unit.value; markDirty(); });

        const status = el('select', { class: 'select input-sm' },
          MATERIAL_STATUS.map(v => el('option', { value: v, selected: m.status === v, text: v })));
        status.addEventListener('change', () => { m.status = status.value; markDirty(); renderMaterials(); });

        const inv = el('select', { class: 'select input-sm' }, [
          el('option', { value: '', text: '연결 안 함' }),
          ...store.inventory.map(it => el('option', {
            value: it.id, selected: m.inventoryId === it.id,
            text: `${it.name} (${it.quantity}${it.unit})`
          }))
        ]);
        inv.addEventListener('change', () => { m.inventoryId = inv.value || ''; markDirty(); renderMaterials(); });

        const est = el('input', { class: 'input input-sm', type: 'number', min: 0, step: 100, value: m.estPrice ?? '' });
        est.addEventListener('input', () => { m.estPrice = est.value === '' ? '' : Number(est.value); markDirty(); });

        const act = el('input', { class: 'input input-sm', type: 'number', min: 0, step: 100, value: m.actualPrice ?? '' });
        act.addEventListener('input', () => { m.actualPrice = act.value === '' ? '' : Number(act.value); markDirty(); });

        const vendor = el('input', { class: 'input input-sm', value: m.vendor || '', placeholder: '구매처' });
        vendor.addEventListener('input', () => { m.vendor = vendor.value; markDirty(); });

        const del = el('button', { class: 'btn-icon', type: 'button', title: '삭제' }, ['✕']);
        del.addEventListener('click', () => {
          prv.materials.splice(i, 1); markDirty(); renderMaterials();
        });

        const row = el('div', { class: 'mat-row' }, [
          el('label', { class: 'check', style: { justifyContent: 'center' } }, [pubCheck]),
          name, qty, unit, status, inv, est, act, vendor, del
        ]);

        // 재고 연결 시 부족 여부를 바로 알려준다.
        if (m.inventoryId) {
          const item = invMap.get(m.inventoryId);
          if (item) {
            const need = Number(m.quantity) || 0;
            const have = Number(item.quantity) || 0;
            if (have < need) {
              row.append(el('div', { class: 'xsmall', style: { gridColumn: '1 / -1', color: 'var(--danger)' },
                text: `재고 부족 — 보유 ${have}${item.unit}, 필요 ${need}${m.unit || item.unit} (${need - have}${item.unit} 추가 필요)` }));
            }
          }
        }
        matWrap.append(row);
      });
    }

    const addMatBtn = el('button', { class: 'btn btn-sm' }, ['+ 준비물 추가']);
    addMatBtn.addEventListener('click', () => {
      prv.materials = prv.materials || [];
      prv.materials.push({
        id: uid('m'), name: '', quantity: 1, unit: '개', category: '소모품',
        status: '구매 필요', inventoryId: '', estPrice: '', actualPrice: '', vendor: '',
        pub: true, note: ''
      });
      markDirty(); renderMaterials();
    });

    const matDraftBtn = el('button', { class: 'btn btn-sm' }, ['준비물 초안 만들기']);
    matDraftBtn.addEventListener('click', () => openMaterialsDraft({
      session: pub, button: matDraftBtn,
      onApply: (items) => {
        prv.materials = prv.materials || [];
        items.forEach(it => prv.materials.push({
          id: uid('m'), name: it.name, quantity: it.quantity, unit: it.unit,
          category: MATERIAL_CATEGORIES.includes(it.category) ? it.category : '기타',
          status: '구매 필요', inventoryId: '', estPrice: '', actualPrice: '', vendor: '',
          pub: true, note: it.note || ''
        }));
        markDirty(); renderMaterials();
        toastOk(`${items.length}개 항목을 추가했습니다. 수량과 상태를 확인해 주세요.`);
      },
      onSafety: (text) => {
        if (!prv.safety) { prv.safety = text; safetyArea.value = text; markDirty(); }
      }
    }));

    renderMaterials();
    out.push(section('준비물', [
      el('div', { class: 'flex gap-8 mb-12 wrap' }, [
        addMatBtn,
        store.settings?.geminiEnabled !== false ? matDraftBtn : null,
        el('div', { class: 'spacer grow' }),
        el('span', { class: 'xsmall muted', text: '"공개" 를 체크한 항목만 학생 화면에 표시됩니다.' })
      ]),
      matWrap
    ]));

    /* 체크리스트 */
    const checkWrap = el('div');
    const DEFAULT_CHECKS = ['활동지 출력', '시약 소분', '실험기구 준비', '영상 테스트', '학생용 재료 배부 준비', '안전장비 확인'];

    function renderChecklist() {
      const list = prv.checklist || [];
      clear(checkWrap);
      if (!list.length) {
        checkWrap.append(emptyState('체크리스트가 없습니다.', '기본 항목을 불러오거나 직접 추가해 주세요.'));
      }
      list.forEach((c, i) => {
        const cb = el('input', { type: 'checkbox', checked: Boolean(c.done) });
        const txt = el('input', { class: 'input input-sm', value: c.text || '' });
        const row = el('div', { class: `check-row ${c.done ? 'done' : ''}` }, [
          cb,
          el('span', { class: 'txt' }, [txt]),
          el('button', { class: 'btn-icon', type: 'button', title: '삭제', onclick: () => {
            prv.checklist.splice(i, 1); markDirty(); renderChecklist();
          } }, ['✕'])
        ]);
        cb.addEventListener('change', () => { c.done = cb.checked; markDirty(); renderChecklist(); });
        txt.addEventListener('input', () => { c.text = txt.value; markDirty(); });
        checkWrap.append(row);
      });
    }
    renderChecklist();

    const ready = readinessOf(prv);
    out.push(section('실험 전 체크리스트', [
      el('div', { class: 'flex gap-8 mb-12 wrap items-center' }, [
        el('button', { class: 'btn btn-sm', onclick: () => {
          prv.checklist = prv.checklist || [];
          prv.checklist.push({ id: uid('c'), text: '', done: false });
          markDirty(); renderChecklist();
        } }, ['+ 항목 추가']),
        el('button', { class: 'btn btn-sm', onclick: () => {
          prv.checklist = prv.checklist || [];
          DEFAULT_CHECKS.forEach(t => {
            if (!prv.checklist.some(c => c.text === t)) prv.checklist.push({ id: uid('c'), text: t, done: false });
          });
          markDirty(); renderChecklist();
        } }, ['기본 항목 불러오기']),
        el('div', { class: 'spacer grow' }),
        el('span', { class: 'xsmall muted', text: '체크리스트와 준비물 상태로 준비 진행률이 계산됩니다.' })
      ]),
      checkWrap
    ], { aside: el('span', { class: 'badge', text: `${ready.checkDone}/${ready.checkTotal}` }) }));

    /* 안전 / Plan B */
    const safetyArea = bindTo(prv, 'safety', el('textarea', { class: 'textarea', rows: 3 }));
    safetyArea.value = prv.safety || '';
    const planBArea = bindTo(prv, 'planB', el('textarea', { class: 'textarea', rows: 3 }));
    planBArea.value = prv.planB || '';
    const memoArea = bindTo(prv, 'memo', el('textarea', { class: 'textarea', rows: 3 }));
    memoArea.value = prv.memo || '';

    out.push(section('안전 · Plan B · 메모', [
      el('div', { class: 'form-grid cols-3' }, [
        el('div', { class: 'field' }, [el('label', { text: '안전 준비사항' }), safetyArea]),
        el('div', { class: 'field' }, [el('label', { text: 'Plan B' }), planBArea]),
        el('div', { class: 'field' }, [el('label', { text: '기타 메모' }), memoArea])
      ])
    ], { open: false }));

    /* 참고영상 */
    const videoWrap = el('div');
    function renderVideos() {
      clear(videoWrap);
      const list = pub.videos || [];
      if (!list.length) {
        videoWrap.append(emptyState('선택한 영상이 없습니다.', '검색해서 학생에게 보여줄 영상을 고를 수 있습니다.'));
        return;
      }
      list.forEach((v, i) => {
        videoWrap.append(el('div', { class: 'video-picked mb-8' }, [
          v.thumbnail ? el('img', { src: v.thumbnail, alt: '', loading: 'lazy' }) : null,
          el('div', { class: 'grow', style: { minWidth: 0 } }, [
            el('div', { class: 'strong small truncate', text: v.title }),
            el('div', { class: 'xsmall muted', text: [v.channelTitle, v.duration].filter(Boolean).join(' · ') })
          ]),
          extLink(v.url, '열기', 'btn btn-sm'),
          el('button', { class: 'btn btn-sm btn-danger', onclick: () => {
            pub.videos.splice(i, 1); markDirty(); renderVideos();
          } }, ['제거'])
        ]));
      });
    }
    renderVideos();

    const searchBtn = el('button', { class: 'btn btn-sm' }, ['영상 검색']);
    searchBtn.addEventListener('click', () => openVideoSearch({
      defaultQuery: `${pub.title || ''} 실험`.trim(),
      button: searchBtn,
      onPick: (v) => {
        pub.videos = pub.videos || [];
        if (pub.videos.some(x => x.videoId === v.videoId)) { toastWarn('이미 선택한 영상입니다.'); return; }
        pub.videos.push(v);
        markDirty(); renderVideos();
        toastOk('영상을 추가했습니다.');
      }
    }));

    out.push(section('참고영상 (학생 공개)', [
      el('div', { class: 'flex gap-8 mb-12 items-center wrap' }, [
        store.settings?.youtubeEnabled !== false
          ? searchBtn
          : el('span', { class: 'xsmall muted', text: '설정에서 영상 검색이 꺼져 있습니다.' }),
        el('button', { class: 'btn btn-sm', onclick: async () => {
          const url = await promptDialog({ title: '영상 주소 직접 추가', label: 'YouTube 주소', placeholder: 'https://www.youtube.com/watch?v=...' });
          if (!url) return;
          const m = /(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(url);
          if (!m) { toastError('YouTube 주소를 확인해 주세요.'); return; }
          pub.videos = pub.videos || [];
          pub.videos.push({
            videoId: m[1], title: url, channelTitle: '', duration: '',
            thumbnail: `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${m[1]}`
          });
          markDirty(); renderVideos();
        } }, ['주소로 추가'])
      ]),
      videoWrap
    ], { open: false, aside: el('span', { class: 'badge', text: `${(pub.videos || []).length}개` }) }));

    /* 활동지 */
    const wsWrap = el('div');
    function renderWorksheets() {
      clear(wsWrap);
      const list = pub.worksheets || [];
      if (!list.length) { wsWrap.append(emptyState('등록된 활동지가 없습니다.')); return; }
      list.forEach((w, i) => {
        wsWrap.append(el('div', { class: 'flex items-center gap-8 mb-8' }, [
          el('span', { class: 'grow truncate small strong', text: w.name || w.url }),
          extLink(w.url, '열기', 'btn btn-sm'),
          el('button', { class: 'btn btn-sm btn-danger', onclick: () => {
            pub.worksheets.splice(i, 1); markDirty(); renderWorksheets();
          } }, ['제거'])
        ]));
      });
    }
    renderWorksheets();

    const fileInput = el('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.hwp,.hwpx,.docx,.pptx', hidden: true });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const t = toast('업로드 중…');
      try {
        const up = await uploadFile(file, 'public', `sessions/${selectedId}/worksheets`);
        pub.worksheets = pub.worksheets || [];
        pub.worksheets.push({ name: up.name, url: up.url, path: up.path });
        markDirty(); renderWorksheets();
        toastOk('업로드했습니다.');
      } catch (e) {
        console.error('[session] 활동지 업로드 실패', e);
        toastError(e?.message || '업로드하지 못했습니다.');
      } finally {
        t.remove();
        fileInput.value = '';
      }
    });

    out.push(section('활동지 (학생 공개)', [
      el('div', { class: 'flex gap-8 mb-12 wrap' }, [
        el('button', { class: 'btn btn-sm', onclick: () => fileInput.click() }, ['파일 업로드']),
        el('button', { class: 'btn btn-sm', onclick: async () => {
          const url = await promptDialog({ title: '링크로 추가', label: '활동지 주소', placeholder: 'https://' });
          if (!url) return;
          if (!/^https?:\/\//i.test(url)) { toastError('http 로 시작하는 주소를 입력해 주세요.'); return; }
          const name = await promptDialog({ title: '이름', label: '표시할 이름', value: '활동지' });
          pub.worksheets = pub.worksheets || [];
          pub.worksheets.push({ name: name || '활동지', url });
          markDirty(); renderWorksheets();
        } }, ['링크로 추가']),
        fileInput
      ]),
      wsWrap
    ], { open: false }));

    /* 간이보고서 질문 */
    const qWrap = el('div');
    function renderQuestions() {
      clear(qWrap);
      const list = pub.reportQuestions || [];
      if (!list.length) { qWrap.append(emptyState('질문이 없습니다.')); return; }
      list.forEach((q, i) => {
        const txt = el('input', { class: 'input input-sm grow', value: q.text || '' });
        txt.addEventListener('input', () => { q.text = txt.value; markDirty(); });
        const type = el('select', { class: 'select input-sm', style: { width: '92px' } }, [
          el('option', { value: 'long', selected: q.type !== 'short', text: '서술형' }),
          el('option', { value: 'short', selected: q.type === 'short', text: '한 줄' })
        ]);
        type.addEventListener('change', () => { q.type = type.value; markDirty(); });
        qWrap.append(el('div', { class: 'flex items-center gap-6 mb-8' }, [
          el('span', { class: 'xsmall muted num', style: { width: '16px' }, text: String(i + 1) }),
          txt, type,
          el('button', { class: 'btn-icon', title: '삭제', onclick: () => {
            pub.reportQuestions.splice(i, 1); markDirty(); renderQuestions();
          } }, ['✕'])
        ]));
      });
    }
    renderQuestions();

    const qBtn = el('button', { class: 'btn btn-sm' }, ['보고서 질문 만들기']);
    qBtn.addEventListener('click', () => openReportQuestionsDraft({
      session: pub, priv: prv, button: qBtn,
      onApply: (questions) => {
        pub.reportQuestions = questions.map((q, i) => ({ id: `q${i + 1}`, text: q.text, type: q.type }));
        markDirty(); renderQuestions();
        toastOk('질문을 교체했습니다. 내용을 확인한 뒤 저장해 주세요.');
      }
    }));

    out.push(section('간이보고서 질문', [
      el('div', { class: 'flex gap-8 mb-12 wrap' }, [
        el('button', { class: 'btn btn-sm', onclick: () => {
          pub.reportQuestions = pub.reportQuestions || [];
          pub.reportQuestions.push({ id: uid('q'), text: '', type: 'long' });
          markDirty(); renderQuestions();
        } }, ['+ 질문 추가']),
        el('button', { class: 'btn btn-sm', onclick: () => {
          pub.reportQuestions = DEFAULT_REPORT_QUESTIONS.map(q => ({ ...q }));
          markDirty(); renderQuestions();
        } }, ['기본 질문으로']),
        store.settings?.geminiEnabled !== false ? qBtn : null,
        el('div', { class: 'spacer grow' }),
        el('span', { class: 'xsmall muted', text: '만족도 별점은 항상 함께 표시됩니다.' })
      ]),
      qWrap
    ], { open: false }));

    /* 지난 운영 메모 */
    const past = pastRunNote(pub.title);
    if (past) out.unshift(el('div', { class: 'notice accent mb-12' }, [
      el('strong', { text: '지난 운영 메모 · ' + (past.from || '') }), el('br'),
      el('span', { class: 'pre-wrap', text: past.text })
    ]));

    return out;
  }

  /** 같은 이름의 활동을 이전에 운영한 기록이 있으면 알려준다. */
  function pastRunNote(title) {
    const key = String(title || '').replace(/\s/g, '');
    if (!key) return null;
    const tpl = store.templates.find(t => String(t.title || '').replace(/\s/g, '') === key && t.nextTime);
    if (tpl) return { text: tpl.nextTime, from: '실험 보관함' };
    const other = store.sessions.find(s =>
      s.id !== selectedId && String(s.title || '').replace(/\s/g, '') === key
    );
    if (other) {
      const p = privateOf(other.id);
      if (p?.nextTime) return { text: p.nextTime, from: fmtDate(other.date, { withYear: true }) };
    }
    return null;
  }

  /* ══ 실험 중 ═══════════════════════════════════════════════════════ */
  function duringTab(s) {
    const out = [];

    /* 즉석 메모 - 따로 크게 */
    const quickInput = el('textarea', { class: 'textarea', rows: 2, placeholder: '예) 다음에는 PET병 500mL / 얼음 2봉 더 필요' });
    const notesWrap = el('div');

    function renderNotes() {
      clear(notesWrap);
      const list = (prv.liveNotes || []).slice().reverse();
      if (!list.length) { notesWrap.append(emptyState('기록된 메모가 없습니다.')); return; }
      list.forEach(n => {
        notesWrap.append(el('div', { class: 'flex items-start gap-8 mb-8' }, [
          el('span', { class: 'dot accent', style: { marginTop: '7px', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent)', flex: 'none' } }),
          el('div', { class: 'grow' }, [
            el('div', { class: 'pre-wrap small', text: n.text }),
            el('div', { class: 'xsmall muted', text: fmtStamp(n.at) })
          ]),
          el('button', { class: 'btn-icon', title: '삭제', onclick: () => {
            prv.liveNotes = (prv.liveNotes || []).filter(x => x.id !== n.id);
            markDirty(); renderNotes();
          } }, ['✕'])
        ]));
      });
    }
    renderNotes();

    const quickSave = el('button', { class: 'btn btn-primary btn-lg' }, ['메모 저장']);
    quickSave.addEventListener('click', async () => {
      const text = quickInput.value.trim();
      if (!text) { quickInput.focus(); return; }
      prv.liveNotes = prv.liveNotes || [];
      prv.liveNotes.push({ id: uid('n'), text, at: new Date().toISOString() });
      quickInput.value = '';
      renderNotes();
      const restore = busy(quickSave, '저장 중');
      try {
        await updateSessionPrivate(selectedId, prv);
        toastOk('메모를 저장했습니다.');
      } catch (e) {
        console.error('[session] 메모 저장 실패', e);
        toastError('메모를 저장하지 못했습니다.');
        markDirty();
      } finally { restore(); }
    });

    out.push(section('즉석 메모', [
      el('div', { class: 'flex gap-8 mb-12', style: { alignItems: 'stretch' } }, [
        el('div', { class: 'grow' }, [quickInput]),
        quickSave
      ]),
      notesWrap
    ]));

    /* 사진 / 영상 링크 */
    const driveInput = bindTo(pub, 'driveLink', el('input', { class: 'input', placeholder: 'https://drive.google.com/...', value: pub.driveLink || '' }));
    const photoWrap = el('div', { class: 'photo-grid' });

    function renderPhotos() {
      clear(photoWrap);
      const list = pub.photos || [];
      if (!list.length) {
        photoWrap.append(emptyState('등록된 대표사진이 없습니다.'));
        return;
      }
      list.forEach((p, i) => {
        photoWrap.append(el('div', { class: 'photo-cell' }, [
          el('img', { src: p.url, alt: p.caption || '', loading: 'lazy' }),
          el('button', { class: 'del', title: '삭제', onclick: () => {
            pub.photos.splice(i, 1);
            if (pub.coverPhoto === p.url) pub.coverPhoto = pub.photos[0]?.url || '';
            markDirty(); renderPhotos();
          } }, ['✕'])
        ]));
      });
    }
    renderPhotos();

    const photoInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    photoInput.addEventListener('change', async () => {
      const files = Array.from(photoInput.files || []).slice(0, 5);
      if (!files.length) return;
      const t = toast(`사진 ${files.length}장 업로드 중…`, '', 60000);
      try {
        for (const file of files) {
          const up = await uploadFile(file, 'public', `sessions/${selectedId}/photos`);
          pub.photos = pub.photos || [];
          pub.photos.push({ url: up.url, path: up.path, caption: '' });
          if (!pub.coverPhoto) pub.coverPhoto = up.url;
        }
        markDirty(); renderPhotos();
        toastOk('업로드했습니다.');
      } catch (e) {
        console.error('[session] 사진 업로드 실패', e);
        toastError(e?.message || '업로드하지 못했습니다.');
      } finally {
        t.remove();
        photoInput.value = '';
      }
    });

    out.push(section('활동사진 · 영상', [
      el('div', { class: 'form-grid cols-1' }, [
        el('div', { class: 'field' }, [
          el('label', { text: 'Google Drive 활동사진/영상 폴더 링크 (학생 공개)' }),
          driveInput,
          el('span', { class: 'hint', text: '용량이 큰 사진과 영상은 Drive 공유폴더를 사용하세요. 링크 공유 권한을 확인해 주세요.' })
        ])
      ]),
      el('div', { class: 'flex gap-8 mt-12 mb-12 wrap items-center' }, [
        el('button', { class: 'btn btn-sm', onclick: () => photoInput.click() }, ['대표사진 업로드']),
        photoInput,
        el('span', { class: 'xsmall muted', text: '대표사진 1~5장만 이곳에 올리고, 나머지는 Drive 링크로 관리합니다.' })
      ]),
      photoWrap
    ]));

    /* 출석 */
    const students = activeStudents();
    const attWrap = el('div', { class: 'flex gap-8 wrap' });
    function renderAttendance() {
      clear(attWrap);
      if (!students.length) { attWrap.append(emptyState('등록된 학생이 없습니다.')); return; }
      students.forEach(st => {
        const on = prv.attendance?.[st.uid] !== false;
        attWrap.append(el('button', {
          class: `chip ${on ? 'on' : ''}`, type: 'button',
          onclick: () => {
            prv.attendance = prv.attendance || {};
            prv.attendance[st.uid] = !on;
            markDirty(); renderAttendance();
          }
        }, [st.displayName || '이름 없음']));
      });
    }
    renderAttendance();

    const numField = (label, key) => {
      const input = el('input', { class: 'input', type: 'number', min: 0, value: prv[key] ?? '' });
      input.addEventListener('input', () => { prv[key] = input.value === '' ? null : Number(input.value); markDirty(); });
      return field(label, input);
    };

    const resultMemo = bindTo(prv, 'result', el('textarea', { class: 'textarea', rows: 3, placeholder: '실험 결과 간단 메모' }));
    resultMemo.value = prv.result || '';

    out.push(section('수업 중 기록', [
      el('div', { class: 'field mb-12' }, [
        el('label', { text: '출석 (누르면 결석으로 바뀝니다)' }), attWrap
      ]),
      el('div', { class: 'form-grid cols-3 mb-12' }, [
        numField('성공 인원', 'successCount'),
        numField('실패 인원', 'failCount'),
        numField('재실험 인원', 'retryCount')
      ]),
      el('div', { class: 'field' }, [el('label', { text: '실험 결과 간단 메모' }), resultMemo])
    ]));

    /* 대회 결과 */
    const contest = pub.contest = pub.contest || { enabled: false, visible: false, unit: '초', rows: [] };
    const contestWrap = el('div');

    function renderContest() {
      clear(contestWrap);
      if (!contest.rows.length) { contestWrap.append(emptyState('기록된 결과가 없습니다.')); return; }
      const table = el('table', { class: 'tbl' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { style: { width: '60px' }, text: '순위' }),
          el('th', { text: '학생 또는 팀' }),
          el('th', { class: 'num', style: { width: '100px' }, text: '기록' }),
          el('th', { style: { width: '70px' }, text: '단위' }),
          el('th', { text: '비고' }),
          el('th', { style: { width: '40px' } })
        ])),
        el('tbody', {}, contest.rows.map((r, i) => {
          const mk = (key, opts = {}) => {
            const input = el('input', { class: 'input input-sm', value: r[key] ?? '', ...opts });
            input.addEventListener('input', () => { r[key] = input.value; markDirty(); });
            return input;
          };
          return el('tr', {}, [
            el('td', {}, [mk('rank', { type: 'number', min: 1 })]),
            el('td', {}, [mk('name', { placeholder: '2조' })]),
            el('td', {}, [mk('record', { type: 'number', step: 'any' })]),
            el('td', {}, [mk('unit', { placeholder: contest.unit || '초' })]),
            el('td', {}, [mk('note')]),
            el('td', {}, [el('button', { class: 'btn-icon', title: '삭제', onclick: () => {
              contest.rows.splice(i, 1); markDirty(); renderContest();
            } }, ['✕'])])
          ]);
        }))
      ]);
      contestWrap.append(el('div', { class: 'table-wrap' }, table));
    }
    renderContest();

    const enabledCb = el('input', { type: 'checkbox', checked: Boolean(contest.enabled) });
    enabledCb.addEventListener('change', () => { contest.enabled = enabledCb.checked; markDirty(); });
    const visibleCb = el('input', { type: 'checkbox', checked: Boolean(contest.visible) });
    visibleCb.addEventListener('change', () => { contest.visible = visibleCb.checked; markDirty(); });

    out.push(section('대회 · 기록 결과', [
      el('div', { class: 'flex gap-16 mb-12 wrap items-center' }, [
        el('label', { class: 'check' }, [enabledCb, el('span', { text: '이 활동에 대회/기록이 있음' })]),
        el('label', { class: 'check' }, [visibleCb, el('span', { text: '학생에게 결과 공개' })]),
        el('div', { class: 'spacer grow' }),
        el('button', { class: 'btn btn-sm', onclick: () => {
          contest.rows.push({ rank: contest.rows.length + 1, name: '', record: '', unit: contest.unit || '초', note: '' });
          markDirty(); renderContest();
        } }, ['+ 행 추가'])
      ]),
      contestWrap
    ], { open: Boolean(contest.enabled) }));

    return out;
  }

  /* ══ 실험 후 ═══════════════════════════════════════════════════════ */
  function afterTab(s) {
    const out = [];
    const refs = reflectionsOf(selectedId);
    const rated = refs.filter(r => Number(r.rating) > 0);
    const avg = rated.length ? rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length : 0;
    const students = activeStudents();
    const cost = costOf(prv);

    /* 요약 */
    out.push(el('div', { class: 'form-grid cols-4 mb-12' }, [
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: '보고서 제출' }), el('div', { class: 'v', text: `${refs.length}/${students.length}` })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: '평균 만족도' }), el('div', { class: 'v', text: avg ? avg.toFixed(1) : '—' })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: '예상 비용' }), el('div', { class: 'v', style: { fontSize: '17px' }, text: wonLabel(cost.materialEstimated) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: '실제 비용' }), el('div', { class: 'v', style: { fontSize: '17px' }, text: wonLabel(cost.materialActual) })])
    ]));

    /* 교사 기록 */
    const mk = (key, target, rows = 3, placeholder = '') => {
      const t = el('textarea', { class: 'textarea', rows, placeholder });
      t.value = target[key] || '';
      t.addEventListener('input', () => { target[key] = t.value; markDirty(); });
      return t;
    };

    const nextTimeArea = mk('nextTime', prv, 3, '예) PET병 300mL는 작았음. 다음에는 500mL 사용.');

    out.push(section('실험 후 기록', [
      el('div', { class: 'form-grid cols-2' }, [
        el('div', { class: 'field' }, [el('label', { text: '실제 결과' }), mk('result', prv, 3)]),
        el('div', { class: 'field' }, [el('label', { text: '실제 준비물 사용량' }), mk('usage', prv, 3, '예) KI 용액은 20mL면 충분.')]),
        el('div', { class: 'field' }, [el('label', { text: '잘된 점' }), mk('goodPoints', prv, 3)]),
        el('div', { class: 'field' }, [el('label', { text: '아쉬운 점' }), mk('badPoints', prv, 3)]),
        el('div', { class: 'field span-2' }, [
          el('label', { text: '다음엔 이렇게 (다음에 수정할 점)' }),
          nextTimeArea,
          el('span', { class: 'hint', text: '같은 활동을 다시 불러올 때 화면 위에 지난 운영 메모로 표시됩니다.' })
        ]),
        el('div', { class: 'field span-2' }, [el('label', { text: '교사 성찰' }), mk('reflection', prv, 4)])
      ])
    ]));

    /* 학생 공개 결과 */
    const recommendSel = el('select', { class: 'select' }, [
      ['', '선택 안 함'], ['추천', '추천'], ['보통', '보통'], ['비추천', '다시 하지 않음']
    ].map(([v, t]) => el('option', { value: v, selected: prv.recommend === v, text: t })));
    recommendSel.addEventListener('change', () => { prv.recommend = recommendSel.value; markDirty(); });

    out.push(section('학생 공개 결과', [
      el('div', { class: 'form-grid cols-2' }, [
        el('div', { class: 'field' }, [el('label', { text: '활동 결과 (학생 화면 공개)' }), mk('publicResult', pub, 4)]),
        el('div', { class: 'field' }, [el('label', { text: '과학적 원리 (학생 화면 공개)' }), mk('principle', pub, 4)]),
        el('div', { class: 'field' }, [el('label', { text: '다시 운영 추천 여부 (교사용)' }), recommendSel])
      ])
    ]));

    /* 학생 소감 */
    const summaryArea = mk('reflectionSummary', prv, 6);
    const sumBtn = el('button', { class: 'btn btn-sm' }, ['학생 소감 요약']);
    sumBtn.addEventListener('click', () => openReflectionSummary({
      session: pub, reflections: refs, button: sumBtn,
      onApply: (text) => {
        summaryArea.value = text; prv.reflectionSummary = text; markDirty();
        toastOk('요약을 반영했습니다. 확인 후 저장해 주세요.');
      }
    }));

    const refListWrap = el('div', { class: 'table-wrap', style: { maxHeight: '240px' } });
    if (refs.length) {
      refListWrap.append(el('table', { class: 'tbl' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { style: { width: '92px' }, text: '학생' }),
          el('th', { style: { width: '84px' }, text: '만족도' }),
          el('th', { text: '내용' }),
          el('th', { style: { width: '110px' }, text: '제출' })
        ])),
        el('tbody', {}, refs.map(r => {
          const st = studentByUid(r.studentUid);
          return el('tr', {}, [
            el('td', { class: 'nowrap', text: st?.displayName || '(알 수 없음)' }),
            el('td', {}, [Number(r.rating) ? starsStatic(r.rating) : el('span', { class: 'muted', text: '—' })]),
            el('td', {}, [el('div', { class: 'pre-wrap xsmall', text: (r.answers || []).map(a => a?.value || '').filter(Boolean).join('\n') })]),
            el('td', { class: 'xsmall muted nowrap', text: fmtStamp(r.updatedAt) })
          ]);
        }))
      ]));
    } else {
      refListWrap.append(emptyState('제출된 보고서가 없습니다.'));
    }

    out.push(section('학생 소감', [
      el('div', { class: 'flex gap-8 mb-12 wrap items-center' }, [
        store.settings?.geminiEnabled !== false ? sumBtn : null,
        el('div', { class: 'spacer grow' }),
        el('span', { class: 'xsmall muted', text: '요약 시 학생 이름·학번은 전달되지 않습니다.' })
      ]),
      el('div', { class: 'field mb-12' }, [el('label', { text: '학생 소감 요약' }), summaryArea]),
      el('div', { class: 'hr-label', text: '제출된 보고서' }),
      refListWrap
    ], { open: false, aside: el('span', { class: 'badge', text: `${refs.length}건` }) }));

    /* 마무리 동작 */
    const pfBtn = el('button', { class: 'btn' }, ['포트폴리오 초안 만들기']);
    pfBtn.addEventListener('click', () => openPortfolioDraft({
      session: pub, priv: prv, avgRating: avg ? avg.toFixed(1) : '', button: pfBtn,
      onApply: (draft) => {
        prv.portfolioDraft = draft;
        markDirty();
        toastOk('포트폴리오 초안을 저장 대기 상태로 두었습니다. 저장 버튼을 눌러 주세요.');
      }
    }));

    const archiveBtn = el('button', { class: 'btn' }, ['실험 보관함에 저장']);
    archiveBtn.addEventListener('click', async () => {
      const restore = busy(archiveBtn, '저장 중');
      try {
        const id = `tpl_${selectedId}`;
        await saveTemplate(id, {
          title: pub.title || '',
          field: pub.field || '기타',
          goal: prv.goal || '',
          runPlan: prv.runPlan || '',
          materials: (prv.materials || []).map(m => ({
            name: m.name, quantity: m.quantity, unit: m.unit, category: m.category, note: m.note || ''
          })),
          safety: prv.safety || '',
          planB: prv.planB || '',
          videos: pub.videos || [],
          worksheets: pub.worksheets || [],
          principle: pub.principle || '',
          tags: [`#${pub.field || '기타'}`],
          minutes: 90,
          lastRunMemo: prv.result || '',
          nextTime: prv.nextTime || '',
          savedAt: new Date().toISOString(),
          sourceSessionId: selectedId
        });
        await refreshTemplates();
        toastOk('실험 보관함에 저장했습니다.');
      } catch (e) {
        console.error('[session] 보관함 저장 실패', e);
        toastError('보관함에 저장하지 못했습니다.');
      } finally { restore(); }
    });

    const consumeBtn = el('button', { class: 'btn' }, ['재고 차감']);
    consumeBtn.addEventListener('click', async () => {
      const linked = (prv.materials || []).filter(m => m.inventoryId);
      if (!linked.length) { toastWarn('재고에 연결된 준비물이 없습니다.'); return; }
      const yes = await confirmDialog({
        title: '재고 차감',
        message: `재고에 연결된 준비물 ${linked.length}건의 사용량만큼 재고를 줄입니다.\n\n되돌리려면 재고 화면에서 직접 수정해야 합니다.\n진행할까요?`,
        confirmText: '차감'
      });
      if (!yes) return;
      const restore = busy(consumeBtn, '처리 중');
      try {
        const updates = await consumeFromInventory(linked, inventoryById());
        await refreshInventory();
        toastOk(updates.length ? `${updates.length}개 항목의 재고를 줄였습니다.` : '변경된 재고가 없습니다.');
      } catch (e) {
        console.error('[session] 재고 차감 실패', e);
        toastError('재고를 차감하지 못했습니다.');
      } finally { restore(); }
    });

    out.push(section('마무리', [
      el('div', { class: 'flex gap-8 wrap' }, [
        store.settings?.geminiEnabled !== false ? pfBtn : null,
        archiveBtn,
        consumeBtn,
        el('button', { class: 'btn', onclick: () => ctx.go('portfolio') }, ['포트폴리오 보기'])
      ]),
      prv.portfolioDraft
        ? el('div', { class: 'draft-box mt-12' }, [
            el('h4', { text: '저장된 포트폴리오 초안' }),
            el('div', { class: 'pre-wrap xsmall', text: (prv.portfolioDraft.overview || '').slice(0, 300) })
          ])
        : null
    ]));

    return out;
  }

  /* ── 시작 ──────────────────────────────────────────────────────────── */
  renderList();
  renderPane();

  const head = [
    el('h1', { text: '주차별 활동' }),
    el('span', { class: 'sub', text: '실험 전 · 실험 중 · 실험 후를 한 곳에서 기록합니다.' }),
    el('div', { class: 'spacer' })
  ];

  return { head, body: el('div', { class: 'split' }, [listCard, paneCard]), fixed: true };
}
