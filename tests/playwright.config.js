const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: '.',
  timeout: 60000,
  workers: 2,
  reporter: [['list']],
  use: { browserName: 'chromium', timezoneId: 'Europe/Amsterdam', locale: 'nl-NL' },
  webServer: { command: 'node broker.js 8899', port: 8899, reuseExistingServer: true },
});
