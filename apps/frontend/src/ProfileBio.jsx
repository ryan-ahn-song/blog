import {lazy,Suspense} from 'react';
import {plainBio} from '../../../shared/bio';
import './profile-bio.css';
const Markdown=lazy(()=>import('./BioMarkdown'));
export default function ProfileBio({value}){
  if(!value?.trim())return null;
  return <div className="profile-bio"><Suspense fallback={<p>{plainBio(value)}</p>}><Markdown value={value}/></Suspense></div>;
}
