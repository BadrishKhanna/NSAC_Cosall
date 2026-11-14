"""Download the SPICE kernels and the LOLA terrain model into backend/data/.
These files are not committed to Git (see .gitignore). Safe to run repeatedly:
files that are already present are skipped.

Usage, from anywhere:  python backend/download_data.py
"""
import sys
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
# (file name, URL, minimum plausible size in bytes; catches empty files and HTML error pages)
FILES = [
    ("naif0012.tls", f"{NAIF}/lsk/naif0012.tls", 2_000),
    ("de440s.bsp", f"{NAIF}/spk/planets/de440s.bsp", 20_000_000),
    ("pck00011.tpc", f"{NAIF}/pck/pck00011.tpc", 20_000),
    ("moon_pa_de440_200625.bpc", f"{NAIF}/pck/moon_pa_de440_200625.bpc", 100_000),
    ("moon_de440_220930.tf", f"{NAIF}/fk/satellites/a_old_versions/moon_de440_220930.tf", 2_000),
    ("LDEM_80S_80MPP_ADJ.TIF", "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF", 100_000_000),
]


def fetch(name, url, min_bytes, data_dir=DATA):
    """Download one file unless it is already there. Raises RuntimeError on a bad download."""
    data_dir.mkdir(parents=True, exist_ok=True)
    dest = data_dir / name
    if dest.exists() and dest.stat().st_size >= min_bytes:
        print(f"ok       {name} ({dest.stat().st_size / 1e6:.1f} MB, already present)")
        return
    part = dest.with_name(dest.name + ".part")
    print(f"getting  {name} from {url}", flush=True)
    request = urllib.request.Request(url, headers={"User-Agent": "cosall-data-download"})
    with urllib.request.urlopen(request, timeout=120) as response, open(part, "wb") as out:
        total = int(response.headers.get("Content-Length") or 0)
        done, next_mark = 0, 0.25
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total and done / total >= next_mark:
                print(f"         {name}: {100 * done / total:.0f} %", flush=True)
                next_mark += 0.25
    size = part.stat().st_size
    if size < min_bytes:
        part.unlink()
        raise RuntimeError(f"{name}: downloaded only {size} bytes (expected at least {min_bytes}); check the URL")
    part.replace(dest)
    print(f"done     {name} ({size / 1e6:.1f} MB)")


def main():
    for name, url, min_bytes in FILES:
        fetch(name, url, min_bytes)
    print("All data files are in place:", DATA)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # a build should fail loudly, not continue without data
        print("Download failed:", exc, file=sys.stderr)
        sys.exit(1)