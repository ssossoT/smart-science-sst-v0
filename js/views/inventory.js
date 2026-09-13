/* ==========================================================================
   재고 - 빠르게 "있다 / 더 사야 한다" 를 확인하는 것이 목적
   ========================================================================== */

import {
  el, mount, toastOk, toastError, emptyState, confirmDialog, debounce
} from '../ui.js';
import { store, refreshInventory } from '../store.js';
import {
  INVENTORY_CATEGORIES, newItem, isLow, expiryState,
  saveInventoryItem, deleteInventoryItem
} from '../inventory-service.js';

export async function renderInventory(ctx) {
  let filter = 'all';
  let search = '';
  const card = el('div', { class: 'card' });

  const save = debounce(async (id, patch) => {
    try {
      await saveInventoryItem(id, patch);
      const item = store.inventory.find(i => i.id === id);
      if (item) Object.assign(item, patch);
      toastOk('저장했습니다.');
    } catch (e) {
      console.error('[inventory] 저장 실패', e);
      toastError('저장하지 못했습니다.');
    }
  }, 600);

  function passes(item) {
    if (search) {
      const q = search.replace(/\s/g, '').toLowerCase();
      const hay = `${item.name}${item.category}${item.location}`.replace(/\s/g, '').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === 'low') return isLow(item);
    if (filter === 'expiry') return Boolean(expiryState(item));
    if (filter !== 'all') return item.category === filter;
    return true;
  }

  function render() {
    const list = store.inventory.filter(passes);
    const lowCount = store.inventory.filter(isLow).length;
    const expCount = store.inventory.filter(i => expiryState(i)).length;

    const filterBar = el('div', { class: 'filterbar' }, [
      el('button', { class: `chip ${filter === 'all' ? 'on' : ''}`, onclick: () => { filter = 'all'; render(); } }, ['전체']),
      el('button', { class: `chip ${filter === 'low' ? 'on' : ''}`, onclick: () => { filter = 'low'; render(); } }, [`부족 ${lowCount}`]),
      el('button', { class: `chip ${filter === 'expiry' ? 'on' : ''}`, onclick: () => { filter = 'expiry'; render(); } }, [`유효기간 ${expCount}`]),
      el('span', { style: { width: '6px' } }),
      ...INVENTORY_CATEGORIES.map(c => el('button', {
        class: `chip ${filter === c ? 'on' : ''}`, onclick: () => { filter = c; render(); }
      }, [c])),
      el('div', { class: 'spacer grow' }),
      (() => {
        const s = el('input', { class: 'input input-sm', type: 'search', placeholder: '물품명·보관장소', style: { width: '170px' }, value: search });
        s.addEventListener('input', debounce(() => { search = s.value; render(); }, 250));
        return s;
      })()
    ]);

    let body;
    if (!list.length) {
      body = emptyState(
        store.inventory.length ? '해당하는 재고가 없습니다.' : '등록된 재고가 없습니다.',
        '자주 쓰는 시약과 기구를 등록해 두면 구매 판단이 빨라집니다.',
        el('button', { class: 'btn btn-primary mt-8', onclick: addItem }, ['+ 재고 추가'])
      );
    } else {
      const mk = (item, key, opts = {}) => {
        const input = el('input', { class: 'input input-sm', value: item[key] ?? '', ...opts });
        input.addEventListener('change', () => {
          const v = opts.type === 'number' ? (input.value === '' ? 0 : Number(input.value)) : input.value;
          item[key] = v;
          save(item.id, { [key]: v });
        });
        return input;
      };

      body = el('div', { class: 'card-body flush table-wrap scroll-y' },
        el('table', { class: 'tbl' }, [
          el('thead', {}, el('tr', {}, [
            el('th', { text: '물품명' }),
            el('th', { style: { width: '116px' }, text: '분류' }),
            el('th', { class: 'num', style: { width: '78px' }, text: '수량' }),
            el('th', { style: { width: '62px' }, text: '단위' }),
            el('th', { class: 'num', style: { width: '82px' }, text: '최소 보유' }),
            el('th', { style: { width: '110px' }, text: '보관장소' }),
            el('th', { style: { width: '124px' }, text: '유효기간' }),
            el('th', { text: '메모' }),
            el('th', { style: { width: '40px' } })
          ])),
          el('tbody', {}, list.map(item => {
            const low = isLow(item);
            const exp = expiryState(item);
            const cat = el('select', { class: 'select input-sm' },
              INVENTORY_CATEGORIES.map(c => el('option', { value: c, selected: item.category === c, text: c })));
            cat.addEventListener('change', () => { item.category = cat.value; save(item.id, { category: cat.value }); render(); });

            return el('tr', {}, [
              el('td', {}, [
                el('div', { class: 'flex items-center gap-6' }, [
                  mk(item, 'name'),
                  low ? el('span', { class: 'badge danger', text: '부족' }) : null,
                  exp === 'expired' ? el('span', { class: 'badge danger', text: '기한 지남' })
                    : exp === 'soon' ? el('span', { class: 'badge warn', text: '기한 임박' }) : null
                ])
              ]),
              el('td', {}, [cat]),
              el('td', {}, [mk(item, 'quantity', { type: 'number', min: 0, step: 'any', class: 'input input-sm right' })]),
              el('td', {}, [mk(item, 'unit')]),
              el('td', {}, [mk(item, 'minQuantity', { type: 'number', min: 0, step: 'any', class: 'input input-sm right' })]),
              el('td', {}, [mk(item, 'location')]),
              el('td', {}, [mk(item, 'expiry', { type: 'date' })]),
              el('td', {}, [mk(item, 'memo')]),
              el('td', {}, [el('button', {
                class: 'btn-icon', title: '삭제',
                onclick: async () => {
                  const yes = await confirmDialog({
                    title: '재고 삭제',
                    message: `"${item.name || '이름 없음'}" 항목을 삭제합니다.\n되돌릴 수 없습니다. 삭제할까요?`,
                    confirmText: '삭제', danger: true
                  });
                  if (!yes) return;
                  try {
                    await deleteInventoryItem(item.id);
                    await refreshInventory();
                    render();
                    toastOk('삭제했습니다.');
                  } catch (e) {
                    console.error('[inventory] 삭제 실패', e);
                    toastError('삭제하지 못했습니다.');
                  }
                }
              }, ['✕'])])
            ]);
          }))
        ])
      );
    }

    mount(card,
      el('div', { class: 'card-head' }, [
        el('h2', { text: '재고' }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'badge', text: `${store.inventory.length}품목` }),
        lowCount ? el('span', { class: 'badge danger', text: `부족 ${lowCount}` }) : null,
        el('button', { class: 'btn btn-sm btn-primary', onclick: addItem }, ['+ 재고 추가'])
      ]),
      filterBar,
      body
    );
  }

  async function addItem() {
    const item = newItem({ name: '새 물품' });
    try {
      await saveInventoryItem(item.id, item);
      await refreshInventory();
      render();
      toastOk('재고를 추가했습니다.');
    } catch (e) {
      console.error('[inventory] 추가 실패', e);
      toastError('추가하지 못했습니다.');
    }
  }

  render();

  const head = [
    el('h1', { text: '재고' }),
    el('span', { class: 'sub', text: '수량을 고치면 바로 저장됩니다.' }),
    el('div', { class: 'spacer' })
  ];

  return { head, body: card, fixed: true };
}
