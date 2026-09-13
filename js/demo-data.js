/* ==========================================================================
   초기 샘플 데이터 (교사 화면 · 학생 화면 공용)
   --------------------------------------------------------------------------
   실제 서버(Firebase) 없이 이 브라우저에만 데이터를 저장하는 버전이다.
   여기 있는 값은 처음 접속했을 때 한 번만 채워지는 "초기값"이고,
   이후 교사 화면에서 저장·수정한 내용은 firebase-service.js 가 관리하는
   localStorage 저장소에 실제로 남는다 (js/firebase-service.js 참고).

   필드 이름은 실제 문서 구조(DEFAULT_SETTINGS, sessions, students, inventory)와
   맞춰 뒀다. 다르면 화면에 값이 비어 보인다.
   ========================================================================== */

const YEAR = new Date().getFullYear();

/* ── 교사 로그인 계정 (고정 1개) ─────────────────────────────────────── */

export const TEACHER_ACCOUNT = { name: '성소연', password: '0000' };

/* ── 학생 초기 계정 ──────────────────────────────────────────────────── */

export const INITIAL_STUDENTS = [
  { uid: 's1', displayName: '홍길동', loginName: 'gildong',  studentNo: '10315', status: 'active', password: '0000', year: YEAR, createdAt: new Date().toISOString() },
  { uid: 's2', displayName: '김철수', loginName: 'chulsoo',  studentNo: '20107', status: 'active', password: '0000', year: YEAR, createdAt: new Date().toISOString() },
  { uid: 's3', displayName: '이영희', loginName: 'younghee', studentNo: '10222', status: 'active', password: '0000', year: YEAR, createdAt: new Date().toISOString() }
];

/* ── 운영 설정 ───────────────────────────────────────────────────────── */

export const INITIAL_SETTINGS = {
  siteName: '스마트과학반 LAB',
  schoolName: '○○중학교',
  teacherName: TEACHER_ACCOUNT.name,
  year: YEAR,
  periodStart: `${YEAR}-09-02`,
  periodEnd: `${YEAR}-11-11`,
  totalBudget: 1000000,
  studentLogoutMinutes: 30,
  geminiEnabled: true,
  youtubeEnabled: true,
  intro: '실험으로 과학을 직접 확인하는 중학교 방과후 활동입니다.'
};

/* ── 수업(세션) ──────────────────────────────────────────────────────── */
/* 학생 화면에서 바로 보여줄 수 있도록 studentGuide/publicMaterials 등
   공개용 필드까지 함께 채워 둔다. */

export const INITIAL_SESSIONS = [
  {
    id: 'demo-01', year: YEAR, date: `${YEAR}-09-02`, periodLabel: '1~2차시',
    title: 'OT + 그래비트랙스 ①', field: '물리', status: 'done', isPublic: true, order: 10,
    studentGuide: '방과후 과학반 오리엔테이션! 그래비트랙스 트랙을 함께 만들어 보며 중력과 운동에너지를 관찰해요.',
    publicMaterials: [{ name: '그래비트랙스 세트', quantity: 1, unit: '세트' }],
    publicResult: '팀별로 만든 트랙에서 구슬이 끝까지 도달하는 데 걸린 시간을 측정했습니다.',
    principle: '구슬이 내려가며 위치에너지가 운동에너지로 바뀌는 과정을 관찰할 수 있습니다.'
  },
  {
    id: 'demo-02', year: YEAR, date: `${YEAR}-09-09`, periodLabel: '3~4차시',
    title: '그래비트랙스 ②', field: '물리', status: 'done', isPublic: true, order: 20,
    studentGuide: '지난주 만든 트랙을 더 길고 재미있게 확장해 봅시다. 루프와 점프 구간을 추가해요.',
    publicMaterials: [{ name: '그래비트랙스 확장 세트', quantity: 1, unit: '세트' }],
    publicResult: '루프 구간을 통과시키는 데 성공한 팀은 2팀이었습니다.',
    principle: '루프를 통과하려면 충분한 속력(운동에너지)이 필요합니다.'
  },
  {
    id: 'demo-03', year: YEAR, date: `${YEAR}-09-16`, periodLabel: '5~6차시',
    title: '코끼리 치약 만들기', field: '화학', status: 'done', isPublic: true, order: 30,
    studentGuide: '거품이 현실판 분수처럼 솟아오르는 화학 반응 실험이에요! 안전 장갑을 착용하고, 과산화수소수와 이스트를 섞어 반응을 관찰해봅시다.',
    publicMaterials: [
      { name: '페트병 (1L)', quantity: 1, unit: '개' },
      { name: '과산화수소수 (30%)', quantity: 1, unit: '병' },
      { name: '드라이이스트', quantity: 1, unit: '봉' }
    ],
    publicResult: '색을 넣은 팀마다 서로 다른 색깔의 거품 기둥이 만들어졌습니다.',
    principle: '이스트 속 카탈레이스 효소가 과산화수소를 물과 산소로 빠르게 분해하면서 거품이 발생합니다.'
  },
  {
    id: 'demo-04', year: YEAR, date: `${YEAR}-09-23`, periodLabel: '',
    title: '창의적체험활동의 날 · 방과후 없음', field: '기타', noClass: true, status: 'draft', isPublic: false, order: 40
  },
  {
    id: 'demo-05', year: YEAR, date: `${YEAR}-09-30`, periodLabel: '7~8차시',
    title: '아이스크림 만들기', field: '화학', status: 'draft', isPublic: false, order: 50,
    studentGuide: '소금과 얼음을 이용해 우유를 얼려 아이스크림을 만들어 봅니다.'
  }
];

/* ── 교사 전용 필드 (준비물 원가, 진행 메모 등) ─────────────────────── */

export const INITIAL_PRIVATES = new Map(INITIAL_SESSIONS.map(s => [s.id, {
  goal: '', plan: '', runPlan: '', checklist: [], liveNotes: [], attendance: {},
  safety: '', planB: '', result: '', goodPoints: '', badPoints: '',
  nextTime: '', usage: '', estimatedCost: 8000, actualCost: 0,
  reflection: '', reflectionSummary: '', portfolioDraft: null, recommend: '',
  materials: [
    { id: 'dm1', name: '페트병', quantity: 20, unit: '개', category: '소모품', status: '준비 완료', estPrice: 8000, actualPrice: 8000, vendor: '', pub: true, note: '' },
    { id: 'dm2', name: '과산화수소수', quantity: 2, unit: '병', category: '시약', status: '구매 필요', estPrice: 12000, actualPrice: '', vendor: '', pub: true, note: '' }
  ]
}]));

/* ── 재고 ────────────────────────────────────────────────────────────── */

export const INITIAL_INVENTORY = [
  { id: 'inv-01', name: '페트병 (1L)', category: '소모품', quantity: 20, minQuantity: 10, unit: '개', location: '과학실 선반 A', expiry: '', memo: '' },
  { id: 'inv-02', name: '과산화수소수 (30%)', category: '시약', quantity: 2, minQuantity: 3, unit: '병', location: '약품 보관함', expiry: '', memo: '' },
  { id: 'inv-03', name: '드라이이스트', category: '식재료', quantity: 5, minQuantity: 2, unit: '봉', location: '냉장고', expiry: '', memo: '' }
];
