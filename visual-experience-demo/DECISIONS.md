# Decisions

You were away and asked me not to ask questions, so I made these calls myself. Each one is a single
place to change if you'd rather go the other way.

## Where the work lives

- **The session can only push to `sunnidunni/sunnidunni.github.io`**, on branch
  `claude/pensive-lovelace-1x5p42`. I can't push to `HaichaoLihc/visual-experience-demo` from here, and
  you didn't ask me to fork it. I cloned it, built everything on top of it locally, and committed the
  result to your repository as an **overlay folder**, `visual-experience-demo/`. Every path in it matches
  the upstream repository. To apply it:
  ```sh
  git clone https://github.com/HaichaoLihc/visual-experience-demo && cd visual-experience-demo
  cp -R /path/to/sunnidunni.github.io/visual-experience-demo/. .
  python3 -m http.server 8002   # then open http://localhost:8002/?experience=mirror-ball
  ```
  The overlay holds only new and changed files: five `experiences/<scene>/` folders, five
  `previews/<scene>.jpg`, `experiences.js` (catalog), the five platform HTML files (cache-buster bumped),
  `README.md`, `scripts/prepare-photos.py`, this file and `ANALYSIS.md`.
- **The new scenes run on their own.** Each folder carries its own photos, so if your site's GitHub
  Pages serves `main`, merging this branch also makes them live at
  `https://sunnidunni.github.io/visual-experience-demo/experiences/<scene>/`. Flow and Explore need the
  rest of upstream, though.

## Photos

- **25 photos, not about 30.** That's how many were in the zip. Scenes that want more objects repeat
  them; Double Prints uses each one twice, which is the point of "doubles".
- **The `.HEIC` files were actually JPEGs** (an iPhone export renamed). They're read as JPEG, so no HEIC
  decoder is needed.
- **All metadata is stripped.** Eight of the photos (iPhone 14 and Canon G7 X) carried GPS
  coordinates. The published JPEGs and WebPs have no EXIF, XMP or ICC data at all. I keep only the
  capture time and the camera model, written into `photos.json` on purpose.
- **Color.** The iPhone photos were Display P3. They're converted to sRGB before the profile is
  dropped, so they don't wash out.
- **Sizes.** Full photos are 1600 px on the long side (JPEG q82, 3.2 MB for all 25). Thumbnails are
  480 px on the short side (WebP q80, 616 KB for all 25), the collection's own thumbnail size. Scenes
  load only thumbnails up front.
- **Order and times.** Photos are sorted by `DateTimeOriginal`. For the Canon SX740 photos, the plain
  `DateTime` field had been rewritten by Picasa to the next evening's export time, so it couldn't be
  used. `IMG_7539` has no metadata, so it comes last, with no time shown.
- **One photo turned upright by hand.** `IMG_7539` (the dark selfie) was saved sideways with no
  orientation tag, so both faces lay on their side. Its entry has `"rotate": 90`, and the script turns it
  clockwise into a 1600 × 900 landscape. Remove that key to undo it.
- **Captions are mine.** I wrote short, neutral captions from what's visible ("The huddle", "Blue
  booth"), with no names and nothing about drinking. Each photo also has a hand-placed `focus` point
  where the faces are, which every crop respects. Edit both in any scene's `photos.json`.
- **Album name.** `photos.json` → `album.title` is `"Retreat"`, a placeholder. Receipt Roll prints it
  and Double Prints puts it on the envelope.
- **Every scene folder has its own copy of the photos**, as you specified: `experiences/<name>/` with
  its own `photos.json` and thumbnails. That's 3.8 MB × 5 on disk, but git stores identical files once,
  so the repository grows by one copy. It also means View Source and Copy Prompt hand someone a folder
  that works alone. (The older works share `../stream-implement-3d/`.)
- **`scripts/prepare-photos.py`** rebuilds a scene's `photos/`, `thumbs/` and `photos.json` from any
  folder of photos and keeps captions you've already written. Every scene README explains it.

## ⚠️ Before this goes public

These are identifiable people at a party, including the drinking-game shots. The upstream site is
public on GitHub Pages, and `sunnidunni/sunnidunni.github.io` is a public repository, so the branch I
pushed is already visible. Please check with the people in them before merging anywhere, or swap in a
different set with the script above. If anyone objects, delete the branch; GitHub can keep unreferenced
commits reachable by their hash for a while, so contact GitHub support if they need to be gone fully.
The location data is already gone.

## The five scenes

I picked five scenes where each has a **different material, a different verb and a different light**,
so none of them is a collage:

| Scene | Verb | Material | Light |
| --- | --- | --- | --- |
| Mirror Ball | spin | mirror + projected light | one pin spot, colored by photos |
| Night Pool | stir | water | underwater lamps, caustics, string-light reflections |
| Receipt Roll | pull / tear | thermal paper, type | diner fluorescent + pink neon |
| Bedsheet Cinema | grab | cloth | off-axis slide projector |
| Double Prints | sweep / flip | glossy lab prints | morning sun through blinds |

Together they also follow the night: the party (mirror ball), after (the pool), 3 a.m. (the receipt),
the screening (the sheet), and the morning after (the prints).

Ideas I considered and dropped:
- **Photo booth strip**: too close to Receipt Roll; both are a machine printing paper.
- **Paper airplanes**: a lovely "send it to a friend" metaphor, but the photo stays folded and hidden
  until the end, and the folding geometry was the biggest risk.
- **Sky lanterns**: they send the photos away, which is the wrong feeling for keepsakes.
- **Crate digging**: square record-sleeve crops cut faces badly, and it's close to the existing stacks
  and books.
- **Fogged bus window**: a beautiful wipe-to-reveal, but there was no good reason for the photos to be
  behind the glass.
- **Spin the bottle**: the same verb as the mirror ball.
- **Sticker sheet**: the sheet itself is a grid, which is a collage.
- **Instant film**: developing is a reveal mechanic, so the photos would be hidden by default.

## Things every new scene does

- One `photos.json` per scene, a superset of the collection's format: `id`, `src`, `description`,
  `photographer`, `source_page`, `width`, `height`, plus `thumb`, `taken`, `camera` and `focus`, and an
  `album` object. Credits and sources are empty for personal photos, and the UI hides them.
- **Deep links**: `#<photo id>` opens that photo, and opening one updates the hash, so a friend can be
  sent straight to "Two skulls".
- The platform contract as the references do it: hello, visibility, ready, and no frames when off
  screen. Also reduced motion, a keyboard path, and a live region.
- `document.body.dataset.loaded` is set to the number of thumbnails ready. It's a harmless test hook my
  verification script reads, the same idea as the Souvenir Shop's `body.dataset.ready`.

## Catalog and platform

- The five entries go **after Hanging Lenses and before the photobooks**, since the README says the
  photobooks are "listed last". They're ordered by the night: Mirror Ball, Night Pool, Receipt Roll,
  Bedsheet Cinema, Double Prints.
- `experiences.js` changed, so I bumped its cache-buster from `?v=canopy-first` to `?v=retreat-night`
  in the five HTML pages that load it.
- Previews are 1060 × 959 headless-Chrome captures, like the existing ones.
- `PROMPT.txt` in each scene is exactly the text the site's Copy Prompt button produces. Its source URL
  points at upstream `main`, which will only resolve once the scenes are merged there.

## Process

- Each scene was first built by its own agent from a written brief. I wrote the briefs, the shared
  conventions, the photo pipeline and the verification harness, then reviewed every scene as a design
  director and directed the improvement rounds. Each scene got two critique rounds after its first
  build:
  - **Round 1** fixed what was wrong. Examples: Mirror Ball's spots were sepia and its ball was
    dull; Night Pool's lift was too small and its prints sat on the water like stickers; Receipt
    Roll had no night lighting and grey ink; Bedsheet Cinema's sheet was a flat panel; Double
    Prints' picked-up print looked like a UI modal.
  - **Round 2** polished the light, the first-load moment, the motion constants and the type.
- Verification runs each scene in headless Chromium (software WebGL) inside a stand-in platform page.
  It checks console errors, failed requests, hello and ready, that every thumbnail loaded, that no full
  photo loads before a selection, and that zero frames are drawn after `platform:visibility
  {active:false}`. It takes screenshots at 1440 × 900 and 390 × 844 @2x. Each scene also has a
  scripted interaction pass covering drag, select, step, close, deep link and reduced motion.
- **First-load filmstrips.** Software rendering here draws one to five frames a second, so real-time
  screenshots can't show an intro. Playwright's fake clock steps exact 16 ms frames instead, so each
  scene's first two seconds were checked frame by frame, as they'd play at 60 fps.
- **Frame pacing.** Night Pool, Bedsheet Cinema and Double Prints wait on a `fenceSync` from the
  previous frame before queuing the next one. On a GPU that keeps up, the wait never triggers. On a
  slow one it stops frames piling up into seconds of input lag. Bedsheet Cinema only waits if fences
  are measured to be slow, so a driver that reports late can't halve its frame rate.
- **Not tested on real devices.** I had no real phone or GPU, so motion feel was judged from the
  constants in the code and the filmstrips, not by hand. The first thing worth doing is a pass on a
  real phone (Safari and Chrome), especially Night Pool's water shader and Bedsheet Cinema's cloth and
  haze, which are the heaviest.
- **One fix I made by hand after the rounds:** Double Prints skipped any frame whose predecessor's
  fence hadn't signalled. On a driver that reports late, that could halve the frame rate. I ported
  Bedsheet Cinema's adaptive version and re-ran its full interaction script.

## What I'd do next

1. **Real phones first.** Tune the feel by hand on iOS Safari and Android Chrome: drag weight, spin
   inertia, how far a stir carries, the cloth's grab lag. Measure the heaviest shaders (Night Pool's
   water, Bedsheet Cinema's haze, Double Prints' prints) and drop the pixel ratio to 1.5 where a phone
   can't hold 60 fps.
2. **A "send this one" button.** Every scene already has `#<photo id>` deep links. A small share
   button in the caption pill that copies the link (or opens the share sheet) would make the
   morning-after use direct.
3. **Per-scene ideas the builders and I noted:**
   - Mirror Ball: real reflections of the room in each mirror instead of hashed flecks, and a
     restaged room so the caught photo can be bigger than 44% of the screen on desktop.
   - Night Pool: a GPU wave simulation at higher resolution for fine ripples, with caustics computed
     from the actual surface.
   - Receipt Roll: torn receipts that slowly curl into loose tubes and shade each other, and more
     form on the printer's lid.
   - Bedsheet Cinema: cloth self-collision for very large pulls, and a cheaper haze.
   - Double Prints: prints that shove each other instead of only sliding over, and a gesture to
     gather them back into the envelope.
4. **Sound, maybe.** The whole collection is silent and that's part of its restraint. Still, a room
   tone with a projector fan, a printer motor and water would add a lot here, off by default.
5. **Share the boilerplate.** Each scene repeats about 60 lines of photo loading, caption, deep-link
   and platform-contract code so its folder stands alone. If the collection grows, a tiny shared
   module would be worth the coupling.
