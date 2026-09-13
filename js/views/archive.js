/* ==========================================================================
   실험 보관함 - 운영한 활동을 다음 해에 다시 꺼내 쓴다.
   ========================================================================== */

import {
  el, mount, emptyState, toastOk, toastError, confirmDialog, debounce,
  fmtStamp, uid, todayYmd, busy, promptDialog
} from '../ui.js';
import { store, refreshTemplates, upsertSessionLocal } from '../store.js';
import {
  deleteTemplate, saveTemplate, saveSessionPublic, saveSessionPrivate,
  DEFAULT_REPORT_QUESTIONS, FIELDS
} from '../firebase-service.js';

const SUGGESTED_TAGS = [
  '#물리', '#화학', '#생명', '#지구과학', '#천문', '#디지털', '#제작',
  '#먹는실험', '#준비쉬움', '#준비많음', '#90분', '#2인1조', '#시합', '#소장가능'
];

export async function renderArchive(ctx) {
  const listCard = el('div', { class: 'card' });
  const detailCard = el('div', { class: 'card' });
  let selectedId = store.templates[0]?.id || null;
  let search = '';
  let tagFilter = '';

  function passes(t) {
    if (tagFilter && !(t.tags || []).includes(tagFilter)) return false;
    if (!search) return true;
    const q = search.replace(/\s/g, '').toLowerCase();
    const hay = `${t.title}${t.field}${(t.tags || []).join('')}`.replace(/\s/g, '').toLowerCase();
    return hay.includes(q);
  }

  function renderList() {
    const list = store.templates.filter(passes);
    const allTags = Array.from(new Set(store.templates.flatMap(t => t.tags || [])));

    mount(listCard,
      el('div', { class: 'card-head' }, [
        el('h2', { text: '보관된 실험' }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge', text: `${store.templates.length}개` })
      ]),
      el('div', { class: 'filterbar' }, [
        (() => {
          const s = el('input', { class: 'input input-sm', type: 'search', placeholder: '실험명·분야·태그', value: search });
          s.addEventListener('input', debounce(() => { search = s.value; renderList(); }, 250));
          return s;
        })()
      ]),
      allTags.length ? el('div', { class: 'filterbar', style: { borderTop: 'none' } }, [
        el('button', { class: `chip ${!tagFilter ? 'on' : ''}`, onclick: () => { tagFilter = ''; renderList(); } }, ['전체']),
        ...allTags.map(t => el('button', {
          class: `chip ${tagFilter === t ? 'on' : ''}`, onclick: () => { tagFilter = t; renderList(); }
        }, [t]))
      ]) : null,
      list.length
        ? el('div', { class: 'card-body flush scroll-y' },
            el('div', { class: 'row-list' }, list.map(t =>
              el('div', {
                class: `row-item ${t.id === selectedId ? 'on' : ''}`,
                onclick: () => { selectedId = t.id; renderList(); renderDetail(); }
              }, [
                el('div', { class: 'grow' }, [
                  el('div', { class: 't truncate', text: t.title || '(이름 없음)' }),
                  el('div', { class: 'd truncate', text: [t.field, `준비물 ${(t.materials || []).length}개`].filter(Boolean).join(' · ') })
                ]),
                el('span', { class: 'xsmall muted nowrap', text: fmtStamp(t.savedAt).slice(0, 10) })
              ])
            ))
          )
        : emptyState(
            store.templates.length ? '검색 결과가 없습니다.' : '보관된 실험이 없습니다.',
            '주차별 활동의 [실험 보관함에 저장] 을 누르면 이곳에 쌓입니다.'
          )
    );
  }

  function renderDetail() {
    const t = store.templates.find(x => x.id === selectedId);
    if (!t) {
      mount(detailCard, emptyState('왼쪽에서 실험을 선택해 주세요.'));
      return;
    }

    const tagWrap = el('div', { class: 'flex gap-6 wrap' });
    function renderTags() {
      mount(tagWrap,
        ...(t.tags || []).map(tag => el('span', {
          class: 'chip', onclick: async () => {
            t.tags = t.tags.filter(x => x !== tag);
            await saveTemplate(t.id, { tags: t.tags });
            renderTags();
          }, title: '누르면 제거'
        }, [tag, ' ✕'])),
        el('select', { class: 'select input-sm', style: { width: '132px' }, onchange: async (e) => {
          const v = e.target.value;
          e.target.value = '';
          if (!v) return;
          t.tags = Array.from(new Set([...(t.tags || []), v]));
          await saveTemplate(t.id, { tags: t.tags });
          renderTags(); renderList();
        } }, [
          el('option', { value: '', text: '+ 태그 추가' }),
          ...SUGGESTED_TAGS.filter(x => !(t.tags || []).includes(x)).map(x => el('option', { value: x, text: x }))
        ])
      );
    }
    renderTags();

    const reuseBtn = el('button', { class: 'btn btn-primary' }, ['이 실험 다시 사용']);
    reuseBtn.addEventListener('click', () => reuse(t, reuseBtn));

    mount(detailCard,
      el('div', { class: 'card-head' }, [
        el('div', { style: { minWidth: 0 } }, [
          el('h2', { class: 'truncate', text: t.title || '(이름 없음)' }),
          el('div', { class: 'xsmall muted', text: `저장 ${fmtStamp(t.savedAt)}` })
        ]),
        el('div', { class: 'spacer' }),
        reuseBtn,
        el('button', {
          class: 'btn btn-sm btn-danger',
          onclick: async () => {
            const yes = await confirmDialog({
              title: '보관함에서 삭제',
              message: `"${t.title}" 을(를) 보관함에서 삭제합니다.\n실제 수업 기록은 지워지지 않습니다.\n\n삭제할까요?`,
              confirmText: '삭제', danger: true
            });
            if (!yes) return;
            try {
              await deleteTemplate(t.id);
              await refreshTemplates();
              selectedId = store.templates[0]?.id || null;
              renderList(); renderDetail();
              toastOk('삭제했습니다.');
            } catch (e) {
              console.error('[archive] 삭제 실패', e);
              toastError('삭제하지 못했습니다.');
            }
          }
        }, ['삭제'])
      ]),
      el('div', { class: 'card-body scroll-y' }, [
        el('div', { class: 'flex gap-8 mb-12 wrap items-center' }, [
          el('span', { class: 'tag', text: t.field || '기타' }),
          t.minutes ? el('span', { class: 'badge', text: `${t.minutes}분` }) : null
        ]),
        el('div', { class: 'field mb-12' }, [el('label', { text: '태그' }), tagWrap]),

        t.nextTime ? el('div', { class: 'notice accent mb-12' }, [
          el('strong', { text: '지난 운영 메모' }), el('br'),
          el('span', { class: 'pre-wrap', text: t.nextTime })
        ]) : null,

        t.goal ? block('활동 목표', t.goal) : null,
        t.runPlan ? block('운영계획', t.runPlan) : null,

        (t.materials || []).length ? el('div', { class: 'mb-12' }, [
          el('div', { class: 'hr-label', text: `준비물 ${(t.materials || []).length}개` }),
          el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
            el('thead', {}, el('tr', {}, [
              el('th', { text: '물품명' }),
              el('th', { class: 'num', style: { width: '90px' }, text: '수량' }),
              el('th', { style: { width: '100px' }, text: '분류' }),
              el('th', { text: '비고' })
            ])),
            el('tbody', {}, t.materials.map(m => el('tr', {}, [
              el('td', { text: m.name || '' }),
              el('td', { class: 'num', text: `${m.quantity ?? ''}${m.unit || ''}` }),
              el('td', { class: 'muted', text: m.category || '' }),
              el('td', { class: 'xsmall muted', text: m.note || '' })
            ])))
          ]))
        ]) : null,

        t.safety ? block('안전사항', t.safety) : null,
        t.planB ? block('Plan B', t.planB) : null,
        t.principle ? block('과학적 원리', t.principle) : null,

        (t.videos || []).length ? el('div', { class: 'mb-12' }, [
          el('div', { class: 'hr-label', text: '참고영상' }),
          ...t.videos.map(v => el('div', { class: 'small' }, [
            el('a', { href: v.url, target: '_blank', rel: 'noopener noreferrer', text: v.title || v.url })
          ]))
        ]) : null
      ])
    );
  }

  function block(label, text) {
    return el('div', { class: 'mb-12' }, [
      el('div', { class: 'hr-label', text: label }),
      el('div', { class: 'pre-wrap small', text })
    ]);
  }

  async function reuse(t, button) {
    const date = await promptDialog({
      title: '새 활동 만들기',
      label: '수업 날짜 (YYYY-MM-DD)',
      value: todayYmd()
    });
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toastError('YYYY-MM-DD 형식으로 입력해 주세요.'); return; }

    const restore = busy(button, '만드는 중');
    try {
      const id = 'sx_' + uid('').slice(1);
      const maxOrder = store.sessions.reduce((m, s) => Math.max(m, Number(s.order) || 0), 0);
      const publicDoc = {
        year: Number(store.settings?.year) || new Date().getFullYear(),
        date,
        periodLabel: '',
        title: t.title || '새 활동',
        field: FIELDS.includes(t.field) ? t.field : '기타',
        order: maxOrder + 10,
        noClass: false,
        status: 'draft',
        studentGuide: '',
        publicMaterials: [],
        worksheets: t.worksheets || [],
        videos: t.videos || [],
        driveLink: '',
        photos: [],
        coverPhoto: '',
        publicResult: '',
        principle: t.principle || '',
        contest: { enabled: false, visible: false, unit: '초', rows: [] },
        reportQuestions: DEFAULT_REPORT_QUESTIONS.map(q => ({ ...q })),
        createdAt: new Date().toISOString()
      };
      const saved = await saveSessionPublic(id, publicDoc);

      await saveSessionPrivate(id, {
        goal: t.goal || '',
        plan: '',
        runPlan: t.runPlan || '',
        materials: (t.materials || []).map(m => ({
          id: uid('m'), name: m.name, quantity: m.quantity, unit: m.unit,
          category: m.category || '소모품', status: '구매 필요',
          inventoryId: '', estPrice: '', actualPrice: '', vendor: '',
          pub: true, note: m.note || ''
        })),
        checklist: [],
        safety: t.safety || '',
        planB: t.planB || '',
        liveNotes: [],
        attendance: {},
        nextTime: '',
        // 지난 운영 메모를 새 수업의 참고 메모로 옮겨 둔다.
        memo: t.nextTime ? `[지난 운영 메모]\n${t.nextTime}` : ''
      });

      upsertSessionLocal({ id, ...publicDoc, ...saved });
      await ctx.reload();
      toastOk('새 활동을 만들었습니다.');
      ctx.go('session', id);
    } catch (e) {
      console.error('[archive] 다시 사용 실패', e);
      toastError('새 활동을 만들지 못했습니다.');
    } finally { restore(); }
  }

  renderList();
  renderDetail();

  const head = [
    el('h1', { text: '실험 보관함' }),
    el('span', { class: 'sub', text: '운영한 실험을 저장해 두었다가 다음에 다시 사용합니다.' }),
    el('div', { class: 'spacer' })
  ];

  return { head, body: el('div', { class: 'split' }, [listCard, detailCard]), fixed: true };
}
