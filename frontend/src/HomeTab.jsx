export default function HomeTab({ go }) {
  return (
    <div className="home">
      <header>
        <h1>Cosall</h1>
        <p className="lede">
          Compare lunar south-pole landing sites and dates: how much sunlight, how long Earth is
          in view, and the terrain in between. Built for mission planners, educators and the
          public who need a quick, honest answer without a specialist tool.
        </p>
      </header>

      <section className="nav-cards" aria-label="Sections of this tool">
        <button type="button" className="nav-card" onClick={() => go("orbit")}>
          <span className="nav-card-eyebrow">Explore</span>
          <h2>Earth, Moon and Sun</h2>
          <p>
            A real-time 3D view of the Earth-Moon-Sun system, positioned and lit from NASA
            ephemeris data for any date from 1960 to 2050.
          </p>
          <span className="nav-card-go">Open the orbit view &rarr;</span>
        </button>
        <button type="button" className="nav-card" onClick={() => go("planner")}>
          <span className="nav-card-eyebrow">Plan</span>
          <h2>Site planner</h2>
          <p>
            Pick a landing site and a date to see the terrain horizon, sunlight and
            direct-to-Earth windows, and how sensitive the answer is to your assumptions.
          </p>
          <span className="nav-card-go">Open the planner &rarr;</span>
        </button>
      </section>

      <section aria-labelledby="about-h">
        <h2 id="about-h">How this works</h2>
        <p className="body-text">
          Sun and Earth positions come from NASA&rsquo;s SPICE toolkit and the DE440 planetary
          ephemeris &mdash; the same kind of data used to plan real missions. Terrain near the
          south pole comes from NASA&rsquo;s LOLA laser-altimeter elevation model. Combining the
          two gives a real terrain horizon at each site, so &ldquo;is the Sun up&rdquo; accounts
          for the hills and crater rims around you, not just a flat-Moon approximation.
        </p>
        <p className="body-text">
          This is a geometric visibility model, not a full illumination or thermal simulation:
          it does not account for dust, atmospheric-free scattering (there is none to speak of),
          spacecraft antenna patterns, or the exact shape of a lander. Treat the numbers as a
          fast, honest first pass for comparing sites and dates &mdash; the kind of thing that
          used to take a specialist tool and a lot of patience.
        </p>
      </section>

      <section aria-labelledby="soon-h" className="coming-soon">
        <h2 id="soon-h">Coming next</h2>
        <p className="body-text">
          A launch-date suggester: given a landing site, it will scan candidate dates and
          recommend windows that balance sunlight, direct-to-Earth communication and a
          reasonable transit time from Earth. Not built yet &mdash; the site planner above
          already computes everything it needs, so this is next in line.
        </p>
      </section>

      <footer>
        Data: NASA NAIF SPICE (DE440 ephemeris, lunar orientation) and the LOLA south-polar
        elevation model (Barker et al. 2023). Earth and Moon imagery in the orbit view:
        Solar System Scope (solarsystemscope.com/textures), based on NASA imagery, CC BY 4.0.
        Built for the NASA Space Apps Challenge.
      </footer>
    </div>
  );
}
