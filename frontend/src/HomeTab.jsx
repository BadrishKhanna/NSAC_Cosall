import { SatelliteHeroArt } from "./HeroArt.jsx";
import HomeTitle from "./HomeTitle.jsx";
export default function HomeTab({ go }) {
  return (
    <>
      <header className="home-hero">
        <SatelliteHeroArt />
        <div className="home-hero-inner">
            <HomeTitle />
          <p className="lede">
            Compare lunar south-pole landing sites and dates: how much sunlight, how long Earth is
            in view, and the terrain in between. Built for mission planners, educators and the
            public who need a quick, honest answer without a specialist tool.
          </p>
        </div>
      </header>

      <div className="home">
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
          <button type="button" className="nav-card" onClick={() => go("launch")}>
            <span className="nav-card-eyebrow">Decide</span>
            <h2>Launch planner</h2>
            <p>
              Scans five years of candidate landing dates for a site and recommends the best
              windows, with a launch date worked back from a chosen Earth launch site and
              transfer time, plus a three-year mission outlook for whichever you pick.
            </p>
            <span className="nav-card-go">Open the launch planner &rarr;</span>
          </button>
                    <button type="button" className="nav-card" onClick={() => go("story")}>
            <span className="nav-card-eyebrow">Watch</span>
            <h2>The story</h2>
            <p>
              A lander touches down and finds no Sun and no Earth. Follow it through the terrain,
              the sites and the dates that decide whether a mission survives.
            </p>
            <span className="nav-card-go">Start the story &rarr;</span>
          </button>
        </section>

        <section aria-labelledby="about-h">
          <h2 id="about-h">How this works</h2>
          <p className="body-text">
            Cosall answers one question: from a given spot near the Moon&rsquo;s south pole, when
            are the Sun and Earth actually in view? Their positions come from NASA&rsquo;s SPICE
            toolkit and the DE440 ephemeris, the same kind of data real missions are planned
            with. The ground comes from NASA&rsquo;s LOLA laser-altimeter elevation model, which
            gives every site its own terrain horizon, so a ridge a few degrees tall can hide a Sun
            that is only a few degrees up.
          </p>
          <p className="body-text">
            From that, the Site planner shows the sunlight and Earth-view windows for any site and
            date range, and compares up to three sites side by side. The Launch planner then
            scans five years of landing dates, ranks the best windows, and works back to a launch
            date. The Orbit view and the story show the same geometry in 3D and on screen.
          </p>
          <p className="body-text">
            It is a geometric model, not a power or thermal simulation. It treats Earth as a
            point, ignores antenna patterns and dust, and has terrain data only south of
            80&deg;S. Use it as a fast, honest first pass for comparing places and dates, not as
            a mission design.
          </p>
        </section>

        <footer>
          Data and credits: NASA NAIF SPICE (DE440 ephemeris and lunar orientation); the LOLA
          south-polar elevation model (Barker et al. 2023); Earth and Moon textures in the orbit
          view from Solar System Scope (solarsystemscope.com/textures), based on NASA imagery,
          CC BY 4.0. Made for the NASA Space Apps Challenge.
        </footer>
      </div>
    </>
  );
}
