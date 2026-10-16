import { defineConfig, devices } from "@playwright/test";
const base = process.env.TEST_BASE_PATH || "";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "offline-cache.spec.ts",
  workers: 1,
  timeout: 150000,
  use: { baseURL: `http://127.0.0.1:3116${base}/`, trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/test-offline-cache-server.mjs",
    url: `http://127.0.0.1:3116${base}/`,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "cache-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1586, height: 992 },
      },
    },
    {
      name: "cache-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1586, height: 992 },
      },
    },
    {
      name: "cache-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1586, height: 992 },
      },
    },
  ],
});
