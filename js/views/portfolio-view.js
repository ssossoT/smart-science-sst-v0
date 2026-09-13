/* ==========================================================================
   포트폴리오 (선생님 화면 안)
   누적된 활동 기록을 문서 형태로 보고, 인쇄 화면으로 이동할 수 있다.
   ========================================================================== */

import { el, mount, emptyState } from '../ui.js';
import { store, activeStudents } from '../store.js';
import { buildPortfolio, portfolioSessions } from '../portfolio.js';
import { sessionTitle } from '../common.js';
import { fmtDateDot } from '../ui.js';

export async function renderPortfolioView(ctx) {
  const card = el('div', { class: 'card' });
  const candidates = portfolioSessions(store.sessions);
  const selected = new Set(candidates.map(s => s.id));
  let withPhotos = true;

  function render() {
    const chosen = candidates.filter(s => selected.has(s.id));

    const pickBar = el('div', { class: 'filterbar' }, [
      el('span', { class: 'label', text: '포함할 활동' }),
      ...candidates.map(s => el('button', {
        class: `chip ${selected.has(s.id) ? 'on' : ''}`, type: 'button',
        onclick: () => {
          selected.has(s.id) ? selected.delete(s.id) : selected.add(s.id);
          render();
        }
      }, [`${fmtDateDot(s.date).slice(5)} ${sessionTitle(s)}`])),
      el('div', { class: 'spacer grow' }),
      (() => {
        const cb = el('input', { type: 'checkbox', checked: withPhotos });
        cb.addEventListener('change', () => { withPhotos = cb.checked; render(); });
        return el('label', { class: 'check' }, [cb, el('span', { text: '사진 포함' })]);
      })()
    ]);

    const doc = chosen.length
      ? buildPortfolio({
          settings: store.settings || {},
          sessions: chosen,
          privates: store.privates,
          reflections: store.reflections,
          studentCount: activeStudents().length,
          withPhotos
        })
      : emptyState(
          candidates.length ? '선택한 활동이 없습니다.' : '포트폴리오에 넣을 활동이 없습니다.',
          candidates.length ? '위에서 포함할 활동을 선택해 주세요.'
            : '수업 상태를 "수업 완료" 또는 "기록 보관" 으로 바꾸면 이곳에 쌓입니다.',
          candidates.length ? null : el('button', { class: 'btn btn-primary mt-8', onclick: () => ctx.go('plan') }, ['전체 계획으로 이동'])
        );

    mount(card,
      el('div', { class: 'card-head no-print' }, [
        el('h2', { text: '누적 기록' }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge', text: `${chosen.length}개 활동` }),
        el('a', {
          class: 'btn btn-sm', href: './portfolio.html', target: '_blank', rel: 'noopener'
        }, ['인쇄용으로 열기'])
      ]),
      candidates.length ? pickBar : null,
      el('div', { class: 'card-body scroll-y' }, doc)
    );
  }

  render();

  const head = [
    el('h1', { text: '포트폴리오' }),
    el('span', { class: 'sub', text: '구매 가격·재고·학생 개인정보는 포함되지 않습니다.' }),
    el('div', { class: 'spacer' })
  ];

  return { head, body: card, fixed: true };
}
