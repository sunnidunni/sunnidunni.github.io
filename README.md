# derek sun

Personal site. Two ways to see it:

- **3d** — a desk. Folded notes get tossed onto it, then a pencil writes "hi, i'm derek" on the paper. Click a note and it flips open, and a notebook page swings in with the details. The pencil follows the cursor (right-click to doodle). There's also a sketched Spotify logo and a cat named Taozi who doesn't want to be caught.
- **2d** — one page on notebook paper with the same content. Handwritten margin notes and doodles get written in by a little pencil as you scroll. Default on phones and for `prefers-reduced-motion`, which also skips the writing animation.

Switch with the toggle in the top right, or link straight to one with `?mode=2d` / `?mode=3d`. The choice is remembered.

## How it's put together

The 2D page in `index.html` is the source of truth for all content. In 3D, clicking a card clones the matching `<section data-sheet="…">` into a slide-in sheet, so copy only ever lives in one place.

```
index.html          content (2d page) + hud, sheet, loading shell
styles.css          tokens (light + dark), 2d page, hud, sheet
js/
├── ui.js           mode switching, sheet, music player — no three.js
├── handwriting.js  single-stroke handwriting font + doodle shapes (shared by 2d and 3d)
├── scribble.js     writes notes/doodles on the 2d page and sheet, with the little pencil
├── main.js         3d app + render loop (loaded only when 3d is shown, paused in 2d)
├── scene.js        renderer, camera, paper background + fog
├── lighting.js     soft daylight
├── floor.js        ruled-paper floor
├── textures.js     note covers, handwritten insides
├── portfolioItems.js  the folded notes (hover peek, click to open, toss-in)
├── interaction.js  hover / click on cards, spotify, cat
├── controls.js     pan-only camera
├── particles.js    dust
├── pencil.js       cursor pencil, doodling, and writing on its own
├── spotifyLogo.js  sketched logo
└── dog.js          the cat (historical filename)
```

## Editing

- **Content**: edit the sections in `index.html`. Both modes update.
- **Songs**: add or swap `<button data-track="SPOTIFY_TRACK_ID">` entries in the `#listening` section. One is picked at random on each visit.
- **Card labels on the desk**: `CARDS` in `js/portfolioItems.js` (`inside` is what's handwritten inside each note).
- **Handwritten notes**: `<span data-hand="any text"></span>` writes text; `<span data-doodle="circle"></span>` draws a doodle sized to the element. Doodles available: underline, strike, circle, arrow (with `data-dir`), star, sparkle, heart, notes, plane, cat, spiral. Wrap text in `<mark class="hl">` for a highlighter swipe.

## Credits

Handwriting uses **EMS Elfin** (single-stroke) by Sheldon B. Michaels, converted by Windell H. Oskay, derived from *Mountains of Christmas* by Crystal Kluge / Tart Workshop. SIL Open Font License 1.1.
