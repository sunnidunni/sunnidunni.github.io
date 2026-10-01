# derek sun

Personal site. Two ways to see it:

- **3d** — a desk. Index cards for each section, a pencil that follows the cursor (right-click to doodle), a sketched Spotify logo, and a cat named Taozi who doesn't want to be caught.
- **2d** — a single clean page with the same content. Default on phones and for `prefers-reduced-motion`.

Switch with the toggle in the top right, or link straight to one with `?mode=2d` / `?mode=3d`. The choice is remembered.

## How it's put together

The 2D page in `index.html` is the source of truth for all content. In 3D, clicking a card clones the matching `<section data-sheet="…">` into a slide-in sheet, so copy only ever lives in one place.

```
index.html          content (2d page) + hud, sheet, loading shell
styles.css          tokens (light + dark), 2d page, hud, sheet
js/
├── ui.js           mode switching, sheet, music player — no three.js
├── main.js         3d app + render loop (loaded only when 3d is shown, paused in 2d)
├── scene.js        renderer, camera, paper background + fog
├── lighting.js     soft daylight
├── floor.js        ruled-paper floor
├── textures.js     index-card faces
├── portfolioItems.js  the cards
├── interaction.js  hover / click on cards, spotify, cat
├── controls.js     pan-only camera
├── particles.js    dust
├── pencil.js       cursor pencil + doodling
├── spotifyLogo.js  sketched logo
└── dog.js          the cat (historical filename)
```

## Editing

- **Content**: edit the sections in `index.html`. Both modes update.
- **Songs**: add or swap `<button data-track="SPOTIFY_TRACK_ID">` entries in the `#listening` section. One is picked at random on each visit.
- **Card labels on the desk**: `CARDS` in `js/portfolioItems.js`.
