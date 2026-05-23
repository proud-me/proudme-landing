"""
One-shot generator for docs/assets/og-card.png (1200x630, the social-share
preview image used in og:image + twitter:image). Run from repo root:

    python docs/assets/generate_og_card.py

Re-run only when the brand or headline copy changes. Result is checked
into git so GitHub Pages serves it as a static asset.
"""

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os, sys

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(__file__), "og-card.png")

# Brand palette (matches docs/styles.css :root tokens).
BRAND_START = (60, 50, 147)      # #3C3293 indigo
BRAND_END   = (94, 78, 196)      # softer violet for the bottom of the gradient
GOLD        = (245, 166, 35)     # #F5A623
GOLD_LIGHT  = (255, 213, 128)    # #FFD580 (radial highlight inside smiley)
DARK        = (26, 21, 51)       # smiley eyes/mouth, #1A1533
PEACH       = (255, 159, 139)    # smiley cheeks
CREAM       = (251, 250, 247)    # body text
CREAM_DIM   = (220, 215, 235)    # credit text


def _font(size, bold=False):
    """Pick a TrueType font that's actually installed on this Windows box.
    Falls back to PIL's default bitmap font if nothing matches."""
    candidates = []
    if bold:
        candidates += [
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
        ]
    else:
        candidates += [
            r"C:\Windows\Fonts\segoeui.ttf",
            r"C:\Windows\Fonts\arial.ttf",
        ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def draw_gradient(img):
    """Top-to-bottom indigo->violet gradient. Plus a soft conic-ish accent
    glow in the upper-right to mimic the hero's brand glow on the live site."""
    base = Image.new("RGB", (W, H), BRAND_START)
    px = base.load()
    for y in range(H):
        t = y / (H - 1)
        r = int(BRAND_START[0] + (BRAND_END[0] - BRAND_START[0]) * t)
        g = int(BRAND_START[1] + (BRAND_END[1] - BRAND_START[1]) * t)
        b = int(BRAND_START[2] + (BRAND_END[2] - BRAND_START[2]) * t)
        for x in range(W):
            px[x, y] = (r, g, b)
    glow = Image.new("RGB", (W, H), (255, 255, 255))
    gd = ImageDraw.Draw(glow)
    gd.rectangle([0, 0, W, H], fill=(0, 0, 0))
    gd.ellipse([W - 700, -300, W + 200, 600], fill=GOLD)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=180))
    base = Image.blend(base, glow, alpha=0.22)
    img.paste(base, (0, 0))


def draw_smiley(img, cx, cy, r):
    """The website's signature gold smiley, scaled to radius r. Matches
    docs/styles.css `.pebble-mascot` block + buddy_smiley.svg."""
    d = ImageDraw.Draw(img, "RGBA")
    # Outer gradient circle (fake radial via 2 stacked ellipses).
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD)
    d.ellipse([cx - r * 0.85, cy - r * 0.95, cx + r * 0.85, cy + r * 0.5],
              fill=GOLD_LIGHT + (140,))
    # Cheeks.
    d.ellipse([cx - r * 0.62, cy + r * 0.05, cx - r * 0.30, cy + r * 0.30],
              fill=PEACH + (180,))
    d.ellipse([cx + r * 0.30, cy + r * 0.05, cx + r * 0.62, cy + r * 0.30],
              fill=PEACH + (180,))
    # Eyes.
    ew, eh = r * 0.08, r * 0.13
    d.ellipse([cx - r * 0.27 - ew, cy - r * 0.05 - eh,
               cx - r * 0.27 + ew, cy - r * 0.05 + eh], fill=DARK)
    d.ellipse([cx + r * 0.27 - ew, cy - r * 0.05 - eh,
               cx + r * 0.27 + ew, cy - r * 0.05 + eh], fill=DARK)
    # Smile (an arc).
    box = [cx - r * 0.32, cy + r * 0.05, cx + r * 0.32, cy + r * 0.50]
    d.arc(box, start=20, end=160, fill=DARK, width=int(r * 0.07))


def main():
    img = Image.new("RGB", (W, H), BRAND_START)
    draw_gradient(img)

    # Headline. Two lines, big and bold, left-aligned in the lower-left
    # quadrant. The smiley sits in the right ~third.
    title_font = _font(96, bold=True)
    tag_font   = _font(36, bold=False)
    credit_font = _font(24, bold=False)
    badge_font  = _font(26, bold=True)

    d = ImageDraw.Draw(img, "RGBA")
    pad_l, pad_t = 80, 130
    d.text((pad_l, pad_t), "Big habits", font=title_font, fill=CREAM)
    d.text((pad_l, pad_t + 110), "start small.", font=title_font, fill=CREAM)

    # Subtitle / pitch.
    d.text((pad_l, pad_t + 240),
           "A kids 7-11 wellness app from\nthe LSU Pedagogical Kinesiology Lab.",
           font=tag_font, fill=CREAM_DIM, spacing=8)

    # Badge pill (gold capsule with dark text), bottom-left.
    badge_text = "Free  ·  iPhone + iPad"
    bbox = d.textbbox((0, 0), badge_text, font=badge_font)
    bw = bbox[2] - bbox[0] + 60
    bh = bbox[3] - bbox[1] + 28
    bx, by = pad_l, H - 90
    d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=bh // 2, fill=GOLD)
    d.text((bx + 30, by + 10), badge_text, font=badge_font, fill=DARK)

    # Credit line, bottom-right.
    credit = "Led by Dr. Senlin Chen, PhD  ·  Louisiana State University"
    cbox = d.textbbox((0, 0), credit, font=credit_font)
    d.text((W - (cbox[2] - cbox[0]) - 50, H - 50), credit, font=credit_font, fill=CREAM_DIM)

    # Smiley in the upper-right area.
    draw_smiley(img, cx=W - 230, cy=H // 2 + 20, r=180)

    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
