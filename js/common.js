/* ==========================================================================
   교사/학생 화면이 함께 쓰는 표시 로직
   ========================================================================== */

import { el, esc, fmtDate, pct } from './ui.js';
import {
  SESSION_STATUS, MATERIAL_STATUS, PENDING_PURCHASE, cachedSettings
} from './firebase-service.js';

/* ── 푸터 ────────────────────────────────────────────────────────────── */

export function teacherFooterHtml(s = cachedSettings()) {
  const school = esc(s.schoolName || '');
  const teacher = esc(s.teacherName || '');
  const year = esc(s.year || new Date().getFullYear());
  return `
    <p>본 사이트의 수업자료 및 기록물은 교육 목적으로 제작되었습니다.</p>
    <p>제작자의 동의 없는 무단 복제·배포·수정·상업적 이용을 금합니다.</p>
    <p>활동 및 실험을 재현할 경우 안전수칙과 학교 여건을 충분히 확인해 주세요.</p>
    <p style="margin-top:8px">제작자 <strong>${school} 교사 ${teacher}</strong></p>
    <p>© ${year} ${school} 교사 ${teacher}. All rights reserved.</p>`;
}

export function studentFooterHtml(s = cachedSettings()) {
  return `<p>© ${esc(s.year || new Date().getFullYear())} ${esc(s.siteName || '스마트과학반')} · ${esc(s.schoolName || '')}</p>`;
}

export function renderFooter(node, kind) {
  if (!node) return;
  node.className = 'site-footer';
  node.innerHTML = kind === 'student' ? studentFooterHtml() : teacherFooterHtml();
}

/** 문서 제목과 브랜드명을 설정값에 맞춘다. */
export function applyBranding(settings, { suffix = '' } = {}) {
  const name = settings.siteName || '스마트과학반 LAB';
  document.title = suffix ? `${name} · ${suffix}` : name;
  document.querySelectorAll('[data-site-name]').forEach(n => { n.textContent = name; });
  document.querySelectorAll('[data-school-name]').forEach(n => { n.textContent = settings.schoolName || ''; });
  document.querySelectorAll('[data-teacher-name]').forEach(n => { n.textContent = settings.teacherName || ''; });
  document.querySelectorAll('[data-year]').forEach(n => { n.textContent = settings.year || ''; });
}

/* ── 배지 ────────────────────────────────────────────────────────────── */

export function statusBadge(status) {
  const meta = SESSION_STATUS[status] || SESSION_STATUS.draft;
  return el('span', { class: `badge ${meta.badge}`, text: meta.label });
}

export function materialStatusBadge(status) {
  let cls = '';
  if (status === '보유' || status === '준비 완료') cls = 'ok';
  else if (status === '구매 필요') cls = 'danger';
  else if (status === '주문 완료') cls = 'warn';
  else if (status === '수령 완료') cls = 'info';
  return el('span', { class: `badge ${cls}`, text: status || '미지정' });
}

/* ── 준비물 계산 ─────────────────────────────────────────────────────── */

export function isPurchaseNeeded(m) {
  return PENDING_PURCHASE.includes(m?.status) && m?.status !== '준비 완료';
}

export function isNotOrdered(m) {
  return m?.status === '구매 필요';
}

/** 준비 진행률: 체크리스트 + 준비물 상태를 함께 본다. */
export function readinessOf(priv) {
  const checks = Array.isArray(priv?.checklist) ? priv.checklist : [];
  const mats = Array.isArray(priv?.materials) ? priv.materials : [];

  const checkDone = checks.filter(c => c.done).length;
  const matReady = mats.filter(m => ['보유', '준비 완료', '수령 완료', '사용 완료'].includes(m.status)).length;

  const total = checks.length + mats.length;
  const done = checkDone + matReady;

  return {
    total,
    done,
    percent: pct(done, total),
    checkDone,
    checkTotal: checks.length,
    matReady,
    matTotal: mats.length,
    needPurchase: mats.filter(isPurchaseNeeded).length,
    notOrdered: mats.filter(isNotOrdered).length,
    ordered: mats.filter(m => m.status === '주문 완료').length
  };
}

/**
 * 비용 집계.
 *   spent     : 실제가격이 입력된 금액 (이미 쓴 돈)
 *   committed : 아직 실제가격이 없는 '구매 필요 / 주문 완료' 항목의 예상가 (앞으로 쓸 돈)
 * 두 값은 서로 겹치지 않으므로 spent + committed 로 총 소요액을 구할 수 있다.
 */
export function costOf(priv) {
  const mats = Array.isArray(priv?.materials) ? priv.materials : [];
  const est = mats.reduce((sum, m) => sum + (Number(m.estPrice) || 0), 0);
  const actual = mats.reduce((sum, m) => sum + (Number(m.actualPrice) || 0), 0);
  const committed = mats
    .filter(m => !(Number(m.actualPrice) > 0) && ['구매 필요', '주문 완료'].includes(m.status))
    .reduce((s, m) => s + (Number(m.estPrice) || 0), 0);

  return {
    materialEstimated: est,
    materialActual: actual,
    spent: actual,
    committed
  };
}

/* ── 분야 이모지 ─────────────────────────────────────────────────────── */
/* 첫 화면·학생 화면·교사 화면이 같은 이모지를 쓰도록 여기 한 곳에 둔다. */

export const FIELD_EMOJI = {
  물리: '⚛️', 화학: '🧪', 생명: '🧬', 지구과학: '🌍',
  천문: '🔭', 디지털: '💻', 제작: '🛠️', 기타: '🔬'
};

export function fieldEmoji(field) {
  return FIELD_EMOJI[field] || '🔬';
}

/* ── 수업 라벨 ───────────────────────────────────────────────────────── */

export function sessionLabel(s) {
  if (!s) return '';
  const parts = [fmtDate(s.date)];
  if (s.periodLabel) parts.push(s.periodLabel);
  return parts.join(' · ');
}

export function sessionTitle(s) {
  if (!s) return '';
  return s.noClass ? (s.title || '방과후 없음') : (s.title || '(제목 없음)');
}

/** 오늘 기준으로 '이번 활동' 을 고른다. */
export function pickCurrentSession(sessions) {
  const active = sessions.filter(s => !s.noClass);
  if (!active.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 아직 지나지 않은 가장 가까운 수업
  const upcoming = active
    .filter(s => {
      const d = s.date ? new Date(s.date + 'T00:00:00') : null;
      return d && d >= today;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length) return upcoming[0];

  // 모두 지났으면 가장 최근 수업
  return active.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
}

export function nextSessionAfter(sessions, currentId) {
  const list = sessions.filter(s => !s.noClass).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const idx = list.findIndex(s => s.id === currentId);
  return idx >= 0 ? list[idx + 1] || null : null;
}

export { MATERIAL_STATUS };
