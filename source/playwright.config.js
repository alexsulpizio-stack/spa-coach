import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  timeout:30000,
  workers:process.env.CI?1:undefined,
  use:{baseURL:'http://127.0.0.1:4173',trace:'on-first-retry'},
  webServer:{
    command:'npm run serve',
    port:4173,
    reuseExistingServer:!process.env.CI
  }
});
