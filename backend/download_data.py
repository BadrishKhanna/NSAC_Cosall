"""Download the SPICE kernels and the LOLA terrain model into backend/data/.
These files are not committed to Git (see .gitignore). Safe to run repeatedly:
files that are already present AND pass the format check are skipped.

Usage, from anywhere:  python backend/download_data.py
"""
import sys
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
# (file name, URL, minimum plausible size in bytes; catches empty files and HTML error
# pages outright, but is not the only check -- see verify() below, since a file can be
# larger than this and still be a truncated/corrupted download.)
FILES = [
    ("naif0012.tls", f"{NAIF}/lsk/naif0012.tls", 2_000),
    ("de440s.bsp", f"{NAIF}/spk/planets/de440s.bsp", 20_000_000),
    ("pck00011.tpc", f"{NAIF}/pck/pck00011.tpc", 20_000),
    ("moon_pa_de440_200625.bpc", f"{NAIF}/pck/moon_pa_de440_200625.bpc", 100_000),
    ("moon_de440_220930.tf", f"{NAIF}/fk/satellites/a_old_versions/moon_de440_220930.tf", 2_000),
    ("LDEM_80S_80MPP_ADJ.TIF", "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF", 100_000_000),
]
# Every SPICE text kernel (.tls, .tpc, .tf) starts with this exact header; every SPICE
# binary kernel built on the DAF format (.bsp, .bpc) starts with this one. A file that
# doesn't start with the right signature for its extension is not a valid kernel,
# whatever its size -- this is what catches a corrupted-but-large-enough download that
# a pure byte-count check would miss.
TEXT_KERNEL_SUFFIXES = (".tls", ".tpc", ".tf")
DAF_KERNEL_SUFFIXES = (".bsp", ".bpc")


def verify(path, min_bytes):
    """Raises ValueError with a specific reason if `path` is not a plausible, complete
    download. Returns nothing on success."""
    size = path.stat().st_size
    if size < min_bytes:
        raise ValueError(f"only {size} bytes (expected at least {min_bytes}); likely truncated or an error page")
    suffix = path.suffix.lower()
    with open(path, "rb") as f:
        head = f.read(8)
    if suffix in TEXT_KERNEL_SUFFIXES and not head.startswith(b"KPL/"):
        raise ValueError(f"does not start with the SPICE text-kernel header b'KPL/' (starts with {head!r})")
    if suffix in DAF_KERNEL_SUFFIXES and not head.startswith(b"DAF/"):
        raise ValueError(f"does not start with the SPICE binary-kernel header b'DAF/' (starts with {head!r})")
    # .TIF (the LOLA DEM) is checked by size only here; rasterio validates its structure
    # properly the first time horizon_profile() actually opens it.


def fetch(name, url, min_bytes, data_dir=DATA):
    """Download one file unless a valid copy is already there. Raises RuntimeError if,
    after downloading, the file still doesn't pass verify() -- this can legitimately
    happen once on a bad network day, which is why main() retries each file once."""
    data_dir.mkdir(parents=True, exist_ok=True)
    dest = data_dir / name
    if dest.exists():
        try:
            verify(dest, min_bytes)
            print(f"ok       {name} ({dest.stat().st_size / 1e6:.1f} MB, already present and valid)")
            return
        except ValueError as exc:
            print(f"redo     {name}: existing file failed validation ({exc}); re-downloading")
            dest.unlink()

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

    if total and done != total:
        part.unlink()
        raise RuntimeError(f"{name}: got {done} bytes but the server said {total}; connection likely dropped")
    part.replace(dest)
    try:
        verify(dest, min_bytes)
    except ValueError as exc:
        dest.unlink()
        raise RuntimeError(f"{name}: downloaded but failed validation ({exc}); check the URL or NAIF's server")
    print(f"done     {name} ({dest.stat().st_size / 1e6:.1f} MB)")


def main():
    for name, url, min_bytes in FILES:
        try:
            fetch(name, url, min_bytes)
        except RuntimeError as exc:
            # One retry: this whole function exists because a transient network hiccup
            # is the most likely cause, so give it one more chance before giving up.
            print(f"retrying {name} once after: {exc}", flush=True)
            fetch(name, url, min_bytes)
    print("All data files are in place:", DATA)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # a build should fail loudly, not continue without data
        print("Download failed:", exc, file=sys.stderr)
        sys.exit(1)
