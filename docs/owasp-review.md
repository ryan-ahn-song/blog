# OWASP 재점검 및 운영 적용

기준: 2026-11-16, OWASP Cheat Sheet Series의 Authentication, Session Management, Authorization, File Upload, CSRF, CSP 원칙. 점검은 관련 경로의 코드·회귀 테스트·운영 설정 확인이며 모든 OWASP 항목의 인증이나 완전한 침투 테스트를 의미하지 않습니다.

## 이번에 추가한 보강

- assets.run_worker_first=true: HTML을 포함한 실제 응답이 보안 헤더 코드와 canonical 리다이렉트를 통과하도록 수정.
- 21st-ark.dev를 메인으로 정하고 canonical/og:url/도메인 순서를 변경. 이전 도메인은 308 이동, 진행 중인 이전 OAuth callback은 원래 호스트에서 검증. 도메인 간 인증 쿠키·요청 본문은 전달하지 않음.
- 로고/파비콘은 앱의 /assets로 이동하여 비공개 R2 전환 후에도 정상 표시.
- API/웹 workers.dev 및 미리보기 URL 차단. API는 웹의 service binding으로만 호출.
- 서버에서 권한별 idle/absolute 세션 만료 적용. 관리자 30분/8시간, 작성자 1시간/24시간, 열람자 4시간/7일. 활동 갱신 쓰기는 5분에 한 번 이하로 제한.
- API 오류 로그 활성화. invocation request 로그와 traces는 비활성화하여 OAuth 코드·쿠키를 로그로 수집하지 않음.
- 기존의 최근 인증 일회성, 세션 버전·회전, CSRF/소유권/역할 검사, 문서·링크 검증, R2 용량/픽셀 제한, 계정별 메모리 캐시 격리를 회귀 검증.

## 운영 확인 기록

- Cloudflare API Worker의 공개 Production URL 및 Preview URL 비활성화: 브라우저에서 적용.
- R2 Public Development URL: 기존 비활성 상태 확인.
- R2 Custom Domain / WAF / 최종 배포 결과: 아래에 작업 완료 후 실측 결과 기록.

## 별도 한계

서버의 이미지 전체 디코딩·재인코딩/EXIF 제거는 아직 없으며, 악성 파일 스캔·외부 이미지 처리 서비스를 새로 구매하거나 활성화하지 않았습니다. 현재는 JPG/PNG/WebP만 허용하고 파일 크기·시그니처·치수·저장 한도, 권한 프록시, 고정 Content-Type/nosniff로 방어합니다. 세션 재인증은 연결된 동일 OAuth ID를 검증하며 제공자의 비밀번호/MFA 재입력을 강제하지 않습니다. 법적 문서의 처리 지역·국외 이전 고지는 운영자 검토가 필요합니다.

## 근거

- https://github.com/OWASP/CheatSheetSeries
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
