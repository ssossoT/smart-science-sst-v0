/* ==========================================================================
   영상 검색 모달
   검색 버튼을 눌렀을 때만 서버를 호출한다. (자동 검색하지 않음)
   API KEY 는 서버에만 있으며 브라우저로 내려오지 않는다.
   ========================================================================== */

import { el, mount, openModal, busy, emptyState, extLink } from '../ui.js';
import { callApi } from '../firebase-service.js';

export function openVideoSearch({ defaultQuery = '', onPick }) {
  const input = el('input', {
    class: 'input', type: 'search', placeholder: '검색어', value: defaultQuery
  });
  const searchBtn = el('button', { class: 'btn btn-primary' }, ['영상 검색']);
  const results = el('div');
  const closeBtn = el('button', { class: 'btn' }, ['닫기']);

  const modal = openModal({
    title: '영상 검색',
    size: 'xwide',
    body: el('div', {}, [
      el('div', { class: 'flex gap-8 mb-12' }, [
        el('div', { class: 'grow' }, [input]),
        searchBtn
      ]),
      results
    ]),
    footer: [el('div', { class: 'grow' }), closeBtn]
  });
  closeBtn.addEventListener('click', () => modal.close());

  mount(results, emptyState('검색어를 입력하고 [영상 검색] 을 눌러 주세요.',
    '선생님이 선택한 영상만 학생 화면에 표시됩니다.'));

  function renderItems(items) {
    if (!items.length) {
      mount(results, emptyState('검색 결과가 없습니다.', '검색어를 바꿔서 다시 시도해 주세요.'));
      return;
    }
    mount(results, el('div', { class: 'video-grid' }, items.map(v =>
      el('div', { class: 'video-card' }, [
        el('div', { class: 'thumb' }, [
          v.thumbnail ? el('img', { src: v.thumbnail, alt: '', loading: 'lazy' }) : null,
          v.duration ? el('span', { class: 'dur', text: v.duration }) : null
        ]),
        el('div', { class: 'meta' }, [
          el('div', { class: 'vt', text: v.title }),
          el('div', { class: 'vc', text: v.channelTitle })
        ]),
        el('div', { class: 'acts' }, [
          extLink(v.url, 'YouTube 열기', 'btn btn-sm grow'),
          el('button', {
            class: 'btn btn-sm btn-primary',
            onclick: () => { onPick(v); }
          }, ['선택'])
        ])
      ])
    )));
  }

  async function search() {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    const restore = busy(searchBtn, '검색 중');
    mount(results, el('div', { class: 'flex items-center gap-10 muted', style: { padding: '28px 8px' } }, [
      el('span', { class: 'spinner' }), el('span', { text: '영상을 찾는 중입니다…' })
    ]));
    try {
      const res = await callApi('/api/youtube/search', { q, maxResults: 8 });
      renderItems(res.items || []);
    } catch (e) {
      mount(results, el('div', { class: 'empty' }, [
        el('strong', { text: e?.message || '영상 검색 중 오류가 발생했습니다.' }),
        el('button', { class: 'btn mt-8', onclick: search }, ['다시 시도'])
      ]));
    } finally {
      restore();
    }
  }

  searchBtn.addEventListener('click', search);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

  return modal;
}
