// Full-bleed artwork for the top of the About and Home tabs. Each is one SVG that fills
// its hero section; the page's text sits on top of it. Flat shapes only, drawn with the
// same colors as the rest of Cosall (see styles.css: hz-* classes, --sky-ink, --land).
// Both use a 16:9 canvas that is cropped to fit the screen, anchored to the right so the
// action (Sun, Earth, Moon, satellite) stays visible and the left stays clear for text.

// Deterministic star field: the same stars on every render and every visit.
function makeStars(count, width, height, seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    x: rnd() * width,
    y: rnd() * height,
    r: 0.8 + rnd() * 1.4,
    o: 0.35 + rnd() * 0.5,
  }));
}

function Stars({ stars }) {
  return stars.map((st, i) => (
    <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} className="hero-star" />
  ));
}

// ---- About: a terrain ridge under the Sun's path, with Earth above ---------------
const ABOUT_STARS = makeStars(90, 1600, 620, 7);
const RIDGE = [
  [0, 780], [90, 760], [180, 775], [280, 730], [380, 745], [470, 700], [560, 720], [650, 755],
  [740, 735], [830, 770], [930, 752], [1030, 790], [1130, 765], [1230, 725], [1320, 748],
  [1420, 705], [1510, 735], [1600, 720],
];
const SUN_TRACK = Array.from({ length: 33 }, (_, i) => ({
  x: 860 + i * 20,
  y: 752 - 330 * Math.sin((Math.PI * i) / 32),
}));
const SUN_AT = 26;

export function HorizonHeroArt() {
  const ridge = "M" + RIDGE.map(([x, y]) => `${x},${y}`).join(" L");
  const sun = SUN_TRACK[SUN_AT];
  return (
    <svg className="hero-art" viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <Stars stars={ABOUT_STARS} />
      {SUN_TRACK.map((p, i) =>
        i === SUN_AT ? null : <circle key={i} cx={p.x} cy={p.y} r="4" className="hz-sun-dot hero-trail" />,
      )}
      <circle cx={sun.x} cy={sun.y} r="26" className="hz-sun-dot" />
      <circle cx="1180" cy="210" r="16" className="hz-earth-dot" />
      <path d={`${ridge} L1600,900 L0,900 Z`} className="hz-land" />
      <path d={ridge} className="hz-ridge" style={{ strokeWidth: 2.4 }} />
    </svg>
  );
}

// ---- Home: a satellite on its way from Earth toward the Moon's south pole --------
const HOME_STARS = makeStars(110, 1600, 900, 21);
const MOON = { x: 1480, y: 450, r: 300 };
const LIT = "#a3a9ae"; // the ridge color used elsewhere
const DARK = "#23262a"; // the ground color used elsewhere
const CRATERS = [
  { x: 1290, y: 380, r: 30 },
  { x: 1260, y: 520, r: 20 },
  { x: 1330, y: 600, r: 34 },
  { x: 1240, y: 330, r: 14 },
];

export function SatelliteHeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <defs>
        <clipPath id="home-moon-clip">
          <circle cx={MOON.x} cy={MOON.y} r={MOON.r} />
        </clipPath>
      </defs>
      <Stars stars={HOME_STARS} />

      {/* The Moon: a dark disc, with the sunlit side drawn as the disc minus a shadow circle */}
      <circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill={DARK} />
      <g clipPath="url(#home-moon-clip)">
        <circle cx={MOON.x} cy={MOON.y} r={MOON.r} fill={LIT} />
        {CRATERS.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.r} fill="#8e949a" />
        ))}
        <circle cx={MOON.x + 220} cy={MOON.y - 70} r={MOON.r} fill={DARK} />
      </g>
      {/* South pole marker */}
      <circle cx={MOON.x} cy={MOON.y + MOON.r - 8} r="9" fill="none" stroke="#e9e7e2" strokeWidth="2.5" />

      {/* Earth, and the path from Earth to the pole */}
      <circle cx="140" cy="800" r="22" className="hz-earth-dot" />
      <path
        d="M140,800 C500,700 900,520 1472,738"
        fill="none"
        stroke="#8e949a"
        strokeWidth="3.5"
        strokeDasharray="1 14"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* The satellite, nose toward the Moon */}
      <g transform="translate(1070 640) rotate(6) scale(1.15)">
        <path d="M-30,-8 L-42,-13 L-42,13 L-30,8 Z" fill="#565c61" />
        <rect x="-30" y="-20" width="60" height="40" rx="4" fill="#b9bfc5" />
        <rect x="-30" y="-6" width="60" height="12" fill="#8e949a" />
        {/* solar panels, one above and one below */}
        <line x1="0" y1="-26" x2="0" y2="-20" stroke="#b9bfc5" strokeWidth="3" />
        <line x1="0" y1="20" x2="0" y2="26" stroke="#b9bfc5" strokeWidth="3" />
        <rect x="-22" y="-108" width="44" height="82" fill="#565c61" stroke="#b9bfc5" strokeWidth="1.5" />
        <rect x="-22" y="26" width="44" height="82" fill="#565c61" stroke="#b9bfc5" strokeWidth="1.5" />
        <g stroke="#b9bfc5" strokeWidth="1" opacity="0.6">
          <line x1="-22" y1="-81" x2="22" y2="-81" />
          <line x1="-22" y1="-54" x2="22" y2="-54" />
          <line x1="0" y1="-108" x2="0" y2="-26" />
          <line x1="-22" y1="54" x2="22" y2="54" />
          <line x1="-22" y1="81" x2="22" y2="81" />
          <line x1="0" y1="26" x2="0" y2="108" />
        </g>
        {/* dish and feed, pointing at the Moon */}
        <line x1="30" y1="0" x2="38" y2="0" stroke="#e9e7e2" strokeWidth="3" />
        <path d="M50,-18 Q34,0 50,18" fill="none" stroke="#e9e7e2" strokeWidth="3" strokeLinecap="round" />
        <line x1="40" y1="0" x2="62" y2="0" stroke="#e9e7e2" strokeWidth="2" />
        <circle cx="62" cy="0" r="3" fill="#e9e7e2" />
      </g>
    </svg>
  );
}
