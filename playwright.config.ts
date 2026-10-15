import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // Update and PDF-cancellation tests temporarily change shared static assets.
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:3100${process.env.TEST_BASE_PATH || ""}/`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx serve "${process.env.STATIC_TEST_DIR || "out"}" -l tcp://127.0.0.1:3100`,
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1586, height: 992 },
      },
    },
  ],
});
