/* ==========================================================================
   2026 스마트과학반 전체 계획 - 초기 데이터
   설정 화면에서 [초기 일정 등록] 을 누르면 한 번만 생성된다.
   이미 존재하는 문서는 건드리지 않으므로 여러 번 눌러도 중복되지 않는다.
   ========================================================================== */

import {
  getDb, doc, getDoc, setDoc, writeBatch,
  DEFAULT_REPORT_QUESTIONS, DEFAULT_SETTINGS
} from './firebase-service.js';

export const SEED_YEAR = 2026;

/** 2026학년도 2학기 스마트과학반 운영 계획 (총 20차시) */
export const SEED_SESSIONS = [
  { key: '01', date: '2026-09-02', periodLabel: '1~2차시',   title: 'OT + 그래비트랙스 ①',            field: '물리' },
  { key: '02', date: '2026-09-09', periodLabel: '3~4차시',   title: '그래비트랙스 ②',                  field: '물리' },
  { key: '03', date: '2026-09-16', periodLabel: '5~6차시',   title: '코끼리 치약',                     field: '화학' },
  { key: '04', date: '2026-09-23', periodLabel: '',          title: '창의적체험활동의 날 · 방과후 없음', field: '기타', noClass: true },
  { key: '05', date: '2026-09-30', periodLabel: '7~8차시',   title: '아이스크림 만들기',               field: '화학' },
  { key: '06', date: '2026-10-07', periodLabel: '9~10차시',  title: 'DNA 추출 + 소장',                 field: '생명' },
  { key: '07', date: '2026-10-14', periodLabel: '11~12차시', title: '드라이아이스 DAY',                field: '화학' },
  { key: '08', date: '2026-10-21', periodLabel: '13~14차시', title: '시험 전 자습',                    field: '기타' },
  { key: '09', date: '2026-10-28', periodLabel: '',          title: '중간고사 · 방과후 없음',           field: '기타', noClass: true },
  { key: '10', date: '2026-11-04', periodLabel: '15~18차시', title: '천문대 체험 4시간',               field: '천문' },
  { key: '11', date: '2026-11-11', periodLabel: '19~20차시', title: '가상 실험실 만들기 + 간식 파티',   field: '디지털' }
];

export function seedSessionId(key) {
  return `s${SEED_YEAR}-${key}`;
}

function buildSessionDoc(item, index) {
  return {
    year: SEED_YEAR,
    date: item.date,
    periodLabel: item.periodLabel || '',
    title: item.title,
    field: item.field || '기타',
    order: (index + 1) * 10,
    noClass: Boolean(item.noClass),

    status: 'draft',
    isPublic: false,

    // 학생 공개 영역 (선생님이 입력하면 학생 화면에 그대로 연동된다)
    studentGuide: '',
    publicMaterials: [],
    worksheets: [],
    videos: [],
    driveLink: '',
    photos: [],
    coverPhoto: '',
    publicResult: '',
    principle: '',
    relatedVideos: [],
    contest: { enabled: false, visible: false, unit: '초', rows: [] },
    reportQuestions: DEFAULT_REPORT_QUESTIONS.map(q => ({ ...q })),

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 초기 일정 등록.
 * @returns {Promise<{created:number, skipped:number}>}
 */
export async function seedSchedule() {
  const db = getDb();
  let created = 0, skipped = 0;

  // 기존 문서 확인 (중복 생성 방지)
  const checks = await Promise.all(
    SEED_SESSIONS.map(async (item) => {
      const id = seedSessionId(item.key);
      const snap = await getDoc(doc(db, 'sessions', id));
      return { id, item, exists: snap.exists() };
    })
  );

  const batch = writeBatch(db);
  checks.forEach(({ id, item, exists }, index) => {
    if (exists) { skipped += 1; return; }
    batch.set(doc(db, 'sessions', id), buildSessionDoc(item, index));
    created += 1;
  });

  if (created > 0) await batch.commit();
  return { created, skipped };
}

/** settings/site 문서가 없으면 기본값으로 만든다. */
export async function seedSettingsIfMissing() {
  const ref = doc(getDb(), 'settings', 'site');
  const snap = await getDoc(ref);
  if (snap.exists()) return false;
  await setDoc(ref, { ...DEFAULT_SETTINGS });
  return true;
}
