import { HorizonHeroArt } from "./HeroArt.jsx";

// About tab. The text lives in the arrays below, so editing the page means editing
// words, not markup. Escapes like \u00b0 are safe here because they sit inside JS strings;
// in JSX text, use entities instead (&deg;, &mdash;) -- see the note in DECISIONS.md.

// Replace this image: either overwrite frontend/public/about-placeholder.svg, or drop a
// photo into frontend/public/ and change the path (and the alt text) here.
const ABOUT_IMAGE_URL = "/about-placeholder.svg";
const ABOUT_IMAGE_ALT = "Placeholder image: replace with a photo of the team or the project";

// Replace with the real team. Add or remove lines freely. Optional: add
// photo: "/team/name.jpg" (a file in frontend/public/team/) to show a photo instead of
// initials.
const TEAM = [
  { name: "Team member 1", role: "Role" },
  { name: "Team member 2", role: "Role" },
  { name: "Team member 3", role: "Role" },
];

function initialsOf(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const VS_PUBLISHED = [
  {
    check: "Apollo 11: Sun altitude, four mission events",
    result: "Differs by 0.01\u20130.06\u00b0",
    ref: "Apollo Lunar Surface Journal table of Sun and Earth altitudes and azimuths (Scotti)",
  },
  {
    check: "Apollo 11: Sun azimuth",
    result: "Differs by 0.02\u00b0 or less",
    ref: "Same table",
  },
  {
    check: "Apollo 11: Earth azimuth",
    result: "Differs by 0.03\u00b0 or less",
    ref: "Same table",
  },
  {
    check: "Apollo 11: Earth altitude",
    result: "Low by a steady 0.16\u20130.18\u00b0",
    ref: "Same table. Its own independent calculations differ by up to 0.5\u00b0, and a parallax check fits a difference between measuring from the Moon\u2019s center and from the site.",
  },
  {
    check: "Shackleton ridge: share of the year the Sun is up",
    result: "72.4% (Sun center, ground level), 77.2% (Sun\u2019s upper edge), 87.9% (plus 2 m height)",
    ref: "Published averages for persistently lit polar regions: 77\u201388%, from independent 20-year simulations with a different terrain model and assumptions",
  },
  {
    check: "Shackleton ridge: position of the best-lit spot",
    result: "About 1.8 km from the reference point",
    ref: "Published reference point at 89.44\u00b0S, 218.2\u00b0E",
  },
];

const VS_KNOWN = [
  {
    check: "South-pole baseline (\u221289.5\u00b0, 2027, no terrain)",
    result: "Sun elevation \u22122.02\u00b0 to 2.02\u00b0; Earth \u22126.60\u00b0 to 7.07\u00b0",
    ref: "Matches what the Moon\u2019s ~1.5\u00b0 axial tilt and ~6.7\u00b0 libration should produce",
  },
  {
    check: "Terrain horizon on synthetic terrain",
    result: "Bearings within 0.5\u00b0, elevation angles within ~0.3\u00b0",
    ref: "Analytic values from an independent spherical construction",
  },
  {
    check: "Sun and Earth geometry, vectorized code",
    result: "Agrees to about 1e\u221213\u00b0",
    ref: "An independent rotation-matrix implementation, on random sites and bodies",
  },
  {
    check: "Moon phase formula",
    result: "Exact in all three cases",
    ref: "New moon 0%, full moon 100%, quarter 50%",
  },
  {
    check: "Latitude/longitude to 3D position (site marker)",
    result: "Round-trip error about 1e\u221212\u00b0",
    ref: "Six test sites, converted out and back",
  },
  {
    check: "Landing-window scan",
    result: "10 of 10 picks matched",
    ref: "Hand-built scenario with known peaks in each of 5 years; the minimum-separation rule also rejected a nearby second-best peak",
  },
  {
    check: "Default transit times in the launch planner",
    result: "Apollo 11 about 4.3 days; Chandrayaan-3 about 40.1 days",
    ref: "Launch and landing times from mission timelines",
  },
];

const CREDITS = [
  {
    what: "Sun, Earth and Moon positions",
    who: "NASA NAIF SPICE toolkit, with the DE440 planetary ephemeris and lunar orientation kernels (JPL)",
  },
  {
    what: "South-pole terrain",
    who: "LOLA south-polar elevation model, 80 m per pixel from 80\u00b0S to the pole (Barker et al. 2023), via NASA\u2019s Planetary Geodesy Data Archive",
  },
  {
    what: "Apollo 11 site and comparison values",
    who: "Landing coordinates from Davies and Colvin (2000); altitudes and azimuths from the Apollo Lunar Surface Journal",
  },
  {
    what: "Candidate polar sites",
    who: "Connecting Ridge and Peak Near Shackleton: LPSC 2024 abstract 1695. Nobile Rim 2: Pe\u00f1a-Asensio et al., Acta Astronautica. These are proposals inside NASA\u2019s candidate regions, not NASA-designated landing sites.",
  },
  {
    what: "Earth and Moon images (Orbit view)",
    who: "Solar System Scope (solarsystemscope.com/textures), based on NASA imagery, licensed CC BY 4.0",
  },
  {
    what: "Software",
    who: "FastAPI, SpiceyPy, rasterio and pyproj on the server; React and Three.js in the browser",
  },
];

const LIMITS = [
  {
    lead: "Visibility only.",
    text: "Cosall computes whether the Sun and Earth are above the horizon. It is not a full illumination, thermal or power simulation, and it ignores dust, antenna patterns and the shape of a lander.",
  },
  {
    lead: "Simple Moon, real terrain horizon.",
    text: "Site geometry uses a spherical Moon. Terrain enters only through the horizon around each site (rays every 1\u00b0, out to 100 km).",
  },
  {
    lead: "Terrain only south of 80\u00b0S.",
    text: "The elevation model stops there. Sites further north, such as Apollo 11, are computed with a flat horizon and are flagged as such.",
  },
  {
    lead: "No light-time or aberration correction.",
    text: "Positions are geometric. The effect on visibility is small, but it is not modeled.",
  },
  {
    lead: "Sun and Earth treated simply.",
    text: "The Sun counts as up when its upper edge (0.27\u00b0) clears the terrain, or its center if you choose that. Earth is treated as a point at the center of its disk.",
  },
  {
    lead: "Reference frame not fully checked.",
    text: "We use the DE440 Moon frame, while the terrain model was built with the DE421 one. We have not quantified the difference, which is expected to be small.",
  },
  {
    lead: "Assumed antenna height and time steps.",
    text: "Antenna and panel height defaults to 2 m. Single-site views use hourly steps; the multi-year landing scan uses 3-hour steps.",
  },
  {
    lead: "Launch planner is a ranking aid.",
    text: "Transit time is an assumption you choose, not a computed trajectory, and the window score is a stated heuristic for shortlisting dates, not a mission-design optimum.",
  },
  {
    lead: "Dates from 1960 to 2050.",
    text: "Outside that range the tool will not compute.",
  },
];

function Row({ id, title, blurb, children }) {
  return (
    <section className="about-row" aria-labelledby={id}>
      <div className="about-row-head">
        <h2 id={id}>{title}</h2>
        {blurb && <p>{blurb}</p>}
      </div>
      <div className="about-row-body">{children}</div>
    </section>
  );
}

function ResultTable({ rows }) {
  return (
    <div className="about-scroll">
      <table className="about-table">
        <thead>
          <tr>
            <th scope="col">What we checked</th>
            <th scope="col">What we got</th>
            <th scope="col">Compared with</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.check}>
              <th scope="row">{r.check}</th>
              <td>{r.result}</td>
              <td>{r.ref}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AboutTab() {
  return (
    <div className="about">
      <header className="about-hero">
        <HorizonHeroArt />
        <div className="about-hero-inner">
          <h1>Is the Sun up? Is Earth in view?</h1>
          <p className="lede">
            Cosall answers both for any lunar south-pole site and date, and shows its working.
          </p>
        </div>
      </header>

      <main className="page about-page">
        <figure className="about-figure">
          <img src={ABOUT_IMAGE_URL} alt={ABOUT_IMAGE_ALT} />
        </figure>

        <Row id="about-intent-h" title="Why we built it" blurb="A first answer you can check.">
          <p className="lede about-lede">
            Choosing where and when to land near the lunar south pole comes down to two questions:
            how much sunlight a site gets, and how long Earth stays in view. The terrain decides both.
          </p>
          <p className="body-text">
            Cosall puts those answers in one place, for mission planners, educators and anyone
            curious about the Moon. We built it for the NASA Space Apps Challenge with one aim: a fast
            first answer that shows its working. Positions come from NASA ephemeris data and horizons
            from NASA terrain data, and the page tells you what it does and does not model.
          </p>
        </Row>

        <Row id="about-team-h" title="The team" blurb="The people behind it.">
          <ul className="about-team">
            {TEAM.map((m) => (
              <li key={m.name}>
                <span className="about-avatar" aria-hidden="true">
                  {m.photo ? <img src={m.photo} alt="" /> : initialsOf(m.name)}
                </span>
                <span>
                  <span className="team-name">{m.name}</span>
                  <span className="team-role">{m.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </Row>

        <Row
          id="about-validation-h"
          title="How we know it&rsquo;s right"
          blurb="Checked against published values, and against answers we can work out independently."
        >
          <p className="summary about-proof">
            Our Sun altitudes land within <b className="sun">0.06&deg;</b> of the published Apollo 11
            values, and Earth azimuths within <b className="earth">0.03&deg;</b>. Earth altitude runs
            a steady <b className="earth">0.16&ndash;0.18&deg;</b> low, which a parallax check
            suggests is a center-versus-site convention difference, not an error. At our best-lit
            cell near Shackleton (Sun&rsquo;s upper edge, 2 m antenna) the Sun is up{" "}
            <b className="sun">87.9%</b> of the year, inside the 77&ndash;88% published for
            persistently lit regions.
          </p>

          <h3 className="about-sub">Against published values</h3>
          <ResultTable rows={VS_PUBLISHED} />
          <p className="tcap">
            The Shackleton figures come from different models and assumptions, so they show
            agreement in range, not an exact match.
          </p>

          <h3 className="about-sub">Against known answers</h3>
          <ResultTable rows={VS_KNOWN} />
        </Row>

        <Row id="about-credits-h" title="Data and credits" blurb="Everything here stands on NASA data and published work.">
          <dl className="about-credits">
            {CREDITS.map((c) => (
              <div key={c.what}>
                <dt>{c.what}</dt>
                <dd>{c.who}</dd>
              </div>
            ))}
          </dl>
        </Row>

        <Row id="about-limits-h" title="What Cosall does not do" blurb="Where the model stops, so you know how far to trust it.">
          <ul className="about-limits">
            {LIMITS.map((l) => (
              <li key={l.lead}>
                <b>{l.lead}</b> {l.text}
              </li>
            ))}
          </ul>
        </Row>

        <footer>Built for the NASA Space Apps Challenge.</footer>
      </main>
    </div>
  );
}
