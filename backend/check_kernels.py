from pathlib import Path

import spiceypy as spice
import spiceypy.utils.support_types as stypes

DATA = Path(__file__).resolve().parent / "data"

KERNELS = [
    "naif0012.tls",
    "de440s.bsp",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_220930.tf",
]
for name in KERNELS:
    spice.furnsh(str(DATA / name))


def show(label, cover):
    for i in range(spice.wncard(cover)):
        a, b = spice.wnfetd(cover, i)
        print(label, spice.et2utc(a, "C", 0), "->", spice.et2utc(b, "C", 0))


spk = stypes.SPICEDOUBLE_CELL(2000)
spice.spkcov(str(DATA / "de440s.bsp"), 301, spk)
show("Moon position kernel covers:", spk)

pck = stypes.SPICEDOUBLE_CELL(2000)
spice.pckcov(str(DATA / "moon_pa_de440_200625.bpc"), 31008, pck)
show("Moon orientation kernel covers:", pck)

# Proves the Moon frame loads: should print a 3x3 rotation matrix
print(spice.pxform("J2000", "MOON_ME", spice.str2et("1969-07-20 20:17:00 UTC")))