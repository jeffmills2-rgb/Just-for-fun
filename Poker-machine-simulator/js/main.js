// main.js — engine, UI and wiring. Loaded as an ES module.
import { BASE_SYMBOLS, SYMBOL_THEMES } from './symbols.js';
import { PAYLINES, PAYTABLE } from './paytable.js';
import { Sound } from './sound.js';

/* ====================== CONFIG / PRESETS ====================== */
// Feature values are multipliers of TOTAL BET. Line pays are multipliers of BET PER ACTIVE LINE.
const PRESETS = {
  balanced: {
    name:"LUCKY ORBS",
    featureP:0.0165,
    startOrbs:[{n:6,p:.70},{n:7,p:.25},{n:8,p:.05}],
    orbLand:0.04,
    orbValues:[
      {v:1,p:.34},{v:2,p:.24},{v:3,p:.16},{v:5,p:.12},{v:8,p:.07},{v:12,p:.04},
      {v:15,p:.022,jp:"MINI"},{v:50,p:.007,jp:"MINOR"},{v:250,p:.0009,jp:"MAJOR"}
    ],
    grandMult:1500
  },
  frequent: {
    name:"STEADY STREAK",
    featureP:0.027,
    startOrbs:[{n:6,p:.80},{n:7,p:.18},{n:8,p:.02}],
    orbLand:0.035,
    orbValues:[
      {v:1,p:.42},{v:2,p:.27},{v:3,p:.15},{v:5,p:.09},{v:8,p:.04},
      {v:12,p:.0175,jp:"MINI"},{v:40,p:.0024,jp:"MINOR"},{v:200,p:.00009,jp:"MAJOR"}
    ],
    grandMult:1000
  },
  volatile: {
    name:"DRAGON HOARD",
    featureP:0.0145,
    startOrbs:[{n:6,p:.66},{n:7,p:.26},{n:8,p:.08}],
    orbLand:0.045,
    orbValues:[
      {v:1,p:.32},{v:2,p:.22},{v:3,p:.16},{v:5,p:.13},{v:10,p:.085},{v:20,p:.045},
      {v:25,p:.0125,jp:"MINI"},{v:80,p:.0045,jp:"MINOR"},{v:400,p:.0004,jp:"MAJOR"}
    ],
    grandMult:2500
  }
};
const JP_KEYS = {MINI:15,MINOR:50,MAJOR:250,GRAND:1500};

/* ====================== STATE ====================== */
let cfg = PRESETS.balanced;
let presetKey = "balanced";
let targetRTP = 0.90, payoutScale = 1, rawRTP = null;
// Aristocrat betting model: total bet = lines × bet-per-line(credits) × denom.
const LINE_OPTIONS = [1,5,10,30,50];
const BPL_OPTIONS = [1,2,3,5,10];      // bet multiplier (credits per active line)
let denom = 0.05, activeLines = 50, betPerLineCredits = 1;
let betPerLine = betPerLineCredits*denom;       // dollars per line
let bet = activeLines*betPerLineCredits*denom;  // dollars per spin
let depositAmount = 0;                          // chosen on the load screen
let startingBalance = 0, balance = 0;
let spinCount = 0, featureCount = 0, totalWagered = 0, totalWon = 0;
let largestWin = 0, hitCount = 0, lossRun = 0, maxLossRun = 0;
let sumReturn = 0, sumReturnSq = 0, spinReturns = [];
let balanceHistory = [0], resultFlags = [];
let theoRTP = null;
let spinning = false, autoOn = false, autoLeft = 0, autoTimer = null;
let featureSearchOn = false, featureSearchCancel = false;
let featureEnabled = true, gambleEnabled = true;
let pendingGamble = null;          // {amount (at risk), banked (secured), resolve}
let gambleStreak = 0;
let halfMode = false, gambleBusy = false;
const gambleHistory = [];          // recent {rk,s,color,win}
let pendingTheme = "maths";        // single game — Mathematics Growth Adventure
let currentGrid = [];
let lastWin = 0;

/* ====================== ELEMENTS ====================== */
const $ = id => document.getElementById(id);
const reelsEl=$("reels"), paylineSvg=$("paylineSvg"), fx=$("fx");
const balanceEl=$("balance"), plEl=$("pl"), resultEl=$("result"), gaugeFill=$("gaugeFill");
const betCalcEl=$("betCalc"), lastWinMeter=$("lastWinMeter"), paylineList=$("paylineList");
const machineNameEl=$("machineName");
const jpEls={MINI:$("jpMini"),MINOR:$("jpMinor"),MAJOR:$("jpMajor"),GRAND:$("jpGrand")};
const graph=$("graph"), gctx=graph.getContext("2d");
let reelEls=[];

let symbolThemeKey="maths";
const SYMBOLS = BASE_SYMBOLS.map(s=>({...s,name:s.id,g:s.id,c:""}));
const SYMBOL_BY_ID = Object.fromEntries(SYMBOLS.map(s=>[s.id,s]));
const ORB = SYMBOL_BY_ID.ORB;
// Per-theme cabinet background. Drop assets/themes/<theme>/background.png and it
// loads behind the machine; if it is missing the original gradient shows instead.
function applyThemeBackground(key){
  const machine=document.querySelector(".machine"); if(!machine) return;
  const url=`assets/themes/${key}/background.png`;
  const probe=new Image();
  probe.onload =()=> machine.style.setProperty("--machine-bg", `url("${url}")`);
  probe.onerror=()=> machine.style.setProperty("--machine-bg", "none");
  probe.src=url;
}
function applySymbolTheme(key=symbolThemeKey){
  symbolThemeKey = SYMBOL_THEMES[key] ? key : "maths";
  const theme = SYMBOL_THEMES[symbolThemeKey];
  SYMBOLS.forEach(sym=>{
    Object.assign(sym, theme.symbols[sym.id] || {});
    // Image path for this symbol in the current theme. Drop a PNG here and it
    // appears automatically; if the file is missing, the SVG art is used instead.
    sym.img = `assets/themes/${symbolThemeKey}/${sym.id}.png`;
  });
  applyThemeBackground(symbolThemeKey);
  const sel=document.getElementById("symbolTheme"); if(sel) sel.value=symbolThemeKey;
  const readout=document.getElementById("themeReadout"); if(readout) readout.textContent=theme.label;
  const title=document.getElementById("machineName"); if(title) title.textContent=theme.machineName;
  const loadTitle=document.getElementById("loadMachineName"); if(loadTitle) loadTitle.textContent=theme.machineName;
  if(currentGrid && currentGrid.length) renderGrid(currentGrid.map(s=>SYMBOL_BY_ID[s.id]));
  else if(reelEls && reelEls.length) renderGrid(randomGrid());
}

/* ====================== HELPERS ====================== */
const money = n => "$"+Number(n).toFixed(2);
// Credits = dollars / denomination, shown the way a real cabinet does.
const creditsOf = n => Math.round(Number(n)/denom);
const creditStr = n => creditsOf(n).toLocaleString();
const denomLabel = d => d>=1 ? "$"+d.toFixed(0) : (d*100)+"¢";
const moneyK = n => { n=Number(n); return n>=1000? "$"+(n/1000).toFixed(n>=10000?0:1)+"k" : "$"+n.toFixed(0); };
const pct = n => (n*100).toFixed(2)+"%";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function weighted(list){
  const r=Math.random(); let c=0;
  for(const it of list){ c+=it.p; if(r<c) return it; }
  return null;
}
function pickN(list){ const it=weighted(list); return it?it.n:list[0].n; }
function weightedSymbol(){
  const sum=SYMBOLS.reduce((s,o)=>s+o.w,0);
  let r=Math.random()*sum;
  for(const s of SYMBOLS){ r-=s.w; if(r<=0) return s; }
  return SYMBOLS[SYMBOLS.length-1];
}
function gridIndex(row,col){ return row*5+col; }
function cellAt(i){ return reelsEl.querySelector(`[data-index="${i}"]`); }
function countOrbs(grid){ return grid.filter(s=>s.id==="ORB").length; }

/* ====================== REELS ====================== */
function getCellH(){
  const r = reelEls[0];
  const w = Math.floor(r?.clientWidth || 95);
  // Symbols are sized by reel width (capped); the whole machine is then
  // scaled to the viewport by fitMachine() so it always fits the screen.
  // When the maths panel is hidden the cabinet goes landscape and fills the
  // screen, so cells are allowed to grow larger and stay roughly square.
  const collapsed = document.getElementById("layout")?.classList.contains("collapsed");
  return Math.max(46, Math.min(w, collapsed ? 150 : 88));
}
/* Scale the whole cabinet down so it always fits the viewport height
   (only when the maths panel is collapsed / single column). */
function fitMachine(){
  const m = document.querySelector(".machine");
  if(!m) return;
  const collapsed = $("layout").classList.contains("collapsed");
  m.style.transform = "none"; m.style.marginBottom = "0";
  if(!collapsed) return;                       // expanded: let the page scroll
  const top = m.getBoundingClientRect().top;
  const avail = window.innerHeight - top - 12;
  const natural = m.scrollHeight;
  if(natural < 1) return;
  const scale = Math.min(1, avail / natural);
  if(scale < 0.998){
    m.style.transformOrigin = "top center";
    m.style.transform = `scale(${scale})`;
    m.style.marginBottom = `${-(natural * (1 - scale))}px`;
  }
}
// When true, reel symbols render as <img> from assets/themes/<theme>/<ID>.png.
// Any image that fails to load falls back to the built-in SVG art, so the
// machine always looks complete even before real images are added.
let useImages = true;
function symInner(sym){
  if(useImages && sym.img){
    return `<img class="symImg" src="${sym.img}" alt="${sym.name||sym.id}" draggable="false" loading="eager" data-sym="${sym.id}" onerror="window.__symFallback(this)">`;
  }
  return sym.g;
}
// Global so it can be referenced from the inline onerror handler.
window.__symFallback = function(img){
  const s = SYMBOL_BY_ID[img.getAttribute("data-sym")];
  img.outerHTML = s ? s.g : "";
};
function symbolHTML(sym, index="", h=getCellH()){
  const orb = sym.id==="ORB" ? " orb" : "";
  const data = index==="" ? "" : ` data-index="${index}"`;
  return `<div class="reelSymbol${orb}"${data} style="height:${h}px"><span class="sym ${sym.c}">${symInner(sym)}</span></div>`;
}
function layoutReels(){
  const h = getCellH();
  reelEls.forEach(r=>{ r.style.height=(h*3)+"px"; });
}
function buildReels(){
  reelsEl.innerHTML=""; reelEls=[];
  for(let c=0;c<5;c++){
    const reel=document.createElement("div"); reel.className="reel"; reel.dataset.reel=c;
    reel.innerHTML=`<div class="reelStrip"></div>`;
    reelsEl.appendChild(reel); reelEls.push(reel);
  }
  layoutReels();
}
function renderGrid(grid){
  currentGrid = grid.slice();
  layoutReels();
  const h=getCellH();
  for(let col=0;col<5;col++){
    const strip=reelEls[col].querySelector(".reelStrip");
    strip.style.transition="none";
    strip.style.transform="translateY(0)";
    strip.innerHTML=[0,1,2].map(row=>symbolHTML(grid[gridIndex(row,col)], gridIndex(row,col), h)).join("");
  }
}
function randomGrid(){
  const grid=[];
  for(let row=0;row<3;row++) for(let col=0;col<5;col++) grid[gridIndex(row,col)] = weightedSymbol();
  return grid;
}
function forceScatterTrigger(grid){
  const want = pickN(cfg.startOrbs);
  const idx=[...Array(15).keys()]; idx.sort(()=>Math.random()-.5);
  for(let k=0;k<want;k++) grid[idx[k]]=ORB;
}
function generateSpinGrid(){
  const grid=randomGrid();
  if(featureEnabled && Math.random()<cfg.featureP) forceScatterTrigger(grid);
  return grid;
}
async function spinReelsTo(finalGrid, manual){
  clearPaylines();
  if(!manual){ renderGrid(finalGrid); return; }
  layoutReels();
  const h=getCellH();
  // Aristocrat-style reel: a tall blurred strip scrolls down fast, then each
  // reel decelerates and stops one after another, left to right, with a small
  // overshoot/bounce as it settles — like the machine in the reference clip.
  const PRE=2;            // filler symbols above the result (revealed on bounce)
  const SCROLL=34;        // length of the random spinning section
  const promises = reelEls.map((reel,col)=>new Promise(resolve=>{
    const strip=reel.querySelector(".reelStrip");
    const finals=[finalGrid[gridIndex(0,col)],finalGrid[gridIndex(1,col)],finalGrid[gridIndex(2,col)]];
    const pre=Array.from({length:PRE},()=>weightedSymbol());
    const randoms=Array.from({length:SCROLL},()=>weightedSymbol());
    // strip = [pre fillers][3 result cells][scrolling randoms]
    const stripSyms=pre.concat(finals, randoms);
    strip.style.transition="none";
    strip.innerHTML=stripSyms.map((sym,idx)=>{
      const isFinal = idx>=PRE && idx<PRE+3;
      return symbolHTML(sym, isFinal?gridIndex(idx-PRE,col):"", h);
    }).join("");
    const rest=-h*PRE;                 // resting offset shows the 3 result cells
    strip.style.transform=`translateY(${rest-h*SCROLL}px)`;  // start deep in the randoms
    reel.classList.remove("landing");
    reel.classList.add("spinning");
    const dur=560+col*200;             // clear left-to-right stagger
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        // overshoot easing (y>1 control point) makes the reel bounce past the
        // stop and settle back, revealing the filler above for an instant.
        strip.style.transition=`transform ${dur}ms cubic-bezier(.16,.74,.3,1.16)`;
        strip.style.transform=`translateY(${rest}px)`;
      });
    });
    setTimeout(()=>{
      reel.classList.remove("spinning");
      reel.classList.add("landing");
      Sound.play("reel_stop");
      setTimeout(()=>reel.classList.remove("landing"), 180);
      resolve();
    }, dur+30);
  }));
  await Promise.all(promises);
  renderGrid(finalGrid);
}
// Add a landing shake + glow (and a sound) to feature orbs now showing on the
// reels. Called after a spin resolves so they grab attention like a real machine.
function highlightReelOrbs(){
  const orbs=reelsEl.querySelectorAll(".reelSymbol.orb");
  if(!orbs.length) return;
  orbs.forEach(o=>{ o.classList.remove("orbLand"); void o.offsetWidth; o.classList.add("orbLand");
    setTimeout(()=>o.classList.remove("orbLand"), 700); });
  Sound.play("orb_land", orbs.length>=3 ? 1 : 0.7);
}

/* ====================== PAYLINE EVALUATION ====================== */
function evaluateLines(grid, scale=payoutScale){
  const wins=[];
  for(let li=0;li<activeLines;li++){
    const rows=PAYLINES[li];
    const first=grid[gridIndex(rows[0],0)];
    if(!first || first.scatter) continue;
    let count=1;
    for(let col=1;col<5;col++){
      const s=grid[gridIndex(rows[col],col)];
      if(s && s.id===first.id) count++; else break;
    }
    const table=PAYTABLE[first.id];
    const mult=table && table[count];
    if(count>=3 && mult){
      const cells=[];
      for(let col=0;col<count;col++) cells.push(gridIndex(rows[col],col));
      wins.push({line:li+1,rows,symbol:first,count,mult,pay:mult*betPerLine*scale,cells});
    }
  }
  return wins;
}
function clearPaylines(){
  if(paylineSvg) paylineSvg.innerHTML="";
  document.querySelectorAll(".reelSymbol.win").forEach(c=>c.classList.remove("win"));
}
function drawPayline(rows, upto=5){
  const pts=[];
  for(let col=0;col<upto;col++){
    const x=(col+.5)*(1000/5);
    const y=(rows[col]+.5)*(600/3);
    pts.push(`${x},${y}`);
  }
  const p=document.createElementNS("http://www.w3.org/2000/svg","polyline");
  p.setAttribute("points",pts.join(" "));
  p.setAttribute("class","paylinePath");
  paylineSvg.appendChild(p);
}
function showPaylineWins(wins){
  clearPaylines();
  if(!wins.length){
    paylineList.innerHTML=`<div class="lineWinItem"><span>No line pays this spin.</span><b>—</b></div>`;
    return;
  }
  wins.slice(0,6).forEach(w=>drawPayline(w.rows, w.count));
  wins.forEach(w=>w.cells.forEach(i=>cellAt(i)?.classList.add("win")));
  const total=wins.reduce((s,w)=>s+w.pay,0);
  paylineList.innerHTML = wins.map(w=>`<div class="lineWinItem"><span>Line ${w.line}: ${w.count} × ${w.symbol.name} pays ${w.mult}×</span><b>${money(w.pay)}</b></div>`).join("")
    + `<div class="lineWinItem"><span>Total line pays</span><b>${money(total)}</b></div>`;
}

/* ====================== OUTCOME / FEATURE MODEL ====================== */
function pickOrbValue(){
  const it=weighted(cfg.orbValues);
  return it || cfg.orbValues[0];
}
function makeFeatureGrid(initialCount=6){
  const grid=new Array(15).fill(null);
  const idx=[...Array(15).keys()]; idx.sort(()=>Math.random()-.5);
  for(let k=0;k<Math.min(15,initialCount);k++) grid[idx[k]]=pickOrbValue();
  return grid;
}
function countFeatureOrbs(grid){ return grid.filter(Boolean).length; }
function featureTotalMult(grid, scale=payoutScale){
  const count=countFeatureOrbs(grid);
  let total=grid.reduce((s,o)=>s+(o?o.v:0),0);
  if(count===15) total += (cfg.grandMult || JP_KEYS.GRAND);
  return total*scale;
}
function landFeatureOrbs(grid){
  const landed=[];
  for(let i=0;i<15;i++){
    if(!grid[i] && Math.random()<cfg.orbLand){ grid[i]=pickOrbValue(); landed.push(i); }
  }
  return landed;
}
function simulateFeature(initialCount=6, scale=payoutScale){
  const grid=makeFeatureGrid(initialCount);
  let respins=3;
  while(respins>0 && countFeatureOrbs(grid)<15){
    const landed=landFeatureOrbs(grid);
    respins = landed.length?3:respins-1;
  }
  const filled=countFeatureOrbs(grid);
  return {grid, totalMult:featureTotalMult(grid, scale), filled, grand:filled===15};
}

/* ====================== MONTE CARLO RTP ====================== */
function estimateRTP(iters=50000, scale=payoutScale){
  let ret=0;
  for(let n=0;n<iters;n++){
    const grid=generateSpinGrid();
    const linePay=evaluateLines(grid, scale).reduce((s,w)=>s+w.pay,0);
    let win=linePay;
    if(featureEnabled && countOrbs(grid)>=6) win += simulateFeature(countOrbs(grid), scale).totalMult*bet;
    ret += win/bet;
  }
  return ret/iters;
}
function calibratePayoutScale(forceRaw=false){
  targetRTP = (parseInt($("targetRTP")?.value || "90",10))/100;
  if(forceRaw || !rawRTP) rawRTP = Math.max(0.01, estimateRTP(25000, 1));
  payoutScale = targetRTP / rawRTP;
  theoRTP = rawRTP * payoutScale;
  const rtpLbl=$("targetRtpLbl"), edgeLbl=$("targetEdgeLbl"), scaleLbl=$("payoutScaleLbl");
  if(rtpLbl) rtpLbl.textContent = Math.round(targetRTP*100)+"%";
  if(edgeLbl) edgeLbl.textContent = Math.round((1-targetRTP)*100)+"%";
  if(scaleLbl) scaleLbl.textContent = payoutScale.toFixed(2)+"×";
}
function refreshTheoRTP(forceRaw=true){
  calibratePayoutScale(forceRaw);
  $("theoRTP").textContent = pct(theoRTP);
  $("stEdge").textContent = pct(Math.max(0,1-theoRTP));
  refreshJackpots();
}

/* ====================== JACKPOT DISPLAY ====================== */
function refreshJackpots(){
  const map={};
  cfg.orbValues.forEach(o=>{ if(o.jp) map[o.jp]=o.v; });
  map.GRAND = cfg.grandMult || JP_KEYS.GRAND;
  for(const k of ["MINI","MINOR","MAJOR","GRAND"]){
    const m=map[k]??JP_KEYS[k];
    jpEls[k].textContent = moneyK(m*bet*payoutScale);
  }
  const hsGrand=$("hsGrandMeter");
  if(hsGrand) hsGrand.textContent = moneyK((cfg.grandMult || JP_KEYS.GRAND)*bet*payoutScale);
}

/* ====================== GRAPH ====================== */
const G={left:64,right:18,top:34,bottom:34};
function drawGraph(){
  const W=graph.width,H=graph.height,ctx=gctx;
  ctx.clearRect(0,0,W,H);
  const pl={x:G.left,y:G.top,w:W-G.left-G.right,h:H-G.top-G.bottom};
  let mn=Math.min(...balanceHistory,startingBalance), mx=Math.max(...balanceHistory,startingBalance);
  if(mx-mn<1){ mx+=1; mn-=1; }
  const padr=(mx-mn)*0.08; mn-=padr; mx+=padr; if(mn>0&&mn<startingBalance*0.4) mn=Math.max(0,mn);
  const yToPx=v=> pl.y + (mx-v)/(mx-mn)*pl.h;
  const xToPx=i=> pl.x + (balanceHistory.length<=1?0:(i/(balanceHistory.length-1))*pl.w);
  ctx.strokeStyle="#2a3040"; ctx.lineWidth=1; ctx.strokeRect(pl.x,pl.y,pl.w,pl.h);
  ctx.font="11px ui-monospace,monospace"; ctx.fillStyle="#8a93a6"; ctx.textAlign="right";
  for(let i=0;i<=4;i++){ const v=mx-(i/4)*(mx-mn), y=pl.y+(i/4)*pl.h;
    ctx.strokeStyle="#1c2230"; ctx.beginPath(); ctx.moveTo(pl.x,y); ctx.lineTo(pl.x+pl.w,y); ctx.stroke();
    ctx.fillStyle="#8a93a6"; ctx.fillText("$"+v.toFixed(0), pl.x-8, y+4); }
  if(startingBalance>=mn && startingBalance<=mx){ const y=yToPx(startingBalance);
    ctx.strokeStyle="#5a627a"; ctx.setLineDash([5,5]); ctx.beginPath();
    ctx.moveTo(pl.x,y); ctx.lineTo(pl.x+pl.w,y); ctx.stroke(); ctx.setLineDash([]); }
  ctx.textAlign="center"; ctx.fillStyle="#8a93a6";
  const nmax=balanceHistory.length-1;
  for(let i=0;i<=5;i++){ const idx=Math.round(nmax*i/5); ctx.fillText(idx, xToPx(idx), pl.y+pl.h+20); }
  if(balanceHistory.length>1){
    const grad=ctx.createLinearGradient(0,pl.y,0,pl.y+pl.h);
    grad.addColorStop(0,"rgba(55,208,224,.22)"); grad.addColorStop(1,"rgba(55,208,224,0)");
    ctx.beginPath(); ctx.moveTo(xToPx(0),yToPx(balanceHistory[0]));
    for(let i=1;i<balanceHistory.length;i++) ctx.lineTo(xToPx(i),yToPx(balanceHistory[i]));
    ctx.lineTo(xToPx(balanceHistory.length-1),pl.y+pl.h); ctx.lineTo(xToPx(0),pl.y+pl.h);
    ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
  }
  ctx.strokeStyle="#37d0e0"; ctx.lineWidth=2; ctx.beginPath();
  balanceHistory.forEach((v,i)=>{ const x=xToPx(i),y=yToPx(v); i?ctx.lineTo(x,y):ctx.moveTo(x,y); });
  ctx.stroke();
  const baseY=pl.y+pl.h+5;
  for(let i=10;i<balanceHistory.length;i+=10){
    const win=resultFlags[i-1];
    ctx.strokeStyle=win?"#2ecc71":"#e23b4e"; ctx.lineWidth=2;
    const x=xToPx(i); ctx.beginPath(); ctx.moveTo(x,baseY-10); ctx.lineTo(x,baseY-2); ctx.stroke();
  }
  if(balanceHistory.length){ const i=balanceHistory.length-1;
    ctx.fillStyle="#37d0e0"; ctx.beginPath(); ctx.arc(xToPx(i),yToPx(balanceHistory[i]),3.2,0,7); ctx.fill(); }
}

/* ====================== STATS / UI ====================== */
function refreshMeters(){
  // Primary readouts are in CREDITS (like a real machine), dollars beneath.
  balanceEl.textContent=creditStr(balance);
  const bc=$("balanceCash"); if(bc) bc.textContent=money(balance);
  lastWinMeter.textContent=creditStr(lastWin);
  const wc=$("winCash"); if(wc) wc.textContent=money(lastWin);
  const pl=balance-startingBalance;
  plEl.textContent=(pl>=0?"+":"")+money(pl);
  plEl.className="v "+(pl>=0?"pos":"neg");
  const pd=$("plDenom"); if(pd) pd.textContent=denomLabel(denom)+" denom";
  const g=Math.max(0,Math.min(1, startingBalance? balance/startingBalance:0));
  gaugeFill.style.width=(g*100)+"%";
  const canGamble = gambleEnabled && lastWin>0 && !spinning && !autoOn;
  $("gambleBtn").disabled = !canGamble;
  const tw=$("takeWinBtn"); if(tw) tw.disabled = !(lastWin>0 && !spinning && !autoOn);
  const tws=$("takeWinSub"); if(tws) tws.textContent = lastWin>0 ? creditStr(lastWin)+" cr" : "collect";
}
function recomputeReturnStats(){
  sumReturn = spinReturns.reduce((s,x)=>s+x,0);
  sumReturnSq = spinReturns.reduce((s,x)=>s+x*x,0);
}
function refreshStats(){
  $("stSpins").textContent=spinCount;
  $("stWager").textContent=moneyK(totalWagered);
  $("stHit").textContent= spinCount? pct(hitCount/spinCount):"—";
  $("stFeat").textContent=featureCount;
  $("stMax").textContent=money(largestWin);
  $("stStreak").textContent=maxLossRun;
  if(spinReturns.length>1){
    recomputeReturnStats();
    const mean=sumReturn/spinReturns.length;
    const variance=Math.max(0, sumReturnSq/spinReturns.length - mean*mean);
    $("stStd").textContent=money(Math.sqrt(variance)*bet);
  } else $("stStd").textContent="—";
  $("actRTP").textContent= totalWagered? pct(totalWon/totalWagered):"—";
}
function flashResult(t,cls){ resultEl.textContent=t; resultEl.className="result "+cls; }
function setSpinDisabled(d){
  $("spinBtn").disabled=d;
  $("autoBtn").disabled=d&&!autoOn;
  const until=$("untilFeatureBtn"); if(until) until.disabled=d&&!featureSearchOn;
  refreshMeters();
}
function setLastWin(n){ lastWin=Math.max(0,n); refreshMeters(); }

/* ====================== CELEBRATION ====================== */
function celebrate(amount){
  if(autoOn || amount<=bet) return;
  const colors=['#FF595E','#FFCA3A','#8AC926','#1982C4','#6A4C93','#FFD166','#06D6A0'];
  for(let i=0;i<18;i++){ const s=document.createElement('div'); s.className='coin'; s.textContent='🪙';
    s.style.setProperty('--tx',(Math.random()*300-150)+'px');
    s.style.setProperty('--ty',(Math.random()*-220-100)+'px');
    s.style.setProperty('--rot',(Math.random()*720-360)+'deg');
    fx.appendChild(s); setTimeout(()=>s.remove(),1300); }
  for(let i=0;i<30;i++){ const b=document.createElement('div'); b.className='conf';
    b.style.background=colors[i%colors.length];
    b.style.setProperty('--tx',(Math.random()*360-180)+'px');
    b.style.setProperty('--ty',(Math.random()*-240-110)+'px');
    b.style.setProperty('--rot',(Math.random()*720-360)+'deg');
    fx.appendChild(b); setTimeout(()=>b.remove(),1500); }
}

/* ====================== HOLD & SPIN (interactive feature screen) ====================== */
const hsOverlay=$("hsOverlay"), hsGrid=$("hsGrid"), hsTrail=$("hsTrail"), hsSpinBtn=$("hsSpinBtn"), hsMessage=$("hsMessage");
let hsActionResolve=null;
function buildHsGrid(){
  hsGrid.innerHTML="";
  for(let i=0;i<15;i++){ const d=document.createElement("div"); d.className="hscell"; hsGrid.appendChild(d); }
  buildFeatureTrail();
}
function buildFeatureTrail(){
  if(!hsTrail) return;
  hsTrail.innerHTML="";
  for(let i=0;i<15;i++){ const d=document.createElement("div"); d.className="trailDot"; hsTrail.appendChild(d); }
}
function paintFeatureTrail(count){
  if(!hsTrail) return;
  [...hsTrail.children].forEach((d,i)=>{ d.className="trailDot"+(i<count?" on":"")+(i===14&&count>=15?" grand":""); });
}
function featureOrbLabel(o){
  const amt = o.v*bet*payoutScale;
  if(o.jp) return `<span class="orbJP">${o.jp}</span><span class="orbAmt">${moneyK(amt)}</span>`;
  return `<span class="orbAmt">${moneyK(amt)}</span>`;
}
function paintHs(grid, newIdx=[]){
  for(let i=0;i<15;i++){ const c=hsGrid.children[i], o=grid[i];
    if(o){
      c.className="hscell "+(o.jp?"jp":"orb")+(newIdx.includes(i)?" new":"");
      c.innerHTML=`<div class="orbBall">${featureOrbLabel(o)}</div>`;
    }
    else { c.className="hscell"; c.innerHTML=""; }
  }
}
function setFeatureSpinVisual(grid, on=true){
  for(let i=0;i<15;i++){
    const c=hsGrid.children[i]; if(!c) continue;
    if(!grid[i] && on) c.classList.add("searching");
    else c.classList.remove("searching");
  }
}
function makeVisualFeatureSeed(trigger){
  const grid=new Array(15).fill(null);
  let positions=[];
  if(Array.isArray(trigger)){
    positions=trigger.map((s,i)=>s&&s.id==="ORB"?i:null).filter(i=>i!==null);
  } else {
    const initialCount=Math.max(6, Math.min(15, parseInt(trigger)||6));
    positions=[...Array(15).keys()].sort(()=>Math.random()-.5).slice(0, initialCount);
  }
  positions.forEach(i=>{ grid[i]=pickOrbValue(); });
  return {grid, positions, initialCount:positions.length};
}
function updateHsMeters(grid, respins, msg){
  const count=countFeatureOrbs(grid);
  $("hsRespins").textContent=respins;
  $("hsCount").textContent=count;
  const needEl=$("hsNeed"); if(needEl) needEl.textContent=Math.max(0,15-count);
  $("hsTotal").textContent=money(featureTotalMult(grid)*bet);
  $("hsGrandMeter").textContent=moneyK((cfg.grandMult || JP_KEYS.GRAND)*bet*payoutScale);
  paintFeatureTrail(count);
  const screen=hsOverlay.querySelector(".featureScreen");
  if(screen) screen.classList.toggle("grandChase", count>=12 && count<15 && respins>0);
  if(msg) hsMessage.textContent=msg;
}
function waitHsAction(label){
  hsSpinBtn.textContent=label;
  hsSpinBtn.disabled=false;
  return new Promise(resolve=>{ hsActionResolve=resolve; });
}
hsSpinBtn.addEventListener("click",()=>{
  if(hsActionResolve){ const r=hsActionResolve; hsActionResolve=null; hsSpinBtn.disabled=true; r(); }
});
async function playFeature(trigger=6){
  featureCount++;
  const triggerCount = Array.isArray(trigger) ? countOrbs(trigger) : Math.max(6, Math.min(15, parseInt(trigger)||6));
  if(autoOn){ return simulateFeature(triggerCount).totalMult*bet; }

  buildHsGrid();
  const seed=makeVisualFeatureSeed(trigger);
  const grid=new Array(15).fill(null);
  let respins=3;
  hsOverlay.classList.add("show");
  paintHs(grid);
  updateHsMeters(grid, respins, `Feature triggered with ${seed.initialCount} orbs. Triggering orbs lock in place.`);

  for(const i of seed.positions){
    grid[i]=seed.grid[i];
    paintHs(grid, [i]);
    updateHsMeters(grid, respins, `Locking trigger orb ${countFeatureOrbs(grid)} of ${seed.initialCount}...`);
    await sleep(110);
  }

  updateHsMeters(grid, respins, `All ${seed.initialCount} trigger orbs locked. Press Start Feature.`);
  await waitHsAction("Start Feature");

  while(respins>0 && countFeatureOrbs(grid)<15){
    updateHsMeters(grid, respins, "Press Feature Spin. Empty positions spin independently.");
    await waitHsAction("Feature Spin");
    hsMessage.textContent="Spinning empty positions...";
    setFeatureSpinVisual(grid, true);
    await sleep(countFeatureOrbs(grid)>=12 ? 850 : 460);
    setFeatureSpinVisual(grid, false);
    const landed=landFeatureOrbs(grid);
    if(landed.length){
      paintHs(grid, landed);
      Sound.play("orb_land", landed.length>=3 ? 1 : 0.8);
      respins=3;
      updateHsMeters(grid, respins, `Dropped ${landed.length} new prize ball${landed.length===1?"":"s"}. Respins reset to 3.`);
      celebrate(bet*2);
    } else {
      respins--;
      paintHs(grid);
      updateHsMeters(grid, respins, respins>0?"No new prize balls. One respin used.":"No respins remaining.");
    }
    await sleep(520);
  }

  const grand=countFeatureOrbs(grid)===15;
  if(grand){
    updateHsMeters(grid, respins, "FULL SCREEN! GRAND JACKPOT AWARDED.");
    Sound.play("jackpot");
    celebrate((cfg.grandMult || JP_KEYS.GRAND)*bet*payoutScale);
  } else {
    updateHsMeters(grid, respins, "Feature complete. Collect your feature win.");
  }
  await waitHsAction("Collect");
  hsOverlay.querySelector(".featureScreen")?.classList.remove("grandChase");
  hsOverlay.classList.remove("show");
  return featureTotalMult(grid)*bet;
}

/* ====================== GAMBLE (classic Aristocrat double-up) ====================== */
const gOverlay=$("gOverlay"), cardInner=$("cardInner"), cardFront=$("cardFront"),
      gAmt=$("gAmt"), gMsg=$("gMsg");
const round2=n=>Math.round(n*100)/100;
function setGambleMode(half){
  halfMode=!!half;
  $("fullBtn").classList.toggle("active", !halfMode);
  $("halfBtn").classList.toggle("active", halfMode);
  $("gModeTitle").textContent = halfMode ? "Half gamble selected" : "Full gamble selected";
  updateGambleMeters();
}
function updateGambleMeters(){
  if(!pendingGamble) return;
  const atRisk=pendingGamble.amount, banked=pendingGamble.banked||0;
  $("gCredit").textContent=creditStr(balance);
  $("gCreditCash").textContent=money(balance);
  $("gBet").textContent=(activeLines*betPerLineCredits).toLocaleString();
  $("gBetCash").textContent=money(bet);
  $("gWinTotal").textContent=creditStr(atRisk+banked);
  $("gWinCash").textContent=money(atRisk+banked);
  $("gPerDollar").textContent=Math.round(1/denom).toLocaleString();
  gAmt.textContent=`${creditStr(atRisk)} (${money(atRisk)})`;
}
function renderGambleHistory(){
  const wrap=$("gHistory"); if(!wrap) return;
  if(!gambleHistory.length){ wrap.innerHTML=`<div class="gChip empty">–</div><div class="gChip empty">–</div><div class="gChip empty">–</div>`; return; }
  wrap.innerHTML=gambleHistory.slice(0,10).map(h=>`<div class="gChip ${h.color}" title="${h.win?'win':'miss'}">${h.rk}${h.s}</div>`).join("");
}
function offerGamble(amount){
  return new Promise(resolve=>{
    gambleStreak=0; gambleBusy=false;
    pendingGamble={amount:round2(amount), banked:0, resolve};
    setGambleMode(false);
    renderGambleHistory();
    gMsg.textContent="Guess the colour to double, or the exact suit to quadruple.";
    cardInner.classList.remove("flip"); cardFront.textContent="?"; cardFront.className="face front";
    updateGambleMeters();
    setGambleButtons(false);
    gOverlay.classList.add("show");
  });
}
function endGamble(finalAmount){
  gOverlay.classList.remove("show");
  const r=pendingGamble.resolve; pendingGamble=null; r(round2(finalAmount));
}
const SUIT_COLOR={"♥":"red","♦":"red","♣":"black","♠":"black"};
function drawCard(){ const suits=["♥","♦","♣","♠"]; const ranks=["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
  const s=suits[(Math.random()*4)|0], rk=ranks[(Math.random()*ranks.length)|0]; return {s,rk,color:SUIT_COLOR[s]}; }
async function revealCard(){ cardInner.classList.add("flip"); await sleep(520); }
async function resolveGuess(kind, guess, mult){
  if(!pendingGamble || gambleBusy) return;
  gambleBusy=true; setGambleButtons(true);
  const card=drawCard();
  cardFront.textContent=card.rk+card.s;
  cardFront.className="face front "+(card.color==="red"?"redcard":"blackcard");
  await revealCard();
  const win = kind==="color" ? card.color===guess : card.s===guess;
  gambleHistory.unshift({rk:card.rk,s:card.s,color:card.color,win});
  if(gambleHistory.length>12) gambleHistory.pop();
  renderGambleHistory();
  gambleStreak++;
  // half gamble banks half before risking the rest
  let stake=pendingGamble.amount;
  if(halfMode){ const keep=round2(stake/2); pendingGamble.banked=round2(pendingGamble.banked+keep); stake=round2(stake-keep); }
  stake = win ? round2(stake*mult) : 0;
  pendingGamble.amount=stake;
  updateGambleMeters();
  if(win){
    const total=round2(stake+pendingGamble.banked);
    gMsg.textContent=`${card.rk}${card.s} — ${kind==="color"?"colour":"suit"} hit!${halfMode?" Half banked.":""} Gamble again or collect ${money(total)}.`;
    if(gambleStreak>=5 || stake<=0){ gMsg.textContent=`Collecting ${money(total)}.`; await sleep(750); return endGamble(total); }
    await sleep(480); resetCardFace(); gambleBusy=false; setGambleButtons(false);
  } else {
    if(pendingGamble.banked>0){ gMsg.textContent=`${card.rk}${card.s} — missed. You keep the banked ${money(pendingGamble.banked)}.`; await sleep(950); endGamble(pendingGamble.banked); }
    else { gMsg.textContent=`${card.rk}${card.s} — wrong. The gamble is lost.`; await sleep(950); endGamble(0); }
  }
}
function resolveColor(guess){ return resolveGuess("color", guess, 2); }
function resolveSuit(guess){ return resolveGuess("suit", guess, 4); }
function resetCardFace(){ cardInner.classList.remove("flip"); setTimeout(()=>{cardFront.textContent="?";cardFront.className="face front";},120); }
function setGambleButtons(dis){ document.querySelectorAll(".gbtn,.suit,#collectBtn").forEach(b=>b.disabled=dis);
  const fb=$("fullBtn"), hb=$("halfBtn"); if(fb) fb.disabled=dis; if(hb) hb.disabled=dis; }
async function gambleLastWin(){
  if(spinning || autoOn || !gambleEnabled || lastWin<=0 || balance<lastWin) return;
  spinning=true; setSpinDisabled(true);
  const original=lastWin;
  balance-=original; totalWon-=original; setLastWin(0);
  refreshMeters(); refreshStats();
  const finalAmount = await offerGamble(original);
  balance+=finalAmount; totalWon+=finalAmount;
  if(finalAmount>largestWin) largestWin=finalAmount;
  if(spinReturns.length){ spinReturns[spinReturns.length-1]=finalAmount/bet; recomputeReturnStats(); }
  if(balanceHistory.length) balanceHistory[balanceHistory.length-1]=balance;
  if(resultFlags.length) resultFlags[resultFlags.length-1]=finalAmount>=bet;
  if(finalAmount>0){ flashResult(`Gamble collected ${money(finalAmount)} (${creditStr(finalAmount)} credits).` , finalAmount>=original?"win":"small"); }
  else { flashResult("Gamble lost — double or nothing returned $0.00.","loss"); }
  spinning=false; setSpinDisabled(false); refreshMeters(); refreshStats(); drawGraph();
}

/* ====================== CORE SPIN ====================== */
async function doSpin(manual){
  if(spinning) return false;
  if(balance < bet){ if(manual) flashResult("Insufficient balance — reset or lower your bet.","loss"); stopAuto(); return false; }
  spinning=true; setSpinDisabled(true); setLastWin(0);
  balance -= bet; totalWagered += bet;
  refreshMeters();

  const grid=generateSpinGrid();
  if(manual) Sound.play("spin_start");
  await spinReelsTo(grid, manual);
  const lineWins=evaluateLines(grid);
  const lineWin=lineWins.reduce((s,w)=>s+w.pay,0);
  showPaylineWins(lineWins);

  let featureWin=0, isFeature=false;
  const orbCount = countOrbs(grid);
  if(orbCount>=1) highlightReelOrbs();
  if(featureEnabled && orbCount>=6){
    isFeature=true;
    Sound.play("feature_start");
    Sound.loop("feature_music");
    featureWin = await playFeature(grid);
    Sound.stopLoop("feature_music");
  }
  const win=lineWin+featureWin;

  balance += win;
  totalWon += win;
  spinCount++;
  if(win>0) hitCount++;
  if(win>largestWin) largestWin=win;
  const net = win-bet;
  if(net<0){ lossRun++; if(lossRun>maxLossRun) maxLossRun=lossRun; } else lossRun=0;
  spinReturns.push(win/bet);
  recomputeReturnStats();
  balanceHistory.push(balance);
  resultFlags.push(win>=bet);

  const parts=[];
  if(lineWin>0) parts.push(`line pays ${money(lineWin)}`);
  if(featureWin>0) parts.push(`Hold & Spin ${money(featureWin)}`);
  if(win>=bet*2){ flashResult(`Spin #${spinCount}: won ${money(win)} (${parts.join(" + ")})`,"win"); Sound.play("bigwin"); }
  else if(win>0){ flashResult(`Spin #${spinCount}: won ${money(win)} (${parts.join(" + ")})`,"small"); Sound.play("win"); }
  else flashResult(`Spin #${spinCount}: no win`,"loss");

  if(win>bet) celebrate(win);
  if(manual && gambleEnabled && win>0) setLastWin(win);
  refreshMeters(); refreshStats(); drawGraph();

  spinning=false; setSpinDisabled(false);
  return true;
}

/* ====================== AUTO PLAY ====================== */
function startAuto(){
  if(autoOn || featureSearchOn) return;
  setLastWin(0);
  autoLeft = Math.max(1, parseInt($("autoCount").value)||100);
  autoOn=true; $("stopBtn").disabled=false; $("autoBtn").disabled=true; $("spinBtn").disabled=true;
  const until=$("untilFeatureBtn"); if(until) until.disabled=true;
  const delay = 70 - parseInt($("speed").value);
  autoTimer=setInterval(async ()=>{
    if(autoLeft<=0 || balance<bet){ stopAuto(); return; }
    if(spinning) return;
    autoLeft--;
    await doSpin(false);
  }, Math.max(8,delay));
}
function stopAuto(){ autoOn=false; clearInterval(autoTimer); autoTimer=null;
  if(!featureSearchOn){ $("stopBtn").disabled=true; $("autoBtn").disabled=false; $("spinBtn").disabled=false; const until=$("untilFeatureBtn"); if(until) until.disabled=false; }
  refreshMeters(); }
function stopFeatureSearch(){ featureSearchCancel=true; }

function recordSettledSpin(win){
  balance += win; totalWon += win; spinCount++;
  if(win>0) hitCount++;
  if(win>largestWin) largestWin=win;
  const net=win-bet;
  if(net<0){ lossRun++; if(lossRun>maxLossRun) maxLossRun=lossRun; } else lossRun=0;
  spinReturns.push(win/bet); recomputeReturnStats();
  balanceHistory.push(balance); resultFlags.push(win>=bet);
}

async function spinUntilFeature(){
  if(spinning || autoOn || featureSearchOn) return;
  if(!featureEnabled){ flashResult("Turn on Hold & Spin before using Spin Until Feature.","loss"); return; }
  if(balance < bet){ flashResult("Insufficient balance — reset or lower your bet.","loss"); return; }
  setLastWin(0); clearPaylines();
  featureSearchOn=true; featureSearchCancel=false; spinning=true;
  const until=$("untilFeatureBtn");
  if(until){ until.classList.add("on"); until.textContent="Hunting..."; until.disabled=true; }
  $("stopBtn").disabled=false; $("autoBtn").disabled=true; $("spinBtn").disabled=true;
  flashResult("Rapid spinning until the 6+ orb feature appears...","small");

  let attempts=0, found=false, lastGrid=null, lastLineWins=[];
  while(!featureSearchCancel && balance>=bet){
    attempts++;
    balance -= bet; totalWagered += bet;
    const grid=generateSpinGrid();
    const lineWins=evaluateLines(grid);
    const lineWin=lineWins.reduce((s,w)=>s+w.pay,0);
    const orbCount=countOrbs(grid);

    if(orbCount>=6){
      found=true;
      renderGrid(grid); showPaylineWins(lineWins);
      refreshMeters(); refreshStats(); drawGraph();
      flashResult(`Feature found after ${attempts.toLocaleString()} spin${attempts===1?"":"s"}: ${orbCount} orbs triggered Hold & Spin.`,"win");
      const featureWin=await playFeature(grid);
      const win=lineWin+featureWin;
      recordSettledSpin(win);
      const parts=[]; if(lineWin>0) parts.push(`line pays ${money(lineWin)}`); if(featureWin>0) parts.push(`Hold & Spin ${money(featureWin)}`);
      flashResult(`Spin #${spinCount}: won ${money(win)}${parts.length?` (${parts.join(" + ")})`:""}` , win>=bet*2?"win":(win>0?"small":"loss"));
      if(win>bet) celebrate(win);
      if(gambleEnabled && win>0) setLastWin(win);
      break;
    }

    recordSettledSpin(lineWin);
    lastGrid=grid; lastLineWins=lineWins;
    if(attempts%25===0){
      renderGrid(grid); showPaylineWins(lineWins);
      flashResult(`Searching for feature... ${attempts.toLocaleString()} fast spins so far.`, "small");
      refreshMeters(); refreshStats(); drawGraph();
      await sleep(0);
    }
  }

  if(!found){
    if(lastGrid){ renderGrid(lastGrid); showPaylineWins(lastLineWins); }
    flashResult(featureSearchCancel?`Spin Until Feature stopped after ${attempts.toLocaleString()} spin${attempts===1?"":"s"}.`:`Balance ran out before the feature appeared after ${attempts.toLocaleString()} spins.`, "loss");
  }
  featureSearchOn=false; featureSearchCancel=false; spinning=false;
  if(until){ until.classList.remove("on"); until.textContent="Spin until feature"; until.disabled=false; }
  $("stopBtn").disabled=true; $("autoBtn").disabled=false; $("spinBtn").disabled=false;
  refreshMeters(); refreshStats(); drawGraph();
}

async function runBulkSpins(n){
  if(spinning || autoOn) return;
  setLastWin(0);
  spinning=true; setSpinDisabled(true);
  let lastGrid=null, lastLineWins=[];
  const totalToRun=Math.max(1,n|0);
  for(let i=0;i<totalToRun;i++){
    if(balance < bet) break;
    balance -= bet; totalWagered += bet;
    const grid=generateSpinGrid();
    const lineWins=evaluateLines(grid);
    const lineWin=lineWins.reduce((s,w)=>s+w.pay,0);
    const orbCount=countOrbs(grid);
    let featureWin=0;
    if(featureEnabled && orbCount>=6){
      featureCount++;
      featureWin = simulateFeature(orbCount).totalMult*bet;
    }
    const win=lineWin+featureWin;
    balance += win; totalWon += win; spinCount++;
    if(win>0) hitCount++;
    if(win>largestWin) largestWin=win;
    const net=win-bet;
    if(net<0){ lossRun++; if(lossRun>maxLossRun) maxLossRun=lossRun; } else lossRun=0;
    spinReturns.push(win/bet); balanceHistory.push(balance); resultFlags.push(win>=bet);
    lastGrid=grid; lastLineWins=lineWins;
    if(i%500===0) await sleep(0);
  }
  recomputeReturnStats();
  if(lastGrid){ renderGrid(lastGrid); showPaylineWins(lastLineWins); }
  flashResult(`Instant simulation complete: ${totalToRun.toLocaleString()} attempted spins at ${Math.round(targetRTP*100)}% target RTP.`, balance>=startingBalance?"win":"loss");
  spinning=false; setSpinDisabled(false);
  refreshMeters(); refreshStats(); drawGraph();
}

/* ====================== CONFIG APPLY / RESET ====================== */
function readBet(){
  if(!LINE_OPTIONS.includes(activeLines)) activeLines=50;
  if(!BPL_OPTIONS.includes(betPerLineCredits)) betPerLineCredits=1;
  betPerLine = betPerLineCredits*denom;
  bet = activeLines*betPerLineCredits*denom;
  const totalCredits = activeLines*betPerLineCredits;
  // bet banner + meters
  if($("linesReadout")) $("linesReadout").textContent=activeLines;
  if($("bplReadout")) $("bplReadout").textContent=betPerLineCredits;
  betCalcEl.textContent=money(bet);
  const bm=$("buttonBetMeter"); if(bm) bm.textContent=totalCredits.toLocaleString();
  const bcash=$("betCash"); if(bcash) bcash.textContent=money(bet);
  const plBtn=$("playLines"); if(plBtn) plBtn.textContent=activeLines+" line"+(activeLines===1?"":"s");
  const mbs=$("maxBetSub"); if(mbs) mbs.textContent=(50*10).toLocaleString()+" cr";
  // active button states
  document.querySelectorAll(".lineBtn[data-lines]").forEach(b=>b.classList.toggle("active", parseInt(b.dataset.lines)===activeLines));
  document.querySelectorAll(".betBtn[data-bpl]").forEach(b=>b.classList.toggle("active", parseInt(b.dataset.bpl)===betPerLineCredits));
  const auto=$("autoBtn"); if(auto) auto.textContent=`Auto ×${Math.max(1,parseInt($("autoCount").value)||100)}`;
  refreshJackpots(); refreshMeters();
}
function setLines(n){ activeLines=n; readBet(); refreshTheoRTP(); flashResult(`${n} line${n===1?"":"s"} active — total bet ${money(bet)} (${creditStr(bet)} credits).`,"small"); }
function setBpl(n){ betPerLineCredits=n; readBet(); refreshTheoRTP(false); flashResult(`Betting ${n} credit${n===1?"":"s"} per line — total bet ${money(bet)} (${creditStr(bet)} credits).`,"small"); }
function resetSessionState(message="Press PLAY to spin."){
  balance=startingBalance; spinCount=0; featureCount=0; totalWagered=0; totalWon=0;
  largestWin=0; hitCount=0; lossRun=0; maxLossRun=0; sumReturn=0; sumReturnSq=0; spinReturns=[];
  balanceHistory=[balance]; resultFlags=[]; setLastWin(0);
  flashResult(message,"loss");
  paylineList.innerHTML=`<div class="lineWinItem"><span>No line pays yet.</span><b>—</b></div>`;
  clearPaylines();
}
function applyConfig(resetSession){
  cfg=PRESETS[presetKey];
  applySymbolTheme(symbolThemeKey);
  featureEnabled=$("tFeature").checked; gambleEnabled=$("tGamble").checked;
  startingBalance=Math.max(0,parseFloat($("startBal").value)||0);
  readBet();
  if(resetSession) resetSessionState();
  refreshMeters(); refreshStats(); drawGraph(); refreshTheoRTP(); fitMachine();
}
function resetBalanceOnly(){
  resetSessionState("Balance reset.");
  refreshMeters(); refreshStats(); drawGraph();
}

/* ====================== LOAD / DEPOSIT SCREEN ====================== */
let pendingDenom = 0.05, resumeMode = false;
const loadOverlay=$("loadOverlay");
function refreshLoadScreen(){
  $("depositAmt").textContent=money(depositAmount);
  $("denomNoteVal").textContent=denomLabel(pendingDenom);
  $("denomNoteDep").textContent=money(depositAmount);
  $("denomNoteCred").textContent=Math.round(depositAmount/pendingDenom).toLocaleString();
  document.querySelectorAll(".loadDenomBtn[data-denom]").forEach(b=>
    b.classList.toggle("active", Math.abs(parseFloat(b.dataset.denom)-pendingDenom)<1e-9));
  document.querySelectorAll(".gameBtn[data-theme]").forEach(b=>
    b.classList.toggle("active", b.dataset.theme===pendingTheme));
  const play=$("loadPlayBtn");
  play.disabled = !(depositAmount>0);
  if(resumeMode){
    play.textContent = depositAmount>0 ? `Add ${money(depositAmount)} & continue →` : "Insert cash to continue";
  } else {
    const g=SYMBOL_THEMES[pendingTheme]?SYMBOL_THEMES[pendingTheme].label:"";
    play.textContent = depositAmount>0 ? `Play ${g} · ${money(depositAmount)} →` : "Insert cash to play";
  }
}
function openLoadScreen(resume){
  resumeMode=!!resume;
  if(resume){
    depositAmount=0;
  } else {
    pendingDenom = denom||0.05;
    pendingTheme = symbolThemeKey;
    depositAmount = Math.max(0, round2(balance));   // carry the current balance across a game/denom change
  }
  // game + denomination are locked once a session is running (Add cash only tops up)
  document.querySelectorAll(".loadDenomBtn[data-denom]").forEach(b=>b.disabled=resume);
  document.querySelectorAll(".gameBtn[data-theme]").forEach(b=>b.disabled=resume);
  const t2=$("loadColTitle2"); if(t2) t2.textContent = resume? "Denomination (locked)" : "2 · Choose denomination";
  const sub=document.querySelector(".loadSub");
  if(sub) sub.textContent = resume ? "Add cash — your denomination stays the same" : "Insert cash & set the denomination";
  applySymbolTheme(pendingTheme);
  refreshLoadScreen();
  loadOverlay.classList.add("show");
}
function commitLoad(){
  if(depositAmount<=0) return;
  if(resumeMode){
    balance += depositAmount;
    startingBalance += depositAmount;   // keep P/L meaningful across top-ups
    flashResult(`Added ${money(depositAmount)} (${creditStr(depositAmount)} credits) to your balance.`,"small");
  } else {
    symbolThemeKey = pendingTheme;
    const sel=$("symbolTheme"); if(sel) sel.value=symbolThemeKey;
    denom = pendingDenom;
    $("startBal").value = depositAmount;
    startingBalance = depositAmount;
    applyConfig(true);   // applies the chosen theme + denomination and starts a fresh session
    flashResult(`${SYMBOL_THEMES[symbolThemeKey].label} loaded — ${money(depositAmount)} at ${denomLabel(denom)} = ${creditStr(depositAmount)} credits. Press PLAY.`,"small");
  }
  loadOverlay.classList.remove("show");
  refreshMeters(); refreshStats(); drawGraph(); fitMachine();
}

/* ====================== MATHS PANEL (collapse + small-screen notice) ====================== */
function rerenderReels(){
  layoutReels();
  renderGrid(currentGrid.length ? currentGrid : randomGrid());
}
function expandMaths(){
  $("layout").classList.remove("collapsed");
  const t=$("mathsToggle"); t.textContent="Hide the maths ◂"; t.setAttribute("aria-expanded","true");
  rerenderReels(); fitMachine(); drawGraph();
  const col=$("analyticsCol"); if(col) col.scrollIntoView({behavior:"smooth",block:"start"});
}
function collapseMaths(){
  $("layout").classList.add("collapsed");
  const t=$("mathsToggle"); t.textContent="Show the maths ▸"; t.setAttribute("aria-expanded","false");
  // let the grid lay out at the new (landscape) width before sizing the reels
  requestAnimationFrame(()=>{ rerenderReels(); fitMachine(); });
}

/* ====================== EVENTS ====================== */
// A soft click on every physical cabinet button press.
const deckEl=document.querySelector(".cabinetDeck");
if(deckEl) deckEl.addEventListener("click",e=>{ if(e.target.closest("button")) Sound.play("click",0.6); });
// Mute / unmute toggle.
const muteBtn=$("muteBtn");
if(muteBtn) muteBtn.addEventListener("click",()=>{
  const off=!muteBtn.classList.contains("off");
  Sound.setMuted(off);
  muteBtn.classList.toggle("off",off);
  muteBtn.textContent = off ? "🔇 Muted" : "🔊 Sound";
});
$("spinBtn").addEventListener("click",()=>doSpin(true));
$("autoBtn").addEventListener("click",startAuto);
$("stopBtn").addEventListener("click",()=>{ if(featureSearchOn) stopFeatureSearch(); else stopAuto(); });
$("gambleBtn").addEventListener("click",gambleLastWin);
$("takeWinBtn").addEventListener("click",()=>{ if(lastWin>0){ const w=lastWin; setLastWin(0); Sound.play("collect"); flashResult(`Took win of ${money(w)} (${creditStr(w)} credits) to credit.`,"small"); } });
$("untilFeatureBtn").addEventListener("click",spinUntilFeature);
$("serviceBtn").addEventListener("click",()=>flashResult("Reserve / attendant call — in a venue this holds the machine for the player.","small"));
$("targetRTP").addEventListener("input",()=>{refreshTheoRTP(false); flashResult(`Target RTP set to ${Math.round(targetRTP*100)}%. Reset or simulate to compare long-run results.`,"small");});
const useImagesEl=$("useImagesToggle");
if(useImagesEl) useImagesEl.addEventListener("change",()=>{
  useImages=useImagesEl.checked;
  renderGrid(currentGrid.length?currentGrid.map(s=>SYMBOL_BY_ID[s.id]):randomGrid());
  flashResult(useImages?"Image symbols on.":"Image symbols off — using built-in art.","small");
});
$("bulk1000").addEventListener("click",()=>runBulkSpins(1000));
$("bulk10000").addEventListener("click",()=>runBulkSpins(10000));

/* Aristocrat bet buttons */
document.querySelectorAll(".lineBtn[data-lines]").forEach(b=>b.addEventListener("click",()=>setLines(parseInt(b.dataset.lines))));
document.querySelectorAll(".betBtn[data-bpl]").forEach(b=>b.addEventListener("click",()=>setBpl(parseInt(b.dataset.bpl))));
$("maxBetBtn").addEventListener("click",()=>{ activeLines=50; betPerLineCredits=10; readBet(); refreshTheoRTP();
  flashResult(`MAX BET — ${activeLines} lines × 10 credits = ${creditStr(bet)} credits (${money(bet)}).`,"small");
  if(!spinning && !autoOn && balance>=bet) doSpin(true); });

/* settings */
$("applyBtn").addEventListener("click",()=>applyConfig(true));
$("resetBtn").addEventListener("click",resetBalanceOnly);
$("autoCount").addEventListener("input",readBet);
$("tFeature").addEventListener("change",()=>{featureEnabled=$("tFeature").checked; refreshTheoRTP();});
$("tGamble").addEventListener("change",()=>{gambleEnabled=$("tGamble").checked; if(!gambleEnabled) setLastWin(0); refreshMeters();});
$("speed").addEventListener("input",()=>{ const v=parseInt($("speed").value);
  $("speedLbl").textContent = v<20?"slow":v<45?"fast":"turbo"; });
document.querySelectorAll(".chip[data-preset]").forEach(c=>c.addEventListener("click",()=>{
  document.querySelectorAll(".chip[data-preset]").forEach(x=>x.classList.remove("active"));
  c.classList.add("active"); presetKey=c.dataset.preset; applyConfig(true);
}));

/* collapsible maths panel — warn first on small screens */
$("mathsToggle").addEventListener("click",()=>{
  if($("layout").classList.contains("collapsed")){
    if(window.innerWidth < 820){ $("mathsWarn").classList.add("show"); return; }
    expandMaths();
  } else {
    collapseMaths();
  }
});
$("mathsWarnGo").addEventListener("click",()=>{ $("mathsWarn").classList.remove("show"); expandMaths(); });
$("mathsWarnCancel").addEventListener("click",()=>{ $("mathsWarn").classList.remove("show"); });

/* load / deposit / menu screen */
document.querySelectorAll(".noteBtn[data-note]").forEach(b=>b.addEventListener("click",()=>{ depositAmount=round2(depositAmount+parseFloat(b.dataset.note)); refreshLoadScreen(); }));
document.querySelectorAll(".loadDenomBtn[data-denom]").forEach(b=>b.addEventListener("click",()=>{ if(b.disabled) return; pendingDenom=parseFloat(b.dataset.denom); refreshLoadScreen(); }));
document.querySelectorAll(".gameBtn[data-theme]").forEach(b=>b.addEventListener("click",()=>{ if(b.disabled) return; pendingTheme=b.dataset.theme; applySymbolTheme(pendingTheme); refreshLoadScreen(); }));
$("clearDeposit").addEventListener("click",()=>{ depositAmount=0; refreshLoadScreen(); });
$("loadPlayBtn").addEventListener("click",commitLoad);
$("addCashBtn").addEventListener("click",()=>{ if(spinning||autoOn||featureSearchOn) return; openLoadScreen(true); });
$("menuBtn").addEventListener("click",()=>{ if(spinning||autoOn||featureSearchOn) return; openLoadScreen(false); });

/* gamble overlay */
document.querySelectorAll(".gbtn[data-bet]").forEach(b=>b.addEventListener("click",()=>resolveColor(b.dataset.bet)));
document.querySelectorAll(".suit[data-suit]").forEach(b=>b.addEventListener("click",()=>resolveSuit(b.dataset.suit)));
$("fullBtn").addEventListener("click",()=>{ if(pendingGamble && !gambleBusy) setGambleMode(false); });
$("halfBtn").addEventListener("click",()=>{ if(pendingGamble && !gambleBusy) setGambleMode(true); });
$("collectBtn").addEventListener("click",()=>{ if(pendingGamble && !gambleBusy) endGamble(pendingGamble.amount+(pendingGamble.banked||0)); });

document.addEventListener("keydown",e=>{
  if(gOverlay.classList.contains("show")||hsOverlay.classList.contains("show")||loadOverlay.classList.contains("show")||$("mathsWarn").classList.contains("show")) return;
  if(e.code==="Space"){ e.preventDefault(); if(!autoOn) doSpin(true); }
  else if(e.key.toLowerCase()==="a"){ startAuto(); }
  else if(e.key==="Escape"){ if(featureSearchOn) stopFeatureSearch(); else stopAuto(); }
});
let resizeTimer=null;
window.addEventListener("resize",()=>{ clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{ renderGrid(currentGrid.length?currentGrid:randomGrid()); fitMachine(); },120); });

/* ====================== INIT ====================== */
buildReels();
applySymbolTheme(symbolThemeKey);
$("startBal").value = 0;     // real balance arrives from the load screen
applyConfig(true);
openLoadScreen(false);       // show the load screen on first load
window.addEventListener("load", fitMachine);
setTimeout(fitMachine, 60);
