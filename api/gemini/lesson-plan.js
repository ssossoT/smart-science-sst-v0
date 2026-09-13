// 수업 계획 초안 생성 (관리자 전용)
import { methodGuard, readBody, ok, fail, requireAdmin, rateLimit } from '../_lib/http.js';
import { generateJson, BASE_SYSTEM } from '../_lib/gemini.js';

const step = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    minutes: { type: 'number' },
    detail: { type: 'string' }
  },
  required: ['title', 'minutes', 'detail']
};

const schema = {
  type: 'object',
  properties: {
    goals: { type: 'array', items: { type: 'string' } },
    intro: { type: 'array', items: step },
    main: { type: 'array', items: step },
    wrapUp: { type: 'array', items: step },
    totalMinutes: { type: 'number' },
    safety: { type: 'array', items: { type: 'string' } },
    planB: { type: 'string' }
  },
  required: ['goals', 'intro', 'main', 'wrapUp', 'totalMinutes', 'safety', 'planB']
};

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (!rateLimit('gem:' + session.uid, { limit: 30, windowMs: 300_000 })) {
    return fail(res, 429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  }

  const b = await readBody(req);
  const title = String(b.title || '').trim();
  if (!title) return fail(res, 400, '활동명을 입력해 주세요.');

  const materials = Array.isArray(b.materials)
    ? b.materials.slice(0, 40).map(m => `- ${m.name} ${m.quantity ?? ''}${m.unit ?? ''}`).join('\n')
    : '';

  const prompt = [
    `활동명: ${title}`,
    b.field ? `분야: ${b.field}` : '',
    b.grade ? `대상: ${b.grade}` : '대상: 중학교 2학년',
    `학생 수: ${Number(b.studentCount) || 8}명`,
    b.groupType ? `조 편성: ${b.groupType}` : '조 편성: 2인 1조',
    `활동 시간: ${Number(b.minutes) || 90}분`,
    materials ? `현재 준비물:\n${materials}` : '',
    b.note ? `추가 메모: ${String(b.note).slice(0, 500)}` : '',
    '',
    '위 조건으로 방과후 과학 수업 운영 계획을 작성해 주세요.',
    '- intro(도입), main(주요 활동), wrapUp(마무리) 각 단계를 시간과 함께 구체적으로 적어 주세요.',
    '- 모든 단계의 minutes 합이 전체 활동 시간과 같도록 맞춰 주세요.',
    '- planB 에는 실험이 실패하거나 시간이 부족할 때의 대안을 적어 주세요.',
    '- 소수 인원(8명 내외) 방과후 수업임을 고려해 주세요.'
  ].filter(Boolean).join('\n');

  try {
    const data = await generateJson({ system: BASE_SYSTEM, prompt, schema, temperature: 0.6 });
    return ok(res, { data });
  } catch (e) {
    return fail(res, 502, '수업 계획 초안을 불러오지 못했습니다.', e);
  }
}
