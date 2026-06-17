#!/usr/bin/env python3
"""Generate the PWA / favicon assets from the in-app "lifti" wordmark.

The wordmark mirrors the header in index.html: lowercase, light weight,
letter-spaced, teal (#2DD4BF) on the dark app background (#0B0F10) with a
soft glow. Run with: python3 scripts/generate_icons.py
"""
import os
import cairosvg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")

BG = "#0B0F10"
ACCENT = "#2DD4BF"

FONT_STACK = "Inter, -apple-system, 'Segoe UI', sans-serif"


def wordmark_svg(size, *, rounded=True, safe_scale=1.0, glow=True):
    """Return an SVG string with the centred 'lifti' wordmark.

    safe_scale shrinks the text so maskable icons keep the wordmark inside
    the platform safe zone (~80% of the canvas).
    """
    radius = round(size * 0.18) if rounded else 0
    font_size = size * 0.30 * safe_scale
    letter_spacing = font_size * 0.16
    cx = size / 2
    cy = size / 2

    glow_defs = ""
    glow_text = ""
    if glow:
        glow_defs = (
            '<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">'
            f'<feGaussianBlur stdDeviation="{size * 0.018:.2f}" result="b"/>'
            '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>'
            "</filter>"
        )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}" role="img" aria-label="lifti">
  <defs>
    <radialGradient id="bgGlow" cx="80%" cy="14%" r="75%">
      <stop offset="0%" stop-color="#123A38"/>
      <stop offset="42%" stop-color="{BG}"/>
      <stop offset="100%" stop-color="{BG}"/>
    </radialGradient>
    {glow_defs}
  </defs>
  <rect width="{size}" height="{size}" rx="{radius}" fill="{BG}"/>
  <rect width="{size}" height="{size}" rx="{radius}" fill="url(#bgGlow)"/>
  <text x="{cx}" y="{cy}" fill="{ACCENT}" font-family="{FONT_STACK}"
        font-size="{font_size:.2f}" font-weight="300" letter-spacing="{letter_spacing:.2f}"
        text-anchor="middle" dominant-baseline="central"
        {'filter="url(#glow)"' if glow else ''}>lifti</text>
</svg>"""


def main():
    os.makedirs(ICONS, exist_ok=True)

    # Scalable favicon (matches the in-app wordmark identity).
    favicon = wordmark_svg(64, rounded=True)
    with open(os.path.join(ROOT, "favicon.svg"), "w") as f:
        f.write(favicon + "\n")

    targets = [
        ("icon-192.png", 192, dict(rounded=True, safe_scale=1.0)),
        ("icon-512.png", 512, dict(rounded=True, safe_scale=1.0)),
        # Maskable: full-bleed background, wordmark kept inside the safe zone.
        ("icon-maskable-512.png", 512, dict(rounded=False, safe_scale=0.72)),
    ]
    for name, size, opts in targets:
        svg = wordmark_svg(size, **opts)
        cairosvg.svg2png(
            bytestring=svg.encode("utf-8"),
            write_to=os.path.join(ICONS, name),
            output_width=size,
            output_height=size,
        )
        print(f"wrote icons/{name} ({size}x{size})")
    print("wrote favicon.svg")


if __name__ == "__main__":
    main()
