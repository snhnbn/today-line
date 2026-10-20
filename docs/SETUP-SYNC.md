# 컴퓨터 3대 연동 설정 안내

목표: 3대의 컴퓨터에서 **같은 주소**로 앱을 열고, 데이터는 **구글 드라이브의 파일 1개**(`worktimeline-data.json`)로 공유한다.

- 앱 주소: GitHub Pages (`https://<GitHub 계정>.github.io/today-line/`)
- 데이터: 내 구글 드라이브. 앱은 자기가 만든 이 파일 하나만 볼 수 있다(`drive.file` 권한). 드라이브의 다른 파일은 보지 못한다.
- 각 컴퓨터의 브라우저에도 사본이 저장되므로, 인터넷이 끊겨도 앱은 그대로 쓸 수 있다.

설정은 처음 한 번만 하면 된다. 아래 순서대로 진행하고, 각 단계가 끝나면 Claude에게 알려 준다.

---

## 1. GitHub 저장소 만들기 (약 5분)

1. https://github.com 에 로그인한다. 계정이 없으면 새로 만든다.
2. 오른쪽 위 **+** → **New repository** 를 누른다.
   - Repository name: `today-line`
   - **Public** 을 선택한다. 무료 계정에서 GitHub Pages를 쓰려면 Public이어야 한다.
     공개되는 것은 앱 코드뿐이다. 업무 데이터는 구글 드라이브에만 있고 저장소에는 올라가지 않는다.
   - README, .gitignore, license 추가 항목은 **모두 체크하지 않는다**(빈 저장소로 만든다).
3. **Create repository** 를 누른 뒤, 화면에 보이는 주소(`https://github.com/<계정>/today-line.git`)를 Claude에게 알려 준다.
   → Claude가 코드를 올린다. 올리는 중에 GitHub 로그인 창이 한 번 뜰 수 있다.
4. 코드가 올라가면 저장소의 **Settings → Pages** 로 이동한다. **Build and deployment → Source** 를 **GitHub Actions** 로 바꾼다.
5. 몇 분 뒤 `https://<계정>.github.io/today-line/` 에서 앱이 열린다. 이 주소를 3대 모두 즐겨찾기에 추가한다.

## 2. Google Cloud 설정 (약 15분, 한 번만)

1. https://console.cloud.google.com 에 앱을 쓸 구글 계정으로 로그인한다.
2. 위쪽의 프로젝트 선택 → **새 프로젝트** 를 누르고, 이름을 `today-line` 으로 정해 만든다.
3. **API 및 서비스 → 라이브러리** 에서 **Google Drive API** 를 검색해 **사용** 을 누른다.
4. **Google 인증 플랫폼**(또는 **OAuth 동의 화면**)으로 이동한다.
   - 앱 이름 `Today Line`, 사용자 지원 이메일·개발자 이메일은 본인 이메일을 넣는다.
   - 대상(User type): **외부(External)** 를 고른다.
   - **테스트 사용자** 에 본인 구글 이메일을 추가한다.
   - **데이터 액세스(범위)** 에서 `.../auth/drive.file` 하나만 추가한다.
5. **클라이언트 → 클라이언트 만들기**(OAuth 클라이언트 ID) 를 누른다.
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 JavaScript 원본** 에 아래 두 개를 추가한다. 끝에 `/` 나 경로를 붙이지 않는다.
     - `http://localhost:5173`
     - `https://<GitHub 계정>.github.io`
   - 승인된 리디렉션 URI는 비워 둔다.
6. 만들어진 **클라이언트 ID**(`....apps.googleusercontent.com`)를 복사해 Claude에게 알려 준다.
   - 클라이언트 ID는 브라우저에 공개되는 값이라 비밀번호가 아니다.
   - **클라이언트 보안 비밀(secret)은 필요 없다.** 알려 주지 않는다.

### 7일마다 다시 로그인해야 하는 문제
앱이 **테스트** 상태이면 구글이 7일마다 연결을 끊는다. 동의 화면에서 **앱 게시(프로덕션으로 전환)** 를 누르면 이 제한이 풀린다.
`drive.file` 처럼 민감하지 않은 범위만 쓰는 앱은 구글 심사 없이 전환할 수 있는 것으로 알려져 있다. 다만 전환 후 로그인할 때 "확인되지 않은 앱" 경고가 뜨는지는 **아직 확인하지 못했다**. 경고가 뜨면 **고급 → 이동** 을 눌러 진행하면 된다(본인이 만든 앱이므로 안전하다).

## 3. 클라이언트 ID 등록 (Claude가 하거나, 일부는 직접)

- 이 컴퓨터의 개발용 `.env` 파일: Claude가 넣는다.
- GitHub 저장소 **Settings → Secrets and variables → Actions → Variables 탭 → New repository variable**
  - Name: `VITE_GOOGLE_CLIENT_ID`
  - Value: 복사한 클라이언트 ID
  - 등록한 뒤 **Actions** 탭에서 "Deploy to GitHub Pages" 를 열고 **Run workflow** 를 눌러 다시 배포한다.

## 4. 각 컴퓨터에서 처음 한 번

> ⚠️ 지금까지 `http://localhost:5173` 에 입력한 데이터는 그 주소의 브라우저 저장소에만 있다. GitHub Pages 주소에서는 보이지 않는다.
> 옮기는 방법은 둘 중 하나다:
> - localhost 화면에서 먼저 **구글 드라이브 연결** 을 해서 드라이브에 올린다. 또는
> - localhost에서 **내보내기** 한 JSON을 Pages 주소에서 **불러오기** 한다.

1. 데이터가 있는 컴퓨터부터 시작한다. 앱 주소를 열고 위쪽의 **구글 드라이브 연결** 을 누른 뒤 로그인하고 허용한다.
   → 드라이브에 `worktimeline-data.json` 이 생긴다.
2. 나머지 두 컴퓨터에서도 같은 주소를 열고 **구글 드라이브 연결** 을 누른다. → 드라이브의 데이터를 받아온다.
3. 그 뒤로는 수정할 때마다 몇 초 안에 드라이브에 저장된다. 다른 컴퓨터는 창으로 돌아오면 바뀐 내용을 받아온다.
4. 두 컴퓨터에서 동기화 전에 따로 수정했다면, 덮어쓰기 전에 **어느 쪽을 남길지** 묻는 창이 뜬다.
