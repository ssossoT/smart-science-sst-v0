// YouTube 영상 검색 (관리자 전용)
// YOUTUBE_API_KEY 는 이 파일 밖으로 나가지 않는다. 학생은 이 endpoint 를 호출할 수 없다.
import { methodGuard, readBody, ok, fail, requireAdmin, rateLimit } from '../_lib/http.js';

/** ISO8601 duration(PT1H2M3S) -> "1:02:03" */
function formatDuration(iso) {
  const m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return '';
  const h = Number(m[1] || 0), min = Number(m[2] || 0), s = Number(m[3] || 0);
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

async function callYouTube(path, params, key) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  url.searchParams.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    const text = await resp.text();
    if (!resp.ok) {
      const err = new Error('YOUTUBE_HTTP_' + resp.status);
      err.detail = text.slice(0, 400);
      err.status = resp.status;
      throw err;
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, ['POST', 'GET'])) return;
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (!rateLimit('yt:' + session.uid, { limit: 60, windowMs: 300_000 })) {
    return fail(res, 429, '검색 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
  }

  const body = req.method === 'POST' ? await readBody(req) : (req.query || {});
  const q = String(body.q || '').trim();
  if (!q) return fail(res, 400, '검색어를 입력해 주세요.');
  if (q.length > 120) return fail(res, 400, '검색어가 너무 깁니다.');

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return fail(res, 503, '영상 검색이 설정되지 않았습니다.', 'YOUTUBE_API_KEY missing');

  const maxResults = Math.min(Math.max(Number(body.maxResults) || 8, 1), 12);

  try {
    const search = await callYouTube('search', {
      part: 'snippet',
      q,
      type: 'video',
      safeSearch: 'strict',
      relevanceLanguage: 'ko',
      videoEmbeddable: 'true',
      maxResults
    }, key);

    const ids = (search.items || []).map(i => i.id?.videoId).filter(Boolean);
    if (!ids.length) return ok(res, { items: [] });

    const details = await callYouTube('videos', {
      part: 'contentDetails,snippet,statistics',
      id: ids.join(',')
    }, key);

    const byId = new Map((details.items || []).map(v => [v.id, v]));
    const items = ids.map(id => {
      const v = byId.get(id);
      const snip = v?.snippet || (search.items.find(i => i.id?.videoId === id)?.snippet) || {};
      const thumbs = snip.thumbnails || {};
      return {
        videoId: id,
        title: snip.title || '',
        channelTitle: snip.channelTitle || '',
        publishedAt: snip.publishedAt || '',
        thumbnail: (thumbs.medium || thumbs.high || thumbs.default || {}).url || '',
        duration: formatDuration(v?.contentDetails?.duration),
        url: `https://www.youtube.com/watch?v=${id}`
      };
    });

    return ok(res, { items });
  } catch (e) {
    if (e?.status === 403) {
      return fail(res, 502, '영상 검색 사용량이 초과되었거나 키 설정에 문제가 있습니다.', e.detail || e);
    }
    return fail(res, 502, '영상 검색 중 오류가 발생했습니다.', e.detail || e);
  }
}
