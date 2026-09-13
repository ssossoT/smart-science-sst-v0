// 간이보고서 질문 초안 생성 (관리자 전용)
import { methodGuard, readBody, ok, fail, requireAdmin, rateLimit } from '../_lib/http.js';
import { generateJson, BASE_SYSTEM } from '../_lib/gemini.js';

const schema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          type: { type: 'string', enum: ['long', 'short'] }
        },
        required: ['text', 'type']
      }
    }
  },
  required: ['questions']
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
    b.field ? `분야: ${b.field}` : '',
    b.goal ? `활동 목표: ${String(b.goal).slice(0, 400)}` : '',
    '',
    '이 활동을 마친 중학생이 작성할 간이보고서 질문을 3~5개 만들어 주세요.',
    '- 방과후 활동용 간단한 기록지 수준입니다. 정식 연구보고서 수준으로 어렵게 만들지 마세요.',
    '- 한 문장으로 짧고 분명하게 물어봐 주세요.',
    '- 관찰한 결과, 그렇게 된 까닭, 새롭게 알게 된 점이 고르게 들어가도록 해주세요.',
    '- type 은 서술형이면 long, 한 줄 답변이면 short 로 지정해 주세요.'
  ].filter(Boolean).join('\n');

  try {
    const data = await generateJson({ system: BASE_SYSTEM, prompt, schema, temperature: 0.5 });
    return ok(res, { data });
  } catch (e) {
    return fail(res, 502, '보고서 질문을 불러오지 못했습니다.', e);
  }
}
