import { defineConfig, devices } from "@playwright/test";

// Separate remote-only acceptance: never starts fixture server, seeds users,
// logs in a performer, creates events or invokes music providers.
export default defineConfig({
  testDir: "tests/hosted",
  workers: 1,
  fullyParallel: false,
  retries: 1,
  timeout: 60000,
  use: {
    baseURL: "https://our-jam-rehearsal.onrender.com",
    ignoreHTTPSErrors: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "hosted-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "hosted-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
