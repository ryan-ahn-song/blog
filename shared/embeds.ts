export function safeEmbedUrl(value:unknown):string|null {
  if(typeof value!=='string'||value.length>2048||/[\s\p{Cc}]/u.test(value.trim()))return null;
  try{
    const url=new URL(value.trim());
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
    return url.href;
  }catch{return null;}
}

function startTime(value:string|null){
  if(!value)return 0;
  if(/^\d+$/.test(value))return Math.min(Number(value),604800);
  const match=value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return match?Math.min(Number(match[1]??0)*3600+Number(match[2]??0)*60+Number(match[3]??0),604800):0;
}

/** Only recognized provider IDs can become an iframe source. Arbitrary pages stay links. */
export function describeEmbed(value:unknown){
  const href=safeEmbedUrl(value);
  if(!href)return null;
  const url=new URL(href),host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
  if(!url.port){
    const youtubeHosts=['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'];
    const youtubeId=['youtu.be','www.youtu.be'].includes(host)?parts[0]:youtubeHosts.includes(host)?(parts[0]==='watch'?url.searchParams.get('v'):['embed','shorts','live'].includes(parts[0])?parts[1]:null):null;
    if(youtubeId&&/^[a-zA-Z0-9_-]{11}$/.test(youtubeId)){
      const params=new URLSearchParams({playsinline:'1',rel:'0'}),start=startTime(url.searchParams.get('start')??url.searchParams.get('t'));
      if(start)params.set('start',String(start));
      return {kind:'video',provider:'YouTube',url:href,host,embedSrc:'https://www.youtube-nocookie.com/embed/'+youtubeId+'?'+params};
    }
    const vimeoId=['vimeo.com','www.vimeo.com'].includes(host)?parts[0]:host==='player.vimeo.com'&&parts[0]==='video'?parts[1]:null;
    if(vimeoId&&/^[1-9]\d{0,11}$/.test(vimeoId)){
      const params=new URLSearchParams({dnt:'1'}),privateHash=url.searchParams.get('h')??(['vimeo.com','www.vimeo.com'].includes(host)?parts[1]:null);
      if(privateHash&&/^[a-zA-Z0-9]{6,32}$/.test(privateHash))params.set('h',privateHash);
      return {kind:'video',provider:'Vimeo',url:href,host,embedSrc:'https://player.vimeo.com/video/'+vimeoId+'?'+params};
    }
  }
  return {kind:'link',provider:'',url:href,host,embedSrc:null};
}
