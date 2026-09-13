/* ==========================================================================
   로컬 확인용 간단 서버
   --------------------------------------------------------------------------
   index.html 을 더블클릭해서 열면 화면이 깨집니다.
   브라우저가 file:// 에서는 보안 정책 때문에 ES 모듈(js)과 css 를 불러오지 않기 때문입니다.
   반드시 아래처럼 주소(http://)로 열어야 합니다.

       npm start
       → 브라우저에서 http://localhost:4173 접속

   ※ 이 서버는 화면 확인용입니다. /api (초안 만들기, 영상 검색, 학생 계정 관리)까지
     함께 테스트하려면 `vercel dev` 를 사용하세요. README 11장을 참고하세요.
   ========================================================================== */

import http from 'http';
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const port = Number(process.argv[2] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.pdf':  'application/pdf',
  '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  let rel;
  try {
    rel = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (rel === '/') rel = '/index.html';

  const file = path.resolve(root, '.' + rel);
  if (!file.startsWith(root)) {           // 상위 폴더 접근 차단
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('찾을 수 없습니다: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}).listen(port, () => {
  console.log('');
  console.log('  스마트과학반 LAB 로컬 서버가 켜졌습니다.');
  console.log('  브라우저에서 아래 주소를 여세요.');
  console.log('');
  console.log('      http://localhost:' + port);
  console.log('');
  console.log('  끄려면 이 창에서 Ctrl + C 를 누르세요.');
  console.log('');
});
