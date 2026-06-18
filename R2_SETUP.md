# Lakehouse R2 이미지 저장 설정

이 사이트는 정적 HTML이라 브라우저에서 파일을 바로 Firebase DB에 넣으면 용량/저장 한계에 금방 걸립니다. 그래서 이미지는 Cloudflare R2에 저장하고, OC/배너 데이터에는 이미지 URL만 저장하도록 만들었습니다.

## 1. Cloudflare에서 준비

1. R2 버킷을 만듭니다. 기본 설정 파일 기준 이름은 `lakehouse-images`입니다.
2. Worker를 배포합니다.
3. 업로드를 막기 위한 토큰을 secret으로 넣습니다.

```powershell
corepack pnpm wrangler login
corepack pnpm wrangler secret put UPLOAD_TOKEN
corepack pnpm r2:deploy
```

## 2. 사이트에서 연결

관리자 화면의 R2 설정 칸에 아래 두 값을 넣으면 됩니다.

- Upload URL: `https://<worker-name>.<account>.workers.dev/upload`
- Upload Token: 위에서 `UPLOAD_TOKEN`으로 넣은 값

OC 수정 화면에서도 같은 R2 설정 칸이 보입니다. 한 번 저장하면 브라우저 `localStorage`에 저장됩니다.

## 3. 공개 URL

`PUBLIC_BASE_URL`을 설정하지 않으면 Worker의 `/file/...` 경로로 이미지를 보여줍니다. R2 public/custom domain을 연결했다면 `wrangler.toml`의 `PUBLIC_BASE_URL` 예시를 켜거나 Cloudflare Worker 변수로 넣으면 업로드된 이미지 URL이 그 도메인으로 저장됩니다.

## 4. 작동 방식

- R2 설정이 있으면 이미지/오디오 파일 업로드 시 R2 URL이 입력칸에 들어갑니다.
- R2 설정이 없거나 업로드가 실패하면 기존처럼 base64 data URL로 임시 저장됩니다.
- Firebase/LocalStorage에는 파일 원본이 아니라 URL 문자열만 저장되는 구조가 됩니다.