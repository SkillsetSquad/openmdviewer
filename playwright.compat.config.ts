import { defineConfig, devices } from "@playwright/test";
import readerConfig from "./playwright.config";

// Reuse the same observable reader contracts across engines. Provider-fixture
// routing differs around service workers; real provider checks stay separate.
export default defineConfig({
  ...readerConfig,
  testMatch: ["reader.spec.ts", "preferences.spec.ts", "collections.spec.ts"],
  projects: [
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1586, height: 992 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1586, height: 992 },
      },
    },
  ],
});
