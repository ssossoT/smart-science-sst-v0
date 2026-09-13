/* ==========================================================================
   설정
   API KEY 자체는 이곳에 저장하지 않는다. Vercel 환경변수에만 둔다.
   ========================================================================== */

import {
  el, toastOk, toastError, busy, confirmDialog, setDirty, won
} from '../ui.js';
import { store, syncPublicSettings } from '../store.js';
import { saveSettings, callApi } from '../firebase-service.js';
import { seedSchedule, seedSettingsIfMissing, SEED_YEAR } from '../seed-data.js';
import { pickCurrentSession } from '../common.js';

const DIRTY_KEY = 'settings';

export async function renderSettings(ctx) {
  const s = store.settings || {};
  const draft = { ...s };
  let dirty = false;

  const saveBtn = el('button', { class: 'btn btn-primary' }, ['설정 저장']);
  const stateEl = el('span', { class: 'save-state' });

  function markDirty() {
    dirty = true;
    setDirty(DIRTY_KEY, true);
    stateEl.textContent = '저장하지 않은 변경';
    stateEl.className = 'save-state dirty';
  }

  function textField(label, key, opts = {}, hint) {
    const input = el('input', { class: 'input', value: s[key] ?? '', ...opts });
    input.addEventListener('input', () => {
      draft[key] = opts.type === 'number' ? (input.value === '' ? 0 : Number(input.value)) : input.value;
      markDirty();
    });
    return el('div', { class: 'field' }, [
      el('label', { text: label }), input,
      hint ? el('span', { class: 'hint', text: hint }) : null
    ]);
  }

  function selectField(label, key, options, hint) {
    const sel = el('select', { class: 'select' },
      options.map(([v, t]) => el('option', { value: String(v), selected: String(s[key]) === String(v), text: t })));
    sel.addEventListener('change', () => {
      const v = sel.value;
      draft[key] = v === 'true' ? true : v === 'false' ? false : (isNaN(Number(v)) ? v : Number(v));
      markDirty();
    });
    return el('div', { class: 'field' }, [
      el('label', { text: label }), sel,
      hint ? el('span', { class: 'hint', text: hint }) : null
    ]);
  }

  const introArea = el('textarea', { class: 'textarea', rows: 2 });
  introArea.value = s.intro || '';
  introArea.addEventListener('input', () => { draft.intro = introArea.value; markDirty(); });

  saveBtn.addEventListener('click', async () => {
    const restore = busy(saveBtn, '저장 중');
    stateEl.textContent = '저장 중…';
    stateEl.className = 'save-state saving';
    try {
      await saveSettings(draft);
      Object.assign(store.settings, draft);
      await syncPublicSettings(pickCurrentSession(store.sessions));
      dirty = false;
      setDirty(DIRTY_KEY, false);
      stateEl.textContent = '저장됨';
      stateEl.className = 'save-state saved';
      toastOk('설정을 저장했습니다.');
      document.querySelectorAll('[data-site-name]').forEach(n => { n.textContent = draft.siteName || ''; });
      document.title = `선생님용 · ${draft.siteName || '스마트과학반 LAB'}`;
    } catch (e) {
      console.error('[settings] 저장 실패', e);
      toastError('설정을 저장하지 못했습니다.');
      stateEl.textContent = '저장 실패';
      stateEl.className = 'save-state dirty';
    } finally { restore(); }
  });

  /* ── 초기 데이터 ───────────────────────────────────────────────────── */
  const seedBtn = el('button', { class: 'btn btn-primary' }, [`${SEED_YEAR} 초기 일정 등록`]);
  const seedResult = el('div', { class: 'xsmall muted mt-8' });

  seedBtn.addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: '초기 일정 등록',
      message: `${SEED_YEAR} 스마트과학반 전체 계획(총 20차시)을 등록합니다.\n\n이미 등록된 일정은 그대로 두고 없는 것만 추가합니다.\n여러 번 눌러도 중복되지 않습니다.\n\n진행할까요?`,
      confirmText: '등록'
    });
    if (!yes) return;

    const restore = busy(seedBtn, '등록 중');
    try {
      await seedSettingsIfMissing();
      const { created, skipped } = await seedSchedule();
      seedResult.textContent = `새로 등록 ${created}개 · 이미 있어 건너뜀 ${skipped}개`;
      if (created) {
        await ctx.reload();
        toastOk(`${created}개 일정을 등록했습니다.`);
      } else {
        toastOk('이미 모든 일정이 등록되어 있습니다.');
      }
    } catch (e) {
      console.error('[settings] 초기 일정 등록 실패', e);
      toastError('초기 일정을 등록하지 못했습니다.');
    } finally { restore(); }
  });

  /* ── 연동 상태 확인 ────────────────────────────────────────────────── */
  const geminiState = el('span', { class: 'badge', text: '확인 안 함' });
  const youtubeState = el('span', { class: 'badge', text: '확인 안 함' });

  const geminiTest = el('button', { class: 'btn btn-sm' }, ['연동 확인']);
  geminiTest.addEventListener('click', async () => {
    const restore = busy(geminiTest, '확인 중');
    geminiState.className = 'badge';
    geminiState.textContent = '확인 중';
    try {
      await callApi('/api/gemini/report-questions', { title: '연동 확인', field: '기타' });
      geminiState.className = 'badge ok';
      geminiState.textContent = '정상';
    } catch (e) {
      geminiState.className = 'badge danger';
      geminiState.textContent = e?.status === 503 ? '키 미설정' : '오류';
      toastError(e?.message || '연동을 확인하지 못했습니다.');
    } finally { restore(); }
  });

  const youtubeTest = el('button', { class: 'btn btn-sm' }, ['연동 확인']);
  youtubeTest.addEventListener('click', async () => {
    const restore = busy(youtubeTest, '확인 중');
    youtubeState.className = 'badge';
    youtubeState.textContent = '확인 중';
    try {
      await callApi('/api/youtube/search', { q: '과학 실험', maxResults: 1 });
      youtubeState.className = 'badge ok';
      youtubeState.textContent = '정상';
    } catch (e) {
      youtubeState.className = 'badge danger';
      youtubeState.textContent = e?.status === 503 ? '키 미설정' : '오류';
      toastError(e?.message || '연동을 확인하지 못했습니다.');
    } finally { restore(); }
  });

  /* ── 화면 ──────────────────────────────────────────────────────────── */
  const body = el('div', { style: { maxWidth: '900px', margin: '0 auto', display: 'grid', gap: '12px' } }, [

    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h2', { text: '기본 정보' }),
        el('div', { class: 'spacer' }),
        stateEl
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'form-grid cols-3' }, [
          textField('사이트 이름', 'siteName', {}, '화면 상단과 첫 화면에 표시됩니다.'),
          textField('학교명', 'schoolName'),
          textField('교사명', 'teacherName'),
          textField('운영 학년도', 'year', { type: 'number' }, '이 학년도의 활동과 학생만 불러옵니다.'),
          textField('운영 시작일', 'periodStart', { type: 'date' }),
          textField('운영 종료일', 'periodEnd', { type: 'date' }),
          el('div', { class: 'field span-full' }, [
            el('label', { text: '첫 화면 소개 문구' }), introArea
          ]),
          textField('문의 이메일', 'contactEmail', { type: 'email' })
        ])
      ])
    ]),

    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: '예산 · 학생 화면' })]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'form-grid cols-3' }, [
          textField('총예산 (원)', 'totalBudget', { type: 'number', step: 10000 },
            `현재 ${won(s.totalBudget || 0)}원`),
          selectField('학생 자동 로그아웃', 'studentLogoutMinutes', [
            [30, '30분'], [60, '60분'], [0, '사용 안 함']
          ], '공용 기기에서 일정 시간 조작이 없으면 자동으로 로그아웃합니다.')
        ])
      ])
    ]),

    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: '외부 연동' })]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'notice mb-12' },
          'API KEY 는 이 화면에 저장하지 않습니다. Vercel 프로젝트의 Environment Variables 에만 등록합니다.'),
        el('div', { class: 'form-grid cols-2' }, [
          el('div', {}, [
            el('div', { class: 'flex items-center gap-8 mb-8' }, [
              el('span', { class: 'label grow', text: '초안 만들기 기능 (Gemini)' }),
              geminiState, geminiTest
            ]),
            selectField('사용 여부', 'geminiEnabled', [[true, '사용'], [false, '사용 안 함']],
              '끄면 준비물·수업계획·요약 초안 버튼이 숨겨집니다.')
          ]),
          el('div', {}, [
            el('div', { class: 'flex items-center gap-8 mb-8' }, [
              el('span', { class: 'label grow', text: '영상 검색 (YouTube Data API)' }),
              youtubeState, youtubeTest
            ]),
            selectField('사용 여부', 'youtubeEnabled', [[true, '사용'], [false, '사용 안 함']],
              '끄면 영상 검색 버튼이 숨겨집니다. 주소로 직접 추가는 계속 가능합니다.')
          ])
        ])
      ])
    ]),

    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: '초기 데이터' })]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'notice mb-12' },
          `${SEED_YEAR} 스마트과학반 전체 계획(9/2 ~ 11/11, 총 20차시)을 한 번에 등록합니다. 이미 있는 일정은 건드리지 않습니다.`),
        seedBtn,
        seedResult
      ])
    ]),

    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h2', { text: '관리자 계정' })]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'notice' }, [
          '관리자는 Firebase Console 에서만 추가할 수 있습니다. ',
          el('code', { text: 'admins/{uid}' }),
          ' 문서를 만들면 그 Google 계정으로 이 화면에 접근할 수 있습니다.'
        ]),
        el('div', { class: 'mt-12 small' }, [
          el('span', { class: 'muted', text: '현재 로그인 계정 UID  ' }),
          el('code', { text: store.user?.uid || '' })
        ])
      ])
    ]),

    el('div', { class: 'flex gap-8', style: { justifyContent: 'flex-end', paddingBottom: '8px' } }, [saveBtn])
  ]);

  const head = [
    el('h1', { text: '설정' }),
    el('span', { class: 'sub', text: '변경 후 [설정 저장] 을 눌러 주세요.' }),
    el('div', { class: 'spacer' })
  ];

  return { head, body };
}
