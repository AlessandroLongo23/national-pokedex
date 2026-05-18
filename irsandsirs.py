"""Fetch Illustration Rare / Special Illustration Rare cards and render a
real-size 3x3 PDF of their high-res images.

Usage:
    python irsandsirs.py                 # fetch (or reuse) CSV + build PDF
    python irsandsirs.py --skip-fetch    # reuse existing CSV
    python irsandsirs.py --out foo.pdf   # custom output path
"""
from __future__ import annotations

import argparse
import io
import sys
import time
from pathlib import Path

import pandas as pd
import requests
from PIL import Image
from tqdm import tqdm
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

ROOT = Path(__file__).parent
CSV_PATH = ROOT / "irs_and_sirs_lookup.csv"
IMG_CACHE = ROOT / "cache" / "irs_sirs_images"
DEFAULT_PDF = ROOT / "irs_and_sirs.pdf"

API_URL = "https://api.pokemontcg.io/v2/cards"
QUERY = 'rarity:"Illustration Rare" OR rarity:"Special Illustration Rare"'

# Real Pokémon card dimensions
CARD_W = 63 * mm
CARD_H = 88 * mm
COLS = 3
ROWS = 3
GAP = 2 * mm
PAGE_W, PAGE_H = A4
MARGIN_X = (PAGE_W - COLS * CARD_W - (COLS - 1) * GAP) / 2
MARGIN_Y = (PAGE_H - ROWS * CARD_H - (ROWS - 1) * GAP) / 2

# Cap cached image resolution so we don't bloat the PDF or pay for needless
# scaling. 300 DPI is print-quality; the card is 63mm x 88mm.
TARGET_DPI = 300
MAX_IMG_W = int(round(63 / 25.4 * TARGET_DPI))   # ~744 px
MAX_IMG_H = int(round(88 / 25.4 * TARGET_DPI))   # ~1040 px


def fetch_cards() -> pd.DataFrame:
    """Pull every IR / SIR card from pokemontcg.io and return a sorted DataFrame."""
    cards: list[dict] = []
    page = 1
    pbar = tqdm(desc="Fetching cards", unit="card")
    while True:
        resp = requests.get(
            API_URL,
            params={"q": QUERY, "page": page, "pageSize": 250},
            timeout=30,
        )
        if resp.status_code != 200:
            pbar.write(f"API error: {resp.status_code}")
            break
        data = resp.json().get("data", [])
        if not data:
            break
        for card in data:
            dex_nums = card.get("nationalPokedexNumbers") or []
            cards.append({
                "ID": card.get("id"),
                "Name": card.get("name"),
                "Dex": min(dex_nums) if dex_nums else None,
                "Set": card.get("set", {}).get("name"),
                "Era": card.get("set", {}).get("series"),
                "Rarity": card.get("rarity"),
                "Artist": card.get("artist", "Unknown"),
                "Image URL (High Res)": card.get("images", {}).get("large"),
                "TCGPlayer Market Link": card.get("tcgplayer", {}).get("url", "N/A"),
            })
        pbar.update(len(data))
        page += 1
        time.sleep(1)  # rate-limit politeness
    pbar.close()

    df = pd.DataFrame(cards)
    sort_by_dex(df)
    df.to_csv(CSV_PATH, index=False)
    return df


def sort_by_dex(df: pd.DataFrame) -> None:
    """Sort in place by National Pokédex number, then Set, then Rarity."""
    df.sort_values(
        by=["Dex", "Name", "Set", "Rarity"],
        inplace=True,
        na_position="last",
    )


def backfill_dex(df: pd.DataFrame) -> None:
    """Look up National Pokédex numbers for any rows missing them."""
    missing = df["Dex"].isna() if "Dex" in df.columns else pd.Series([True] * len(df))
    if "Dex" not in df.columns:
        df["Dex"] = pd.NA
    names_to_lookup = sorted(df.loc[missing, "Name"].dropna().unique().tolist())
    if not names_to_lookup:
        return
    print(f"Backfilling Dex numbers for {len(names_to_lookup)} unique Pokémon...")
    name_to_dex: dict[str, int] = {}
    for name in tqdm(names_to_lookup, desc="Pokédex lookup", unit="name"):
        try:
            r = requests.get(
                f"https://pokeapi.co/api/v2/pokemon-species/{name.lower().replace(' ', '-')}",
                timeout=15,
            )
            if r.status_code == 200:
                name_to_dex[name] = int(r.json().get("id"))
        except Exception as exc:
            print(f"  warning: dex lookup failed for {name}: {exc}", file=sys.stderr)
        time.sleep(0.05)
    df.loc[missing, "Dex"] = df.loc[missing, "Name"].map(name_to_dex)


def load_csv() -> pd.DataFrame:
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV non trovato: {CSV_PATH}. Esegui senza --skip-fetch.")
    df = pd.read_csv(CSV_PATH)
    if "Dex" not in df.columns or df["Dex"].isna().any():
        backfill_dex(df)
        df.to_csv(CSV_PATH, index=False)
    sort_by_dex(df)
    return df


def cache_path(card_id: str) -> Path:
    safe = card_id.replace("/", "_")
    return IMG_CACHE / f"{safe}.jpg"


def _flatten_and_resize(im: Image.Image) -> Image.Image:
    """Composite onto white if needed and downscale to print resolution."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (255, 255, 255))
        bg.paste(rgba, mask=rgba.split()[-1])
        out = bg
    else:
        out = im.convert("RGB")
    if out.width > MAX_IMG_W or out.height > MAX_IMG_H:
        out.thumbnail((MAX_IMG_W, MAX_IMG_H), Image.LANCZOS)
    return out


def _shrink_existing(dest: Path) -> None:
    """If a cached image is larger than needed, resize it in place."""
    try:
        with Image.open(dest) as im:
            im.load()
            if im.width <= MAX_IMG_W and im.height <= MAX_IMG_H:
                return
            out = _flatten_and_resize(im)
        out.save(dest, format="JPEG", quality=92, optimize=True)
    except Exception as exc:
        print(f"  warning: failed to shrink {dest.name}: {exc}", file=sys.stderr)


def download_image(url: str, dest: Path) -> bool:
    """Download once, composite onto white, downscale, save as JPEG."""
    if dest.exists() and dest.stat().st_size > 0:
        _shrink_existing(dest)
        return True
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with Image.open(io.BytesIO(r.content)) as im:
            im.load()
            out = _flatten_and_resize(im)
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, format="JPEG", quality=92, optimize=True)
        return True
    except Exception as exc:
        print(f"  warning: download failed ({url}): {exc}", file=sys.stderr)
        return False


def ensure_images(df: pd.DataFrame) -> list[Path]:
    """Download every card image, return the list of local paths in DataFrame order."""
    IMG_CACHE.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    pbar = tqdm(df.iterrows(), total=len(df), desc="Downloading images", unit="img")
    for _, row in pbar:
        url = row.get("Image URL (High Res)")
        card_id = row.get("ID")
        if not isinstance(url, str) or not url.startswith("http"):
            continue
        dest = cache_path(str(card_id))
        if not dest.exists():
            pbar.set_postfix_str(str(card_id))
            if not download_image(url, dest):
                continue
            time.sleep(0.15)
        paths.append(dest)
    pbar.close()
    return paths


def build_pdf(image_paths: list[Path], out_path: Path) -> int:
    """Render images into a 3x3 real-size grid on A4. Returns page count."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out_path), pagesize=A4)
    per_page = COLS * ROWS

    for idx, img_path in enumerate(tqdm(image_paths, desc="Rendering PDF", unit="card")):
        slot = idx % per_page
        if slot == 0 and idx > 0:
            c.showPage()
        col = slot % COLS
        row = slot // COLS
        x = MARGIN_X + col * (CARD_W + GAP)
        y = PAGE_H - MARGIN_Y - (row + 1) * CARD_H - row * GAP

        try:
            img = ImageReader(str(img_path))
            iw, ih = img.getSize()
            # Fill the card slot exactly (no padding) preserving aspect ratio.
            scale = max(CARD_W / iw, CARD_H / ih)
            draw_w = iw * scale
            draw_h = ih * scale
            draw_x = x + (CARD_W - draw_w) / 2
            draw_y = y + (CARD_H - draw_h) / 2
            c.saveState()
            c.rect(x, y, CARD_W, CARD_H, stroke=0, fill=0)
            p = c.beginPath()
            p.rect(x, y, CARD_W, CARD_H)
            c.clipPath(p, stroke=0, fill=0)
            c.drawImage(
                img, draw_x, draw_y,
                width=draw_w, height=draw_h,
                preserveAspectRatio=True, mask="auto",
            )
            c.restoreState()
        except Exception as exc:
            print(f"  warning: failed to draw {img_path.name}: {exc}", file=sys.stderr)

    c.showPage()
    c.save()
    pages = (len(image_paths) + per_page - 1) // per_page
    return pages


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-fetch", action="store_true",
        help="Reuse the existing CSV instead of calling the API.",
    )
    parser.add_argument(
        "--out", type=Path, default=DEFAULT_PDF,
        help=f"Output PDF path (default: {DEFAULT_PDF.name})",
    )
    args = parser.parse_args()

    df = load_csv() if args.skip_fetch else fetch_cards()
    paths = ensure_images(df)
    pages = build_pdf(paths, args.out)
    print(f"Done. {len(paths)} cards across {pages} pages -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
