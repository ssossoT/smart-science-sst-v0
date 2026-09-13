/* ==========================================================================
   Firebase 웹 설정
   --------------------------------------------------------------------------
   여기 들어가는 값은 브라우저에 공개되어도 되는 값입니다.
   (실제 보호는 Firestore/Storage 보안 규칙이 담당합니다.)

   ▶ 값 얻는 곳
     Firebase Console → 프로젝트 설정(톱니) → 일반 → 내 앱 → 웹 앱 → SDK 설정 및 구성
     "구성(Config)" 을 선택하면 아래와 같은 객체가 나옵니다. 그대로 붙여넣으세요.

   ▶ GEMINI_API_KEY, YOUTUBE_API_KEY 는 이 파일에 절대 넣지 마세요.
     그 두 키는 Vercel 환경변수에만 저장하고 /api 서버에서만 사용합니다.
   ========================================================================== */

export const firebaseConfig = {
  apiKey: "AIzaSyBiJ9pIHeeRCw5spDoCDTc3xMmaqdBPou4",
  authDomain: "extra-school-activity.firebaseapp.com",
  projectId: "extra-school-activity",
  storageBucket: "extra-school-activity.firebasestorage.app",
  messagingSenderId: "344545124234",
  appId: "1:344545124234:web:83e4608116417319c77273"
};

/** 설정이 실제로 채워졌는지 확인한다. */
export function isFirebaseConfigured() {
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
  return required.every(k => {
    const v = firebaseConfig[k];
    return typeof v === 'string' && v.length > 6 && !v.includes('여기에');
  });
}

/* SDK 버전을 올리려면 js/firebase-service.js 상단의 import URL
   (https://www.gstatic.com/firebasejs/10.14.1/...) 을 함께 수정하세요. */
