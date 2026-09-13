/* ==========================================================================
   재고 관리
   완전한 재고관리 시스템을 목표로 하지 않는다.
   "지금 있는가 / 더 사야 하는가" 를 빠르게 판단하는 것이 목적이다.
   ========================================================================== */

import {
  listInventory, saveInventoryItem, deleteInventoryItem
} from './firebase-service.js';
import { uid, todayYmd } from './ui.js';

export const INVENTORY_CATEGORIES = ['시약', '실험기구', '소모품', '안전용품', '전자·디지털', '식재료', '기타'];

export const EMPTY_ITEM = {
  name: '',
  category: '소모품',
  quantity: 0,
  unit: '개',
  location: '',
  expiry: '',
  minQuantity: 0,
  memo: ''
};

export { listInventory, saveInventoryItem, deleteInventoryItem };

export function newItem(patch = {}) {
  return { id: uid('inv'), ...EMPTY_ITEM, ...patch, updatedAt: new Date().toISOString() };
}

/** 최소 보유량 미만인지 */
export function isLow(item) {
  const min = Number(item?.minQuantity) || 0;
  if (min <= 0) return false;
  return (Number(item?.quantity) || 0) < min;
}

/** 유효기간이 지났거나 30일 내에 만료되는지 */
export function expiryState(item) {
  const ymd = item?.expiry;
  if (!ymd) return null;
  const today = todayYmd();
  if (ymd < today) return 'expired';
  const d = (new Date(ymd + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000;
  return d <= 30 ? 'soon' : null;
}

/**
 * 준비물 한 줄에 대해 재고 상황을 판단한다.
 * @param {object} material 수업 준비물 { name, quantity, inventoryId }
 * @param {Map<string,object>} inventoryById
 */
export function checkAgainstInventory(material, inventoryById) {
  const item = material?.inventoryId ? inventoryById.get(material.inventoryId) : null;
  if (!item) return { linked: false, enough: null, item: null, shortage: 0 };
  const need = Number(material.quantity) || 0;
  const have = Number(item.quantity) || 0;
  return {
    linked: true,
    item,
    enough: have >= need,
    shortage: Math.max(0, need - have)
  };
}

/** 이름으로 재고 후보를 찾는다 (연결 도우미) */
export function suggestInventory(name, inventory) {
  const key = String(name || '').replace(/\s/g, '').toLowerCase();
  if (!key) return [];
  return inventory
    .filter(i => String(i.name || '').replace(/\s/g, '').toLowerCase().includes(key))
    .slice(0, 6);
}

/**
 * 준비물을 '사용 완료' 로 바꿀 때 재고에서 실제 사용량을 차감한다.
 * 자동으로 부르지 않고, 선생님이 [재고 차감] 을 눌렀을 때만 실행한다.
 */
export async function consumeFromInventory(materials, inventoryById) {
  const updates = [];
  for (const m of materials) {
    if (!m.inventoryId) continue;
    const item = inventoryById.get(m.inventoryId);
    if (!item) continue;
    const used = Number(m.usedQuantity ?? m.quantity) || 0;
    if (used <= 0) continue;
    const next = Math.max(0, (Number(item.quantity) || 0) - used);
    updates.push({ id: item.id, name: item.name, before: item.quantity, after: next });
    await saveInventoryItem(item.id, { quantity: next });
    item.quantity = next;
  }
  return updates;
}
