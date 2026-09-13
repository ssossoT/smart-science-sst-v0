// Gemini 호출 공통 모듈 (서버 전용)
// GEMINI_API_KEY 는 이 파일 밖으로 절대 나가지 않는다.
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'GeminiError';
    this.detail = detail;
  }
}

/**
 * JSON Schema 를 사용한 구조화 응답 요청.
 * @param {object} opts
 * @param {string} opts.system  역할 지시문
 * @param {string} opts.prompt  사용자 입력
 * @param {object} opts.schema  responseSchema (OpenAPI 3 subset)
 * @returns {Promise<object>} 파싱된 JSON
 */
export async function generateJson({ system, prompt, schema, temperature = 0.6 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError('GEMINI_API_KEY_MISSING');

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      responseMimeType: 'application/json',
      responseSchema: schema
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ]
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    throw new GeminiError('GEMINI_NETWORK', e?.message);
  }
  clearTimeout(timer);

  const text = await resp.text();
  if (!resp.ok) throw new GeminiError('GEMINI_HTTP_' + resp.status, text.slice(0, 500));

  let payload;
  try { payload = JSON.parse(text); } catch { throw new GeminiError('GEMINI_BAD_ENVELOPE', text.slice(0, 300)); }

  const candidate = payload?.candidates?.[0];
  if (!candidate) throw new GeminiError('GEMINI_NO_CANDIDATE', JSON.stringify(payload).slice(0, 300));
  if (candidate.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
    throw new GeminiError('GEMINI_BLOCKED_' + candidate.finishReason);
  }

  const raw = (candidate.content?.parts || []).map(p => p.text || '').join('').trim();
  if (!raw) throw new GeminiError('GEMINI_EMPTY');

  try {
    return JSON.parse(raw);
  } catch {
    // responseSchema 를 쓰면 대부분 순수 JSON 이지만, 혹시 모를 코드펜스를 정리한다.
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s >= 0 && e > s) {
      try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { /* fallthrough */ }
    }
    throw new GeminiError('GEMINI_BAD_JSON', raw.slice(0, 300));
  }
}

export const BASE_SYSTEM =
  '당신은 대한민국 중학교 과학 방과후 수업을 준비하는 교사를 돕는 실무 보조자입니다. ' +
  '결과는 한국어로, 학교 현장에서 바로 쓸 수 있는 간결하고 구체적인 표현으로 작성합니다. ' +
  '과장된 홍보 문구, 이모지, 불필요한 수식어를 쓰지 않습니다. ' +
  '안전에 위험한 내용(폭발물, 유독가스 발생, 고압, 강산·강염기 단독 취급 등)은 제안하지 않고, ' +
  '중학생이 교사 지도 아래 안전하게 수행 가능한 범위로만 작성합니다. ' +
  '주어진 JSON 스키마를 정확히 지켜 응답합니다.';

/** 사용자에게 보여줄 일반 메시지로 변환 (원문/키 노출 금지) */
export function userMessageFor(kind) {
  return `${kind}을(를) 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`;
}
