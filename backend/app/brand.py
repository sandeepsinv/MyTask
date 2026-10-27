"""Brand colours from the Property Shop Investment logo, and the shades derived from them.

Projects and people's avatars take their colour from this list only.
Keep in sync with PROJECT_COLORS in frontend/src/components/Projects.tsx.
"""

NAVY = "#282b66"
ORANGE = "#e96831"

PALETTE = [NAVY, ORANGE, "#4f5394", "#b44515", "#7a7db3", "#f2925f", "#14163f", "#5b5d73"]

# Colours used before the rebrand, mapped to their nearest brand shade.
OLD_TO_BRAND = {
    "#2563eb": NAVY,
    "#4f46e5": NAVY,
    "#1b6e66": "#4f5394",
    "#0d9488": "#4f5394",
    "#c2410c": ORANGE,
    "#be123c": "#b44515",
    "#4d7c0f": "#7a7db3",
    "#15803d": "#7a7db3",
    "#a16207": "#f2925f",
    "#0369a1": "#14163f",
    "#1f2937": "#14163f",
    "#6b6b69": "#5b5d73",
}


def to_brand(color: str | None, fallback_index: int = 0) -> str:
    """The brand colour for a stored colour: unchanged if already on the palette."""
    c = (color or "").lower()
    if c in PALETTE:
        return c
    return OLD_TO_BRAND.get(c, PALETTE[fallback_index % len(PALETTE)])
