import './loading.css';

function Bar({width='100%',className=''}){return <span className={'sk-block sk-line '+className} style={{width}}/>;}
function Avatar(){return <span className="sk-block sk-avatar"/>;}
function Lines(){return <div className="sk-lines"><Bar/><Bar width="88%"/><Bar width="66%"/></div>;}
function Byline(){return <div className="sk-byline"><Avatar/><div><Bar width="42%"/><Bar width="28%"/></div></div>;}
function Post(){return <div className="sk-post"><Byline/><Bar width="72%" className="sk-title"/><Bar width="90%"/><div className="sk-block sk-media"/><div className="sk-actions"><span className="sk-block"/><span className="sk-block"/><span className="sk-block"/></div></div>;}
function Members(){return <div className="sk-members">{[0,1,2,3].map(id=><div className="sk-member" key={id}><Avatar/><Bar width="60%" className="sk-title"/><Bar width="85%"/><Bar width="68%"/></div>)}</div>;}
function Rows(){return <div className="sk-rows">{[0,1,2].map(id=><div className="sk-row" key={id}><Avatar/><Lines/></div>)}</div>;}
function Creators(){return <div className="sk-creators">{[0,1,2,3].map(id=><div key={id}><div className="sk-block sk-portrait"/><Bar width="60%"/><Bar width="84%"/></div>)}</div>;}
function Results(){return <div className="sk-results">{[0,1,2].map(id=><div className="sk-result" key={id}><Bar width="30%"/><Bar width="74%" className="sk-title"/><Lines/><Bar width="48%"/></div>)}</div>;}
function Profile(){return <div className="sk-profile"><div className="sk-block sk-cover"/><div className="sk-profile-body"><div className="sk-block sk-profile-avatar"/><Bar width="40%" className="sk-heading"/><Bar width="65%"/><div className="sk-tabs"><Bar width="60px"/><Bar width="60px"/></div><Post/></div></div>;}
function Reader(){return <div className="sk-reader"><Bar width="80px"/><Bar width="82%" className="sk-heading"/><Bar width="60%"/><Byline/><Lines/><Lines/><Lines/></div>;}
function Editor(){return <div className="sk-editor"><div className="sk-editor-details"><Bar width="50%" className="sk-title"/>{[0,1,2,3].map(id=><div className="sk-field" key={id}><Bar width="30%"/><div className={'sk-block '+(id===0?'sk-input':'sk-textarea')}/></div>)}</div><div className="sk-document"><div className="sk-toolbar"><span className="sk-block"/><span className="sk-block"/><span className="sk-block"/></div><Lines/><Lines/></div></div>;}
function Dashboard(){return <div className="sk-dashboard"><div className="sk-metrics">{[0,1,2,3].map(id=><div key={id}><Bar width="50%"/><div className="sk-block sk-number"/><Bar width="70%"/></div>)}</div><div className="sk-block sk-chart"/><Rows/></div>;}

export default function LoadingSkeleton({variant='feed',label='포스트를 불러오고 있어요.'}){
  let shape;
  switch(variant){
    case 'members':shape=<Members/>;break;
    case 'creators':shape=<Creators/>;break;
    case 'results':shape=<Results/>;break;
    case 'profile':shape=<Profile/>;break;
    case 'reader':shape=<Reader/>;break;
    case 'editor':shape=<Editor/>;break;
    case 'dashboard':shape=<Dashboard/>;break;
    case 'chart':shape=<div className="sk-block sk-chart"/>;break;
    case 'text':shape=<Lines/>;break;
    case 'rows':case 'comments':case 'account':shape=<Rows/>;break;
    case 'consent':shape=<div className="sk-consent"><Bar width="40%" className="sk-heading"/><Lines/><Rows/></div>;break;
    default:shape=<><Post/><Post/></>;
  }
  return <div className={'loading-skeleton skeleton-'+variant} aria-busy="true"><span className="sr-only" role="status">{label}</span><div className="skeleton-visual" aria-hidden="true">{shape}</div></div>;
}
