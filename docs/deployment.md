# Cloudflare 배포와 메인 도메인

메인 도메인: **https://21st-ark.dev**. https://21stark.dev는 경로·쿼리를 유지하여 308 이동합니다. 두 도메인의 Custom Domain 연결은 유지합니다. 전환 전에 시작한 OAuth 콜백만 원래 호스트에서 처리합니다. 세션 쿠키는 호스트별이므로 새 메인 도메인에서 다시 로그인해야 합니다. 기존 호스트로 보내는 변경 요청은 421로 거부하며 다른 도메인으로 본문을 자동 전달하지 않습니다.

| 설정 | 프론트 | API |
|---|---|---|
| Worker | 21st-ark-web | 21st-ark-api |
| 저장소 루트 | / | / |
| 빌드 | npm run build:frontend | npm run build:backend |
| 배포 | npm run deploy:frontend | npm run deploy:backend |

API 배포 명령은 D1 원격 마이그레이션을 먼저 적용합니다. 0014 → 0015 → 0016을 적용한 뒤 새 API를 배포합니다. 웹은 API service binding을 사용합니다. workers.dev와 Preview URL은 양쪽 Worker에서 끄며 공개 접속은 Custom Domain으로만 받습니다.

프론트 assets.run_worker_first=true는 HTML의 CSP/HSTS/클릭재킹 방지 헤더와 도메인 이동이 정적 파일 응답에서도 적용되게 합니다. 정적 자산 요청도 Worker 실행을 통과하므로 Workers 요청 사용량을 함께 확인합니다. API 오류 로그는 활성화하되 invocation_logs와 traces는 꺼 OAuth 코드·쿠키가 요청 로그에 저장되지 않게 합니다.

사용자 이미지는 비공개 R2 21st-ark-media의 MEDIA 바인딩으로 읽고 /api/media에서 권한을 검사합니다. 로고·아이콘은 프론트 /assets에 포함합니다. R2의 media.21stark.dev Access 및 Public Development URL을 모두 끕니다. Access를 꺼도 기존 CDN 캐시가 응답할 수 있으므로 이전 zone의 `http.host eq "media.21stark.dev"` Block 규칙을 유지하고 해당 호스트의 캐시를 Purge합니다. 기존 실제 이미지 URL의 403과 앱 `/api/media`의 200을 함께 확인해야 합니다. MEDIA_BASE_URL은 과거 문서 URL을 인식하는 호환 설정이며 새 이미지 응답 주소로 사용하지 않습니다. 저장된 이미지와 DB를 삭제하지 않습니다.

OAuth의 신규 시작 주소와 Homepage URL은 https://21st-ark.dev, 콜백은 /api/auth/callback/google 및 /api/auth/callback/github입니다. Google 승인된 JavaScript 원본에는 https://21st-ark.dev를 유지합니다. 전환 기간에는 기존 21stark.dev 콜백 등록과 AUTH_ORIGINS를 함께 유지합니다. 로컬은 http://127.0.0.1:3000을 사용합니다.

로컬 검증: npm run check, npm run test:security-performance, npm run test:features, npm run test:github, npm run test:account-controls, npm run test:render. 운영 설정은 docs/owasp-review.md의 실측 결과를 확인합니다.
