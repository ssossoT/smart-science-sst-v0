/* ==========================================================================
   선생님 홈 - 이번 주 수업 준비 상황을 한눈에
   ========================================================================== */

import {
  el, won, wonLabel, fmtDate, relativeDay, pct, emptyState, starsStatic, fmtStamp
} from '../ui.js';
import {
  store, privateOf, reflectionsOf, activeStudents, syncPublicSettings
} from '../store.js';
import {
  readinessOf, costOf, statusBadge, pickCurrentSession, nextSessionAfter,
  sessionTitle, isNotOrdered, isPurchaseNeeded
} from '../common.js';

function statTile(k, v, s, unit) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v' }, [String(v), unit ? el('small', { text: unit }) : null]),
    s ? el('div', { class: 's', text: s }) : null
  ]);
}

/** 전체 예산 집계 */
function budgetSummary() {
  const total = Number(store.settings?.totalBudget) || 0;
  let spent = 0, committed = 0;
  store.privates.forEach(p => {
    const c = costOf(p);
    spent += c.spent;
    committed += c.committed;
  });
  return { total, spent, committed, remain: Math.max(0, total - spent - committed) };
}

export async function renderHome(ctx) {
  const sessions = store.sessions;
  const current = pickCurrentSession(sessions);
  const next = current ? nextSessionAfter(sessions, current.id) : null;

  // 첫 화면(로그인 전) 안내에 다음 일정을 반영해 둔다.
  syncPublicSettings(current);

  const priv = current ? (privateOf(current.id) || {}) : {};
  const ready = readinessOf(priv);
  const students = activeStudents();
  const refs = current ? reflectionsOf(current.id) : [];
  const rated = refs.filter(r => Number(r.rating) > 0);
  const avgRating = rated.length
    ? (rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(1)
    : '—';
  const budget = budgetSummary();

  /* ── 상단 통계 ─────────────────────────────────────────────────────── */
  const stats = el('div', { class: 'dash-stats' }, [
    statTile('준비 진행률', ready.total ? `${ready.percent}` : '—', `완료 ${ready.done} / 전체 ${ready.total}`, ready.total ? '%' : ''),
    statTile('구매 필요', ready.notOrdered, ready.ordered ? `주문 완료 ${ready.ordered}건` : '아직 주문하지 않음'),
    statTile('학생 보고서', `${refs.length} / ${students.length}`, students.length ? `제출률 ${pct(refs.length, students.length)}%` : '등록된 학생 없음'),
    statTile('평균 만족도', avgRating, rated.length ? `응답 ${rated.length}명` : '응답 없음', rated.length ? ' / 5' : ''),
    statTile('남은 예산', won(budget.remain), `총 ${won(budget.total)}원`, '원')
  ]);

  /* ── 이번 활동 카드 ────────────────────────────────────────────────── */
  const nowCard = el('div', { class: 'card now-card' }, [
    el('div', { class: 'card-head' }, [
      el('h2', { text: '이번 활동' }),
      el('div', { class: 'spacer' }),
      current ? statusBadge(current.status) : null
    ]),
    current
      ? el('div', { class: 'card-body', style: { overflowY: 'auto' } }, [
          el('div', { class: 'now-title', text: sessionTitle(current) }),
          el('div', { class: 'now-meta' }, [
            el('span', { class: 'badge accent', text: fmtDate(current.date, { withYear: true }) }),
            current.periodLabel ? el('span', { class: 'badge', text: current.periodLabel }) : null,
            current.field ? el('span', { class: 'tag', text: current.field }) : null,
            el('span', { class: 'muted small', text: relativeDay(current.date) })
          ]),

          el('div', { class: 'mt-16' }, [
            el('div', { class: 'flex items-center justify-between mb-8' }, [
              el('span', { class: 'label', text: '준비 진행률' }),
              el('span', { class: 'small strong num', text: ready.total ? `${ready.percent}%` : '항목 없음' })
            ]),
            el('div', { class: `progress progress-lg ${ready.percent >= 100 ? 'ok' : ready.percent < 50 ? 'warn' : ''}` }, [
              el('i', { style: { width: `${ready.percent}%` } })
            ]),
            el('div', { class: 'flex gap-12 mt-8 small muted wrap' }, [
              el('span', { text: `준비 완료 ${ready.matReady}` }),
              el('span', { text: `미완료 ${Math.max(0, ready.matTotal - ready.matReady)}` }),
              el('span', { text: `구매 필요 ${ready.notOrdered}` }),
              el('span', { text: `주문 완료 ${ready.ordered}` }),
              el('span', { text: `체크리스트 ${ready.checkDone}/${ready.checkTotal}` })
            ])
          ]),

          el('div', { class: 'flex gap-8 mt-16 wrap' }, [
            el('button', {
              class: 'btn btn-primary', onclick: () => ctx.go('session', current.id)
            }, ['수업 준비하기']),
            el('button', {
              class: 'btn', onclick: () => ctx.go('purchase')
            }, ['준비물·구매 보기'])
          ])
        ])
      : emptyState('등록된 활동이 없습니다.', '설정에서 초기 일정을 등록하거나 전체 계획에서 활동을 추가해 주세요.',
          el('button', { class: 'btn btn-primary mt-8', onclick: () => ctx.go('plan') }, ['전체 계획으로 이동']))
  ]);

  /* ── 구매하지 않은 물품 ────────────────────────────────────────────── */
  const pending = [];
  store.sessions.forEach(s => {
    const p = privateOf(s.id);
    (p?.materials || []).forEach(m => {
      if (isPurchaseNeeded(m)) pending.push({ session: s, m });
    });
  });
  pending.sort((a, b) => {
    const rank = x => (isNotOrdered(x.m) ? 0 : 1);
    return rank(a) - rank(b) || String(a.session.date).localeCompare(String(b.session.date));
  });

  const purchaseCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h2', { text: '구매가 남은 물품' }),
      el('div', { class: 'spacer' }),
      el('span', { class: `badge ${pending.length ? 'danger' : 'ok'}`, text: `${pending.length}건` }),
      el('button', { class: 'btn btn-sm', onclick: () => ctx.go('purchase') }, ['전체 보기'])
    ]),
    pending.length
      ? el('div', { class: 'card-body flush scroll-y' },
          el('div', { class: 'mini-list' }, pending.slice(0, 20).map(({ session, m }) =>
            el('div', {
              class: 'mini-row', style: { cursor: 'pointer' },
              onclick: () => ctx.go('session', session.id)
            }, [
              el('span', { class: `dot ${isNotOrdered(m) ? 'danger' : 'warn'}` }),
              el('span', { class: 'grow truncate' }, [
                el('span', { class: 'strong', text: m.name || '(이름 없음)' }),
                el('span', { class: 'muted small', text: ` ${m.quantity || ''}${m.unit || ''}` })
              ]),
              el('span', { class: 'xsmall muted truncate', style: { maxWidth: '110px' }, text: sessionTitle(session) }),
              el('span', { class: `badge ${isNotOrdered(m) ? 'danger' : 'warn'}`, text: m.status })
            ])
          ))
        )
      : emptyState('구매할 물품이 없습니다.')
  ]);

  /* ── 다음 일정 ─────────────────────────────────────────────────────── */
  const upcoming = store.sessions
    .filter(s => s.date >= (current?.date || ''))
    .slice(0, 6);

  const nextCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h2', { text: '다음 일정' }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm', onclick: () => ctx.go('plan') }, ['전체 계획'])
    ]),
    upcoming.length
      ? el('div', { class: 'card-body flush scroll-y' },
          el('div', { class: 'mini-list' }, upcoming.map(s =>
            el('div', {
              class: 'mini-row', style: { cursor: 'pointer' },
              onclick: () => ctx.go('session', s.id)
            }, [
              el('span', { class: `dot ${s.id === current?.id ? 'accent' : s.noClass ? '' : 'ok'}` }),
              el('span', { class: 'num xsmall muted', style: { minWidth: '54px' }, text: fmtDate(s.date) }),
              el('span', { class: 'grow truncate', text: sessionTitle(s) }),
              s.periodLabel ? el('span', { class: 'xsmall muted nowrap', text: s.periodLabel }) : null
            ])
          ))
        )
      : emptyState('등록된 활동이 없습니다.')
  ]);

  /* ── 최근 교사 메모 ────────────────────────────────────────────────── */
  const notes = [];
  store.sessions.forEach(s => {
    const p = privateOf(s.id);
    (p?.liveNotes || []).forEach(n => notes.push({ session: s, note: n }));
    if (p?.nextTime) notes.push({ session: s, note: { text: p.nextTime, at: p.updatedAt, kind: '다음엔 이렇게' } });
  });
  notes.sort((a, b) => String(b.note.at || '').localeCompare(String(a.note.at || '')));

  const memoCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h2', { text: '최근 메모' })]),
    notes.length
      ? el('div', { class: 'card-body flush scroll-y' },
          el('div', { class: 'mini-list' }, notes.slice(0, 12).map(({ session, note }) =>
            el('div', {
              class: 'mini-row', style: { cursor: 'pointer', alignItems: 'flex-start' },
              onclick: () => ctx.go('session', session.id)
            }, [
              el('span', { class: 'dot accent', style: { marginTop: '6px' } }),
              el('span', { class: 'grow' }, [
                el('div', { class: 'pre-wrap', style: { fontSize: '12.5px' }, text: note.text || '' }),
                el('div', { class: 'xsmall muted', text: [sessionTitle(session), note.kind, fmtStamp(note.at)].filter(Boolean).join(' · ') })
              ])
            ])
          ))
        )
      : emptyState('기록된 메모가 없습니다.', '수업 중 화면에서 빠르게 메모를 남길 수 있습니다.')
  ]);

  /* ── 학생 보고서 제출현황 ──────────────────────────────────────────── */
  const submitCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h2', { text: '보고서 제출 현황' }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm', onclick: () => ctx.go('records') }, ['학생 기록'])
    ]),
    !students.length
      ? emptyState('등록된 학생이 없습니다.', '학생 관리에서 학생을 추가해 주세요.',
          el('button', { class: 'btn btn-primary mt-8', onclick: () => ctx.go('students') }, ['학생 추가']))
      : el('div', { class: 'card-body flush scroll-y' },
          el('div', { class: 'mini-list' },
            store.sessions
              .filter(s => !s.noClass && ['done', 'archived', 'published'].includes(s.status))
              .slice(-8).reverse()
              .map(s => {
                const rs = reflectionsOf(s.id);
                const rate = pct(rs.length, students.length);
                const rr = rs.filter(r => Number(r.rating) > 0);
                const avg = rr.length ? (rr.reduce((a, r) => a + Number(r.rating), 0) / rr.length) : 0;
                return el('div', {
                  class: 'mini-row', style: { cursor: 'pointer' },
                  onclick: () => ctx.go('session', s.id)
                }, [
                  el('span', { class: 'grow truncate', text: sessionTitle(s) }),
                  avg ? starsStatic(avg) : null,
                  el('span', { class: 'xsmall muted num nowrap', text: `${rs.length}/${students.length}` }),
                  el('span', { class: 'progress', style: { width: '58px', flex: 'none' } }, [
                    el('i', { style: { width: `${rate}%` } })
                  ])
                ]);
              })
          )
        )
  ]);

  /* ── 예산 카드 ─────────────────────────────────────────────────────── */
  const usedPct = pct(budget.spent + budget.committed, budget.total);
  const budgetCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h2', { text: '예산' }),
      el('div', { class: 'spacer' }),
      el('span', { class: 'xsmall muted', text: `${usedPct}% 사용` })
    ]),
    el('div', { class: 'card-body' }, [
      el('div', { class: `progress progress-lg ${usedPct > 90 ? 'warn' : ''}` }, [
        el('i', { style: { width: `${usedPct}%` } })
      ]),
      el('div', { class: 'form-grid cols-2 mt-12' }, [
        el('div', {}, [el('div', { class: 'label', text: '총예산' }), el('div', { class: 'strong num', text: wonLabel(budget.total) })]),
        el('div', {}, [el('div', { class: 'label', text: '사용 금액' }), el('div', { class: 'strong num', text: wonLabel(budget.spent) })]),
        el('div', {}, [el('div', { class: 'label', text: '주문 예정' }), el('div', { class: 'strong num', text: wonLabel(budget.committed) })]),
        el('div', {}, [el('div', { class: 'label', text: '잔여' }), el('div', { class: 'strong num', style: { color: 'var(--accent)' }, text: wonLabel(budget.remain) })])
      ])
    ])
  ]);

  const body = el('div', { class: 'dash' }, [
    stats,
    el('div', { class: 'dash-left' }, [nowCard, purchaseCard]),
    el('div', { class: 'dash-right' }, [nextCard, submitCard]),
    el('div', { class: 'dash-bottom' }, [memoCard, budgetCard])
  ]);

  const head = [
    el('h1', { text: '홈' }),
    el('span', { class: 'sub', text: next ? `다음 활동 ${fmtDate(next.date)} · ${sessionTitle(next)}` : '' }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-sm', onclick: () => ctx.reload() }, ['새로고침'])
  ];

  return { head, body, fixed: true };
}
