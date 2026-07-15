# 키사라기고교 VN — Tauri 데스크톱

## 개발

```bash
npm run tauri:dev
```

- Next.js(`127.0.0.1:3004`) + Tauri 창이 `/vn/test_scene` 을 연다.
- 이미 `npm run dev` 가 떠 있으면 포트를 재사용한다.
- 창: 1280×720 (최소 960×540), 타이틀 **키사라기고교**, F11 풀스크린.

## 프로덕션 빌드

사이트는 Cloudflare Opennext·API 라우트·middleware 를 쓰므로 **VN용 정적 export** 로 패키징한다.

```bash
npm run tauri:build
```

`build:tauri` 가 잠시 `app/api`·`middleware.ts` 를 치우고 `output: 'export'` 후 `.tauri-frontend` 에 복사한다.

웹 배포(`npm run build` / `build:cf`)에는 영향 없다 (`TAURI_BUILD=1` 일 때만 export).

## 요구 사항 (Windows)

1. Rust (`rustup`) — `rustc --version`
2. **Visual Studio Build Tools 2022** + “C++로 데스크톱 개발” (MSVC `link.exe`)
3. WebView2 Runtime (Windows 10/11 기본 포함인 경우 많음)

## 아이콘

`src-tauri/icons/` — 현재 플레이스홀더. 나중에:

```bash
npx tauri icon path/to/1024.png
```

## Firebase 세이브

WebView에서도 Anonymous Auth + RTDB 는 브라우저와 동일하게 네트워크로 동작한다. CSP는 `null`(제한 없음).
