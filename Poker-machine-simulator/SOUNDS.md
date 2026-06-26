# Sound manifest

All audio lives in `assets/sounds/`. The files shipped now are simple
**placeholders** — replace any of them with your own clip of the same name and
it's picked up automatically. A missing file is ignored, so the machine still
runs silently if you delete one.

Keep the same filename and a web-friendly format (`.wav`, `.mp3`, and `.ogg`
all work in modern browsers). If you switch to `.mp3`, also update the path in
`js/sound.js` (the `FILES` map at the top).

## When each sound plays

| File | Fires when |
|------|------------|
| `click.wav` | Any cabinet button is pressed |
| `spin_start.wav` | The reels begin a manual spin |
| `reel_stop.wav` | Each reel comes to a stop — plays 5 times, staggered, like a real machine |
| `win.wav` | A normal line win is paid |
| `bigwin.wav` | A large win (2× bet or more) lands |
| `orb_land.wav` | A feature orb appears on the reels, and when orbs drop during the feature |
| `feature_start.wav` | The Hold & Spin feature triggers (6+ orbs) |
| `feature_music.wav` | Loops for the duration of the feature, stops when it ends |
| `jackpot.wav` | A full-screen Grand jackpot is awarded |
| `collect.wav` | Taking a win / cashing out to credit |

## Controls

The **🔊 Sound** button on the cabinet (top button cluster) mutes/unmutes all
audio. Volume defaults to 70% and can be changed in `js/sound.js` (`this.volume`).

## A note on browsers

Browsers only allow audio after the user interacts with the page, so the first
sound you'll hear is the click when you press a button — that's expected.
