// Two palette colours and one-pixel image rectangles; logical dimensions can
// be enlarged independently to exercise compositing-work limits.
export function animatedGif({width=1,height=1,frames=2}={}){
 const word=n=>[n&255,(n>>8)&255],out=[...Buffer.from('GIF89a'),...word(width),...word(height),0x80,0,0,67,107,186,112,189,155];
 out.push(0x21,0xff,11,...Buffer.from('NETSCAPE2.0'),3,1,0,0,0);
 for(let i=0;i<frames;i++)out.push(0x21,0xf9,4,4,80,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,i%2?0x4c:0x44,1,0);
 return new Uint8Array([...out,0x3b]);
}
