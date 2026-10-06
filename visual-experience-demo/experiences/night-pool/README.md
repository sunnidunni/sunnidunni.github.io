# Night Pool

The night's prints float on a pool after the party. As the page opens, the two lamps in the far wall come on and the prints drop in; a string of bulbs above shows only in the water, as narrow columns of sparks. Drag to stir the water and carry the prints along, tap the water to ripple it, or tap a print to lift it out, still dripping; ‹ › or the arrow keys step through the photographs, and ×, Escape or a tap on the water drops it back. With nothing lifted, the arrow keys push a current and Enter lifts the print nearest the middle.

It shows the 25 photos from one retreat night, each once, as a laminated print with a thin white border that keeps the whole frame. The prints drop into the pool one after another as their thumbnails arrive; only the 480 px thumbnails load up front, into one texture array, and a print's full file loads when it is lifted. With reduced motion the lamps are on and the prints afloat from the start, and nothing moves on its own.

Serve the repository root over HTTP and open `experiences/night-pool/`. It is plain HTML, CSS, and three JavaScript modules drawing with WebGL 2: `main.js` (the scene and its controls), `sim.js` (the water's wave equation and the floating prints) and `shaders.js`; there is no build step or dependency.

## Use your own photos

1. Put your photos in one folder (JPEG, PNG or WebP; HEIC needs `pip install pillow-heif`).
2. From the repository root, run `python3 scripts/prepare-photos.py /path/to/your/photos experiences/night-pool`.
   It replaces `photos/`, `thumbs/` and `photos.json` in this folder: photos are turned upright, converted
   to sRGB, stripped of location and camera metadata, saved at 1600 px with 480 px WebP thumbnails, and
   listed oldest first. It needs Pillow (`pip install pillow`).
3. Caption them in `photos.json`, one photo per line: `description` is the caption, `taken` the time shown
   (or `null`), and `focus` the point to keep in frame when a photo is cropped (0–1 from the left and top).
   The prints show whole photographs, so `focus` is not used here, and neither are `album.title` and `album.date`.
4. Reload the page. Every photo becomes one print, and the prints shrink when there are many, so that they
   never cover more than about 30% of the water; 10 to 40 photos work best. With fewer than 12 photos
   some float twice (`MIN_PRINTS` at the top of `main.js`).

Without Python: add a JPEG to `photos/`, a WebP or JPEG about 480 px on its short side to `thumbs/`, and a
line to `photos.json` with its `id`, `src`, `thumb`, `width`, `height`, `description`, `taken` and `focus`.
