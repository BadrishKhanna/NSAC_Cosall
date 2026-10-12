import { useEffect, useState } from "react";
import "./home-title.css";

// The big "Cosall" on the Home page, as a link to the story (#story). It looks the same at
// rest. On hover or keyboard focus a horizon line is drawn, a small lander touches down
// beside the word, and a caption says what lies ahead. Touch screens cannot hover, so there
// the same state plays once shortly after load and then stays.
export default function HomeTitle() {
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const touch = window.matchMedia("(hover: none)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!touch || calm) return undefined;
    const id = setTimeout(() => setHint(true), 2000);
    return () => clearTimeout(id);
  }, []);

  return (
    <h1 className="home-title">
      <a href="#story" className={`home-title-link${hint ? " is-hint" : ""}`} aria-label="Cosall, watch the story">
        <span className="ht-cap" aria-hidden="true">Silent landing: watch the story &rarr;</span>
        <span className="ht-word">Cosall</span>
        <span className="ht-line" aria-hidden="true" />
        <svg className="ht-lander" viewBox="0 0 60 72" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
          <path className="ht-plume" d="M24 50 L30 70 L36 50" strokeWidth="1.4" />
          <path d="M20 30 L40 30 L37 12 L23 12 Z" />
          <rect x="17" y="30" width="26" height="14" />
          <path d="M23 12 L23 6 M37 12 L37 6" />
          <path d="M4 22 H20 M40 22 H56" />
          <path d="M18 44 L8 68 M42 44 L52 68 M24 44 L22 68 M36 44 L38 68" />
          <path d="M3 68 H13 M47 68 H57 M18 68 H27 M33 68 H42" />
        </svg>
      </a>
    </h1>
  );
}
