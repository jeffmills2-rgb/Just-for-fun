// paytable.js — paylines + pay values. Pure data.

// Row numbers: 0 = top, 1 = middle, 2 = bottom. Each payline has one row per reel.
// The first 20 are the classic hand-authored lines; the remaining lines are
// generated deterministically so the machine can run up to 50 active lines
// (matching the PLAY 1 / 5 / 10 / 30 / 50 buttons on the deck).
const CORE_LINES = [
  [1,1,1,1,1], [0,0,0,0,0], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2],
  [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [0,1,1,1,2],
  [2,1,1,1,0], [0,1,0,1,0], [2,1,2,1,2], [1,0,1,2,1], [1,2,1,0,1],
  [0,0,2,0,0], [2,2,0,2,2], [0,2,0,2,0], [2,0,2,0,2], [1,0,2,0,1]
];

// Build a 50-line set: start with the curated lines above, then fill with
// further distinct row patterns until we reach 50 (deterministic order).
function buildPaylines(target = 50){
  const lines = [];
  const seen = new Set();
  const add = rows => { const k = rows.join(""); if(!seen.has(k)){ seen.add(k); lines.push(rows); } };
  CORE_LINES.forEach(add);
  // Deterministic fill: walk all 3^5 = 243 row combinations in order and add
  // any not already present, until we have `target` lines.
  for(let n = 0; n < 243 && lines.length < target; n++){
    const rows = [];
    let v = n;
    for(let r = 0; r < 5; r++){ rows.push(v % 3); v = Math.floor(v / 3); }
    add(rows);
  }
  return lines.slice(0, target);
}

export const PAYLINES = buildPaylines(50);

export const PAYTABLE = {
  STAR:{3:50,4:200,5:800}, DIAMOND:{3:30,4:120,5:500}, CIRCLE:{3:20,4:80,5:300}, TRIANGLE:{3:15,4:50,5:200},
  A:{3:8,4:25,5:100}, K:{3:6,4:20,5:80}, Q:{3:5,4:15,5:60}, J:{3:3,4:10,5:40}
};
