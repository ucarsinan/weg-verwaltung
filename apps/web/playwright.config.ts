import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Zero-dependency manual .env.local loader
try {
  const envPath = path.resolve(__dirname, ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const parts = trimmed.split("=");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn("Failed to load .env.local manually:", e);
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

// Storage-state path matches what `e2e/auth.setup.ts` writes. Kept as a
// string literal here so the config has no runtime import dependency on
// the setup file (Playwright loads this config before resolving the
// project graph).
const STORAGE_STATE = "playwright/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // One-time auth bootstrap — seeds the admin and persists the cookies
    // the rest of the suite reuses. Matches files named *.setup.ts.
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
    // Firefox-DE is the §5.10 canonical SR-pair — add only on CI to keep
    // dev-loop fast.
    ...(process.env.CI
      ? [
          {
            name: "firefox",
            use: { ...devices["Desktop Firefox"], storageState: STORAGE_STATE },
            dependencies: ["setup"],
          },
        ]
      : []),
  ],
  webServer: {
    command: `pnpm dev --hostname ${HOST} --port ${PORT}`,
    cwd: __dirname,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
