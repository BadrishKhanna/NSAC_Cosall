from lunar_geometry import azel_deg, utc_to_et

# Published values: Apollo Lunar Surface Journal, "Sun and Earth: Altitudes and Azimuths
# at the Apollo Landing Sites" (Scotti's results), computed for the nominal site
# 0.6875 N, 23.4333 E. On that page the landing-row Earth altitude is printed as "59:43";
# it is read here as 59.43. VERIFY every value against the page before citing.
EVENTS = [
    # name, UTC, sun altitude, sun azimuth, Earth altitude, Earth azimuth (all deg)
    ("Landing",   "1969-07-20 20:17:39 UTC", 10.65, 88.81, 59.43, 272.16),
    ("EVA start", "1969-07-21 02:39:33 UTC", 13.84, 88.84, 59.30, 272.88),
    ("EVA end",   "1969-07-21 05:11:13 UTC", 15.17, 88.85, 59.27, 273.17),
    ("Liftoff",   "1969-07-21 17:54:00 UTC", 21.65, 88.91, 59.09, 274.58),
]
SITES = [
    ("ALSJ nominal site", 0.6875, 23.4333),
    ("refined site (LRRR-based)", 0.67408, 23.47297),
]

for site_name, lat, lon in SITES:
    print(f"\n{site_name}: {lat} N, {lon} E")
    print(f"{'event':10s} {'body':5s} {'alt calc':>9s} {'alt pub':>8s} {'diff':>6s} "
          f"{'az calc':>8s} {'az pub':>7s} {'diff':>6s}")
    for name, utc, s_alt, s_az, e_alt, e_az in EVENTS:
        et = utc_to_et(utc)
        for body, alt_pub, az_pub in (("SUN", s_alt, s_az), ("EARTH", e_alt, e_az)):
            alt, az = azel_deg(body, et, lat, lon)
            d_az = (az - az_pub + 180.0) % 360.0 - 180.0
            print(f"{name:10s} {body:5s} {alt:9.2f} {alt_pub:8.2f} {alt - alt_pub:6.2f} "
                  f"{az:8.2f} {az_pub:7.2f} {d_az:6.2f}")