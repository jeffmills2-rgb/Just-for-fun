# Poker Machine Simulator

A classroom sandbox for teaching the mathematics of the house edge. Every result
comes from `Math.random()` — no real money, no payouts.

## Running it

ES modules don't load from a `file://` page, so the project needs a small local
web server. From this folder:

```
python3 serve.py
```

Then open <http://localhost:8000/index.html> (the script tries to open it for
you). Use `python3 serve.py 8080` to pick a different port. Press `Ctrl+C` to
stop. On macOS you can also double-click `start.command`.

## Project layout

```
index.html            Markup + loads the CSS and the main module
css/styles.css        All styling
js/main.js            Engine, UI and wiring (ES module)
js/symbols.js         Symbol artwork (pure data)
js/paytable.js        Paylines + pay values (pure data)
js/sound.js           Audio manager (maps events -> files)
assets/themes/maths/<ID>.png          Optional reel symbol images
assets/themes/maths/background.png    Optional cabinet background
assets/sounds/*.wav                   Sound effects (placeholders)
serve.py              Dev server
IMAGES.md             Exact filename for every symbol + background, per theme
SOUNDS.md             Every sound event and the file it uses
```

The machine uses a single game, Mathematics Growth Adventure, with all of its art
in `assets/themes/maths/`. The interface uses the NSW Department of Education
palette (navy #002664, red #D7153A, white).

## Using real images on the reels

Each symbol can be a PNG instead of the built-in SVG. The app looks for
`assets/themes/<theme>/<ID>.png` for every symbol; if the file isn't there it
draws the original SVG art, so nothing ever looks broken.

1. See **IMAGES.md** (or the `README.txt` inside each theme folder) for the exact
   filenames and what each one depicts.
2. Drop in a PNG — 512×512, transparent background, artwork roughly centred.
3. Reload. The image appears on the reels.

The **"Use image symbols"** checkbox in the settings panel turns images on/off so
you can compare them with the built-in art.

## Custom background

Drop a `background.png` into `assets/themes/maths/` and it loads behind the
machine. With no file present, the
original navy gradient is used. A wide image (around 1600×1000) looks best;
it's shown at about 60% opacity so the reels and meters stay readable. To make
it more or less prominent, change `--machine-bg-opacity` in `css/styles.css`.

## Sound

Reel spins, per-reel stops, wins, feature music and more are wired up — see
**SOUNDS.md** for the full list of events and which file each one uses. The files
in `assets/sounds/` are **placeholders**; replace any of them with your own clip
of the same name. The **🔊 Sound** button on the cabinet mutes/unmutes audio.

## Feature orbs

When feature orbs land on the reels they now glow and shake to draw the eye, the
same way a real machine highlights them, with a matching sound.

> Note: the real *Lightning Link* / Aristocrat reel graphics are copyrighted. For
> a school resource, use your own, royalty-free, or AI-generated artwork.
