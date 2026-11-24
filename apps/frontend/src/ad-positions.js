// Seeded placement keeps existing slots stable while the same feed grows.
// This is layout randomness, not authentication or cryptographic randomness.
export function adPositionsFor(count,total,seed){
  let state=2166136261;
  for(const char of String(seed))state=Math.imul(state^char.charCodeAt(0),16777619);
  state=state>>>0||1;
  function gap(){state^=state<<13;state^=state>>>17;state^=state<<5;return 3+(state>>>0)%3;}
  const positions=new Set();
  for(let after=gap();after<=count;after+=gap())positions.add(after);
  // Preserve minimum-one for complete short lists, never a temporary page tail.
  if(count>0&&count>=total&&!positions.size)positions.add(count);
  return positions;
}
