import { useEffect, useRef, useState } from "react";

// Optional background music. Off by default: browsers only allow sound after a click, and
// unexpected sound is unwelcome anyway. Put the file in frontend/public/music/ and keep the
// name below in step with it (capital letters matter on Render).
const MUSIC_URL = "/music/ambient.mp3";
const VOLUME = 0.35;

// Rendered inside the top bar in App.jsx, which never unmounts, so the music keeps playing
// when the visitor switches tabs.
export default function MusicToggle() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = VOLUME;
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || unavailable) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch (err) {
      setPlaying(false);
      if (err?.name === "NotSupportedError") setUnavailable(true); // missing or unreadable file
    }
  }

  const label = unavailable ? "Music unavailable" : playing ? "Pause music" : "Play music";

  return (
    <>
      <audio
        ref={audioRef}
        src={MUSIC_URL}
        loop
        preload="none"
        onError={() => {
          setUnavailable(true);
          setPlaying(false);
        }}
      />
      <button
        type="button"
        className={`music-btn${playing ? " active" : ""}`}
        onClick={toggle}
        aria-pressed={playing}
        aria-label={label}
        title={label}
        disabled={unavailable}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9v6h4l5 4V5L7 9H3z" />
          {playing ? (
            <>
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18 6a8.5 8.5 0 0 1 0 12" />
            </>
          ) : (
            <path d="M16 9l5 6M21 9l-5 6" />
          )}
        </svg>
      </button>
    </>
  );
}
