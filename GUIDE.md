# 스마트과학반 LAB - Firebase 연동 & GitHub Pages 배포 가이드

선생님, 안녕하세요! 본 가이드는 사이트를 **Firebase에 연동**하고 **GitHub Pages에 배포**하여 실제로 사용할 수 있도록 돕는 단계별 안내서입니다.

---

## 1단계: Firebase 프로젝트 생성 및 설정 (Firebase 연동)

### 1-1. Firebase 프로젝트 만들기
1. [Firebase Console](https://console.firebase.google.com/)에 접속하여 Google 계정으로 로그인합니다.
2. **[프로젝트 추가]** 버튼을 클릭합니다.
3. 프로젝트 이름으로 `smartlab` (또는 원하는 이름)을 입력하고 다음을 누릅니다.
4. Google 애널리틱스 설정은 필요에 따라 선택하고 프로젝트를 생성합니다.

### 1-2. 웹 앱 추가 및 설정 값 복사
1. 프로젝트 개요 화면에서 **웹 아이콘 (`</>`)**을 클릭하여 앱을 추가합니다.
2. 앱 닉네임을 입력하고 **[앱 등록]**을 누릅니다. (Firebase Hosting 설정 체크는 안 하셔도 됩니다)
3. 화면에 나타나는 `const firebaseConfig = { ... }` 코드 블록을 확인합니다.
4. 내 프로젝트 파일 중 `js/firebase-config.js` 파일에 위 정보를 그대로 붙여넣습니다.

```javascript
// js/firebase-config.js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 1-3. Authentication (인증) 설정
1. Firebase 메뉴에서 **[생성] -> [Authentication]**으로 이동합니다.
2. **[시작하기]**를 누른 후 **[로그인 방법]** 탭 선택:
   - **Google**: 활성화 (선생님 로그인용)
   - **이메일/비밀번호**: 활성화 (학생 로그인용)

### 1-4. Firestore Database 설정 및 보안 규칙 등록
1. Firebase 메뉴에서 **[생성] -> [Firestore Database]**로 이동합니다.
2. **[데이터베이스 만들기]**를 클릭하고 위치(예: `asia-northeast3 (서울)`)를 선택한 뒤 생성을 완료합니다.
3. **[규칙 (Rules)]** 탭으로 이동합니다.
4. 프로젝트 내에 포함된 `firestore.rules` 파일의 내용을 전체 복사하여 붙여넣고 **[게시]**를 누릅니다.

### 1-5. Storage (파일/사진 업로드용) 설정 (선택 사항)
1. Firebase 메뉴에서 **[생성] -> [Storage]**로 이동하여 생성합니다.
2. **[규칙 (Rules)]** 탭에 프로젝트의 `storage.rules` 파일 내용을 붙여넣고 **[게시]**를 누릅니다.

---

## 2단계: GitHub 저장소 만들기 & 코드 푸시 (GitHub 배포)

### 2-1. GitHub 저장소(Repository) 생성
1. [GitHub](https://github.com/)에 로그인 후 우측 상단의 **[+] -> [New repository]**를 클릭합니다.
2. Repository name에 `smartlab`을 입력합니다.
3. Public(공개)으로 설정 후 **[Create repository]**를 누릅니다.

### 2-2. 내 컴퓨터에서 저장소 올리기 (Git 명령어)
터미널(PowerShell 또는 Git Bash)을 열고 아래 명령어를 순서대로 실행합니다:

```bash
# 1. git 초기화 (이미 되어 있다면 생략)
git init

# 2. 모든 파일 추가 및 커밋
git add .
git commit -m "스마트과학반 LAB 사이트 첫 배포"

# 3. 브랜치 이름을 main으로 변경
git branch -M main

# 4. 깃허브 저장소 연결 (YOUR_USERNAME과 YOUR_REPOSITORY를 본인 깃허브 주소로 변경)
git remote add origin https://github.com/YOUR_USERNAME/smartlab.git

# 5. 코드 푸시
git push -u origin main
```

---

## 3단계: GitHub Pages 자동 배포 확인

1. GitHub 저장소 페이지의 **[Settings] -> [Pages]** 메뉴로 이동합니다.
2. **Source** 설정을 `GitHub Actions`로 선택합니다.
   *(이미 포함된 `.github/workflows/deploy.yml` 파일 덕분에 코드 푸시 시 자동으로 배포됩니다!)*
3. 몇 분 후 **[Actions]** 탭에서 배포 완료 초록색 체크(`✔`)를 확인할 수 있으며, 제공되는 URL(예: `https://YOUR_USERNAME.github.io/smartlab/`)로 사이트에 접속하실 수 있습니다.

---

## 4단계: 최초 관리자(선생님) 권한 부여

1. 배포된 사이트 주소로 접속한 뒤 **선생님용** 로그인 버튼을 눌러 Google 계정으로 로그인합니다.
2. 아직 관리자로 등록되지 않아 **"관리자 권한이 없습니다"** 화면과 함께 본인의 **UID**가 표시됩니다.
3. **[UID 복사]** 버튼을 누릅니다.
4. **Firebase Console -> Firestore Database -> 데이터 시작 (문서 추가)**로 이동합니다:
   - **컬렉션 ID**: `admins`
   - **문서 ID**: (복사한 UID 붙여넣기)
   - 필드는 빈 상태로 두고 저장합니다.
5. 사이트로 돌아와 새로고침하면 **선생님 대시보드 관리자 화면**이 즉시 열립니다! 🎉
