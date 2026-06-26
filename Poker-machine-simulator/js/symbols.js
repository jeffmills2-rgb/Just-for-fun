// symbols.js — reel symbol artwork (SVG) + theme packs. Pure data, no DOM.

/* ====================== SYMBOLS / PAYLINES ======================
   High-quality faceted "gem medallion" artwork. Each symbol is an
   octagonal cut gem set in an ornate gold cabinet frame with cut
   facets, an inner glow, a glass gloss highlight and an embossed
   glyph — mirroring the look of premium Aristocrat reel symbols.
   Signatures are unchanged so every theme pack keeps working.        */
function hashId(s){ let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0; return "s"+h.toString(36); }
// 8 facet triangles fanning out from centre to each octagon vertex,
// alternating light/dark for a cut-crystal sparkle.
const OCT = [[50,6],[81,19],[94,50],[81,81],[50,94],[19,81],[6,50],[19,19]];
function facetPolys(){
  let out="";
  for(let i=0;i<8;i++){
    const a=OCT[i], b=OCT[(i+1)%8];
    const fill = i%2===0 ? "rgba(255,255,255,.20)" : "rgba(0,0,0,.20)";
    out += `<polygon points="50,50 ${a[0]},${a[1]} ${b[0]},${b[1]}" fill="${fill}"/>`;
  }
  return out;
}
function svgIcon(label, bg1, bg2, fg="#ffffff", accent="#ffd24a", small=""){
  const id = hashId(label+bg1+bg2+fg+accent);
  const sub = small ? `<text x="50" y="82" text-anchor="middle" font-size="14" font-weight="900" fill="${accent}" stroke="rgba(0,0,0,.5)" stroke-width="2.4" paint-order="stroke" font-family="Arial, sans-serif">${small}</text>` : "";
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${label}">
    <defs>
      <radialGradient id="core${id}" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stop-color="${bg1}"/><stop offset="52%" stop-color="${bg2}"/>
        <stop offset="100%" stop-color="${bg2}" stop-opacity=".55"/>
      </radialGradient>
      <linearGradient id="frame${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff3bd"/><stop offset="42%" stop-color="${accent}"/>
        <stop offset="72%" stop-color="#a9741a"/><stop offset="100%" stop-color="#5e3d08"/>
      </linearGradient>
      <radialGradient id="glow${id}" cx="50%" cy="44%" r="60%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <polygon points="50,2 86,15 98,50 86,86 50,98 14,86 2,50 14,15"
      fill="url(#frame${id})" stroke="rgba(0,0,0,.45)" stroke-width="1.5"/>
    <polygon points="50,9 80,21 91,50 80,79 50,91 20,79 9,50 20,21"
      fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4"/>
    <polygon points="50,6 81,19 94,50 81,81 50,94 19,81 6,50 19,19"
      fill="url(#core${id})" stroke="rgba(0,0,0,.30)" stroke-width="1"/>
    ${facetPolys()}
    <circle cx="50" cy="48" r="30" fill="url(#glow${id})"/>
    <ellipse cx="40" cy="28" rx="20" ry="11" fill="rgba(255,255,255,.34)"/>
    <text x="50" y="62" text-anchor="middle" font-size="40" font-weight="900" fill="${fg}"
      stroke="rgba(0,0,0,.55)" stroke-width="3" paint-order="stroke"
      font-family="Georgia,'Times New Roman',serif">${label}</text>
    ${sub}
  </svg>`;
}
function orbIcon(label="◉", accent="#ffd24a"){
  const id = hashId("orb"+label+accent);
  return `<svg viewBox="0 0 100 100" role="img" aria-label="Feature orb">
    <defs>
      <radialGradient id="ball${id}" cx="36%" cy="28%" r="78%">
        <stop offset="0%" stop-color="#fff8cf"/><stop offset="30%" stop-color="${accent}"/>
        <stop offset="72%" stop-color="#b9760f"/><stop offset="100%" stop-color="#5b2c02"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="46" fill="#3a2402" stroke="#ffe27a" stroke-width="3"/>
    <circle cx="50" cy="50" r="40" fill="url(#ball${id})" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
    <ellipse cx="38" cy="30" rx="15" ry="9" fill="rgba(255,255,255,.72)"/>
    <circle cx="64" cy="66" r="8" fill="rgba(255,255,255,.18)"/>
    <text x="50" y="63" text-anchor="middle" font-size="34" font-weight="900" fill="#4a1c00"
      stroke="rgba(255,255,255,.35)" stroke-width="1.2" paint-order="stroke"
      font-family="Georgia,serif">${label}</text>
  </svg>`;
}
export const BASE_SYMBOLS = [
  {id:"STAR",w:0.05}, {id:"DIAMOND",w:0.06}, {id:"CIRCLE",w:0.08}, {id:"TRIANGLE",w:0.10},
  {id:"A",w:0.13}, {id:"K",w:0.15}, {id:"Q",w:0.18}, {id:"J",w:0.23},
  {id:"ORB",w:0.02,scatter:true}
];
// Single theme pack. The app uses one game only — Mathematics Growth Adventure.
// The reel art comes from your own PNGs in assets/themes/maths/ (see IMAGES.md);
// the SVG glyphs below are only fallbacks shown if an image is missing.
export const SYMBOL_THEMES = {
  maths:{
    label:"Mathematics Growth Adventure", machineName:"MATHEMATICS GROWTH ADVENTURE",
    symbols:{
      STAR:{name:"Symbol 1",g:svgIcon("π","#cfe0f5","#002664","#ffffff","#D7153A"),c:"s-star"},
      DIAMOND:{name:"Symbol 2",g:svgIcon("Σ","#cfe0f5","#1D428A","#ffffff","#D7153A"),c:"s-diamond"},
      CIRCLE:{name:"Symbol 3",g:svgIcon("√","#cfe0f5","#002664","#ffffff","#407EC9"),c:"s-circle"},
      TRIANGLE:{name:"Symbol 4",g:svgIcon("Δ","#cfe0f5","#1D428A","#ffffff","#407EC9"),c:"s-triangle"},
      A:{name:"Symbol 5",g:svgIcon("×","#f6c9d2","#D7153A","#ffffff","#ffffff"),c:"s-A"},
      K:{name:"Symbol 6",g:svgIcon("÷","#cfe0f5","#002664","#ffffff","#407EC9"),c:"s-K"},
      Q:{name:"Symbol 7",g:svgIcon("+","#f6c9d2","#D7153A","#ffffff","#ffffff"),c:"s-Q"},
      J:{name:"Symbol 8",g:svgIcon("=","#cfe0f5","#1D428A","#ffffff","#407EC9"),c:"s-J"},
      ORB:{name:"Feature Orb",g:orbIcon("∞","#407EC9"),c:"s-orb"}
    }
  }
};
