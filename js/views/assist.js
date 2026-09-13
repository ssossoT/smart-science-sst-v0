/* ==========================================================================
   초안 만들기 모달 모음
   --------------------------------------------------------------------------
   원칙
     · 생성 → 미리보기 → 선생님 확인/수정 → 저장. 자동 저장하지 않는다.
     · 구매 완료, 실제 비용, 재고 수량, 출석, 학생 평가는 절대 자동으로 정하지 않는다.
     · 학생 소감 요약에는 이름·학번·UID 를 보내지 않는다.
   ========================================================================== */

import { el, mount, openModal, toastError, toastWarn, busy } from '../ui.js';
import { activeStudents } from '../store.js';
import { callApi } from '../firebase-service.js';

/** 생성 중 / 오류 / 결과를 한 컨테이너에서 전환한다. */
function stageBox() {
  const box = el('div');
  return {
    node: box,
    loading(text = '초안을 만드는 중입니다') {
      mount(box, el('div', { class: 'flex items-center gap-10 muted', style: { padding: '28px 8px' } }, [
        el('span', { class: 'spinner' }), el('span', { text: text + '…' })
      ]));
    },
    error(message, retry) {
      mount(box, el('div', { class: 'empty' }, [
        el('strong', { text: message }),
        retry ? el('button', { class: 'btn mt-8', onclick: retry }, ['다시 시도']) : null
      ]));
    },
    show(node) { mount(box, node); }
  };
}

function labelRow(label, node) {
  return el('div', { class: 'field' }, [el('label', { text: label }), node]);
}

/* ══ 준비물 초안 ═══════════════════════════════════════════════════════ */

export function openMaterialsDraft({ session, button, onApply, onSafety }) {
  const studentCount = activeStudents().length || 8;

  const titleInput = el('input', { class: 'input', value: session.title || '' });
  const gradeInput = el('input', { class: 'input', value: '중학교 2학년' });
  const countInput = el('input', { class: 'input', type: 'number', min: 1, value: studentCount });
  const groupInput = el('input', { class: 'input', value: '2인 1조' });
  const minutesInput = el('input', { class: 'input', type: 'number', min: 10, step: 5, value: 90 });
  const noteInput = el('textarea', { class: 'textarea', rows: 2, placeholder: '예) 실험실에 가스레인지 없음' });

  const stage = stageBox();
  const runBtn = el('button', { class: 'btn btn-primary' }, ['준비물 초안 만들기']);
  const addAllBtn = el('button', { class: 'btn btn-primary', hidden: true }, ['전체 추가']);
  const addSelBtn = el('button', { class: 'btn', hidden: true }, ['선택 항목 추가']);
  const closeBtn = el('button', { class: 'btn' }, ['취소']);

  let picked = new Set();
  let items = [];

  const modal = openModal({
    title: '준비물 초안 만들기',
    size: 'wide',
    body: el('div', {}, [
      el('div', { class: 'form-grid cols-3' }, [
        el('div', { class: 'span-full' }, [labelRow('활동명', titleInput)]),
        labelRow('대상 학년', gradeInput),
        labelRow('학생 수', countInput),
        labelRow('조 편성', groupInput),
        labelRow('활동 시간(분)', minutesInput),
        el('div', { class: 'span-2' }, [labelRow('추가 메모', noteInput)])
      ]),
      el('div', { class: 'divider' }),
      stage.node
    ]),
    footer: [closeBtn, el('div', { class: 'grow' }), addSelBtn, addAllBtn, runBtn]
  });
  closeBtn.addEventListener('click', () => modal.close());

  function renderResult(data) {
    items = Array.isArray(data.materials) ? data.materials : [];
    picked = new Set(items.map((_, i) => i));

    if (!items.length) { stage.error('생성된 준비물이 없습니다.', run); return; }

    const list = el('div', { class: 'draft-list' }, items.map((m, i) => {
      const cb = el('input', { type: 'checkbox', checked: true });
      cb.addEventListener('change', () => { cb.checked ? picked.add(i) : picked.delete(i); });
      return el('label', { class: 'draft-item' }, [
        cb,
        el('span', { class: 'strong', text: m.name }),
        el('span', { class: 'muted', text: `${m.quantity ?? ''}${m.unit ?? ''}` }),
        el('span', { class: 'tag', text: m.category || '기타' }),
        m.note ? el('span', { class: 'xsmall muted truncate grow', text: m.note }) : el('span', { class: 'grow' })
      ]);
    }));

    const safety = Array.isArray(data.safetyItems) ? data.safetyItems.filter(Boolean) : [];
    const prep = Array.isArray(data.teacherPreparation) ? data.teacherPreparation.filter(Boolean) : [];

    stage.show(el('div', {}, [
      el('div', { class: 'notice mb-12', text: '내용을 확인하고 필요한 항목만 추가해 주세요. 수량과 구매 상태는 추가 후 직접 조정합니다.' }),
      list,
      safety.length ? el('div', { class: 'draft-box mt-12' }, [
        el('h4', { text: '안전 준비사항' }),
        el('ul', {}, safety.map(t => el('li', { class: 'small', text: '· ' + t }))),
        onSafety ? el('button', {
          class: 'btn btn-sm mt-8',
          onclick: () => { onSafety(safety.map(t => '· ' + t).join('\n')); toastWarn('안전 준비사항을 입력란에 넣었습니다.'); }
        }, ['안전 준비사항 반영']) : null
      ]) : null,
      prep.length ? el('div', { class: 'draft-box mt-12' }, [
        el('h4', { text: '수업 전 교사 준비' }),
        el('ul', {}, prep.map(t => el('li', { class: 'small', text: '· ' + t })))
      ]) : null,
      data.notes ? el('div', { class: 'notice mt-12 pre-wrap', text: data.notes }) : null
    ]));

    addAllBtn.hidden = false;
    addSelBtn.hidden = false;
  }

  async function run() {
    if (!titleInput.value.trim()) { toastError('활동명을 입력해 주세요.'); return; }
    addAllBtn.hidden = true; addSelBtn.hidden = true;
    const restore = busy(runBtn, '만드는 중');
    stage.loading();
    try {
      const res = await callApi('/api/gemini/materials', {
        title: titleInput.value.trim(),
        grade: gradeInput.value.trim(),
        studentCount: Number(countInput.value) || studentCount,
        groupType: groupInput.value.trim(),
        minutes: Number(minutesInput.value) || 90,
        note: noteInput.value.trim()
      });
      renderResult(res.data || {});
    } catch (e) {
      stage.error(e?.message || '준비물 초안을 불러오지 못했습니다.', run);
    } finally {
      restore();
    }
  }

  runBtn.addEventListener('click', run);
  addAllBtn.addEventListener('click', () => { onApply(items); modal.close(); });
  addSelBtn.addEventListener('click', () => {
    const sel = items.filter((_, i) => picked.has(i));
    if (!sel.length) { toastWarn('선택한 항목이 없습니다.'); return; }
    onApply(sel); modal.close();
  });

  run();
}

/* ══ 수업 계획 초안 ════════════════════════════════════════════════════ */

export function openLessonPlanDraft({ session, priv, button, onApply }) {
  const studentCount = activeStudents().length || 8;

  const gradeInput = el('input', { class: 'input', value: '중학교 2학년' });
  const countInput = el('input', { class: 'input', type: 'number', min: 1, value: studentCount });
  const groupInput = el('input', { class: 'input', value: '2인 1조' });
  const minutesInput = el('input', { class: 'input', type: 'number', min: 10, step: 5, value: 90 });
  const noteInput = el('textarea', { class: 'textarea', rows: 2 });

  const stage = stageBox();
  const runBtn = el('button', { class: 'btn btn-primary' }, ['수업 계획 초안 만들기']);
  const applyBtn = el('button', { class: 'btn btn-primary', hidden: true }, ['이 내용으로 채우기']);
  const closeBtn = el('button', { class: 'btn' }, ['취소']);
  let result = null;

  const modal = openModal({
    title: '수업 계획 초안 만들기',
    size: 'wide',
    body: el('div', {}, [
      el('div', { class: 'form-grid cols-4' }, [
        labelRow('대상', gradeInput),
        labelRow('학생 수', countInput),
        labelRow('조 편성', groupInput),
        labelRow('시간(분)', minutesInput),
        el('div', { class: 'span-full' }, [labelRow('추가 메모', noteInput)])
      ]),
      el('div', { class: 'divider' }),
      stage.node
    ]),
    footer: [closeBtn, el('div', { class: 'grow' }), applyBtn, runBtn]
  });
  closeBtn.addEventListener('click', () => modal.close());

  function stepsText(steps) {
    return (steps || []).map(s => `· ${s.title} (${s.minutes}분)\n  ${s.detail}`).join('\n');
  }

  function renderResult(d) {
    result = d;
    const planText = [
      '[도입]', stepsText(d.intro), '',
      '[주요 활동]', stepsText(d.main), '',
      '[마무리]', stepsText(d.wrapUp)
    ].join('\n').trim();

    stage.show(el('div', {}, [
      el('div', { class: 'notice mb-12', text: `예상 소요 ${d.totalMinutes || '-'}분. 내용을 확인하고 필요하면 수정한 뒤 채워 주세요.` }),
      d.goals?.length ? el('div', { class: 'draft-box mb-12' }, [
        el('h4', { text: '활동 목표' }),
        el('ul', {}, d.goals.map(g => el('li', { class: 'small', text: '· ' + g })))
      ]) : null,
      el('div', { class: 'field mb-12' }, [
        el('label', { text: '운영계획 (여기서 수정할 수 있습니다)' }),
        (() => {
          const t = el('textarea', { class: 'textarea', rows: 12 });
          t.value = planText;
          t.addEventListener('input', () => { result.__planText = t.value; });
          result.__planText = planText;
          return t;
        })()
      ]),
      el('div', { class: 'form-grid cols-2' }, [
        el('div', { class: 'draft-box' }, [
          el('h4', { text: '안전사항' }),
          el('div', { class: 'pre-wrap small', text: (d.safety || []).map(s => '· ' + s).join('\n') })
        ]),
        el('div', { class: 'draft-box' }, [
          el('h4', { text: 'Plan B' }),
          el('div', { class: 'pre-wrap small', text: d.planB || '' })
        ])
      ])
    ]));
    applyBtn.hidden = false;
  }

  async function run() {
    applyBtn.hidden = true;
    const restore = busy(runBtn, '만드는 중');
    stage.loading();
    try {
      const res = await callApi('/api/gemini/lesson-plan', {
        title: session.title || '',
        field: session.field || '',
        grade: gradeInput.value.trim(),
        studentCount: Number(countInput.value) || studentCount,
        groupType: groupInput.value.trim(),
        minutes: Number(minutesInput.value) || 90,
        materials: (priv?.materials || []).map(m => ({ name: m.name, quantity: m.quantity, unit: m.unit })),
        note: noteInput.value.trim()
      });
      renderResult(res.data || {});
    } catch (e) {
      stage.error(e?.message || '수업 계획 초안을 불러오지 못했습니다.', run);
    } finally { restore(); }
  }

  runBtn.addEventListener('click', run);
  applyBtn.addEventListener('click', () => {
    onApply({
      runPlan: result.__planText || '',
      safety: (result.safety || []).map(s => '· ' + s).join('\n'),
      planB: result.planB || '',
      goal: (result.goals || []).join('\n')
    });
    modal.close();
  });

  run();
}

/* ══ 보고서 질문 초안 ══════════════════════════════════════════════════ */

export function openReportQuestionsDraft({ session, priv, button, onApply }) {
  const stage = stageBox();
  const runBtn = el('button', { class: 'btn btn-primary' }, ['보고서 질문 만들기']);
  const applyBtn = el('button', { class: 'btn btn-primary', hidden: true }, ['이 질문으로 교체']);
  const closeBtn = el('button', { class: 'btn' }, ['취소']);
  let questions = [];

  const modal = openModal({
    title: '보고서 질문 만들기',
    body: stage.node,
    footer: [closeBtn, el('div', { class: 'grow' }), applyBtn, runBtn]
  });
  closeBtn.addEventListener('click', () => modal.close());

  function renderResult(list) {
    questions = list;
    if (!questions.length) { stage.error('생성된 질문이 없습니다.', run); return; }
    stage.show(el('div', {}, [
      el('div', { class: 'notice mb-12', text: '기존 질문을 이 내용으로 교체합니다. 문장은 아래에서 바로 고칠 수 있습니다.' }),
      el('div', { class: 'form-grid' }, questions.map((q, i) => {
        const input = el('input', { class: 'input', value: q.text });
        input.addEventListener('input', () => { questions[i].text = input.value; });
        return el('div', { class: 'flex items-center gap-8' }, [
          el('span', { class: 'xsmall muted num', style: { width: '14px' }, text: String(i + 1) }),
          input,
          el('span', { class: 'badge', text: q.type === 'short' ? '한 줄' : '서술형' })
        ]);
      }))
    ]));
    applyBtn.hidden = false;
  }

  async function run() {
    applyBtn.hidden = true;
    const restore = busy(runBtn, '만드는 중');
    stage.loading();
    try {
      const res = await callApi('/api/gemini/report-questions', {
        title: session.title || '',
        field: session.field || '',
        goal: priv?.goal || ''
      });
      renderResult((res.data?.questions || []).filter(q => q?.text));
    } catch (e) {
      stage.error(e?.message || '보고서 질문을 불러오지 못했습니다.', run);
    } finally { restore(); }
  }

  runBtn.addEventListener('click', run);
  applyBtn.addEventListener('click', () => { onApply(questions); modal.close(); });

  run();
}

/* ══ 학생 소감 요약 ════════════════════════════════════════════════════ */

export function openReflectionSummary({ session, reflections, button, onApply }) {
  const stage = stageBox();
  const runBtn = el('button', { class: 'btn btn-primary' }, ['학생 소감 요약']);
  const applyBtn = el('button', { class: 'btn btn-primary', hidden: true }, ['요약 반영']);
  const closeBtn = el('button', { class: 'btn' }, ['취소']);
  let text = '';

  const modal = openModal({
    title: '학생 소감 요약',
    size: 'wide',
    body: el('div', {}, [
      el('div', { class: 'notice info mb-12', text: '학생 이름·학번·계정 정보는 전달하지 않습니다. 답변 내용만 익명으로 정리합니다.' }),
      stage.node
    ]),
    footer: [closeBtn, el('div', { class: 'grow' }), applyBtn, runBtn]
  });
  closeBtn.addEventListener('click', () => modal.close());

  function block(title, lines) {
    if (!lines?.length) return null;
    return el('div', { class: 'draft-box mb-12' }, [
      el('h4', { text: title }),
      el('div', { class: 'pre-wrap small', text: lines.map(l => '· ' + l).join('\n') })
    ]);
  }

  function renderResult(d, count) {
    text = [
      `[전체 반응] ${d.overall || ''}`,
      d.interesting?.length ? `\n[흥미로워한 부분]\n${d.interesting.map(t => '· ' + t).join('\n')}` : '',
      d.difficult?.length ? `\n[어려워한 부분]\n${d.difficult.map(t => '· ' + t).join('\n')}` : '',
      d.learned?.length ? `\n[새롭게 알게 된 내용]\n${d.learned.map(t => '· ' + t).join('\n')}` : '',
      d.wishNext?.length ? `\n[다음 활동 희망]\n${d.wishNext.map(t => '· ' + t).join('\n')}` : '',
      d.notableOpinions?.length ? `\n[특징적인 의견]\n${d.notableOpinions.map(t => '· ' + t).join('\n')}` : ''
    ].filter(Boolean).join('\n').trim();

    stage.show(el('div', {}, [
      el('div', { class: 'notice mb-12', text: `응답 ${count}건을 정리했습니다.` }),
      el('div', { class: 'draft-box mb-12' }, [
        el('h4', { text: '전체 반응' }),
        el('div', { class: 'pre-wrap small', text: d.overall || '' })
      ]),
      block('흥미로워한 부분', d.interesting),
      block('어려워한 부분', d.difficult),
      block('새롭게 알게 된 내용', d.learned),
      block('다음 활동 희망', d.wishNext),
      block('특징적인 의견', d.notableOpinions)
    ]));
    applyBtn.hidden = false;
  }

  async function run() {
    applyBtn.hidden = true;
    if (!reflections.length) { stage.error('제출된 보고서가 없습니다.'); return; }
    const restore = busy(runBtn, '정리 중');
    stage.loading('학생 소감을 정리하는 중입니다');
    try {
      // 익명 텍스트만 추린다. studentUid 는 전달하지 않는다.
      const entries = reflections.map(r => ({
        answers: (r.answers || []).map(a => a?.value || '').filter(Boolean),
        rating: Number(r.rating) || null
      }));
      const res = await callApi('/api/gemini/reflection-summary', {
        title: session.title || '',
        entries
      });
      renderResult(res.data || {}, res.count || entries.length);
    } catch (e) {
      stage.error(e?.message || '학생 소감 요약을 불러오지 못했습니다.', run);
    } finally { restore(); }
  }

  runBtn.addEventListener('click', run);
  applyBtn.addEventListener('click', () => { onApply(text); modal.close(); });

  run();
}

/* ══ 포트폴리오 초안 ═══════════════════════════════════════════════════ */

export function openPortfolioDraft({ session, priv, avgRating, button, onApply }) {
  const stage = stageBox();
  const runBtn = el('button', { class: 'btn btn-primary' }, ['포트폴리오 초안 만들기']);
  const applyBtn = el('button', { class: 'btn btn-primary', hidden: true }, ['초안 저장']);
  const closeBtn = el('button', { class: 'btn' }, ['취소']);
  let draft = null;
  const editors = {};

  const modal = openModal({
    title: '포트폴리오 초안 만들기',
    size: 'wide',
    body: el('div', {}, [
      el('div', { class: 'notice mb-12', text: '기록된 내용만 바탕으로 정리합니다. 생성된 글은 아래에서 직접 고칠 수 있습니다.' }),
      stage.node
    ]),
    footer: [closeBtn, el('div', { class: 'grow' }), applyBtn, runBtn]
  });
  closeBtn.addEventListener('click', () => modal.close());

  const SECTIONS = [
    ['overview', '활동 개요'],
    ['operation', '운영 내용'],
    ['studentResponse', '학생 반응'],
    ['educationalMeaning', '교육적 의미'],
    ['teacherReflection', '교사 성찰']
  ];

  function renderResult(d) {
    draft = d;
    const nodes = SECTIONS.map(([key, label]) => {
      const t = el('textarea', { class: 'textarea', rows: 4 });
      t.value = d[key] || '';
      t.addEventListener('input', () => { draft[key] = t.value; });
      editors[key] = t;
      return el('div', { class: 'field mb-12' }, [el('label', { text: label }), t]);
    });

    const imp = el('textarea', { class: 'textarea', rows: 3 });
    imp.value = (d.improvements || []).map(s => '· ' + s).join('\n');
    imp.addEventListener('input', () => {
      draft.improvements = imp.value.split('\n').map(s => s.replace(/^·\s*/, '').trim()).filter(Boolean);
    });

    stage.show(el('div', {}, [
      ...nodes,
      el('div', { class: 'field' }, [el('label', { text: '향후 개선사항' }), imp])
    ]));
    applyBtn.hidden = false;
  }

  async function run() {
    applyBtn.hidden = true;
    const restore = busy(runBtn, '만드는 중');
    stage.loading();
    try {
      const res = await callApi('/api/gemini/portfolio', {
        title: session.title || '',
        date: session.date || '',
        periodLabel: session.periodLabel || '',
        field: session.field || '',
        goal: priv?.goal || '',
        result: priv?.result || session.publicResult || '',
        avgRating: avgRating || '',
        reflectionSummary: priv?.reflectionSummary || '',
        teacherMemo: [priv?.goodPoints, priv?.badPoints, priv?.reflection].filter(Boolean).join('\n'),
        nextTime: priv?.nextTime || '',
        principle: session.principle || ''
      });
      renderResult(res.data || {});
    } catch (e) {
      stage.error(e?.message || '포트폴리오 초안을 불러오지 못했습니다.', run);
    } finally { restore(); }
  }

  runBtn.addEventListener('click', run);
  applyBtn.addEventListener('click', () => {
    onApply({ ...draft, createdAt: new Date().toISOString() });
    modal.close();
  });

  run();
}
