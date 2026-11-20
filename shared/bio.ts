/** Compact, non-rendering excerpt for cards and search/social descriptions. */
export function plainBio(value:unknown){
  return String(value??'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]*>/g,'').replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-+*]\s+|\d+[.)]\s+)/gm,'').replace(/(`+)([^`]+)\1/g,'$2').replace(/(\*\*|__|~~)([\s\S]+?)\1/g,'$2').replace(/(^|\s)([*_])([^\n]*?\S)\2(?=\s|[.,!?]|$)/g,'$1$3').replace(/\s+/g,' ').trim();
}
