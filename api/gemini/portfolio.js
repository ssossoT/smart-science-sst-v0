// 포트폴리오 초안 생성 (관리자 전용)
import { methodGuard, readBody, ok, fail, requireAdmin, rateLimit } from '../_lib/http.js';
import { generateJson, BASE_SYSTEM } from '../_lib/gemini.js';

const schema = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    operation: { type: 'string' },
    studentResponse: { type: 'string' },
    educationalMeaning: { type: 'string' },
    teacherReflection: { type: 'string' },
    improvements: { type: 'array', items: { type: 'string' } }
  },
  required: ['overview', 'operation', 'studentResponse', 'educationalMeaning', 'teacherReflection', 'improvements']
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

  const clip = (v, n = 1500) => String(v || '').slice(0, n);
  const prompt = [
    `활동명: ${title}`,
    b.date ? `운영일: ${b.date}` : '',
    b.periodLabel ? `차시: ${b.periodLabel}` : '',
    b.field ? `분야: ${b.field}` : '',
    b.goal ? `활동 목표: ${clip(b.goal, 800)}` : '',
    b.result ? `실제 결과: ${clip(b.result)}` : '',
    b.avgRating ? `학생 평균 만족도: ${b.avgRating} / 5` : '',
    b.reflectionSummary ? `학생 소감 요약(익명): ${clip(b.reflectionSummary, 2000)}` : '',
    b.teacherMemo ? `교사 메모: ${clip(b.teacherMemo)}` : '',
    b.nextTime ? `다음 운영 개선점: ${clip(b.nextTime)}` : '',
    b.principle ? `과학적 원리: ${clip(b.principle, 800)}` : '',
    '',
    '위 기록을 바탕으로 교사 포트폴리오에 넣을 활동 정리 글의 초안을 작성해 주세요.',
    '- 실제로 운영한 수업을 교사가 스스로 정리한 담담한 서술체(~하였다, ~였다)로 써 주세요.',
    '- 각 항목은 3~5문장 정도로 작성해 주세요.',
    '- 주어진 기록에 없는 사실을 지어내지 마세요. 근거가 없으면 해당 항목을 짧게 쓰세요.',
    '- 학생 개인을 특정할 수 있는 표현은 쓰지 마세요.',
    '- 홍보성 표현이나 과장된 표현은 쓰지 마세요.'
  ].filter(Boolean).join('\n');

  try {
    const data = await generateJson({ system: BASE_SYSTEM, prompt, schema, temperature: 0.5 });
    return ok(res, { data });
  } catch (e) {
    return fail(res, 502, '포트폴리오 초안을 불러오지 못했습니다.', e);
  }
}
