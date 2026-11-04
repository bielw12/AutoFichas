import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.DATABASE_URL_E2E ?? "postgres://autofichas:autofichas@localhost:5432/autofichas_e2e";

/** Ambiente isolado de testes ponta a ponta (banco e armazenamento próprios). */
export const E2E_ENV = {
  DATABASE_URL: DB,
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "./storage-e2e",
  STORAGE_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  APP_SECRET: "e2e-secret-0123456789-abcdefghijklmnopqrstuvwxyz",
  APP_URL: `http://localhost:${PORT}`,
  AI_PROVIDER: "local",
  MAX_UPLOAD_MB: "15",
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 300_000,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    env: E2E_ENV,
    stdout: "pipe",
  },
});
