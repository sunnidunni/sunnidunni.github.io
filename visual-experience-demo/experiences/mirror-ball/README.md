# Mirror Ball

A mirror ball turns slowly in a dark, empty room under one warm pin spot, and each of its 725 small mirrors carries a photo like a transparency, so the light it throws sweeps round the walls, floor and ceiling as squares of photos. Drag sideways or press the arrow keys to spin it; tap a square of light or a mirror (or press Enter for the one nearest the middle) to catch its photo on the back wall, where the arrows or a swipe step through the photos and Escape or a tap anywhere but the picture lets it go.

It shows the 25 photos from one retreat night. Every photo is on 29 mirrors, cropped square around its faces (some a little closer), and neighbouring mirrors rarely share one. Only the thumbnails load up front; a caught photo loads its full file, which replaces the thumbnail once it is decoded.

Serve the repository root over HTTP and open `experiences/mirror-ball/`. It is plain HTML, CSS, and three JavaScript modules drawing with WebGL 2; there is no build step or dependency.

## Use your own photos

1. Put your photos in one folder (JPEG, PNG or WebP; HEIC needs `pip install pillow-heif`).
2. From the repository root, run `python3 scripts/prepare-photos.py /path/to/your/photos experiences/mirror-ball`.
   It replaces `photos/`, `thumbs/` and `photos.json` in this folder: photos are turned upright, converted
   to sRGB, stripped of location and camera metadata, saved at 1600 px with 480 px WebP thumbnails, and
   listed oldest first. It needs Pillow (`pip install pillow`).
3. Caption them in `photos.json`, one photo per line: `description` is the caption, `taken` the time shown
   (or `null`), and `focus` the point to keep in frame when a photo is cropped (0–1 from the left and top).
   `album.title` and `album.date` are not shown.
4. Reload the page. Any number of photos works: the ball always has the same mirrors and shares them out
   evenly, so a few photos repeat many times and with more than 725 some are left off the ball. Arrow keys
   and the caption step through them in the order of `photos.json`. `MOTOR` at the top of `main.js` sets
   how fast the ball turns, and `RINGS` and `DOME` in `optics.js` how many mirrors it has and how far each
   spreads its light.

Without Python: add a JPEG to `photos/`, a WebP or JPEG about 480 px on its short side to `thumbs/`, and a
line to `photos.json` with its `id`, `src`, `thumb`, `width`, `height`, `description`, `taken` and `focus`.
