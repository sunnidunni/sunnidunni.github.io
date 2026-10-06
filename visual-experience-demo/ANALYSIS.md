# Analysis: what the collection does, and what it doesn't yet

Written before adding five scenes for "the night after the party". It covers the five works I read
closely (Slide Curtain, Paper Cloud, Hanging Lenses, Souvenir Shop, Card Gallery), the platform around
them, and what the collection is missing. The checklist at the end is what I review the new scenes
against.

## The five works

| Work | The object | The one interaction | The light | The motion |
| --- | --- | --- | --- | --- |
| **Slide Curtain** | 35 mm slides hung in chains from a curtain rod in front of a lit window | Brush through the curtain; select a slide to hold it up to the lamp | Back light only: the window glows through the film, the wall is lit by what escapes around the curtain, mount edges catch the light from behind | Verlet chains with rigid links and a twist spring; a pointer passing through hands its velocity to nearby slides; simulated only until the curtain is still |
| **Paper Cloud** | Prints on cotton paper hung as a cloud over a circle of broken mirror | Drag to walk around, pinch or scroll closer, tap to fly to a print | The broken mirror throws moving caustics onto the ceiling; the floor is a half-resolution reflection pass with every shard offset | Each sheet turns and drifts on its threads with two incommensurate sines; the camera eases with `1 − e^(−4·dt)`; an idle walk-around after 8 s |
| **Hanging Lenses** | One small print on a dark wall, a hand lens and a loupe hanging on wires in front of it | Drag a lens across the print: it swings back on its wire and keeps the height you left it at | One spotlight; each lens's shadow holds the bright spot its glass focuses, with color fringing; the scene is ray traced in one fragment shader | Damped pendulums using real `g / L`; the release velocity carries into the swing; the view leans a little toward the pointer |
| **Souvenir Shop** | A walkable 3D shop of paper sculptures, ceramics and postcards (three.js) | Walk (WASD / joystick), pick an object up and turn it in your hands | Image-based lighting from a generated room, one shadow-casting sun, a fill, five warm points, ACES tone mapping | Hanging paper sways; camera transitions over 440 ms; quality drops and recovers with frame time |
| **Card Gallery** | Photo cards (CSS 3D on DOM buttons) that morph ring → arc → stack → unfolded fan | Scroll or drag one continuous "position" through the chapters | Flat, white, paper-like; the light is in the card edges (two 1 px box-shadows) | One scalar `position` eased toward `target` (`mix(position, target, 1 − 0.89^dt)`); a 2.1 s automatic intro, then the visitor drives |

## What makes them feel premium

**1. The photograph becomes a physical object, and the material decides how it looks.** None of these
works is a layout of rectangles. A slide is film in a card mount, so it glows from behind and dims as it
turns away from the lamp. A cotton-paper print is lighter and softer than the photo, its ink "bleeding
unevenly at its edges", and only its front is printed. Under a lens, the print magnifies with a little
chromatic aberration. The metaphor gives every rendering decision a reason, so the image treatment never
looks like a filter.

**2. One interaction idea per scene, and it's a physical verb.** Brush, walk around, swing a lens on a
wire, pick up and turn over, scroll through one continuous transformation. You learn each in a second
because it's what you'd do with the real object, and there is no second mode competing with it.
Selection is always a quiet secondary act (tap to hold up, fly to, look closer).

**3. Restraint.** No on-screen instructions, logos, or loading screens (the Souvenir Shop is the one
heavy exception, and even there the import "removed old branding, captions, area tabs, toolbar, and text
hints"). Palettes are muted near-blacks and greys (`#080706`, `#2a2927`, `#3b3a3c`). Type is 12–13 px
system UI and appears only once something is selected, in a single caption pill. Each scene has one light
idea. Controls live in the canvas `aria-label` and the README, not on screen.

**4. The lighting is motivated and specific.** Every scene has a light source you could point to, with
the falloff, soft shadows, and secondary light that come with it: light escaping around a curtain onto the
wall, mirror caustics crawling on a ceiling, lens shadows each holding a focused hot spot. Tone mapping
(`1 − exp(−1.7x)`, ACES) and a little dithering noise keep the dark gradients from banding.

**5. Motion is simulated, not animated.** Chains, pendulums, sway, eased cameras; nothing moves on a
linear tween. Scenes start in an interesting physical state: "the curtain has just been let go: a gentle
sway that settles". The motion settles too. A still curtain draws nothing.

**6. Craft details no one asks for.** SDF antialiasing that widens as a slide turns edge-on; a
`platform:ready` sent only after two frames have drawn; a hover brightening on desktop only; photos keep
their shape inside stretched texture layers via per-instance crops; the light box opens from the slide's
own position (`--from` transform); sheets between the eye and the selected print dissolve with a dither
so the camera can fly to it.

## Technical conventions

- **Folder per work.** `experiences/<id>/index.html` + `style.css` + a dependency-free ES module
  (`main.js`). The recreated scenes are one module each; the Souvenir Shop is a multi-module three.js
  app with three.js vendored. There is no build step. Catalog entries live in `experiences.js` (`id`,
  `title`, optional `poster`). Posters are `previews/<id>.jpg`, 1060 × 959 headless-Chrome captures.
  The Use dialog builds its Copy Prompt from the title and the source-folder URL (`copy-source.js`).
- **Photos.** A shared `photos.json` (`id`, `src`, `description`, `photographer`, `source_page`, and
  `width`/`height` or a picsum URL for the shape). Thumbnails are `assets/thumbs/<id>.webp` at 480 px on
  the short side; full photos are 1400 px JPEGs. WebGL scenes upload every thumbnail into one
  `TEXTURE_2D_ARRAY` layer of 256 × 256 (stretched; per-instance crops restore the shape), decoded off the
  main thread with `createImageBitmap(…, {resizeWidth, resizeHeight})`, then mipmapped. Each photo set is
  one instanced draw. Only a selected photo fetches its full file.
- **Platform message contract.** A work posts `platform:hello`; the feed answers with
  `platform:visibility {active}` and sends it again whenever that changes. After its first frames a work
  posts `platform:ready` (two `requestAnimationFrame`s, with a 200 ms timeout because a held frame never
  fires), which lets the feed mount the next neighbour sooner. Standalone, nobody answers, and the work
  just runs.
- **Off-screen pausing.** `running = hostActive && !document.hidden`. When not running, a frame only
  redraws: no time advance, no simulation, and no further frames requested. The feed also freezes
  same-origin frames itself (wrapping `requestAnimationFrame`, pausing Web Animations and media) as a
  fallback, and calls `WEBGL_lose_context` on frames it removes. Neighbours load one at a time, and only
  once the visitor pauses.
- **Performance habits.** DPR capped at 1.5–2, half-resolution passes (the mirror), adaptive resolution
  (the shop), long setup sliced into tasks of about 12 ms, and no frames at all when nothing moves.
- **Accessibility.** A focusable canvas with an `aria-label` describing the scene and every control, a
  keyboard path for everything (arrows, Enter, Escape), an `aria-live` region, `prefers-reduced-motion`
  respected (no sway, no intro), and dialogs for light boxes.

## Gaps: what the collection doesn't have yet

1. **A night, and people.** Every sample photo is a landscape and every room is a quiet gallery: grey
   walls, daylight, travel. Nothing is about a specific night with specific people, and there's no party
   light — colored, moving, flash-lit. Candid photos of people behave differently from landscapes: they
   are dark, high contrast and flash-lit, the orientation is mixed (4:3, 3:4, 9:16), and random crops cut
   off faces. Crops need a focus point.
2. **Materials.** There's paper, film, glass, metal and wood. There is no water, no cloth, no light
   carrying an image (projection), and no thermal paper or type as a material.
3. **Verbs.** Brush, orbit, swing, walk, scroll. Nobody stirs a liquid, spins something heavy with
   inertia, pulls something out of a machine, tears it off, grabs fabric, sweeps a pile of objects on a
   surface, or turns a photo over to see its back.
4. **Time.** No work uses when a photo was taken, though the EXIF times of one night (21:49 → 01:28) are a
   story in themselves.
5. **Sending.** Nothing helps you point a friend at one photo (no deep links), and no metaphor is about
   giving a photo away, which is what a group does the morning after.
6. **Mechanisms.** Apart from the chains and wires, nothing is a machine: no printer, projector, carousel,
   or motor.
7. **Swapping in your own photos.** Every work reads its photos from another work's folder
   (`../stream-implement-3d/`), and the README mentions `scripts/` importers that aren't in the
   repository. A group wanting to pour their own photos in has to hand-edit JSON and make WebP thumbnails
   themselves, and a phone's location data goes along with every photo unless someone strips it.
8. **Daylight and the morning after.** Apart from the shop, every scene is dim. Nothing is lit by the sun.

## How the new set answers this

| Scene | Metaphor | Verb | Light idea | Gap it fills |
| --- | --- | --- | --- | --- |
| **Mirror Ball** | The party's mirror ball, its tiles carrying the photos as transparencies | Spin it (inertia, motor) | One pin spot; every tile throws a little projected photo onto the walls | Party light, motion, projection |
| **Night Pool** | Prints floating on a pool at night | Stir the water (wave simulation) | Underwater lamps, caustics, string lights broken up in the reflection, print shadows on the floor | Water, night exterior |
| **Receipt Roll** | A thermal printer prints the night as an itemized, timestamped receipt | Pull the paper out; flick to tear it | Diner fluorescent with a pink neon side light on curled thermal paper | Type as material, machines, time |
| **Bedsheet Cinema** | A slide projector throwing the photos onto a bedsheet pinned in the cabin | Grab the sheet (cloth simulation) | Off-axis projector light that bends over the folds; dust in the beam | Cloth, projection, one photo large |
| **Double Prints** | Lab prints in doubles, tipped out on the table the morning after | Sweep through the pile; pick one up and turn it over | Morning sun through blinds, shadows stacked through the pile, gloss when lifted | Daylight, rigid bodies, the back of a photo, giving one away |

Each new scene is self-contained: its own `photos.json`, `photos/` and `thumbs/`, made by
`scripts/prepare-photos.py`, which turns photos upright, converts them to sRGB, strips all metadata
(including GPS), and records the capture time and a focus point. Every scene also supports `#<photo-id>`
deep links, so you can send someone straight to one photo.

## Review checklist (used for the critique rounds)

1. **Metaphor**: is the photo a physical object, and does the material explain how it looks?
2. **One verb**: can a first-time visitor discover the interaction without text, on touch and mouse?
   Does it feel physical: weight, inertia, settling?
3. **Restraint**: no instructions or loading UI, a muted palette, type only where the metaphor has type,
   and one light idea.
4. **Light**: is there a source you could point at, with falloff, soft shadows, specular, tone mapping, and
   no banding?
5. **Motion**: simulated, damped, never linear; does it settle and stop?
6. **First load**: is the first two seconds a moment (the light striking, the printer printing, the
   lamp warming up, the prints spilling) rather than a fade-in?
7. **Photos**: do the faces read? Do the crops respect focus points? Is the full file loaded only on
   selection, and is it sharp once loaded?
8. **Phone**: is it framed for portrait, with targets large enough, and smooth?
9. **Platform**: hello, visibility, and ready; zero frames off screen; reduced motion; keyboard path;
   live region.
10. **Craft**: antialiased edges, no z-fighting, no popping, correct orientation, nothing half-finished.
