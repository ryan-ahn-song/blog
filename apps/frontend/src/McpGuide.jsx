import {useState} from 'react';
import {CANONICAL_ORIGIN} from '../../../shared/site';
import {roleName} from './api';
import './mcp.css';

export default function McpGuide({user,onAccount,onApply,onLogin}){
  const [copied,setCopied]=useState(false),[error,setError]=useState('');
  const endpoint=CANONICAL_ORIGIN+'/mcp',canWrite=['author','admin'].includes(user?.role);
  async function copy(){try{await navigator.clipboard.writeText(endpoint);setCopied(true);setError('');}catch{setError('주소를 복사하지 못했어요. 아래 주소를 직접 복사해 주세요.');}}
  return <div className="mcp-guide">
    <p className="settings-note">사용하는 AI 앱에 21st ARK를 연결하면 내 포스트를 조회하고, 이미지·링크가 들어간 Markdown 초안을 함께 작성할 수 있어요.</p>
    <div className="mcp-endpoint"><code>{endpoint}</code><button type="button" className="text-button" onClick={copy}>{copied?'복사했어요':'주소 복사'}</button></div>
    <p className="mcp-guide-copy" role="status" aria-live="polite">{copied?'MCP 주소를 복사했습니다. AI 앱의 서버 주소에 붙여 넣어 주세요.':''}</p>
    {error&&<p className="auth-error" role="alert">{error}</p>}
    <section className="settings-section"><h3>연결하는 순서</h3><ol className="mcp-guide-steps">
      <li><strong>AI 앱에서 원격 MCP 서버를 추가하세요.</strong><p>외부 도구·MCP·커넥터 설정에서 위 주소를 입력하고, 인증 방식은 OAuth를 선택하세요. 메뉴 이름과 지원 여부는 앱마다 달라요.</p></li>
      <li><strong>21st ARK 계정으로 로그인하세요.</strong><p>연결을 시작하면 브라우저에서 승인 화면이 열립니다. 기존 Google 또는 GitHub 로그인을 이용하면 됩니다. Client ID나 시크릿을 직접 입력할 필요는 없어요.</p></li>
      <li><strong>앱과 허용할 권한을 확인하세요.</strong><p>연결 앱의 이름과 돌아갈 주소를 확인하고 필요한 권한만 선택하세요. 초안 작성에는 ‘초안 생성·수정, 이미지 업로드와 분류 관리’를 허용해야 합니다. 승인해도 계정의 작성 권한이 새로 생기지는 않아요.</p></li>
      <li><strong>AI와 초안을 만든 뒤 웹에서 업로드하세요.</strong><p>저장이 끝나면 AI가 안내하는 편집 주소를 열거나 ‘내 포스트 관리’에서 초안을 확인하세요. 본문·이미지·링크를 검토한 뒤 직접 ‘업로드하기’를 눌러 주세요.</p></li>
    </ol></section>
    <p className="mcp-human-only">AI는 초안만 저장합니다.<br/>공개 업로드·공개 포스트 수정·삭제는 웹에서 직접 진행합니다.</p>
    <section className="settings-section"><h3>내 계정으로 가능한 작업</h3>
      <p className="mcp-guide-role">{user?<>현재 권한 <strong>{roleName(user.role)}</strong></>:'로그인 후 계정 권한에 따라 사용할 수 있어요.'}</p>
      <div className="mcp-guide-table"><table><thead><tr><th scope="col">계정 권한</th><th scope="col">웹에서</th><th scope="col">MCP에서</th></tr></thead><tbody><tr><th scope="row">열람자</th><td>포스트 작성 불가</td><td>내 계정 정보 조회</td></tr><tr><th scope="row">작성자·관리자</th><td>작성·공개 업로드</td><td>내 포스트·통계 조회와 초안 작성</td></tr></tbody></table></div>
      <p className="settings-note">MCP는 관리자 계정이라도 본인 데이터만 다룹니다. 실제 계정 권한과 앱에 허용한 권한을 서버에서 모두 확인합니다.</p>
      {!user?<button type="button" className="pill" onClick={onLogin}>로그인하기</button>:!canWrite?<><p className="settings-note">초안을 작성하려면 먼저 작성자 승인이 필요합니다.</p><button type="button" className="pill" onClick={onApply}>작성자 신청하기</button></>:<p className="settings-note">예시 요청: “이미지와 참고 링크, 표가 들어간 Markdown 초안을 저장하고 편집 주소를 알려줘.”</p>}
    </section>
    <section className="settings-section"><h3>연결 관리와 문제 해결</h3><p className="settings-note">‘계정 및 설정 → 연결된 앱’에서 허용한 권한·최근 활동을 확인하고 연결을 해제할 수 있어요. 해제하면 해당 앱의 이후 접근이 차단됩니다.</p>{user&&<button type="button" className="pill" onClick={onAccount}>연결된 앱 관리</button>}
      <details><summary>초안을 저장할 수 없어요.</summary><p>21st ARK 계정이 작성자 또는 관리자인지 확인하세요. 계정에 권한이 있어도 앱에 초안 작성 권한을 허용하지 않았다면 저장할 수 없습니다. AI 앱에서 다시 연결해 필요한 권한을 선택해 주세요.</p></details>
      <details><summary>연결이 만료되거나 승인 화면이 열리지 않아요.</summary><p>연결 요청은 10분 후 만료됩니다. AI 앱에서 다시 연결을 시작하세요. 사용하는 앱이 원격 MCP와 OAuth를 지원하는지도 확인해 주세요.</p></details>
    </section>
  </div>;
}
