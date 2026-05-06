"""Download Pokémon artwork + metadata into cache/.

Usage:
    python fetch_data.py --ids 1,150,1025
    python fetch_data.py --ids 1-1025

Produces:
    cache/images/NNNN.png          one per id
    cache/pokedex.json             {"NNNN": {name, gen, genus, types, height_m, weight_kg}}
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

# Windows consoles default to cp1252 which can't encode names like Nidoran♀.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent
CACHE = ROOT / "cache"
IMAGES = CACHE / "images"
POKEDEX_FILE = CACHE / "pokedex.json"

ARTWORK_URL = (
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/"
    "sprites/pokemon/other/official-artwork/{id}.png"
)
SPECIES_URL = "https://pokeapi.co/api/v2/pokemon-species/{id}/"
POKEMON_URL = "https://pokeapi.co/api/v2/pokemon/{id}/"

USER_AGENT = "national-pokedex-placeholder/1.0 (personal project)"
MAX_WORKERS = 5
MAX_RETRIES = 4

GEN_ROMAN = {
    "generation-i": "I",
    "generation-ii": "II",
    "generation-iii": "III",
    "generation-iv": "IV",
    "generation-v": "V",
    "generation-vi": "VI",
    "generation-vii": "VII",
    "generation-viii": "VIII",
    "generation-ix": "IX",
}

REQUIRED_FIELDS = ("name", "gen", "genus", "types", "height_m", "weight_kg", "stage")

_chain_cache: dict[str, dict] = {}
_chain_lock = threading.Lock()


def get_chain(url: str) -> dict:
    with _chain_lock:
        cached = _chain_cache.get(url)
    if cached is not None:
        return cached
    data = get_with_retry(url).json()
    with _chain_lock:
        _chain_cache[url] = data
    return data


def _find_depth(node: dict, target: str, depth: int = 0) -> int | None:
    if node.get("species", {}).get("name") == target:
        return depth
    for child in node.get("evolves_to", []) or []:
        d = _find_depth(child, target, depth + 1)
        if d is not None:
            return d
    return None


def _max_depth(node: dict) -> int:
    children = node.get("evolves_to") or []
    if not children:
        return 0
    return 1 + max(_max_depth(c) for c in children)


def compute_stage(species_slug: str, flags: dict, chain_root: dict) -> str:
    """Pokémon marked is_baby are "BABY" and treated as outside the main chain,
    so the first non-baby species becomes Stage 1 (e.g. Pikachu, not Pichu)."""
    if flags.get("is_baby"):
        return "BABY"
    if flags.get("is_legendary"):
        return "LEGENDARY"
    if flags.get("is_mythical"):
        return "MYTHICAL"

    roots: list[dict] = [chain_root]
    while roots and all(r.get("is_baby") for r in roots):
        next_roots: list[dict] = []
        for r in roots:
            next_roots.extend(r.get("evolves_to") or [])
        if not next_roots:
            break
        roots = next_roots

    for vr in roots:
        d = _find_depth(vr, species_slug)
        if d is None:
            continue
        max_d = _max_depth(vr)
        if max_d == 0:
            return "SINGLE"
        return f"STAGE {d + 1}"
    return "SINGLE"


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


def image_path(pid: int) -> Path:
    return IMAGES / f"{pid:04d}.png"


def load_pokedex() -> dict[str, dict]:
    if POKEDEX_FILE.exists():
        return json.loads(POKEDEX_FILE.read_text(encoding="utf-8"))
    return {}


def save_pokedex(data: dict[str, dict]) -> None:
    POKEDEX_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )


def get_with_retry(url: str, *, stream: bool = False) -> requests.Response:
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=30,
                stream=stream,
            )
            if resp.status_code == 200:
                return resp
            if resp.status_code in (429, 500, 502, 503, 504):
                time.sleep(2**attempt)
                continue
            resp.raise_for_status()
        except requests.RequestException as exc:
            last_exc = exc
            time.sleep(2**attempt)
    raise RuntimeError(f"Failed to fetch {url}: {last_exc}")


def fetch_image(pid: int) -> tuple[int, bool, str]:
    path = image_path(pid)
    if path.exists() and path.stat().st_size > 0:
        return pid, True, "cached"
    try:
        resp = get_with_retry(ARTWORK_URL.format(id=pid), stream=True)
        path.write_bytes(resp.content)
        return pid, True, "downloaded"
    except Exception as exc:
        return pid, False, str(exc)


def fetch_meta(pid: int) -> tuple[int, dict | None, str]:
    """Fetch combined species + pokemon metadata for one id."""
    try:
        species = get_with_retry(SPECIES_URL.format(id=pid)).json()
        pokemon = get_with_retry(POKEMON_URL.format(id=pid)).json()

        name = pokemon.get("name", "").title()
        for entry in species.get("names", []):
            if entry.get("language", {}).get("name") == "en":
                name = entry["name"]
                break

        genus = ""
        for entry in species.get("genera", []):
            if entry.get("language", {}).get("name") == "en":
                genus = entry["genus"]
                break

        gen_key = species.get("generation", {}).get("name", "")
        gen = GEN_ROMAN.get(gen_key, "")

        types = [t["type"]["name"] for t in pokemon.get("types", [])]

        height_m = pokemon.get("height", 0) / 10.0
        weight_kg = pokemon.get("weight", 0) / 10.0

        flags = {
            "is_baby": bool(species.get("is_baby")),
            "is_legendary": bool(species.get("is_legendary")),
            "is_mythical": bool(species.get("is_mythical")),
        }
        species_slug = species.get("name", "")
        chain_url = species.get("evolution_chain", {}).get("url")
        if chain_url:
            chain_data = get_chain(chain_url)
            stage = compute_stage(species_slug, flags, chain_data.get("chain", {}))
        elif flags["is_legendary"]:
            stage = "LEGENDARY"
        elif flags["is_mythical"]:
            stage = "MYTHICAL"
        elif flags["is_baby"]:
            stage = "BABY"
        else:
            stage = "SINGLE"

        evolves_from_id = None
        evolves_from_name = ""
        evol_from = species.get("evolves_from_species")
        if evol_from and isinstance(evol_from, dict):
            evol_url = evol_from.get("url", "")
            try:
                evolves_from_id = int(evol_url.rstrip("/").split("/")[-1])
            except (ValueError, IndexError):
                pass
            evolves_from_name = evol_from.get("name", "").replace("-", " ").title()

        return pid, {
            "name": name,
            "gen": gen,
            "genus": genus,
            "types": types,
            "height_m": height_m,
            "weight_kg": weight_kg,
            "stage": stage,
            "evolves_from_id": evolves_from_id,
            "evolves_from_name": evolves_from_name,
        }, "downloaded"
    except Exception as exc:
        return pid, None, str(exc)


def is_complete(entry: dict | None) -> bool:
    if not isinstance(entry, dict):
        return False
    return all(k in entry for k in REQUIRED_FIELDS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", required=True,
                        help="Comma list or range, e.g. 1,150,1025 or 1-1025")
    parser.add_argument("--refresh", action="store_true",
                        help="Re-fetch metadata even if already cached")
    args = parser.parse_args()

    ids = parse_ids(args.ids)
    if not ids:
        print("No IDs given", file=sys.stderr)
        return 2

    IMAGES.mkdir(parents=True, exist_ok=True)
    pokedex = load_pokedex()
    total = len(ids)
    failures: list[int] = []

    needs_meta = [
        pid for pid in ids
        if args.refresh or not is_complete(pokedex.get(f"{pid:04d}"))
    ]
    if needs_meta:
        print(f"Fetching metadata for {len(needs_meta)} Pokemon...")
        try:
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
                futs = {pool.submit(fetch_meta, pid): pid for pid in needs_meta}
                for i, fut in enumerate(as_completed(futs), 1):
                    pid, meta, status = fut.result()
                    if meta:
                        pokedex[f"{pid:04d}"] = meta
                        types_str = "/".join(meta["types"])
                        print(f"  [{i}/{len(needs_meta)}] #{pid:04d} {meta['name']} "
                              f"(Gen {meta['gen']}, {types_str}, {meta['stage']}) {status}")
                    else:
                        failures.append(pid)
                        print(f"  [{i}/{len(needs_meta)}] #{pid:04d} META FAILED: {status}")
                    if i % 100 == 0:
                        save_pokedex(pokedex)
        finally:
            save_pokedex(pokedex)

    to_fetch = [pid for pid in ids
                if not (image_path(pid).exists()
                        and image_path(pid).stat().st_size > 0)]
    if to_fetch:
        print(f"Fetching {len(to_fetch)} images...")
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futs = {pool.submit(fetch_image, pid): pid for pid in to_fetch}
            for i, fut in enumerate(as_completed(futs), 1):
                pid, ok, status = fut.result()
                label = pokedex.get(f"{pid:04d}", {}).get("name", "?")
                if ok:
                    print(f"  [{i}/{len(to_fetch)}] #{pid:04d} {label} ({status})")
                else:
                    failures.append(pid)
                    print(f"  [{i}/{len(to_fetch)}] #{pid:04d} {label} IMAGE FAILED: {status}")

    cached_count = sum(1 for pid in ids if image_path(pid).exists())
    print(
        f"\nDone. {cached_count}/{total} images cached, "
        f"{len(pokedex)} metadata entries, {len(failures)} failure event(s)."
    )
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
