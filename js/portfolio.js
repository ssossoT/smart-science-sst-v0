/* ==========================================================================
   교사 포트폴리오 문서 생성기
   --------------------------------------------------------------------------
   포함하지 않는 것: 구매 가격, 구매처, 재고, 예산, 학생 이름, 학생 UID,
                     학생 계정 정보, 개별 학생 원문 보고서
   학생 소감은 요약된 형태로만 싣는다.
   ========================================================================== */

import { el, fmtDate, fmtDateDot, pct } from './ui.js';
import { sessionTitle } from './common.js';

/** 포트폴리오에 넣을 수업만 고른다. */
export function portfolioSessions(sessions) {
  return sessions
    .filter(s => !s.noClass && ['done', 'archived'].includes(s.status))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function block(label, text) {
  if (!text || !String(text).trim()) return null;
  return el('div', { class: 'mb-12' }, [
    el('h3', { class: 'hr-label', text: label }),
    el('div', { class: 'pre-wrap', style: { fontSize: '13px', lineHeight: '1.75' }, text: String(text) })
  ]);
}

function listBlock(label, items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return el('div', { class: 'mb-12' }, [
    el('h3', { class: 'hr-label', text: label }),
    el('ul', {}, list.map(t => el('li', { style: { fontSize: '13px', lineHeight: '1.75' }, text: '· ' + t })))
  ]);
}

/**
 * 활동 한 개의 포트폴리오 항목.
 * @param {object} session  공개 문서
 * @param {object} priv     교사 전용 문서
 * @param {object[]} reflections 이 수업의 보고서 (집계에만 사용, 원문은 싣지 않음)
 */
export function portfolioEntry(session, priv = {}, reflections = [], studentCount = 0, { withPhotos = true } = {}) {
  const rated = reflections.filter(r => Number(r.rating) > 0);
  const avg = rated.length ? rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length : 0;
  const draft = priv.portfolioDraft || {};

  const photos = withPhotos ? (session.photos || []).slice(0, 6) : [];
  const contestRows = session.contest?.enabled ? (session.contest.rows || []) : [];

  return el('section', { class: 'card pf-entry', style: { padding: '18px', marginBottom: '14px' } }, [
    el('div', { class: 'flex items-center gap-8 wrap mb-8' }, [
      session.periodLabel ? el('span', { class: 'badge accent', text: session.periodLabel }) : null,
      el('span', { class: 'badge', text: fmtDateDot(session.date) }),
      session.field ? el('span', { class: 'tag', text: session.field }) : null
    ]),
    el('h2', { style: { fontSize: '19px', fontWeight: '800', letterSpacing: '-.02em', marginBottom: '10px' } },
      [sessionTitle(session)]),

    // 요약 지표 (학생 개인 정보 없이 집계만)
    el('div', { class: 'form-grid cols-3 mb-12' }, [
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '보고서 제출' }),
        el('div', { class: 'v', style: { fontSize: '17px' }, text: studentCount ? `${reflections.length} / ${studentCount}명` : `${reflections.length}건` })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '학생 만족도' }),
        el('div', { class: 'v', style: { fontSize: '17px' } }, [avg ? `${avg.toFixed(1)} / 5` : '—'])
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '제출률' }),
        el('div', { class: 'v', style: { fontSize: '17px' }, text: studentCount ? `${pct(reflections.length, studentCount)}%` : '—' })
      ])
    ]),

    block('활동 목표', priv.goal),
    block('활동 개요', draft.overview),
    block('운영 내용', draft.operation || priv.runPlan),

    photos.length ? el('div', { class: 'mb-12' }, [
      el('h3', { class: 'hr-label', text: '활동 사진' }),
      el('div', { class: 'photo-grid pf-photos' }, photos.map(p =>
        el('div', { class: 'photo-cell' }, [el('img', { src: p.url, alt: '', loading: 'lazy' })])
      ))
    ]) : null,

    block('활동 결과', session.publicResult || priv.result),

    contestRows.length ? el('div', { class: 'mb-12' }, [
      el('h3', { class: 'hr-label', text: '대회 결과' }),
      el('div', { class: 'table-wrap' }, el('table', { class: 'tbl' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { style: { width: '60px' }, text: '순위' }),
          el('th', { text: '팀' }),
          el('th', { class: 'num', text: '기록' }),
          el('th', { text: '비고' })
        ])),
        el('tbody', {}, contestRows.map(r => el('tr', {}, [
          el('td', { text: `${r.rank || ''}위` }),
          el('td', { text: r.name || '' }),
          el('td', { class: 'num', text: `${r.record ?? ''}${r.unit || ''}` }),
          el('td', { class: 'muted', text: r.note || '' })
        ])))
      ]))
    ]) : null,

    block('과학적 원리', session.principle),
    block('학생 반응', draft.studentResponse),
    block('학생 소감 요약', priv.reflectionSummary),
    block('교육적 의미', draft.educationalMeaning),
    block('교사 성찰', draft.teacherReflection || priv.reflection),
    listBlock('향후 개선사항', draft.improvements?.length ? draft.improvements : (priv.nextTime ? [priv.nextTime] : []))
  ]);
}

/**
 * 전체 포트폴리오 문서.
 * @param {object} opts
 * @param {object} opts.settings
 * @param {object[]} opts.sessions        포함할 수업 (공개 문서)
 * @param {Map} opts.privates             sessionId -> 교사 전용 문서
 * @param {object[]} opts.reflections     전체 보고서
 * @param {number} opts.studentCount
 */
export function buildPortfolio({ settings, sessions, privates, reflections, studentCount = 0, withPhotos = true, withCover = true }) {
  const entries = sessions.map(s =>
    portfolioEntry(
      s,
      privates.get(s.id) || {},
      reflections.filter(r => r.sessionId === s.id),
      studentCount,
      { withPhotos }
    )
  );

  const totalSessions = sessions.length;
  const allRated = reflections.filter(r => Number(r.rating) > 0);
  const overallAvg = allRated.length
    ? (allRated.reduce((a, r) => a + Number(r.rating), 0) / allRated.length).toFixed(1)
    : '—';

  const cover = withCover ? el('div', { class: 'pf-cover card', style: { padding: '28px', marginBottom: '14px', textAlign: 'center' } }, [
    el('h1', { style: { fontSize: '26px', fontWeight: '800', letterSpacing: '-.03em' }, text: `${settings.year || ''}학년도 ${settings.siteName || '스마트과학반'} 운영 기록` }),
    el('div', { class: 'sub muted mt-8', text: `${settings.schoolName || ''} · ${settings.teacherName || ''}` }),
    el('div', { class: 'form-grid cols-3 mt-16', style: { maxWidth: '520px', margin: '18px auto 0' } }, [
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: '운영 활동' }), el('div', { class: 'v', text: String(totalSessions) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: '참여 학생' }), el('div', { class: 'v', text: String(studentCount) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'k', text: '평균 만족도' }), el('div', { class: 'v', text: overallAvg })])
    ]),
    settings.periodStart && settings.periodEnd
      ? el('div', { class: 'meta muted small mt-16', text: `운영 기간 ${fmtDate(settings.periodStart, { withYear: true, withWeek: false })} ~ ${fmtDate(settings.periodEnd, { withYear: true, withWeek: false })}` })
      : null
  ]) : null;

  const footer = el('div', { class: 'print-footer' }, [
    el('div', { text: '본 기록물은 교육 목적으로 제작되었습니다. 무단 복제·배포·수정·상업적 이용을 금합니다.' }),
    el('div', { text: `© ${settings.year || ''} ${settings.schoolName || ''} 교사 ${settings.teacherName || ''}. All rights reserved.` })
  ]);

  return el('div', { class: 'pf-doc' }, [
    cover,
    ...entries,
    footer
  ]);
}
