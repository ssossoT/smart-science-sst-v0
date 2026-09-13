/* ==========================================================================
   전체 계획 - 연간 일정 관리 (추가/수정/삭제/순서·날짜·차시 변경/공개 여부)
   ========================================================================== */

import {
  el, mount, toastOk, toastError, confirmDialog, emptyState,
  weekdayOf, isThisWeek, uid, todayYmd, setDirty, busy
} from '../ui.js';
import {
  store, privateOf, updateSessionPublic, upsertSessionLocal, removeSessionLocal,
  reflectionsOf, syncPublicSettings
} from '../store.js';
import {
  statusBadge, readinessOf, sessionTitle, pickCurrentSession
} from '../common.js';
import {
  FIELDS, SESSION_STATUS, DEFAULT_REPORT_QUESTIONS,
  saveSessionPublic, deleteSession, getSession
} from '../firebase-service.js';

const DIRTY_KEY = 'plan';

function blankSession(year) {
  const maxOrder = store.sessions.reduce((m, s) => Math.max(m, Number(s.order) || 0), 0);
  return {
    id: 'sx_' + uid('').slice(1),
    year: Number(year) || new Date().getFullYear(),
    date: todayYmd(),
    periodLabel: '',
    title: '',
    field: '화학',
    order: maxOrder + 10,
    noClass: false,
    status: 'draft',
    isPublic: false,
    studentGuide: '',
    publicMaterials: [],
    worksheets: [],
    videos: [],
    driveLink: '',
    photos: [],
    coverPhoto: '',
    publicResult: '',
    principle: '',
    relatedVideos: [],
    contest: { enabled: false, visible: false, unit: '초', rows: [] },
    reportQuestions: DEFAULT_REPORT_QUESTIONS.map(q => ({ ...q })),
    createdAt: new Date().toISOString()
  };
}

export async function renderPlan(ctx) {
  const listCard = el('div', { class: 'card' });
  const detailCard = el('div', { class: 'card' });

  let selectedId = ctx.params || pickCurrentSession(store.sessions)?.id || store.sessions[0]?.id || null;

  /* ── 왼쪽 목록 ─────────────────────────────────────────────────────── */
  function renderList() {
    const rows = store.sessions.map(s => {
      const priv = privateOf(s.id);
      const ready = readinessOf(priv);
      const d = s.date || '';
      const classes = [
        'plan-row',
        s.id === selectedId ? 'on' : '',
        isThisWeek(d) ? 'this-week' : '',
        s.noClass ? 'no-class' : '',
        s.status === 'done' || s.status === 'archived' ? 'done' : ''
      ].filter(Boolean).join(' ');

      return el('div', {
        class: classes,
        onclick: () => { selectedId = s.id; renderList(); renderDetail(); }
      }, [
        el('div', { class: 'plan-date' }, [
          el('div', { class: 'md', text: d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '—' }),
          el('div', { class: 'dw', text: weekdayOf(d) })
        ]),
        el('div', { style: { minWidth: 0 } }, [
          el('div', { class: 'p-title truncate', text: sessionTitle(s) }),
          el('div', { class: 'p-sub truncate', text: [s.periodLabel, s.field].filter(Boolean).join(' · ') || '—' })
        ]),
        el('div', { class: 'flex items-center gap-6' }, [
          !s.noClass && ready.total
            ? el('span', { class: 'progress', style: { width: '40px', flex: 'none' } }, [
                el('i', { style: { width: `${ready.percent}%` } })
              ])
            : null,
          statusBadge(s.status)
        ])
      ]);
    });

    mount(listCard,
      el('div', { class: 'card-head' }, [
        el('h2', { text: `${store.settings?.year || ''} 전체 계획` }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge', text: `${store.sessions.filter(s => !s.noClass).length}개 활동` }),
        el('button', { class: 'btn btn-sm btn-primary', onclick: addSession }, ['+ 추가'])
      ]),
      rows.length
        ? el('div', { class: 'card-body flush scroll-y' }, rows)
        : emptyState('등록된 활동이 없습니다.', '설정에서 2026 초기 일정을 등록하거나 직접 추가해 주세요.',
            el('button', { class: 'btn btn-primary mt-8', onclick: () => ctx.go('settings') }, ['설정으로 이동']))
    );
  }

  /* ── 오른쪽 상세 ───────────────────────────────────────────────────── */
  function renderDetail() {
    const s = store.sessions.find(x => x.id === selectedId);
    if (!s) {
      mount(detailCard, emptyState('왼쪽에서 활동을 선택해 주세요.'));
      return;
    }

    const draft = { ...s };
    let dirty = false;
    const markDirty = () => {
      dirty = true;
      setDirty(DIRTY_KEY, true);
      saveBtn.disabled = false;
      stateEl.textContent = '저장하지 않은 변경';
      stateEl.className = 'save-state dirty';
    };

    const stateEl = el('span', { class: 'save-state', text: '' });
    const saveBtn = el('button', { class: 'btn btn-primary', disabled: true }, ['저장']);

    const f = {};
    const bind = (key, node, transform = v => v) => {
      f[key] = node;
      node.addEventListener('input', () => { draft[key] = transform(node.value); markDirty(); });
      node.addEventListener('change', () => { draft[key] = transform(node.value); markDirty(); });
      return node;
    };

    const dateInput = bind('date', el('input', { class: 'input', type: 'date', value: s.date || '' }));
    const periodInput = bind('periodLabel', el('input', { class: 'input', placeholder: '예) 5~6차시', value: s.periodLabel || '' }));
    const titleInput = bind('title', el('input', { class: 'input', placeholder: '활동명', value: s.title || '' }));
    const orderInput = bind('order', el('input', { class: 'input', type: 'number', step: 10, value: s.order ?? 0 }), v => Number(v) || 0);

    const fieldSelect = bind('field', el('select', { class: 'select' },
      FIELDS.map(v => el('option', { value: v, selected: s.field === v, text: v }))
    ));

    const statusSelect = bind('status', el('select', { class: 'select' },
      Object.entries(SESSION_STATUS).map(([k, v]) =>
        el('option', { value: k, selected: s.status === k, text: v.label })
      )
    ));

    const noClassCheck = el('input', { type: 'checkbox', checked: Boolean(s.noClass) });
    noClassCheck.addEventListener('change', () => { draft.noClass = noClassCheck.checked; markDirty(); });

    const statusHint = el('div', { class: 'notice', style: { marginTop: '8px' } });
    function updateStatusHint() {
      const map = {
        draft: '작성중 — 학생 화면에 표시되지 않습니다.',
        published: '학생 공개 — 학생 홈과 일정에 표시됩니다.',
        done: '수업 완료 — 학생이 간이보고서를 작성할 수 있습니다.',
        archived: '기록 보관 — 지난 기록으로 유지되며 학생도 볼 수 있습니다.'
      };
      statusHint.textContent = map[draft.status] || '';
      statusHint.className = 'notice ' + (draft.status === 'draft' ? '' : 'accent');
    }
    statusSelect.addEventListener('change', updateStatusHint);
    updateStatusHint();

    saveBtn.addEventListener('click', async () => {
      const restore = busy(saveBtn, '저장 중');
      stateEl.textContent = '저장 중…';
      stateEl.className = 'save-state saving';
      try {
        if (!draft.title?.trim()) { toastError('활동명을 입력해 주세요.'); return; }
        const patch = {
          date: draft.date, periodLabel: draft.periodLabel, title: draft.title.trim(),
          field: draft.field, order: draft.order, noClass: Boolean(draft.noClass),
          status: draft.status, year: Number(store.settings?.year) || s.year
        };
        if (String(s.id).startsWith('sx_')) {
          const saved = await saveSessionPublic(s.id, { ...s, ...patch });
          upsertSessionLocal({ id: s.id, ...s, ...saved });
        } else {
          await updateSessionPublic(s.id, patch);
        }
        dirty = false;
        setDirty(DIRTY_KEY, false);
        saveBtn.disabled = true;
        stateEl.textContent = '저장됨';
        stateEl.className = 'save-state saved';
        toastOk('저장했습니다.');
        syncPublicSettings(pickCurrentSession(store.sessions));
        renderList();
      } catch (e) {
        console.error('[plan] 저장 실패', e);
        toastError('저장하지 못했습니다.');
        stateEl.textContent = '저장 실패';
        stateEl.className = 'save-state dirty';
      } finally {
        restore();
      }
    });

    const refs = reflectionsOf(s.id);
    const ready = readinessOf(privateOf(s.id));

    mount(detailCard,
      el('div', { class: 'card-head' }, [
        el('h2', { text: '활동 정보' }),
        el('div', { class: 'spacer' }),
        stateEl,
        el('button', {
          class: 'btn btn-sm', onclick: () => ctx.go('session', s.id)
        }, ['상세 준비 →'])
      ]),
      el('div', { class: 'card-body scroll-y' }, [
        el('div', { class: 'form-grid cols-2' }, [
          el('div', { class: 'field' }, [el('label', { text: '날짜' }), dateInput]),
          el('div', { class: 'field' }, [el('label', { text: '차시' }), periodInput]),
          el('div', { class: 'field span-2' }, [el('label', { text: '활동명' }), titleInput]),
          el('div', { class: 'field' }, [el('label', { text: '분야' }), fieldSelect]),
          el('div', { class: 'field' }, [el('label', { text: '정렬 순서' }), orderInput,
            el('span', { class: 'hint', text: '같은 날짜일 때 작은 값이 먼저 옵니다.' })]),
          el('div', { class: 'field span-2' }, [
            el('label', { text: '학생 공개 상태' }), statusSelect, statusHint
          ]),
          el('div', { class: 'span-2' }, [
            el('label', { class: 'check' }, [noClassCheck, el('span', { text: '방과후 없음 (휴업일·행사일)' })])
          ])
        ]),

        el('div', { class: 'divider' }),

        el('div', { class: 'form-grid cols-3' }, [
          el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: '준비 진행률' }),
            el('div', { class: 'v', text: ready.total ? `${ready.percent}%` : '—' })
          ]),
          el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: '구매 필요' }),
            el('div', { class: 'v', text: String(ready.notOrdered) })
          ]),
          el('div', { class: 'stat' }, [
            el('div', { class: 'k', text: '보고서' }),
            el('div', { class: 'v', text: String(refs.length) })
          ])
        ]),

        el('div', { class: 'divider' }),

        el('div', { class: 'flex gap-8 wrap' }, [
          el('button', { class: 'btn', onclick: () => duplicateSession(s) }, ['이 활동 복제']),
          el('button', {
            class: 'btn btn-danger', onclick: () => removeSession(s)
          }, ['삭제'])
        ])
      ]),
      el('div', { class: 'card-foot' }, [
        el('div', { class: 'spacer grow' }),
        saveBtn
      ])
    );
  }

  /* ── 동작 ──────────────────────────────────────────────────────────── */
  async function addSession() {
    const s = blankSession(store.settings?.year);
    s.title = '새 활동';
    try {
      const saved = await saveSessionPublic(s.id, s);
      upsertSessionLocal({ id: s.id, ...s, ...saved });
      selectedId = s.id;
      renderList();
      renderDetail();
      toastOk('활동을 추가했습니다.');
    } catch (e) {
      console.error('[plan] 추가 실패', e);
      toastError('활동을 추가하지 못했습니다.');
    }
  }

  async function duplicateSession(s) {
    const copy = blankSession(store.settings?.year);
    const source = await getSession(s.id);
    Object.assign(copy, {
      title: (source?.title || s.title) + ' (복제)',
      field: source?.field || s.field,
      periodLabel: '',
      status: 'draft',
      isPublic: false,
      studentGuide: source?.studentGuide || '',
      publicMaterials: source?.publicMaterials || [],
      worksheets: source?.worksheets || [],
      videos: source?.videos || [],
      principle: source?.principle || '',
      reportQuestions: source?.reportQuestions || DEFAULT_REPORT_QUESTIONS.map(q => ({ ...q }))
    });
    try {
      const saved = await saveSessionPublic(copy.id, copy);
      upsertSessionLocal({ id: copy.id, ...copy, ...saved });
      selectedId = copy.id;
      renderList();
      renderDetail();
      toastOk('활동을 복제했습니다. 교사 전용 기록은 복제되지 않습니다.');
    } catch (e) {
      console.error('[plan] 복제 실패', e);
      toastError('복제하지 못했습니다.');
    }
  }

  async function removeSession(s) {
    const refs = reflectionsOf(s.id);
    const message = refs.length
      ? `"${sessionTitle(s)}" 활동을 삭제합니다.\n\n이 활동에는 학생 보고서 ${refs.length}건이 연결되어 있습니다.\n활동을 지워도 보고서 자체는 남지만 연결이 끊어집니다.\n\n삭제할까요?`
      : `"${sessionTitle(s)}" 활동을 삭제합니다.\n교사 전용 기록(준비물·메모·성찰)도 함께 삭제됩니다.\n\n삭제할까요?`;
    const yes = await confirmDialog({
      title: '활동 삭제', message, confirmText: '삭제', danger: true
    });
    if (!yes) return;
    try {
      await deleteSession(s.id);
      removeSessionLocal(s.id);
      selectedId = store.sessions[0]?.id || null;
      setDirty(DIRTY_KEY, false);
      renderList();
      renderDetail();
      toastOk('삭제했습니다.');
    } catch (e) {
      console.error('[plan] 삭제 실패', e);
      toastError('삭제하지 못했습니다.');
    }
  }

  renderList();
  renderDetail();

  const head = [
    el('h1', { text: '전체 계획' }),
    el('span', { class: 'sub', text: '날짜·차시·활동명과 학생 공개 상태를 관리합니다.' }),
    el('div', { class: 'spacer' })
  ];

  return { head, body: el('div', { class: 'split wide-left' }, [listCard, detailCard]), fixed: true };
}
