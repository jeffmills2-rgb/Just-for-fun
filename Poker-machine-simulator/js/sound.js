// sound.js — tiny audio manager for the machine.
//
// Every event below maps to one file in assets/sounds/. To change a sound,
// just replace the file with your own (keep the same name). Missing files are
// ignored silently, so the machine still runs with no audio. See SOUNDS.md.

const FILES = {
  click:         "assets/sounds/click.wav",          // any cabinet button press
  spin_start:    "assets/sounds/spin_start.wav",      // reels begin spinning
  reel_stop:     "assets/sounds/reel_stop.wav",       // each reel stops (x5, staggered)
  win:           "assets/sounds/win.wav",             // a normal line win
  bigwin:        "assets/sounds/bigwin.wav",          // a large win (celebrate)
  orb_land:      "assets/sounds/orb_land.wav",        // a feature orb lands
  feature_start: "assets/sounds/feature_start.wav",   // Hold & Spin feature triggers
  feature_music: "assets/sounds/feature_music.wav",   // loops during the feature
  jackpot:       "assets/sounds/jackpot.wav",         // grand / full-screen jackpot
  collect:       "assets/sounds/collect.wav",         // take win / cash out
};

class SoundManager {
  constructor(){
    this.muted = false;
    this.volume = 0.7;
    this._base = {};
    this._loops = {};
    for(const [k, src] of Object.entries(FILES)){
      const a = new Audio(src);
      a.preload = "auto";
      this._base[k] = a;
    }
  }
  // Fire-and-forget one-shot. cloneNode lets the same sound overlap itself
  // (needed for the rapid per-reel stop clicks).
  play(name, vol=1){
    if(this.muted) return;
    const base = this._base[name];
    if(!base) return;
    const a = base.cloneNode();
    a.volume = Math.min(1, this.volume * vol);
    a.play().catch(()=>{});
  }
  loop(name, vol=0.6){
    if(this.muted) return;
    let a = this._loops[name];
    if(!a){ a = new Audio(FILES[name]); a.loop = true; this._loops[name] = a; }
    a.volume = Math.min(1, this.volume * vol);
    try{ a.currentTime = 0; }catch(_){}
    a.play().catch(()=>{});
  }
  stopLoop(name){
    const a = this._loops[name];
    if(a){ a.pause(); try{ a.currentTime = 0; }catch(_){} }
  }
  setMuted(m){
    this.muted = !!m;
    if(this.muted) Object.values(this._loops).forEach(a=>a.pause());
  }
}

export const Sound = new SoundManager();
