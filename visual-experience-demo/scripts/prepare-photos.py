#!/usr/bin/env python3
"""Prepare a folder of photos for the retreat scenes (Mirror Ball, Night Pool, Receipt Roll,
Bedsheet Cinema, Double Prints).

    python3 scripts/prepare-photos.py ~/Pictures/my-night experiences/night-pool [more scene folders]

For every photo it writes, into each scene folder:
  photos/<id>.jpg   upright, sRGB, at most 1600 px on the long side, with all metadata removed
                    (location, camera serial numbers and so on never leave your computer)
  thumbs/<id>.webp  480 px on the short side; scenes load only these until a photo is selected
  photos.json       the list the scene reads, oldest photo first

Captions, crop focus points and turns already in a scene's photos.json are kept for photos with
the same id (the id is the file name, lower-cased), so you can edit captions and run this again.
A photo whose camera saved it sideways without saying so can be given `"rotate": 90` (degrees
clockwise, also 180 or 270) in photos.json; the next run turns it upright.
Needs Pillow (`pip install pillow`); HEIC files also need `pip install pillow-heif`.
"""
import argparse, io, json, os, re, sys
from datetime import datetime
from PIL import Image, ImageOps, ImageCms, ExifTags

try:  # optional: real HEIC files
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff'}
SRGB = ImageCms.createProfile('sRGB')


def photo_id(name):
    return re.sub(r'[^a-z0-9]+', '-', os.path.splitext(name)[0].lower()).strip('-')


def to_srgb(im):
    icc = im.info.get('icc_profile')
    im = im.convert('RGB')
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            im = ImageCms.profileToProfile(im, src, SRGB, outputMode='RGB')
        except Exception:
            pass  # an unreadable profile: keep the pixels as they are
    return im


def read_meta(im):
    exif = im.getexif()
    sub = exif.get_ifd(0x8769)
    when = sub.get(0x9003) or exif.get(0x0132)  # DateTimeOriginal, else DateTime
    taken = None
    if when:
        try:
            taken = datetime.strptime(str(when).strip('\x00 '), '%Y:%m:%d %H:%M:%S').isoformat()
        except ValueError:
            pass
    model = str(exif.get(0x0110) or '').strip('\x00 ').strip()
    return taken, model


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source', help='folder of your photos')
    ap.add_argument('scenes', nargs='+', help='scene folders to write into, e.g. experiences/night-pool')
    ap.add_argument('--long', type=int, default=1600, help='long side of the full photo (default 1600)')
    ap.add_argument('--thumb', type=int, default=480, help='short side of the thumbnail (default 480)')
    ap.add_argument('--captions', help='optional JSON: {"<id>": {"description": "...", "focus": [x, y]}}')
    args = ap.parse_args()

    names = sorted(n for n in os.listdir(args.source) if os.path.splitext(n)[1].lower() in EXTS)
    if not names:
        sys.exit(f'No photos found in {args.source}')
    captions = json.load(open(args.captions)) if args.captions else {}

    # Earlier captions, focus points and turns, from the first scene that has them.
    old = {}
    for scene in args.scenes:
        path = os.path.join(scene, 'photos.json')
        if os.path.exists(path):
            old = {p['id']: p for p in json.load(open(path)).get('photos', [])}
            break
    known = {pid: {**old.get(pid, {}), **captions.get(pid, {})} for pid in map(photo_id, names)}

    prepared = []
    for name in names:
        im = Image.open(os.path.join(args.source, name))
        taken, model = read_meta(im)
        im = to_srgb(ImageOps.exif_transpose(im))
        turn = int(known[photo_id(name)].get('rotate', 0)) % 360
        if turn:
            im = im.rotate(-turn, expand=True)
        full = im.copy()
        full.thumbnail((args.long, args.long), Image.LANCZOS)
        scale = args.thumb / min(im.size)
        thumb = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS) if scale < 1 else im.copy()
        prepared.append((photo_id(name), name, taken, model, full, thumb))
        print(f'{name}: {im.width}x{im.height} -> {full.width}x{full.height}, thumb {thumb.width}x{thumb.height}')

    # Oldest first; photos without a capture time go last, by name.
    prepared.sort(key=lambda p: (p[2] is None, p[2] or '', p[1]))

    for scene in args.scenes:
        path = os.path.join(scene, 'photos.json')
        album = json.load(open(path)).get('album') if os.path.exists(path) else None
        wanted = {f'{p[0]}.jpg' for p in prepared} | {f'{p[0]}.webp' for p in prepared}
        for sub in ('photos', 'thumbs'):
            os.makedirs(os.path.join(scene, sub), exist_ok=True)
            for f in os.listdir(os.path.join(scene, sub)):
                if f.endswith(('.jpg', '.webp')) and f not in wanted:
                    os.remove(os.path.join(scene, sub, f))  # photos no longer in the folder
        entries = []
        for pid, name, taken, model, full, thumb in prepared:
            # Saved without EXIF, XMP or ICC data (the pixels are already sRGB), each written to a
            # temporary name first so a page loading meanwhile never sees half a file.
            for img, sub, ext, opts in ((full, 'photos', 'jpg', dict(format='JPEG', quality=82, optimize=True, progressive=True)),
                                        (thumb, 'thumbs', 'webp', dict(format='WEBP', quality=80, method=6))):
                dest = os.path.join(scene, sub, f'{pid}.{ext}')
                img.save(dest + '.part', **opts)
                os.replace(dest + '.part', dest)
            keep = known[pid]
            entries.append({
                'id': pid,
                'src': f'photos/{pid}.jpg',
                'thumb': f'thumbs/{pid}.webp',
                'width': full.width,
                'height': full.height,
                'description': keep.get('description') or os.path.splitext(name)[0],
                'taken': taken,
                'camera': model,
                'focus': keep.get('focus', [0.5, 0.5]),
                'photographer': keep.get('photographer', ''),
                'source_page': keep.get('source_page', ''),
                **({'rotate': int(keep['rotate']) % 360} if int(keep.get('rotate', 0)) % 360 else {}),
            })
        album = album or {'title': 'The night', 'date': (entries[0]['taken'] or '')[:10]}
        # One photo per line, so captions are easy to find and edit by hand.
        line = lambda o: json.dumps(o, ensure_ascii=False, separators=(', ', ': '))
        with open(path + '.part', 'w') as f:
            f.write('{\n  "album": ' + line(album) + ',\n  "photos": [\n    ')
            f.write(',\n    '.join(line(e) for e in entries))
            f.write('\n  ]\n}\n')
        os.replace(path + '.part', path)
        print(f'{scene}: {len(entries)} photos')


if __name__ == '__main__':
    main()
