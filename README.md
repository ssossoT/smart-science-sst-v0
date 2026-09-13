# 스마트과학반 LAB

중학교 방과후학교 **스마트과학반** 운영 관리 시스템입니다.

매주 반복되는 실험 계획 · 준비물 확인 · 구매 정리를 한 곳에서 처리하고,
수업이 끝나면 결과 · 사진 · 학생 소감 · 교사 성찰이 그대로 **교사 포트폴리오로 쌓이도록** 만들었습니다.

- **선생님용** — 수업 계획, 준비물·구매, 재고, 수업 기록, 학생 기록, 실험 보관함, 포트폴리오
- **학생용** — 일정, 오늘의 활동, 활동자료, 활동사진, 활동 결과, 간이보고서, 내 기록

선생님이 한 번 입력한 내용 중 공개로 지정한 것만 학생 화면에 자동으로 나타납니다.
같은 내용을 두 번 입력하지 않습니다.

---

## 목차

1. [전체 그림](#1-전체-그림)
2. [폴더 구조](#2-폴더-구조)
3. [설치 순서 요약](#3-설치-순서-요약)
4. [Firebase 설정](#4-firebase-설정)
5. [firebase-config.js 입력](#5-firebase-configjs-입력)
6. [보안 규칙 배포](#6-보안-규칙-배포)
7. [최초 관리자 등록](#7-최초-관리자-등록)
8. [API 키 발급 (Gemini · YouTube)](#8-api-키-발급-gemini--youtube)
9. [GitHub 업로드](#9-github-업로드)
10. [Vercel 배포](#10-vercel-배포)
11. [Vercel 환경변수](#11-vercel-환경변수)
12. [배포 후 마무리 설정](#12-배포-후-마무리-설정)
13. [첫 사용 순서](#13-첫-사용-순서)
14. [동작 확인 체크리스트](#14-동작-확인-체크리스트)
15. [데이터 구조](#15-데이터-구조)
16. [보안 설계](#16-보안-설계)
17. [문제 해결](#17-문제-해결)

---

## 1. 전체 그림

```
브라우저 (HTML + CSS + Vanilla JS)
   │
   ├─ Firebase Authentication   로그인 (선생님 Google / 학생 이름+비밀번호)
   ├─ Cloud Firestore           수업, 준비물, 재고, 보고서, 설정
   ├─ Firebase Storage          활동지 PDF, 대표사진
   │
   └─ Vercel Serverless Functions (/api)
          ├─ Gemini API      초안 만들기 (준비물 / 수업계획 / 보고서질문 / 소감요약 / 포트폴리오)
          ├─ YouTube Data API 영상 검색
          └─ Firebase Admin  학생 계정 생성, 학생 로그인 이름 변환
```

**API 키는 브라우저에 내려가지 않습니다.** Gemini 키와 YouTube 키는 Vercel 환경변수에만 저장되고 `/api` 서버 안에서만 사용됩니다.

빌드 도구가 없습니다. Next.js도 React도 쓰지 않습니다. 파일을 열어서 바로 고칠 수 있습니다.

> ### ⚠️ `index.html` 을 더블클릭해서 열지 마세요
>
> 글씨만 나오고 디자인이 하나도 적용되지 않은 화면이 뜹니다.
> 고장난 것이 아닙니다. 브라우저는 보안 정책상 **`file://` 로 연 페이지에서는
> ES 모듈(js 파일)을 불러오지 않기 때문**입니다.
>
> 반드시 **`http://` 주소로** 열어야 합니다.
>
> ```bash
> npm start
> ```
>
> 그 다음 브라우저에서 <http://localhost:4173> 으로 접속하세요.
> (초안 만들기·영상 검색까지 확인하려면 `npm start` 대신 `vercel dev` 를 쓰세요. [11장](#11-vercel-환경변수))
>
> 실제 운영은 Vercel에 배포한 주소를 사용합니다.

---

## 2. 폴더 구조

```
/
├─ index.html              첫 화면 (선생님용 / 학생용 선택)
├─ teacher.html            선생님용 (앱 셸)
├─ student.html            학생용
├─ portfolio.html          포트폴리오 인쇄 전용 화면
│
├─ css/
│   ├─ common.css          디자인 토큰, 버튼, 카드, 폼, 모달, 토스트
│   ├─ teacher.css         선생님용 앱 셸 레이아웃
│   ├─ student.css         학생용 레이아웃
│   └─ print.css           인쇄 / PDF 저장용
│
├─ js/
│   ├─ firebase-config.js      ★ 여기에 Firebase 웹 설정을 붙여넣습니다
│   ├─ firebase-service.js     Firebase 초기화 + 데이터 접근 계층
│   ├─ auth-service.js         로그인 / 로그아웃 / 자동 로그아웃
│   ├─ store.js                선생님 화면 공용 상태
│   ├─ common.js               교사·학생 공용 표시 로직 (배지, 진행률, 비용)
│   ├─ ui.js                   DOM 생성, 토스트, 모달, 날짜·금액 포맷
│   ├─ inventory-service.js    재고
│   ├─ seed-data.js            2026 초기 일정 (총 20차시)
│   ├─ portfolio.js            포트폴리오 문서 생성기
│   ├─ teacher.js              선생님용 라우터
│   ├─ student.js              학생용 전체
│   └─ views/                  선생님용 화면 10개 + 초안 모달 + 영상 검색
│
├─ api/
│   ├─ _lib/                   서버 공용 (Firebase Admin, 인증, Gemini)
│   ├─ auth/resolve-student-login.js   로그인 이름 → 내부 인증 이메일
│   ├─ admin/students.js               학생 계정 생성·수정·비밀번호 변경
│   ├─ gemini/                         초안 만들기 5종
│   └─ youtube/search.js               영상 검색
│
├─ firestore.rules
├─ storage.rules
├─ vercel.json
├─ package.json
└─ README.md
```

> `api/_lib/` 처럼 `_` 로 시작하는 폴더는 Vercel이 API 경로로 만들지 않습니다. 공용 모듈 자리입니다.

---

## 3. 설치 순서 요약

먼저 전체 흐름만 봐 두시면 편합니다.

| 순서 | 하는 일 | 걸리는 시간 |
|---|---|---|
| 1 | Firebase 프로젝트 만들기 | 5분 |
| 2 | Authentication / Firestore / Storage 켜기 | 5분 |
| 3 | `js/firebase-config.js` 에 값 붙여넣기 | 2분 |
| 4 | 보안 규칙 배포 | 5분 |
| 5 | 최초 관리자 등록 (`admins/{uid}`) | 3분 |
| 6 | Gemini · YouTube API 키 발급 | 10분 |
| 7 | GitHub에 올리기 | 5분 |
| 8 | Vercel 연결 + 환경변수 입력 | 10분 |
| 9 | 승인된 도메인 등록 | 2분 |
| 10 | 초기 일정 등록 + 학생 추가 | 10분 |

---

## 4. Firebase 설정

### 4-1. 프로젝트 만들기

1. <https://console.firebase.google.com> 접속
2. **프로젝트 추가** → 이름 입력 (예: `smartlab`)
3. Google 애널리틱스는 **사용 안 함**으로 두어도 됩니다

### 4-2. 웹 앱 등록

1. 프로젝트 개요 화면에서 **웹 아이콘 `</>`** 클릭
2. 앱 닉네임 입력 (예: `smartlab-web`)
3. "Firebase 호스팅 설정"은 **체크하지 않습니다** (배포는 Vercel이 합니다)
4. 등록하면 `firebaseConfig` 객체가 나옵니다 → **5번 단계에서 사용**

### 4-3. Authentication 켜기

**빌드 → Authentication → 시작하기**

**Sign-in method** 탭에서 두 가지를 사용 설정합니다.

| 제공업체 | 용도 |
|---|---|
| **Google** | 선생님 로그인 |
| **이메일/비밀번호** | 학생 로그인 (내부적으로만 사용) |

> 학생은 화면에서 이메일을 입력하지 않습니다.
> 시스템이 내부용 주소(`s-xxxxxxxx@smartlab.local`)를 자동으로 만들어 쓰고, 학생에게는 보여주지 않습니다.

### 4-4. Firestore 만들기

**빌드 → Firestore Database → 데이터베이스 만들기**

- 위치: `asia-northeast3 (서울)`
- 모드: **프로덕션 모드**로 시작 (규칙은 6번에서 넣습니다)

### 4-5. Storage 만들기

**빌드 → Storage → 시작하기**

- 위치는 Firestore와 같게
- 프로덕션 모드로 시작

---

## 5. `firebase-config.js` 입력

`js/firebase-config.js` 파일을 열고, 4-2에서 받은 값을 그대로 붙여넣습니다.

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "smartlab-xxxx.firebaseapp.com",
  projectId: "smartlab-xxxx",
  storageBucket: "smartlab-xxxx.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

값을 다시 보려면
**프로젝트 설정(톱니) → 일반 → 내 앱 → SDK 설정 및 구성 → "구성"** 을 선택합니다.

> ### 이 값은 공개되어도 됩니다
> `apiKey` 는 비밀번호가 아니라 프로젝트를 가리키는 주소표입니다. 모든 Firebase 웹 앱이 브라우저에 노출합니다.
> 실제 데이터 보호는 `firestore.rules` 와 `storage.rules` 가 담당합니다.
>
> **단, `GEMINI_API_KEY` 와 `YOUTUBE_API_KEY` 는 절대 이 파일에 넣지 마세요.** 그 둘은 진짜 비밀 키입니다.

---

## 6. 보안 규칙 배포

이 프로젝트의 보안은 대부분 규칙 파일이 담당합니다. **반드시 배포해야 합니다.**

### 방법 A — 콘솔에 붙여넣기 (간단)

1. **Firestore Database → 규칙** 탭 → `firestore.rules` 전체 내용을 붙여넣고 **게시**
2. **Storage → 규칙** 탭 → `storage.rules` 전체 내용을 붙여넣고 **게시**

### 방법 B — CLI (권장, 나중에 관리하기 편함)

```bash
npm install -g firebase-tools
firebase login
firebase init firestore storage
firebase deploy --only firestore:rules,storage:rules
```

`firebase init` 중 규칙 파일 이름을 물어보면 `firestore.rules`, `storage.rules` 를 그대로 쓰면 됩니다.

### 색인(Index) 안내

이 프로젝트의 질의는 모두 단일 필드 조건이라 **복합 색인이 필요 없습니다.**
혹시 콘솔에 색인 생성 링크가 뜨면 그 링크를 눌러 만들면 됩니다.

---

## 7. 최초 관리자 등록

선생님 화면은 `admins/{uid}` 문서가 있는 계정만 들어갈 수 있습니다.
첫 관리자는 Firebase Console에서 직접 만들어야 합니다.

1. 배포된(또는 로컬) 사이트에서 `teacher.html` 열기
2. **Google 계정으로 로그인**
3. "관리자 권한이 없습니다" 화면이 나오면서 **UID가 표시됩니다** → **[UID 복사]** 클릭
4. Firebase Console → **Firestore Database → 데이터** 탭
5. **컬렉션 시작** → 컬렉션 ID: `admins`
6. **문서 ID**: 복사한 UID를 붙여넣기
7. 필드 추가 (아무거나 하나 있으면 됩니다)

   | 필드 | 유형 | 값 |
   |---|---|---|
   | `email` | string | 본인 이메일 |
   | `name` | string | 성소연 |

8. 저장 후 브라우저 **새로고침** → 선생님 화면으로 들어갑니다

> 관리자를 더 추가하려면 같은 방법으로 `admins` 컬렉션에 문서를 하나 더 만들면 됩니다.
> 보안을 위해 `admins` 컬렉션은 앱에서 수정할 수 없게 막아 두었습니다.

---

## 8. API 키 발급 (Gemini · YouTube)

두 기능 모두 **없어도 사이트는 정상 동작합니다.** 초안 만들기와 영상 검색만 비활성화됩니다.
설정 화면에서 각각 끌 수 있습니다.

### 8-1. Gemini API 키

1. <https://aistudio.google.com/apikey> 접속
2. **Create API key** → 키 복사
3. 이 값이 `GEMINI_API_KEY` 입니다

### 8-2. YouTube Data API v3 키

1. <https://console.cloud.google.com> 접속
2. 프로젝트 선택 (Firebase 프로젝트를 그대로 써도 됩니다)
3. **API 및 서비스 → 라이브러리** → `YouTube Data API v3` 검색 → **사용 설정**
4. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키**
5. 키 복사 → 이 값이 `YOUTUBE_API_KEY` 입니다

> **키 제한을 걸어 두세요.** 만든 키 → **API 제한사항** → `YouTube Data API v3` 만 선택.
> 이 키는 서버에서만 쓰이므로 애플리케이션 제한은 **없음**으로 둡니다.
>
> 무료 할당량은 하루 10,000 units 이고 검색 1회에 약 100 units 를 씁니다. 하루 100회 정도 검색할 수 있어 방과후 수업 준비에는 넉넉합니다.

### 8-3. Firebase Admin 서비스 계정 키

학생 계정 생성과 학생 로그인에 **반드시 필요합니다.**

1. Firebase Console → **프로젝트 설정 → 서비스 계정** 탭
2. **새 비공개 키 생성** → **키 생성** → JSON 파일이 내려받아집니다
3. 그 JSON 파일을 열면 다음 세 값이 들어 있습니다

   ```json
   {
     "project_id":   "smartlab-xxxx",
     "client_email": "firebase-adminsdk-xxxxx@smartlab-xxxx.iam.gserviceaccount.com",
     "private_key":  "-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
   }
   ```

> ⚠️ **이 JSON 파일은 절대 GitHub에 올리지 마세요.** 프로젝트 폴더 밖에 보관하세요.
> `.gitignore` 에 `*serviceAccount*.json` 을 넣어 두었습니다.

---

## 9. GitHub 업로드

```bash
cd "프로젝트 폴더"

git init
git add .
git commit -m "스마트과학반 LAB 초기 버전"
git branch -M main
```

GitHub에서 **New repository** 로 빈 저장소를 만든 뒤(README 추가 체크 해제),

```bash
git remote add origin https://github.com/사용자이름/저장소이름.git
git push -u origin main
```

저장소는 **Private** 로 두는 것을 권합니다.

> 올리기 전에 `git status` 로 서비스 계정 JSON 파일이 포함되지 않았는지 꼭 확인하세요.

---

## 10. Vercel 배포

1. <https://vercel.com> → **GitHub 계정으로 로그인**
2. **Add New… → Project**
3. 방금 만든 저장소 **Import**
4. 설정 화면에서
   - **Framework Preset**: `Other`
   - **Root Directory**: `./`
   - **Build Command**: 비워 둠
   - **Output Directory**: 비워 둠
5. **Environment Variables** 를 먼저 입력합니다 (다음 장 참고)
6. **Deploy**

배포가 끝나면 `https://저장소이름.vercel.app` 같은 주소가 나옵니다.

이후에는 **GitHub에 push 하면 Vercel이 자동으로 다시 배포**합니다.

```bash
git add .
git commit -m "준비물 화면 수정"
git push
```

---

## 11. Vercel 환경변수

**Vercel → 프로젝트 → Settings → Environment Variables**

다섯 개를 등록합니다. 환경은 **Production, Preview, Development 모두 체크**합니다.

| Key | Value |
|---|---|
| `GEMINI_API_KEY` | AI Studio에서 받은 키 |
| `YOUTUBE_API_KEY` | Cloud Console에서 받은 키 |
| `FIREBASE_ADMIN_PROJECT_ID` | 서비스 계정 JSON의 `project_id` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | 서비스 계정 JSON의 `client_email` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | 서비스 계정 JSON의 `private_key` |

### `FIREBASE_ADMIN_PRIVATE_KEY` 줄바꿈 처리 — 가장 자주 막히는 곳입니다

JSON 파일 안의 값은 이렇게 생겼습니다. `\n` 은 **줄바꿈을 나타내는 두 글자**입니다.

```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
```

**입력 방법 (둘 중 아무거나)**

**방법 1 — JSON 값을 그대로 복사 (가장 쉬움)**

JSON 파일에서 `private_key` 의 **큰따옴표 안쪽 내용만** 복사해서 그대로 붙여넣습니다.
`\n` 이 글자 그대로 들어가도 됩니다. 서버 코드가 알아서 진짜 줄바꿈으로 바꿉니다.

```
-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n
```

**방법 2 — 실제 줄바꿈으로 붙여넣기**

Vercel 입력칸은 여러 줄을 받습니다. `\n` 을 실제 줄바꿈으로 바꿔서 이렇게 넣어도 됩니다.

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBg...
-----END PRIVATE KEY-----
```

**주의할 점**

- 앞뒤에 **큰따옴표를 포함하지 마세요.** (실수로 넣어도 코드가 제거합니다)
- `-----BEGIN PRIVATE KEY-----` 와 `-----END PRIVATE KEY-----` 를 **빠뜨리지 마세요.**
- 중간에 공백을 넣거나 줄을 자르지 마세요.

환경변수를 추가하거나 고친 뒤에는 **Deployments → 최신 배포 → ⋯ → Redeploy** 를 해야 반영됩니다.

### 로컬에서 테스트하려면

```bash
npm install
npm install -g vercel
vercel link
vercel env pull .env.local   # Vercel의 환경변수를 내려받습니다
vercel dev                   # http://localhost:3000
```

`.env.local` 은 `.gitignore` 에 들어 있습니다.

---

## 12. 배포 후 마무리 설정

### 12-1. 승인된 도메인 등록 (필수)

이걸 안 하면 **Google 로그인이 실패합니다.**

Firebase Console → **Authentication → 설정 → 승인된 도메인 → 도메인 추가**

```
저장소이름.vercel.app
```

직접 만든 도메인이 있으면 그것도 추가합니다. `localhost` 는 기본으로 들어 있습니다.

### 12-2. Storage CORS 설정 (사진 업로드가 안 될 때만)

대부분 필요 없지만, 업로드에서 CORS 오류가 나면 아래를 적용합니다.

`cors.json` 파일을 만들고

```json
[
  {
    "origin": ["https://저장소이름.vercel.app", "http://localhost:3000"],
    "method": ["GET", "HEAD", "PUT", "POST"],
    "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable"],
    "maxAgeSeconds": 3600
  }
]
```

```bash
gcloud storage buckets update gs://프로젝트ID.firebasestorage.app --cors-file=cors.json
```

---

## 13. 첫 사용 순서

### 13-1. 초기 일정 등록

1. 선생님 화면 로그인 → **설정**
2. **기본 정보** 에서 학교명 · 교사명 · 운영 학년도 · 운영 기간 · 총예산 확인
3. **초기 데이터** → **[2026 초기 일정 등록]**

2026 스마트과학반 전체 계획(총 20차시)이 한 번에 들어갑니다.

| 날짜 | 차시 | 활동 |
|---|---|---|
| 9/2(수) | 1~2차시 | OT + 그래비트랙스 ① |
| 9/9(수) | 3~4차시 | 그래비트랙스 ② |
| 9/16(수) | 5~6차시 | 코끼리 치약 |
| 9/23(수) | — | 창의적체험활동의 날 · 방과후 없음 |
| 9/30(수) | 7~8차시 | 아이스크림 만들기 |
| 10/7(수) | 9~10차시 | DNA 추출 + 소장 |
| 10/14(수) | 11~12차시 | 드라이아이스 DAY |
| 10/21(수) | 13~14차시 | 시험 전 자습 |
| 10/28(수) | — | 중간고사 · 방과후 없음 |
| 11/4(수) | 15~18차시 | 천문대 체험 4시간 |
| 11/11(수) | 19~20차시 | 가상 실험실 만들기 + 간식 파티 |

> **여러 번 눌러도 중복되지 않습니다.** 이미 있는 일정은 건드리지 않고 없는 것만 추가합니다.

### 13-2. 학생 추가

1. **학생 관리** → **[+ 학생 추가]**
2. 표시 이름을 입력하면 로그인 이름이 따라 채워집니다
3. **동명이인이 있으면** 로그인 이름을 `홍길동1`, `홍길동2` 처럼 바꿔 주세요
4. 초기 비밀번호가 자동 생성됩니다. 필요하면 바꿀 수 있습니다
5. 추가하면 **비밀번호가 한 번만 표시됩니다.** 학생에게 바로 알려 주세요

> 비밀번호는 어디에도 저장되지 않습니다. 잊어버리면 **[비밀번호]** 버튼으로 새로 지정하면 됩니다.
> 학번은 매년 바뀔 수 있어 기록 연결에 쓰지 않습니다. 활동 기록은 Firebase UID로 연결됩니다.
> 학생을 지우는 기능은 없습니다. 과거 기록이 사라지지 않도록 **비활성** 상태로 관리합니다.

### 13-3. 수업 준비하기

**주차별 활동** 에서 수업을 고르면 **실험 전 / 실험 중 / 실험 후** 탭이 나옵니다.

**실험 전**
- 활동명, 목표, 학생용 안내, 교사용 계획, 90분 운영계획
- 준비물 — 물품명 / 수량 / 상태 / 재고 연결 / 예상가 / 실제가 / 구매처
- **"공개" 를 체크한 준비물만 학생 화면에 표시됩니다**
- 체크리스트 — 체크율이 준비 진행률이 됩니다
- 참고영상 검색, 활동지 업로드, 간이보고서 질문 편집

**실험 중**
- 즉석 메모 (저장 버튼이 크게 있습니다)
- Drive 사진 링크, 대표사진 업로드
- 출석, 성공/실패/재실험 인원
- 대회 결과 (학생 공개 여부 선택)

**실험 후**
- 실제 결과, 잘된 점, 아쉬운 점, **다음엔 이렇게**, 실제 사용량, 교사 성찰
- 학생 공개 결과, 과학적 원리
- 학생 소감 요약, 포트폴리오 초안, 실험 보관함에 저장, 재고 차감

> **"다음엔 이렇게"** 에 적은 내용은, 같은 이름의 활동을 다시 열 때 화면 맨 위에 **지난 운영 메모**로 자동 표시됩니다.

### 13-4. 학생에게 공개하기

각 수업에는 상태가 있습니다.

| 상태 | 학생 화면 | 보고서 작성 |
|---|---|---|
| **작성중** | 안 보임 | ✕ |
| **학생 공개** | 보임 | ✕ |
| **수업 완료** | 보임 | ✓ |
| **기록 보관** | 보임 | ✓ |

수업 전에는 **학생 공개**, 수업이 끝나면 **수업 완료** 로 바꿔 주세요.

---

## 14. 동작 확인 체크리스트

배포 후 아래를 순서대로 확인하면 빠뜨린 설정을 찾을 수 있습니다.

- [ ] 첫 화면이 열리고 운영 학년도 · 기간이 표시된다
- [ ] 선생님 Google 로그인이 된다 → 안 되면 **12-1 승인된 도메인** 확인
- [ ] 선생님 홈 대시보드에 이번 활동이 표시된다
- [ ] 설정에서 초기 일정 등록이 된다
- [ ] 설정 → 외부 연동 → **Gemini [연동 확인]** 이 "정상"
- [ ] 설정 → 외부 연동 → **YouTube [연동 확인]** 이 "정상"
- [ ] 학생 추가가 된다 → 안 되면 **Firebase Admin 환경변수 3개** 확인
- [ ] 학생 화면에서 이름+비밀번호로 로그인이 된다
- [ ] 수업 상태를 "학생 공개" 로 바꾸면 학생 홈에 나타난다
- [ ] "수업 완료" 로 바꾸면 학생이 간이보고서를 쓸 수 있다
- [ ] 선생님 화면에서 제출된 보고서가 보인다
- [ ] 포트폴리오 화면에서 인쇄 미리보기가 문서처럼 나온다

### 권한이 제대로 막혔는지 확인 (권장)

학생 계정으로 로그인한 상태에서 브라우저 개발자도구 콘솔에 아래를 붙여넣어 보세요.
**둘 다 `permission-denied` 가 나와야 정상입니다.**

```js
const { getDb, doc, getDoc, collection, getDocs } = await import('/js/firebase-service.js');

// 교사 전용 문서 읽기 시도 → 실패해야 함
await getDoc(doc(getDb(), 'sessions', 's2026-03', 'private', 'teacher'))
  .catch(e => console.log('차단됨:', e.code));

// 다른 학생 보고서 목록 읽기 시도 → 실패해야 함
await getDocs(collection(getDb(), 'reflections'))
  .catch(e => console.log('차단됨:', e.code));
```

---

## 15. 데이터 구조

```
settings/public                 첫 화면용 공개 안내 (사이트명, 기간, 다음 일정)
settings/site                   운영 설정 (총예산, 자동 로그아웃, 기능 on/off)

admins/{uid}                    관리자 명단 — 콘솔에서만 추가

students/{uid}                  학생 명부
  displayName, loginName, loginNameKey, authEmail,
  studentNo, year, status, createdAt

studentLoginAliases/{loginNameKey}     ← 클라이언트에서 읽을 수 없음 (서버 전용)
  uid, authEmail, displayName, status

sessions/{sessionId}                   ← 학생도 읽는 공개 영역
  date, periodLabel, title, field, order, noClass,
  status, isPublic,
  studentGuide, publicMaterials[], worksheets[], videos[],
  driveLink, photos[], coverPhoto,
  publicResult, principle, contest{}, reportQuestions[]

sessions/{sessionId}/private/teacher   ← 교사 전용 (학생은 읽기 불가)
  goal, plan, runPlan,
  materials[], checklist[], safety, planB,
  liveNotes[], attendance{},
  result, goodPoints, badPoints, nextTime, usage,
  estimatedCost, actualCost, reflection, reflectionSummary,
  portfolioDraft, recommend

reflections/{sessionId}_{studentUid}    학생 간이보고서
  sessionId, studentUid, answers[], rating, createdAt, updatedAt

inventory/{itemId}              재고
templates/{templateId}          실험 보관함
```

### 왜 문서를 나눴는가

Firestore는 **필드 단위로 읽기를 막을 수 없습니다.**
한 문서 안에 구매 가격과 학생 공개 내용을 같이 두면, 학생이 그 문서를 읽는 순간 가격까지 함께 내려갑니다.

그래서 **교사 전용 내용은 아예 다른 문서**(`private/teacher`)로 분리했습니다.
학생 계정으로는 이 문서를 읽는 요청 자체가 거부됩니다.

---

## 16. 보안 설계

| 지키는 것 | 방법 |
|---|---|
| 학생 비밀번호 평문 저장 금지 | Firebase Authentication이 해시로 관리. Firestore에도 서버에도 저장하지 않음 |
| 비밀번호가 서버를 지나가지 않음 | 서버는 로그인 이름 → 내부 이메일 변환만. 비밀번호는 브라우저 → Firebase 직행 |
| Gemini · YouTube 키 노출 금지 | Vercel 환경변수에만. `/api` 안에서만 사용 |
| API 무단 호출 금지 | 모든 `/api` 는 Firebase ID Token 검증 + `admins/{uid}` 확인 |
| 교사 데이터 학생 접근 금지 | `sessions/{id}/private/teacher` 문서 분리 + 규칙에서 관리자만 허용 |
| 학생 간 보고서 접근 금지 | `resource.data.studentUid == request.auth.uid` 조건 |
| 학생 로그인 정보 탐색 금지 | `studentLoginAliases` 는 클라이언트 읽기·쓰기 모두 차단 |
| 학생 파일 업로드 금지 | Storage 규칙에서 쓰기는 관리자만 |
| 공용 기기 대비 | 세션 저장소만 사용 + 설정한 시간 후 자동 로그아웃 + 로그아웃 시 화면 즉시 초기화 |
| 개인정보 외부 전달 금지 | 소감 요약 시 이름·학번·UID를 보내지 않고 익명 텍스트만 전달 |
| 오류 원문 노출 금지 | 사용자에게는 일반 메시지, 원문은 서버 로그에만 |

### 초안 만들기 기능의 한계

Gemini는 **초안만** 만듭니다. 다음은 절대 자동으로 정해지지 않습니다.

구매 완료 · 실제 비용 · 재고 수량 · 학생 출석 · 실험 성공 여부 · 학생 평가 · 학생 점수

모든 결과는 **생성 → 미리보기 → 선생님 확인·수정 → 저장** 순서로만 반영됩니다.

---

## 17. 문제 해결

### Google 로그인 창이 뜨자마자 닫힙니다
Firebase Console → Authentication → 설정 → **승인된 도메인**에 Vercel 주소를 추가하세요. (12-1)

### "관리자 권한이 없습니다" 가 계속 나옵니다
`admins/{uid}` 문서를 만들었는지, **문서 ID가 화면에 표시된 UID와 정확히 같은지** 확인하세요.
컬렉션 이름은 `admins` (복수형)입니다. 만든 뒤 새로고침해야 반영됩니다.

### 학생 추가가 "서버 설정이 완료되지 않았습니다" 로 실패합니다
Vercel 환경변수 `FIREBASE_ADMIN_PROJECT_ID` / `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` 세 개를 확인하고 **Redeploy** 하세요.
특히 private key의 `-----BEGIN PRIVATE KEY-----` 부분이 빠지지 않았는지 보세요. (11장)

### 학생 로그인에서 "이름 또는 비밀번호를 확인해 주세요" 만 나옵니다
- 학생 관리 화면의 **로그인 이름**과 정확히 같게 입력했는지 확인 (공백·대소문자는 무시됩니다)
- 학생 상태가 **비활성**이 아닌지 확인
- 그래도 안 되면 **[비밀번호]** 로 새로 지정해 보세요

### 데이터가 하나도 안 보이고 콘솔에 `permission-denied` 가 뜹니다
보안 규칙이 배포되지 않았을 가능성이 큽니다. 6장을 다시 확인하세요.

### 영상 검색이 "사용량이 초과되었거나 키 설정에 문제가 있습니다"
YouTube Data API v3가 **사용 설정**되어 있는지, API 키 제한이 이 API를 허용하는지 확인하세요. (8-2)
하루 할당량(10,000 units)을 다 쓴 경우 다음 날 자정(태평양 표준시)에 초기화됩니다.

### 초안 만들기가 계속 실패합니다
설정 → 외부 연동 → **[연동 확인]** 을 눌러 상태를 보세요.
"키 미설정" 이면 `GEMINI_API_KEY` 를 등록하고 Redeploy 하세요.

### 사진 업로드가 안 됩니다
- Storage 규칙을 배포했는지 확인 (6장)
- 파일이 20MB를 넘지 않는지 확인
- CORS 오류가 보이면 12-2 적용

> 용량이 큰 사진과 영상은 **Google Drive 공유폴더**를 쓰는 것이 좋습니다.
> 각 활동의 **Drive 링크**에 앨범 주소를 넣고, 대표사진 1~5장만 업로드하세요.

### 포트폴리오 인쇄가 지저분하게 나옵니다
브라우저 인쇄 대화상자에서
- **배경 그래픽** 켜기
- **머리글/바닥글** 끄기
- 여백: 기본

Chrome 기준으로 맞춰 두었습니다.

---

## 라이선스 및 안내

본 사이트의 수업자료 및 기록물은 교육 목적으로 제작되었습니다.
제작자의 동의 없는 무단 복제·배포·수정·상업적 이용을 금합니다.
활동 및 실험을 재현할 경우 안전수칙과 학교 여건을 충분히 확인해 주세요.

제작자 **동대문중학교 교사 성소연**

© 2026 동대문중학교 교사 성소연. All rights reserved.
