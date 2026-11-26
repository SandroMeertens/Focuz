const { defineConfig, devices } = require('@playwright/test');
// Hoofdtests (focuz.spec.js) draaien in Chrome, en in GitHub Actions ook in Safari.
// De platformtest (platform.spec.js) draait op elk soort apparaat en elke browser-engine.
// Lokaal draaien alleen de Chromium-apparaten; met ALLE=1 (of in GitHub Actions) alles.
const all = !!(process.env.CI || process.env.ALLE || process.env.SAFARI);
const P = (name, dev, engine) => ({ name, testMatch: /platform\.spec\.js/, use: { ...devices[dev] }, engine });
const platforms = [
  P('Windows/Mac · Chrome', 'Desktop Chrome', 'chromium'),
  P('Windows · Edge', 'Desktop Edge', 'chromium'),
  P('Mac · Safari', 'Desktop Safari', 'webkit'),
  P('Windows/Mac · Firefox', 'Desktop Firefox', 'firefox'),
  P('iPad liggend · Safari', 'iPad (gen 7) landscape', 'webkit'),
  P('iPad staand · Safari', 'iPad (gen 7)', 'webkit'),
  P('iPad Pro · Safari', 'iPad Pro 11 landscape', 'webkit'),
  P('iPhone · Safari', 'iPhone 13', 'webkit'),
  P('Android-telefoon · Chrome', 'Pixel 7', 'chromium'),
  P('Android-tablet · Chrome', 'Galaxy Tab S4 landscape', 'chromium'),
].filter(p => all || p.engine === 'chromium').map(({ engine, ...p }) => p);
const projects = [{ name: 'chrome', testMatch: /focuz\.spec\.js/, use: { browserName: 'chromium' } }];
if (all) projects.push({ name: 'safari', testMatch: /focuz\.spec\.js/, use: { browserName: 'webkit' } });
module.exports = defineConfig({
  testDir: '.',
  timeout: 60000,
  workers: 2,
  reporter: [['list']],
  use: { timezoneId: 'Europe/Amsterdam', locale: 'nl-NL', serviceWorkers: 'block' },
  projects: [...projects, ...platforms],
  webServer: { command: 'node broker.js 8899', port: 8899, reuseExistingServer: true },
});
