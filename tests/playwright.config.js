const { defineConfig } = require('@playwright/test');
// Chromium draait altijd. Safari (WebKit) draait in GitHub Actions, of lokaal met: SAFARI=1 npx playwright test
const projects = [{ name: 'chrome', use: { browserName: 'chromium' } }];
if (process.env.CI || process.env.SAFARI) projects.push({ name: 'safari', use: { browserName: 'webkit' } });
module.exports = defineConfig({
  testDir: '.',
  timeout: 60000,
  workers: 2,
  reporter: [['list']],
  use: { timezoneId: 'Europe/Amsterdam', locale: 'nl-NL', serviceWorkers: 'block' },
  projects,
  webServer: { command: 'node broker.js 8899', port: 8899, reuseExistingServer: true },
});
