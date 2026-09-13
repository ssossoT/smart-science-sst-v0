// 학생 소감 요약 (관리자 전용)
// 개인 식별정보(이름/학번/UID)는 전달받지 않으며, 서버에서도 한 번 더 제거한다.
import { methodGuard, readBody, ok, fail, requireAdmin, rateLimit } from '../_lib/http.js';
import { generateJson, BASE_SYSTEM } from '../_lib/gemini.js';

const schema = {
  type: 'object',
  properties: {
    interesting: { type: 'array', items: { type: 'string' } },
    difficult: { type: 'array', items: { type: 'string' } },
    learned: { type: 'array', items: { type: 'string' } },
    wishNext: { type: 'array', items: { type: 'string' } },
    overall: { type: 'string' },
    notableOpinions: { type: 'array', items: { type: 'string' } }
  },
  required: ['interesting', 'difficult', 'learned', 'wishNext', 'overall', 'notableOpinions']
};

/** 혹시 남아 있을 수 있는 개인정보 흔적을 제거한다. */
function sanitize(text) {
  return String(text || '')
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, '')            // 이메일
    .replace(/\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '') // 휴대전화
    .replace(/\b\d{5,}\b/g, '')                            // 학번 등 긴 숫자
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (!rateLimit('gem:' + session.uid, { limit: 30, windowMs: 300_000 })) {
    return fail(res, 429, '요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  }

  const b = await readBody(req);
  const entries = Array.isArray(b.entries) ? b.entries.slice(0, 60) : [];
  const lines = [];
  entries.forEach((entry, i) => {
    const answers = Array.isArray(entry?.answers) ? entry.answers : [];
    const cleaned = answers.map(sanitize).filter(Boolean);
    if (!cleaned.length && entry?.rating == null) return;
    const rating = Number(entry?.rating);
    lines.push(`[응답 ${i + 1}]${Number.isFinite(rating) && rating > 0 ? ` (만족도 ${rating})` : ''}\n${cleaned.join('\n')}`);
  });

  if (lines.length < 1) return fail(res, 400, '요약할 보고서가 없습니다.');

  const prompt = [
    b.title ? `활동명: ${String(b.title).slice(0, 100)}` : '',
    `제출된 학생 응답 ${lines.length}건 (익명):`,
    '',
    lines.join('\n\n').slice(0, 12000),
    '',
    '위 응답들을 교사가 참고할 수 있도록 요약해 주세요.',
    '- 응답을 그대로 길게 옮겨 적지 말고, 공통된 흐름을 정리해 주세요.',
    '- notableOpinions 에는 소수 의견이나 눈에 띄는 제안을 2~3개만 짧게 적어 주세요.',
    '- 특정 학생을 추측할 수 있는 표현은 쓰지 마세요.',
    '- overall 은 3문장 이내로 전체 반응을 정리해 주세요.'
  ].filter(Boolean).join('\n');

  try {
    const data = await generateJson({ system: BASE_SYSTEM, prompt, schema, temperature: 0.4 });
    return ok(res, { data, count: lines.length });
  } catch (e) {
    return fail(res, 502, '학생 소감 요약을 불러오지 못했습니다.', e);
  }
}
