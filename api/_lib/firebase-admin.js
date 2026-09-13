// Firebase Admin SDK 초기화 (서버 전용)
// 필요한 Vercel 환경변수:
//   FIREBASE_ADMIN_PROJECT_ID
//   FIREBASE_ADMIN_CLIENT_EMAIL
//   FIREBASE_ADMIN_PRIVATE_KEY
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let cached = null;

function normalizePrivateKey(raw) {
  if (!raw) return '';
  let key = raw.trim();
  // Vercel 환경변수에 따옴표로 감싸서 붙여넣은 경우 제거
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // 환경변수에 \n 이 문자 그대로 들어간 경우 실제 줄바꿈으로 변환
  return key.replace(/\\n/g, '\n');
}

export function adminReady() {
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );
}

export function getAdmin() {
  if (cached) return cached;
  if (!adminReady()) {
    const err = new Error('FIREBASE_ADMIN_NOT_CONFIGURED');
    err.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
    throw err;
  }
  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY)
        })
      });
  cached = { app, auth: getAuth(app), db: getFirestore(app) };
  return cached;
}
