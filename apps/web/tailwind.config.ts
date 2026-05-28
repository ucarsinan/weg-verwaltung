import type { Config } from "tailwindcss";

// Tailwind v4 is primarily configured via CSS `@theme` in src/app/globals.css.
// This file only pins the content scan paths explicitly for editor tooling.
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
};

export default config;
