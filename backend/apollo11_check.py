from lunar_geometry import elevation_deg, utc_to_et

# Apollo 11: VERIFY against the Apollo Flight Journal / LROC before citing
LAT_DEG, LON_DEG = 0.674, 23.473
LANDING_UTC = "1969-07-20 20:17:40 UTC"

et = utc_to_et(LANDING_UTC)
print(f"Sun elevation:   {elevation_deg('SUN', et, LAT_DEG, LON_DEG):6.2f} deg")
print(f"Earth elevation: {elevation_deg('EARTH', et, LAT_DEG, LON_DEG):6.2f} deg")