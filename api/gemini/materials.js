// 준비물 초안 생성 (관리자 전용)
import { methodGuard, readBody, ok, fail, requireAdmin, rateLimit } from '../_lib/http.js';
import { generateJson, BASE_SYSTEM } from '../_lib/gemini.js';

const schema = {
  type: 'object',
  properties: {
    materials: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          category: { type: 'string', enum: ['소모품', '실험기구', '안전용품', '기타'] },
          note: { type: 'string' }
        },
        required: ['name', 'quantity', 'unit', 'category']
      }
    },
    safetyItems: { type: 'array', items: { type: 'string' } },
    teacherPreparation: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' }
  },
  required: ['materials', 'safetyItems', 'teacherPreparation']
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

  const prompt = [
    `활동명: ${title}`,
    b.grade ? `대상: ${b.grade}` : '대상: 중학교 2학년',
    `학생 수: ${Number(b.studentCount) || 8}명`,
    b.groupType ? `조 편성: ${b.groupType}` : '조 편성: 2인 1조',
    `활동 시간: ${Number(b.minutes) || 90}분`,
    b.note ? `추가 메모: ${String(b.note).slice(0, 500)}` : '',
    '',
    '위 방과후 과학 실험 활동에 필요한 준비물 목록을 작성해 주세요.',
    '- 학생 수와 조 편성을 고려해 실제 필요한 수량을 계산해 주세요.',
    '- quantity 는 숫자만, unit 은 개/병/L/mL/g/봉/세트 등 단위만 적어 주세요.',
    '- 학교에 흔히 있는 물품과 별도 구매가 필요한 물품을 note 에 구분해 적어 주세요.',
    '- safetyItems 에는 이 활동에서 반드시 지켜야 할 안전수칙을 적어 주세요.',
    '- teacherPreparation 에는 수업 전 교사가 미리 해둘 일을 적어 주세요.'
  ].filter(Boolean).join('\n');

  try {
    const data = await generateJson({ system: BASE_SYSTEM, prompt, schema, temperature: 0.4 });
    return ok(res, { data });
  } catch (e) {
    return fail(res, 502, '준비물 초안을 불러오지 못했습니다.', e);
  }
}
