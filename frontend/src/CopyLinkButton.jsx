import { useEffect, useRef, useState } from "react";
import { copyCurrentLink } from "./urlState.js";

// Copies the address bar, which each planner keeps up to date with its settings.
export default function CopyLinkButton() {
  const [state, setState] = useState("idle"); // idle | copied | failed
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyCurrentLink();
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <button type="button" className="btn btn-quiet" onClick={onClick} aria-live="polite">
      {state === "copied" ? "Link copied" : state === "failed" ? "Copy the address bar instead" : "Copy link"}
    </button>
  );
}
