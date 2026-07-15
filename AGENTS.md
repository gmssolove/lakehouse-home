# lakehouse-home — AI 작업 가이드

## 푸시 / 배포

사용자가 **푸시**를 요청하면 `git push`로 끝내지 않는다.

1. 커밋 → `main` push  
2. GitHub Actions **Deploy to Cloudflare** 성공까지 대기  
3. https://lakehouse.me.kr/ 반영 확인 후 완료 보고  

`package.json` 의존성을 바꾸면 **`pnpm-lock.yaml`도 반드시** 같이 커밋한다 (`pnpm install --frozen-lockfile`).

## 어디를 수정해야 하나?

| 목적 | 편집 경로 | 하지 말 것 |
|------|-----------|------------|
| **개발·수정 (항상 여기)** | `C:\Users\user\Downloads\files\` | `dist/` 직접 수정 |
| OC 페이지 | `oc.html` + `src/oc/` | `dist/oc.html` |
| Pair 페이지 | `pair.html` | `dist/pair.html` |
| 메인 홈 | `index.html` | `dist/index.html` |
| 如月高校 | `kisaragi.html`, `characters.html`, `admin.html` | — |
| 정적 공용 파일 | `static/` (R2 업로드 JS 등) | — |
| Cloudflare R2 Worker | `worker/r2-upload-worker.js` | — |

**`dist/`는 `pnpm build` / `npx vite build` 결과물입니다.**  
`localhost:5173`은 **루트 HTML**을 서빙합니다. `dist/`를 고치면 dev 미리보기에 반영되지 않습니다.

## 프로젝트 구조

```
files/                          ← 프로젝트 루트 (여기서 작업)
├── oc.html                     ← OC HTML 셸 (마크업만, ~250줄)
├── pair.html
├── index.html
├── src/
│   └── oc/                     ← OC 모듈 (CSS/JS 분리됨)
│       ├── main.js             ← Vite 엔트리
│       ├── styles/
│       │   ├── index.css       ← @import 허브
│       │   ├── base.css        ← 기본 레이아웃/카드
│       │   ├── oc-rebuild.css  ← 상세 화면 레이아웃
│       │   ├── oc-char-vn-fix.css ← 캐릭터 이미지·VN
│       │   └── …
│       └── js/
│           ├── firebase.js     ← Firebase RTDB 동기화
│           ├── app.js          ← openDetail, renderGrid 등 핵심
│           ├── oc-rebuild.js   ← VN 대사창, 사이드 패널
│           ├── oc-restore-final.js ← 저장, extraInfo
│           └── …
├── static/                     ← publicDir (lakehouse-r2.js)
├── scripts/
│   ├── split-html.mjs          ← HTML → src/ 추출
│   └── apply-slim-html.mjs     ← HTML 셸로 교체
├── vite.config.js
└── dist/                       ← 빌드 출력 (gitignore)
```

## OC 페이지 수정 요령

### CSS
- **기본 UI**: `src/oc/styles/base.css`
- **캐릭터 상세·이미지 크기**: `src/oc/styles/oc-char-vn-fix.css`, `oc-side-info-restore.css`
- **VN 대사창**: `oc-dialogue-*.css`, `oc-profile-dialogue-final2.css`
- 새 CSS 추가 시 `src/oc/styles/index.css`에 `@import` 한 줄 추가

### JavaScript
- **캐릭터 목록/상세 열기**: `src/oc/js/app.js` (`openDetail`, `renderGrid`)
- **VN 클릭 대화**: `src/oc/js/oc-rebuild.js` (`startDialogue`, `bindCharClick`)
- **오른쪽 Info 추가 필드**: `src/oc/js/oc-restore-final.js` (`extraInfo`)
- **저장**: `src/oc/js/oc-restore-final.js` (`saveChar`)

`app.js` 함수는 HTML `onclick="..."` 에서 쓰이므로 `Object.assign(window, …)` 로 전역 노출이 필요합니다.

## 명령어

```bash
cd C:\Users\user\Downloads\files
npx vite              # dev → http://localhost:5173/oc.html
npx vite build        # dist/ 생성
npx vite preview      # dist 미리보기
```

## HTML 모듈 분리 (pair/index 등)

```bash
node scripts/split-html.mjs pair.html pair
node scripts/apply-slim-html.mjs pair.html pair
```

`pair.html` → `src/pair/` 로 동일하게 분리 가능. OC는 이미 적용됨.

## 두 사이트

1. **lakehouse** (`index`, `oc`, `pair`) — Firebase RTDB + R2, 골드 테마
2. **如月高校** (`kisaragi`, `characters`, `admin`) — localStorage, 레드 테마

공유 코드는 아직 `index`/`pair`에 인라인으로 남아 있음. 추후 `src/shared/` 로 점진 이전 예정.

## Cursor 워크스페이스

워크스페이스가 `files/dist`로 열려 있으면 **루트 `files/`** 로 열거나, 항상 `files/oc.html` 경로를 사용하세요.

---

## Express API (Feature-based)

백엔드는 프론트 `src/oc/` 와 분리해 **`server/src/`** 에 둡니다.

```
server/
├── server.js                 ← node server.js
└── src/
    ├── app.js                ← Express 앱 + 라우터 마운트
    ├── shared/db.js          ← 공통 DB 샘플
    ├── auth/
    │   ├── auth.router.js
    │   ├── auth.controller.js
    │   └── auth.service.js
    └── users/
        ├── users.router.js
        ├── users.controller.js
        └── users.service.js
```

```bash
cd server && npm install && npm run dev
# GET  http://localhost:3000/health
# POST http://localhost:3000/auth/login  {"email":"demo@lakehouse.local","password":"demo123"}
# GET  http://localhost:3000/users
```

새 기능 추가: `server/src/{feature}/` 에 router · controller · service 3파일 생성 후 `app.js`에 `app.use('/{feature}', router)` 등록.

## Cursor 규칙 (`.cursor/rules/`)

| 파일 | 적용 |
|------|------|
| `lakehouse-project.mdc` | 항상 — 루트 경로, 3층 분리, dev 명령 |
| `server-feature-structure.mdc` | `server/**` 작업 시 — router/controller/service |
| `frontend-module-structure.mdc` | `oc.html`, `src/**` 작업 시 — HTML 셸 + 모듈 |
