const { defineConfig } = require('playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python -m http.server 4173 --directory .',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
