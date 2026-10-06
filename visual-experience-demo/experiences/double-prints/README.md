# Double Prints

The night's photos came back from a one-hour lab printed twice, and the envelope has been tipped out across an oak table in morning sun through venetian blinds. Drag a print to slide it by the point you hold, or drag across bare table to sweep prints aside; select a print to pick it up into the light and select it again to turn it over. Arrow keys step through the photos, Enter picks one up, F or Space turns it over, and Escape puts it down.

The 25 photos from one retreat night are all here twice, as 4 × 6 glossy prints with a thin white border: landscape photos on landscape prints and portrait photos on portrait prints, each cropped to the print's 3:2 frame around its focus point. Only the thumbnails load up front; a photo's full file loads when one of its prints is picked up. The back of a print carries the lab printer's line and the counter's purple stamp: frame number, time taken, and which of the two copies it is.

Serve the repository root over HTTP and open `experiences/double-prints/`. It is plain HTML, CSS, and three JavaScript modules drawing with WebGL 2; there is no build step or dependency. `main.js` draws the table, its light and the prints, `sim.js` moves the pile (each print a rigid card, with friction sampled at sixteen points under it against whatever lies beneath), and `paper.js` draws the envelope and the backs of the prints with Canvas 2D.

## Use your own photos

1. Put your photos in one folder (JPEG, PNG or WebP; HEIC needs `pip install pillow-heif`).
2. From the repository root, run `python3 scripts/prepare-photos.py /path/to/your/photos experiences/double-prints`.
   It replaces `photos/`, `thumbs/` and `photos.json` in this folder: photos are turned upright, converted
   to sRGB, stripped of location and camera metadata, saved at 1600 px with 480 px WebP thumbnails, and
   listed oldest first. It needs Pillow (`pip install pillow`).
3. Caption them in `photos.json`, one photo per line: `description` is the caption, `taken` the time shown
   (or `null`), and `focus` the point to keep in frame when a photo is cropped (0–1 from the left and top).
   `album.title` is stamped on the envelope's name line and `album.date` on its date line (the date is also
   printed on the back of every print); the envelope also shows how many photos there are.
4. Reload the page. Every photo is printed twice, so 15 to 30 photos fill the table well; more make a deeper
   pile. The print size, its border and the blind's slat pitch are `PRINT`, `BORDER` and `SLAT` at the top of
   `main.js`; the sun's height and direction and the window are set in its `layout()`.

Without Python: add a JPEG to `photos/`, a WebP or JPEG about 480 px on its short side to `thumbs/`, and a
line to `photos.json` with its `id`, `src`, `thumb`, `width`, `height`, `description`, `taken` and `focus`.
