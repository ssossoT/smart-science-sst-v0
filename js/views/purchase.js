/* ==========================================================================
   준비물·구매 - 모든 주차의 준비물을 한 화면에서 관리한다.
   이 사이트에서 가장 자주 쓰는 화면이므로 필터와 일괄 변경을 우선한다.
   ========================================================================== */

import {
  el, mount, toastOk, toastError, emptyState, fmtDate, won, wonLabel,
  isThisWeek, daysFromToday, debounce, busy, toDate, todayYmd
} from '../ui.js';
import {
  store, privateOf, updateSessionPrivate, refreshInventory
} from '../store.js';
import { sessionTitle } from '../common.js';
import { MATERIAL_STATUS, saveInventoryItem } from '../firebase-service.js';
import { newItem } from '../inventory-service.js';

const FILTERS = [
  { key: 'all',       label: '전체' },
  { key: 'thisWeek',  label: '이번 주' },
  { key: 'nextWeek',  label: '다음 주' },
  { key: 'thisMonth', label: '이번 달' },
  { key: 'need',      label: '구매 필요' },
  { key: 'notOrdered', label: '미구매' },
  { key: 'ordered',   label: '주문 완료' },
  { key: 'received',  label: '수령 완료' },
  { key: 'ready',     label: '준비 완료' }
];

function normalizeName(name) {
  return String(name || '').replace(/\s/g, '').toLowerCase();
}

function inNextWeek(ymd) {
  const diff = daysFromToday(ymd);
  if (diff == null) return false;
  const dow = (new Date().getDay() + 6) % 7;
  return diff >= 7 - dow && diff <= 13 - dow;
}

function inThisMonth(ymd) {
  const d = toDate(ymd);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export async function renderPurchase(ctx) {
  let filter = 'need';
  let search = '';

  const tableCard = el('div', { class: 'card' });
  const statsRow = el('div', { class: 'dash-stats mb-12' });

  /** 모든 주차의 준비물을 평탄화한다. */
  function collect() {
    const rows = [];
    store.sessions.forEach(s => {
      const priv = privateOf(s.id);
      (priv?.materials || []).forEach((m, index) => {
        rows.push({ session: s, material: m, index });
      });
    });
    return rows;
  }

  function passesFilter(row) {
    const { session: s, material: m } = row;
    if (search) {
      const q = normalizeName(search);
      if (!normalizeName(m.name).includes(q) && !normalizeName(s.title).includes(q)) return false;
    }
    switch (filter) {
      case 'thisWeek':  return isThisWeek(s.date);
      case 'nextWeek':  return inNextWeek(s.date);
      case 'thisMonth': return inThisMonth(s.date);
      case 'need':      return ['구매 필요', '주문 완료'].includes(m.status);
      case 'notOrdered': return m.status === '구매 필요';
      case 'ordered':   return m.status === '주문 완료';
      case 'received':  return m.status === '수령 완료';
      case 'ready':     return ['준비 완료', '보유'].includes(m.status);
      default:          return true;
    }
  }

  /* 같은 이름의 준비물이 어느 활동에서 쓰이는지 미리 계산한다. */
  function usageMap(all) {
    const map = new Map();
    all.forEach(({ session, material }) => {
      const key = normalizeName(material.name);
      if (!key) return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(sessionTitle(session));
    });
    return map;
  }

  const saveSession = debounce(async (sessionId) => {
    try {
      const priv = privateOf(sessionId);
      await updateSessionPrivate(sessionId, priv);
      toastOk('저장했습니다.');
    } catch (e) {
      console.error('[purchase] 저장 실패', e);
      toastError('저장하지 못했습니다.');
    }
  }, 700);

  function renderStats(all) {
    const need = all.filter(r => r.material.status === '구매 필요');
    const ordered = all.filter(r => r.material.status === '주문 완료');
    const estTotal = need.concat(ordered).reduce((s, r) => s + (Number(r.material.estPrice) || 0), 0);
    const actualTotal = all.reduce((s, r) => s + (Number(r.material.actualPrice) || 0), 0);
    const budget = Number(store.settings?.totalBudget) || 0;

    mount(statsRow,
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '전체 준비물' }),
        el('div', { class: 'v', text: String(all.length) })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '구매 필요' }),
        el('div', { class: 'v', style: { color: need.length ? 'var(--danger)' : '' }, text: String(need.length) }),
        el('div', { class: 's', text: `주문 완료 ${ordered.length}건` })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '예상 소요액' }),
        el('div', { class: 'v', style: { fontSize: '18px' }, text: wonLabel(estTotal) })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '실제 지출 합계' }),
        el('div', { class: 'v', style: { fontSize: '18px' }, text: wonLabel(actualTotal) })
      ]),
      el('div', { class: 'stat' }, [
        el('div', { class: 'k', text: '남은 예산' }),
        el('div', { class: 'v', style: { fontSize: '18px', color: 'var(--accent)' }, text: wonLabel(Math.max(0, budget - actualTotal)) }),
        el('div', { class: 's', text: `총 ${won(budget)}원` })
      ])
    );
  }

  function render() {
    const all = collect();
    const usage = usageMap(all);
    const rows = all.filter(passesFilter)
      .sort((a, b) =>
        String(a.session.date).localeCompare(String(b.session.date)) ||
        String(a.material.name).localeCompare(String(b.material.name), 'ko')
      );

    renderStats(all);

    const filterBar = el('div', { class: 'filterbar' }, [
      ...FILTERS.map(f => el('button', {
        class: `chip ${filter === f.key ? 'on' : ''}`, type: 'button',
        onclick: () => { filter = f.key; render(); }
      }, [f.label])),
      el('div', { class: 'spacer grow' }),
      (() => {
        const s = el('input', { class: 'input input-sm', type: 'search', placeholder: '물품명 또는 활동명', style: { width: '180px' }, value: search });
        s.addEventListener('input', debounce(() => { search = s.value; render(); }, 250));
        return s;
      })()
    ]);

    let body;
    if (!rows.length) {
      body = emptyState(
        filter === 'need' || filter === 'notOrdered' ? '구매할 물품이 없습니다.' : '해당하는 준비물이 없습니다.',
        '주차별 활동 화면에서 준비물을 등록할 수 있습니다.',
        el('button', { class: 'btn btn-primary mt-8', onclick: () => ctx.go('session') }, ['주차별 활동으로 이동'])
      );
    } else {
      const table = el('table', { class: 'tbl' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { style: { width: '78px' }, text: '날짜' }),
          el('th', { text: '물품명' }),
          el('th', { class: 'num', style: { width: '62px' }, text: '수량' }),
          el('th', { style: { width: '130px' }, text: '구매 상태' }),
          el('th', { class: 'num', style: { width: '92px' }, text: '예상가' }),
          el('th', { class: 'num', style: { width: '92px' }, text: '실제가' }),
          el('th', { style: { width: '110px' }, text: '구매처' }),
          el('th', { text: '사용 수업' }),
          el('th', { style: { width: '96px' }, text: '' })
        ])),
        el('tbody', {}, rows.map(({ session, material: m }) => {
          const key = normalizeName(m.name);
          const usedIn = Array.from(usage.get(key) || []);

          const status = el('select', { class: 'select input-sm' },
            MATERIAL_STATUS.map(v => el('option', { value: v, selected: m.status === v, text: v })));
          status.addEventListener('change', () => {
            m.status = status.value;
            saveSession(session.id);
            render();
          });

          const est = el('input', { class: 'input input-sm right', type: 'number', min: 0, step: 100, value: m.estPrice ?? '' });
          est.addEventListener('change', () => { m.estPrice = est.value === '' ? '' : Number(est.value); saveSession(session.id); });

          const act = el('input', { class: 'input input-sm right', type: 'number', min: 0, step: 100, value: m.actualPrice ?? '' });
          act.addEventListener('change', () => { m.actualPrice = act.value === '' ? '' : Number(act.value); saveSession(session.id); });

          const vendor = el('input', { class: 'input input-sm', value: m.vendor || '', placeholder: '—' });
          vendor.addEventListener('change', () => { m.vendor = vendor.value; saveSession(session.id); });

          const rowCls = m.status === '구매 필요' ? '' : '';

          return el('tr', { class: rowCls }, [
            el('td', { class: 'xsmall muted nowrap', text: fmtDate(session.date) }),
            el('td', {}, [
              el('div', { class: 'strong', text: m.name || '(이름 없음)' }),
              m.note ? el('div', { class: 'xsmall muted truncate', text: m.note }) : null
            ]),
            el('td', { class: 'num nowrap', text: `${m.quantity ?? ''}${m.unit || ''}` }),
            el('td', {}, [status]),
            el('td', {}, [est]),
            el('td', {}, [act]),
            el('td', {}, [vendor]),
            el('td', {}, [
              el('div', { class: 'flex gap-4 wrap' }, usedIn.slice(0, 3).map(t =>
                el('span', { class: 'badge', text: t })
              )),
              usedIn.length > 3 ? el('span', { class: 'xsmall muted', text: `외 ${usedIn.length - 3}개` }) : null
            ]),
            el('td', { class: 'nowrap' }, [
              el('button', {
                class: 'btn btn-sm', title: '이 활동 열기',
                onclick: () => ctx.go('session', session.id)
              }, ['활동']),
              el('button', {
                class: 'btn btn-sm', title: '재고에 추가',
                style: { marginLeft: '4px' },
                onclick: async (e) => {
                  const restore = busy(e.currentTarget, '');
                  try {
                    const exists = store.inventory.find(i => normalizeName(i.name) === key);
                    if (exists) {
                      await saveInventoryItem(exists.id, {
                        quantity: (Number(exists.quantity) || 0) + (Number(m.quantity) || 0)
                      });
                    } else {
                      const item = newItem({
                        name: m.name, unit: m.unit || '개',
                        quantity: Number(m.quantity) || 0,
                        category: m.category || '소모품'
                      });
                      await saveInventoryItem(item.id, item);
                      m.inventoryId = item.id;
                      saveSession(session.id);
                    }
                    await refreshInventory();
                    toastOk('재고에 반영했습니다.');
                    render();
                  } catch (err) {
                    console.error('[purchase] 재고 반영 실패', err);
                    toastError('재고에 반영하지 못했습니다.');
                  } finally { restore(); }
                }
              }, ['재고+'])
            ])
          ]);
        }))
      ]);
      body = el('div', { class: 'card-body flush table-wrap scroll-y' }, table);
    }

    mount(tableCard,
      el('div', { class: 'card-head' }, [
        el('h2', { text: '준비물 통합 목록' }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge', text: `${rows.length}건` }),
        el('button', {
          class: 'btn btn-sm',
          onclick: () => copyShoppingList(rows)
        }, ['구매 목록 복사'])
      ]),
      filterBar,
      body
    );
  }

  async function copyShoppingList(rows) {
    const need = rows.filter(r => ['구매 필요', '주문 완료'].includes(r.material.status));
    if (!need.length) { toastError('복사할 구매 항목이 없습니다.'); return; }
    const text = need.map(r =>
      `- ${r.material.name} ${r.material.quantity ?? ''}${r.material.unit || ''}` +
      (r.material.estPrice ? ` (예상 ${won(r.material.estPrice)}원)` : '') +
      ` / ${sessionTitle(r.session)} ${fmtDate(r.session.date)}`
    ).join('\n');
    try {
      await navigator.clipboard.writeText(`[구매 목록] ${todayYmd()}\n${text}`);
      toastOk('구매 목록을 복사했습니다.');
    } catch {
      toastError('복사하지 못했습니다.');
    }
  }

  render();

  const head = [
    el('h1', { text: '준비물·구매' }),
    el('span', { class: 'sub', text: '모든 주차의 준비물을 한 곳에서 확인하고 구매 상태를 관리합니다.' }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn-sm', onclick: () => ctx.reload() }, ['새로고침'])
  ];

  return {
    head,
    body: el('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } }, [
      statsRow, tableCard
    ]),
    fixed: true
  };
}
