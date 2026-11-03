import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Keep the minifier from emitting very new CSS syntax (e.g. media-query range
    // syntax) that only recent browsers understand; targets a few-years-old baseline.
    cssTarget: ["chrome100", "firefox100", "safari15"],
  },
});
