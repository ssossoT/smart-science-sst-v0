/* ==========================================================================
   학생 관리
   --------------------------------------------------------------------------
   · 계정 생성/수정/비밀번호 변경은 모두 서버 API(Admin SDK)에서 처리한다.
     브라우저에서 직접 계정을 만들면 선생님 로그인 세션이 학생으로 바뀌기 때문이다.
   · 비밀번호는 어디에도 저장하지 않는다. 잊어버리면 새로 지정한다.
   · 학생 삭제 기능은 두지 않는다. 활동 기록이 사라지지 않도록 '비활성' 으로 관리한다.
   ========================================================================== */

import {
  el, mount, openModal, toastOk, toastError, confirmDialog,
  emptyState, busy, fmtStamp
} from '../ui.js';
import { store, refreshStudents } from '../store.js';
import { callApi } from '../firebase-service.js';

function randomPassword() {
  // 읽기 쉬운 문자만 사용 (0/O, 1/l 제외)
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const arr = new Uint32Array(8);
  crypto.getRandomValues(arr);
  arr.forEach(n => { out += chars[n % chars.length]; });
  return out;
}

function studentForm(initial = {}) {
  const nameInput = el('input', { class: 'input', value: initial.displayName || '', placeholder: '홍길동', maxlength: 20 });
  const loginInput = el('input', { class: 'input', value: initial.loginName || '', placeholder: '홍길동', maxlength: 40 });
  const noInput = el('input', { class: 'input', value: initial.studentNo || '', placeholder: '선택 입력' });
  const yearInput = el('input', { class: 'input', type: 'number', value: initial.year || store.settings?.year || new Date().getFullYear() });
  const statusSel = el('select', { class: 'select' }, [
    el('option', { value: 'active', selected: initial.status !== 'inactive', text: '사용' }),
    el('option', { value: 'inactive', selected: initial.status === 'inactive', text: '비활성' })
  ]);

  // 표시 이름을 입력하면 로그인 이름을 따라 채운다 (동명이인이면 직접 바꾼다)
  let loginTouched = Boolean(initial.loginName);
  loginInput.addEventListener('input', () => { loginTouched = true; });
  nameInput.addEventListener('input', () => {
    if (!loginTouched) loginInput.value = nameInput.value;
  });

  const node = el('div', { class: 'form-grid cols-2' }, [
    el('div', { class: 'field' }, [
      el('label', { text: '표시 이름' }), nameInput,
      el('span', { class: 'hint', text: '학생 화면에 보이는 이름입니다.' })
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: '로그인 이름' }), loginInput,
      el('span', { class: 'hint', text: '학생이 로그인할 때 입력합니다. 동명이인이면 홍길동1, 홍길동2 처럼 구분해 주세요.' })
    ]),
    el('div', { class: 'field' }, [
      el('label', { text: '학번 (선택)' }), noInput,
      el('span', { class: 'hint', text: '매년 바뀔 수 있어 기록 연결에는 사용하지 않습니다.' })
    ]),
    el('div', { class: 'field' }, [el('label', { text: '학년도' }), yearInput]),
    el('div', { class: 'field' }, [el('label', { text: '상태' }), statusSel])
  ]);

  return {
    node,
    read: () => ({
      displayName: nameInput.value.trim(),
      loginName: loginInput.value.trim(),
      studentNo: noInput.value.trim(),
      year: Number(yearInput.value) || undefined,
      status: statusSel.value
    })
  };
}

/** 새 비밀번호를 한 번만 보여준다. 저장하지 않는다. */
function showPasswordOnce(displayName, password) {
  const pwBox = el('div', {
    class: 'notice accent center',
    style: { fontSize: '22px', fontWeight: '800', letterSpacing: '.06em', padding: '18px' }
  }, [password]);

  const copyBtn = el('button', { class: 'btn' }, ['비밀번호 복사']);
  const okBtn = el('button', { class: 'btn btn-primary' }, ['확인']);

  const m = openModal({
    title: `${displayName} 학생 비밀번호`,
    closable: false,
    body: el('div', {}, [
      el('div', { class: 'notice warn mb-12', text: '이 비밀번호는 지금 화면에서만 확인할 수 있습니다. 어디에도 저장되지 않으니 학생에게 바로 알려 주세요. 잊어버리면 새 비밀번호를 지정하면 됩니다.' }),
      pwBox
    ]),
    footer: [el('div', { class: 'grow' }), copyBtn, okBtn]
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(password);
      toastOk('복사했습니다.');
    } catch {
      toastError('복사하지 못했습니다. 화면의 값을 직접 적어 주세요.');
    }
  });
  okBtn.addEventListener('click', () => m.close(true));
  return m.done;
}

export async function renderStudents(ctx) {
  const card = el('div', { class: 'card' });

  function render() {
    const list = store.students;
    const active = list.filter(s => s.status !== 'inactive');

    let body;
    if (!list.length) {
      body = emptyState('등록된 학생이 없습니다.', '학생을 추가하면 이름과 비밀번호로 로그인할 수 있습니다.',
        el('button', { class: 'btn btn-primary mt-8', onclick: openCreate }, ['+ 학생 추가']));
    } else {
      body = el('div', { class: 'card-body flush table-wrap scroll-y' },
        el('table', { class: 'tbl' }, [
          el('thead', {}, el('tr', {}, [
            el('th', { text: '표시 이름' }),
            el('th', { text: '로그인 이름' }),
            el('th', { style: { width: '90px' }, text: '학번' }),
            el('th', { class: 'center', style: { width: '80px' }, text: '학년도' }),
            el('th', { class: 'center', style: { width: '84px' }, text: '상태' }),
            el('th', { class: 'num', style: { width: '84px' }, text: '보고서' }),
            el('th', { style: { width: '128px' }, text: '가입일' }),
            el('th', { style: { width: '220px' }, text: '' })
          ])),
          el('tbody', {}, list.map(s => {
            const count = store.reflections.filter(r => r.studentUid === s.uid).length;
            return el('tr', {}, [
              el('td', { class: 'strong', text: s.displayName || '—' }),
              el('td', { class: 'muted', text: s.loginName || '—' }),
              el('td', { class: 'muted', text: s.studentNo || '—' }),
              el('td', { class: 'center muted num', text: String(s.year || '') }),
              el('td', { class: 'center' }, [
                el('span', { class: `badge ${s.status === 'inactive' ? '' : 'ok'}`, text: s.status === 'inactive' ? '비활성' : '사용' })
              ]),
              el('td', { class: 'num', text: String(count) }),
              el('td', { class: 'xsmall muted', text: fmtStamp(s.createdAt) }),
              el('td', { class: 'nowrap' }, [
                el('button', { class: 'btn btn-sm', onclick: () => openEdit(s) }, ['수정']),
                el('button', { class: 'btn btn-sm', style: { marginLeft: '4px' }, onclick: () => resetPassword(s) }, ['비밀번호']),
                el('button', { class: 'btn btn-sm', style: { marginLeft: '4px' }, onclick: () => ctx.go('records', s.uid) }, ['기록'])
              ])
            ]);
          }))
        ])
      );
    }

    mount(card,
      el('div', { class: 'card-head' }, [
        el('h2', { text: '학생 명부' }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge', text: `사용 ${active.length}명` }),
        list.length > active.length ? el('span', { class: 'badge', text: `비활성 ${list.length - active.length}명` }) : null,
        el('button', { class: 'btn btn-sm btn-primary', onclick: openCreate }, ['+ 학생 추가'])
      ]),
      el('div', { class: 'notice', style: { margin: '10px 12px 0' } },
        '학생 계정은 삭제하지 않고 비활성으로 관리합니다. 지난 활동 기록이 그대로 남습니다.'),
      body
    );
  }

  function openCreate() {
    const form = studentForm({ year: store.settings?.year });
    const pwInput = el('input', { class: 'input', value: randomPassword(), minlength: 6 });
    const regen = el('button', { class: 'btn btn-sm', type: 'button', onclick: () => { pwInput.value = randomPassword(); } }, ['새로 만들기']);

    const cancel = el('button', { class: 'btn' }, ['취소']);
    const submit = el('button', { class: 'btn btn-primary' }, ['학생 추가']);

    const m = openModal({
      title: '학생 추가',
      size: 'wide',
      body: el('div', {}, [
        form.node,
        el('div', { class: 'divider' }),
        el('div', { class: 'field' }, [
          el('label', { text: '초기 비밀번호 (6자 이상)' }),
          el('div', { class: 'flex gap-8' }, [el('div', { class: 'grow' }, [pwInput]), regen]),
          el('span', { class: 'hint', text: '이 값은 저장되지 않습니다. 추가 후 한 번만 다시 보여드립니다.' })
        ])
      ]),
      footer: [cancel, el('div', { class: 'grow' }), submit]
    });
    cancel.addEventListener('click', () => m.close());

    submit.addEventListener('click', async () => {
      const data = form.read();
      if (!data.displayName) { toastError('표시 이름을 입력해 주세요.'); return; }
      if (!data.loginName) { toastError('로그인 이름을 입력해 주세요.'); return; }
      if (pwInput.value.length < 6) { toastError('비밀번호는 6자 이상이어야 합니다.'); return; }

      const restore = busy(submit, '추가 중');
      try {
        await callApi('/api/admin/students', {
          action: 'create', ...data, password: pwInput.value
        });
        const pw = pwInput.value;
        await refreshStudents();
        m.close();
        render();
        await showPasswordOnce(data.displayName, pw);
        toastOk('학생을 추가했습니다.');
      } catch (e) {
        console.error('[students] 추가 실패', e);
        toastError(e?.message || '학생을 추가하지 못했습니다.');
      } finally { restore(); }
    });
  }

  function openEdit(student) {
    const form = studentForm(student);
    const cancel = el('button', { class: 'btn' }, ['취소']);
    const submit = el('button', { class: 'btn btn-primary' }, ['저장']);

    const m = openModal({
      title: `${student.displayName} 정보 수정`,
      size: 'wide',
      body: form.node,
      footer: [cancel, el('div', { class: 'grow' }), submit]
    });
    cancel.addEventListener('click', () => m.close());

    submit.addEventListener('click', async () => {
      const data = form.read();
      if (!data.displayName || !data.loginName) { toastError('이름을 모두 입력해 주세요.'); return; }
      const restore = busy(submit, '저장 중');
      try {
        await callApi('/api/admin/students', { action: 'update', uid: student.uid, ...data });
        await refreshStudents();
        m.close();
        render();
        toastOk('저장했습니다.');
      } catch (e) {
        console.error('[students] 수정 실패', e);
        toastError(e?.message || '저장하지 못했습니다.');
      } finally { restore(); }
    });
  }

  async function resetPassword(student) {
    const yes = await confirmDialog({
      title: '비밀번호 새로 지정',
      message: `${student.displayName} 학생의 비밀번호를 새로 만듭니다.\n기존 비밀번호는 더 이상 사용할 수 없습니다.\n\n진행할까요?`,
      confirmText: '새 비밀번호 만들기'
    });
    if (!yes) return;

    const password = randomPassword();
    try {
      await callApi('/api/admin/students', { action: 'resetPassword', uid: student.uid, password });
      await showPasswordOnce(student.displayName, password);
      toastOk('비밀번호를 변경했습니다.');
    } catch (e) {
      console.error('[students] 비밀번호 변경 실패', e);
      toastError(e?.message || '비밀번호를 변경하지 못했습니다.');
    }
  }

  render();

  const head = [
    el('h1', { text: '학생 관리' }),
    el('span', { class: 'sub', text: '이름과 비밀번호로 로그인합니다. 학생에게 이메일 주소를 묻지 않습니다.' }),
    el('div', { class: 'spacer' })
  ];

  return { head, body: card, fixed: true };
}
