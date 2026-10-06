# Bedsheet Cinema

A white bedsheet is pinned up in a dark cabin, and a slide projector on a chair in front of it shows the night's photos on it one at a time. Drag the sheet to take hold of it: the picture folds with the cloth and spills onto the planks behind, and the sheet swings back when let go. Tap, Space or the right arrow shows the next slide, the left arrow the previous one, and Enter sends a draft through the sheet.

It shows the 25 photos from one retreat night, one slide at a time in the order they were taken, each whole: the projector's gate is square and every photo is fitted inside it, so portrait photos project tall and narrow. All thumbnails load up front, so changing slides is immediate; the current slide's full file replaces its thumbnail once decoded, and the next slide's full file is fetched ahead. Opening the page with `#<photo id>` starts at that photo, and the address follows the slide.

Serve the repository root over HTTP and open `experiences/bedsheet-cinema/`. It is plain HTML, CSS, and two JavaScript modules drawing with WebGL 2; there is no build step or dependency.

## Use your own photos

1. Put your photos in one folder (JPEG, PNG or WebP; HEIC needs `pip install pillow-heif`).
2. From the repository root, run `python3 scripts/prepare-photos.py /path/to/your/photos experiences/bedsheet-cinema`.
   It replaces `photos/`, `thumbs/` and `photos.json` in this folder: photos are turned upright, converted
   to sRGB, stripped of location and camera metadata, saved at 1600 px with 480 px WebP thumbnails, and
   listed oldest first. It needs Pillow (`pip install pillow`).
3. Caption them in `photos.json`, one photo per line: `description` is the caption, `taken` the time shown
   (or `null`), and `focus` the point to keep in frame when a photo is cropped (0–1 from the left and top).
   This scene never crops, so `focus` is not used. `album.title` and `album.date` are not shown.
4. Reload the page. Any number of photos works; they are shown in the order of `photos.json` and the caption
   counts them. Landscape photos fill the gate's width and portrait photos its height (a little less on the wide
   sheet, so they clear the pins and the beam). At the top of `main.js`,
   `EYE_DIST` sets how far back you sit and `LENS` where the projector stands in front of you; `build()`
   sets the sheet's size and how large the projector throws the picture.

Without Python: add a JPEG to `photos/`, a WebP or JPEG about 480 px on its short side to `thumbs/`, and a
line to `photos.json` with its `id`, `src`, `thumb`, `width`, `height`, `description`, `taken` and `focus`.
