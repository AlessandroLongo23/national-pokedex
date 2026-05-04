"""Render Pokémon placeholder PDF from cache/.

Usage:
    python build_pdf.py --ids 1-1025 --out out/pokedex_full.pdf
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).parent
CACHE = ROOT / "cache"
IMAGES = CACHE / "images"
POKEDEX_FILE = CACHE / "pokedex.json"

CARD_W = 63 * mm
CARD_H = 88 * mm
COLS = 3
ROWS = 3
PAGE_W, PAGE_H = A4
MARGIN_X = (PAGE_W - COLS * CARD_W) / 2
MARGIN_Y = (PAGE_H - ROWS * CARD_H) / 2

INNER_PAD = 2.5 * mm
NAME_ROW_H = 5.5 * mm     # row 1: name, full width
BADGE_ROW_H = 4.4 * mm    # row 2: stage badge (left) + gen badge (right)
HEADER_GAP = 1.2 * mm     # gap between name row and badge row
FOOTER_H = 11 * mm        # bottom: pills, then h/w + genus row (number moved up)
BORDER_DASH = [2, 2]
BORDER_WIDTH = 0.4

def _register_unicode_fonts() -> tuple[str, str, str]:
    """Register Arial (near-identical to Helvetica) for full Unicode coverage.
    Falls back to built-in Helvetica if no TTF is found."""
    candidates = [
        ("C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/ariali.ttf"),
        ("/Library/Fonts/Arial Bold.ttf", "/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Italic.ttf"),
    ]
    for bold_p, reg_p, ital_p in candidates:
        if Path(bold_p).exists() and Path(reg_p).exists():
            try:
                pdfmetrics.registerFont(TTFont("_FontBold", bold_p))
                pdfmetrics.registerFont(TTFont("_FontReg", reg_p))
                if Path(ital_p).exists():
                    pdfmetrics.registerFont(TTFont("_FontItal", ital_p))
                    return "_FontBold", "_FontReg", "_FontItal"
                return "_FontBold", "_FontReg", "_FontBold"
            except Exception:
                pass
    return "Helvetica-Bold", "Helvetica", "Helvetica-Oblique"


FONT_BOLD, FONT_REG, FONT_ITAL = _register_unicode_fonts()

SIZE_NUMBER = 11
SIZE_NAME = 14
NUMBER_COLOR = Color(0.42, 0.42, 0.42)  # medium gray, regular weight
SIZE_GENUS = 6.5
SIZE_PILL = 6.5
SIZE_HW = 6.5
SIZE_GEN = 6.5

GEN_BADGE_FILL = "#2E3A59"        # dark navy charcoal
GEN_BADGE_TEXT = "#FFFFFF"
GEN_BADGE_H = 4.4 * mm
GEN_BADGE_PAD_X = 2 * mm
GEN_BADGE_RADIUS = 1.6 * mm
HW_COLOR = Color(0.3, 0.3, 0.3)

STAGE_COLORS = {
    "STAGE 1":   "#6EAE4E",   # green
    "STAGE 2":   "#E0A42B",   # amber
    "STAGE 3":   "#D25A3F",   # red-orange
    "BABY":      "#F29EBB",   # pink
    "LEGENDARY": "#C9A227",   # gold
    "MYTHICAL":  "#8E44AD",   # purple
    "SINGLE":    "#7F8C8D",   # gray
}

TYPE_COLORS = {
    "normal":   "#A8A77A",
    "fire":     "#EE8130",
    "water":    "#6390F0",
    "electric": "#F7D02C",
    "grass":    "#7AC74C",
    "ice":      "#96D9D6",
    "fighting": "#C22E28",
    "poison":   "#A33EA1",
    "ground":   "#E2BF65",
    "flying":   "#A98FF3",
    "psychic":  "#F95587",
    "bug":      "#A6B91A",
    "rock":     "#B6A136",
    "ghost":    "#735797",
    "dragon":   "#6F35FC",
    "dark":     "#705746",
    "steel":    "#B7B7CE",
    "fairy":    "#D685AD",
}
PILL_H = 4.2 * mm
PILL_PAD_X = 1.8 * mm
PILL_GAP = 1.2 * mm
PILL_RADIUS = 1.6 * mm

EVOL_THUMB_GAP = 1.0 * mm  # gap between thumbnail and name/number text


def parse_ids(spec: str) -> list[int]:
    ids: list[int] = []
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "-" in chunk:
            lo, hi = chunk.split("-", 1)
            ids.extend(range(int(lo), int(hi) + 1))
        else:
            ids.append(int(chunk))
    return sorted(set(ids))


def load_pokedex() -> dict[str, dict]:
    if POKEDEX_FILE.exists():
        return json.loads(POKEDEX_FILE.read_text(encoding="utf-8"))
    return {}


def image_path(pid: int) -> Path:
    return IMAGES / f"{pid:04d}.png"


def load_compressed_image(
    path: Path, max_dim: int, quality: int
) -> ImageReader | None:
    """Load a PNG, composite onto white, downscale, and return a JPEG ImageReader."""
    try:
        with Image.open(path) as im:
            im.load()
            if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                rgba = im.convert("RGBA")
                bg = Image.new("RGB", rgba.size, (255, 255, 255))
                bg.paste(rgba, mask=rgba.split()[-1])
                out = bg
            else:
                out = im.convert("RGB")
            w, h = out.size
            longest = max(w, h)
            if longest > max_dim:
                scale = max_dim / longest
                out = out.resize(
                    (max(1, int(w * scale)), max(1, int(h * scale))),
                    Image.LANCZOS,
                )
            buf = io.BytesIO()
            out.save(buf, format="JPEG", quality=quality, optimize=True)
            buf.seek(0)
            return ImageReader(buf)
    except Exception as exc:
        print(f"  warning: failed to compress {path.name}: {exc}", file=sys.stderr)
        return None


def format_height(m: float) -> str:
    return f"{m:.1f} m"


def format_weight(kg: float) -> str:
    if kg >= 100:
        return f"{kg:.0f} kg"
    return f"{kg:.1f} kg"


def draw_type_pills(c: canvas.Canvas, types: list[str], cx: float, y_top: float) -> None:
    """Draw horizontally centered row of type pills. y_top is the top of the pill row."""
    if not types:
        return
    labels = [t.upper() for t in types]
    widths = [stringWidth(lbl, FONT_BOLD, SIZE_PILL) + 2 * PILL_PAD_X for lbl in labels]
    total_w = sum(widths) + PILL_GAP * (len(labels) - 1)
    x = cx - total_w / 2
    y = y_top - PILL_H
    for lbl, w, tname in zip(labels, widths, types):
        color_hex = TYPE_COLORS.get(tname.lower(), "#777777")
        c.setFillColor(HexColor(color_hex))
        c.setStrokeColor(HexColor(color_hex))
        c.roundRect(x, y, w, PILL_H, PILL_RADIUS, stroke=0, fill=1)
        c.setFillColor(white)
        c.setFont(FONT_BOLD, SIZE_PILL)
        text_y = y + (PILL_H - SIZE_PILL) / 2 + 1.2
        c.drawCentredString(x + w / 2, text_y, lbl)
        x += w + PILL_GAP


def draw_card(
    c: canvas.Canvas,
    pid: int,
    meta: dict,
    x: float,
    y: float,
    max_dim: int,
    quality: int,
) -> bool:
    """Draw one card at bottom-left (x, y). Returns True if artwork was drawn."""
    c.saveState()

    # Border
    c.setLineWidth(BORDER_WIDTH)
    c.setStrokeColor(Color(0, 0, 0))
    c.setDash(*BORDER_DASH)
    c.rect(x, y, CARD_W, CARD_H, stroke=1, fill=0)
    c.setDash()

    # ----- Row 1 (top corners): Stage badge left, Gen badge right -----
    badge_y = y + CARD_H - INNER_PAD - BADGE_ROW_H

    stage = meta.get("stage", "")
    if stage:
        stage_color = STAGE_COLORS.get(stage, "#7F8C8D")
        stage_w = stringWidth(stage, FONT_BOLD, SIZE_GEN) + 2 * GEN_BADGE_PAD_X
        stage_x = x + INNER_PAD
        c.setFillColor(HexColor(stage_color))
        c.setStrokeColor(HexColor(stage_color))
        c.roundRect(stage_x, badge_y, stage_w, BADGE_ROW_H,
                    GEN_BADGE_RADIUS, stroke=0, fill=1)
        c.setFillColor(HexColor(GEN_BADGE_TEXT))
        c.setFont(FONT_BOLD, SIZE_GEN)
        c.drawCentredString(
            stage_x + stage_w / 2,
            badge_y + (BADGE_ROW_H - SIZE_GEN) / 2 + 1.2,
            stage,
        )

    gen = meta.get("gen", "")
    if gen:
        label = f"GEN {gen}"
        gen_w = stringWidth(label, FONT_BOLD, SIZE_GEN) + 2 * GEN_BADGE_PAD_X
        gen_x = x + CARD_W - INNER_PAD - gen_w
        c.setFillColor(HexColor(GEN_BADGE_FILL))
        c.setStrokeColor(HexColor(GEN_BADGE_FILL))
        c.roundRect(gen_x, badge_y, gen_w, BADGE_ROW_H,
                    GEN_BADGE_RADIUS, stroke=0, fill=1)
        c.setFillColor(HexColor(GEN_BADGE_TEXT))
        c.setFont(FONT_BOLD, SIZE_GEN)
        c.drawCentredString(
            gen_x + gen_w / 2,
            badge_y + (BADGE_ROW_H - SIZE_GEN) / 2 + 1.2,
            label,
        )

    # ----- Rows 2+3: Name and Number (no layout shift) -----
    name = meta.get("name", "")
    name_baseline_y = badge_y - HEADER_GAP - SIZE_NAME
    number_baseline_y = name_baseline_y - 0.8 * mm - SIZE_NUMBER

    # Thumbnail spans the name+number area to the left when there's a pre-evolution
    evolves_from_id = meta.get("evolves_from_id")
    has_evol = bool(evolves_from_id)
    thumb_w = 0.0

    if has_evol:
        thumb_top = name_baseline_y + SIZE_NAME * 0.75
        thumb_bottom = number_baseline_y - SIZE_NUMBER * 0.25
        thumb_size = thumb_top - thumb_bottom
        thumb_w = thumb_size + EVOL_THUMB_GAP

        evol_img_path = image_path(evolves_from_id)
        if evol_img_path.exists() and evol_img_path.stat().st_size > 0:
            evol_img = load_compressed_image(evol_img_path, 100, 75)
            if evol_img is not None:
                try:
                    iw, ih = evol_img.getSize()
                    scale = min(thumb_size / iw, thumb_size / ih)
                    dw, dh = iw * scale, ih * scale
                    c.drawImage(
                        evol_img,
                        x + INNER_PAD + (thumb_size - dw) / 2,
                        thumb_bottom + (thumb_size - dh) / 2,
                        width=dw, height=dh,
                        mask="auto", preserveAspectRatio=True,
                    )
                except Exception:
                    pass

    # Name and number always centered on the full card width
    text_cx = x + CARD_W / 2
    name_w_avail = CARD_W - 2 * INNER_PAD

    if name:
        font_size = SIZE_NAME
        while (stringWidth(name, FONT_BOLD, font_size) > name_w_avail
               and font_size > 9):
            font_size -= 0.5
        c.setFillColor(Color(0, 0, 0))
        c.setFont(FONT_BOLD, font_size)
        c.drawCentredString(text_cx, name_baseline_y, name)

    c.setFillColor(NUMBER_COLOR)
    c.setFont(FONT_REG, SIZE_NUMBER)
    c.drawCentredString(text_cx, number_baseline_y, f"#{pid:04d}")

    # ----- Artwork region: between footer and number row -----
    art_x0 = x + INNER_PAD
    art_y0 = y + FOOTER_H
    art_w = CARD_W - 2 * INNER_PAD
    art_h = (number_baseline_y - 1.2 * mm) - art_y0

    drew_image = False
    img_path = image_path(pid)
    if img_path.exists() and img_path.stat().st_size > 0:
        img = load_compressed_image(img_path, max_dim, quality)
        if img is not None:
            try:
                iw, ih = img.getSize()
                scale = min(art_w / iw, art_h / ih)
                draw_w = iw * scale
                draw_h = ih * scale
                draw_x = art_x0 + (art_w - draw_w) / 2
                draw_y = art_y0 + (art_h - draw_h) / 2
                c.drawImage(
                    img, draw_x, draw_y,
                    width=draw_w, height=draw_h,
                    mask="auto", preserveAspectRatio=True,
                )
                drew_image = True
            except Exception as exc:
                print(f"  warning: failed to draw #{pid:04d}: {exc}", file=sys.stderr)

    # ----- Footer: bottom row (h/w + genus), pills, number -----
    cx = x + CARD_W / 2

    # Bottom row: height-left, genus-center, weight-right
    c.setFillColor(HW_COLOR)
    c.setFont(FONT_REG, SIZE_HW)
    bottom_y = y + 1.8 * mm
    h_m = meta.get("height_m")
    w_kg = meta.get("weight_kg")
    if isinstance(h_m, (int, float)) and h_m > 0:
        c.drawString(x + INNER_PAD, bottom_y, format_height(h_m))
    if isinstance(w_kg, (int, float)) and w_kg > 0:
        c.drawRightString(x + CARD_W - INNER_PAD, bottom_y, format_weight(w_kg))
    genus = meta.get("genus", "")
    if genus:
        c.setFillColor(Color(0.35, 0.35, 0.35))
        c.setFont(FONT_ITAL, SIZE_GENUS)
        c.drawCentredString(cx, bottom_y, genus)

    # Above the bottom row: type pills only (number moved next to the name)
    pills_y_top = bottom_y + SIZE_HW + 1.5 * mm + PILL_H

    types = meta.get("types") or []
    if types:
        draw_type_pills(c, types, cx, pills_y_top)

    c.restoreState()
    return drew_image


def build(
    ids: list[int], out_path: Path, max_dim: int, quality: int
) -> tuple[int, int]:
    pokedex = load_pokedex()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out_path), pagesize=A4)

    drawn = 0
    missing = 0
    per_page = COLS * ROWS

    for idx, pid in enumerate(ids):
        slot = idx % per_page
        if slot == 0 and idx > 0:
            c.showPage()
        col = slot % COLS
        row = slot // COLS
        x = MARGIN_X + col * CARD_W
        y = PAGE_H - MARGIN_Y - (row + 1) * CARD_H

        meta = pokedex.get(f"{pid:04d}", {})
        had_image = draw_card(c, pid, meta, x, y, max_dim, quality)
        if had_image:
            drawn += 1
        else:
            missing += 1

    c.showPage()
    c.save()
    return drawn, missing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--max-dim", type=int, default=400,
        help="Max pixel dimension for artwork (default: 400)",
    )
    parser.add_argument(
        "--quality", type=int, default=80,
        help="JPEG quality 1-95 (default: 80)",
    )
    args = parser.parse_args()

    ids = parse_ids(args.ids)
    out_path = Path(args.out)
    drawn, missing = build(ids, out_path, args.max_dim, args.quality)
    per_page = COLS * ROWS
    pages = (len(ids) + per_page - 1) // per_page
    print(
        f"Rendered {len(ids)} placeholders across {pages} page(s) "
        f"({drawn} with artwork, {missing} missing) -> {out_path}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
