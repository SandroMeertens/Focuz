// Automatische tests voor Focuz. Draaien bij elke wijziging op GitHub (zie .github/workflows/test.yml).
// Lokaal: cd tests && npm install && npx playwright test
const { test, expect } = require('@playwright/test');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');
const BROKER = 'ws://localhost:8899';
const FIX = n => path.join(__dirname, 'fixtures', n);
const NM = n => require.resolve(n);

// zet de klok van de pagina op een vast moment
const fakeTime = iso => `{const R=Date;const off=new R('${iso}')-R.now();
  class D extends R{constructor(...a){a.length?super(...a):super(R.now()+off)} static now(){return R.now()+off}};
  window.Date=D;try{sessionStorage.setItem('fz_intro','1')}catch(e){}}`;

// externe bibliotheken komen uit node_modules, de rest van internet is dicht
async function setup(context, iso) {
  await context.addInitScript(fakeTime(iso));
  await context.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('mqtt.min.js')) return r.fulfill({ path: path.join(path.dirname(NM('mqtt/package.json')), 'dist/mqtt.min.js'), contentType: 'application/javascript' });
    if (u.includes('jszip')) return r.fulfill({ path: path.join(path.dirname(NM('jszip/package.json')), 'dist/jszip.min.js'), contentType: 'application/javascript' });
    if (u.includes('qrcode')) return r.fulfill({ path: NM('qrcode-generator'), contentType: 'application/javascript' });
    if (u.startsWith('http')) return r.abort();
    return r.continue();
  });
}
function watchErrors(page, list) { page.on('pageerror', e => list.push(e.message)); }

async function teacher(browser, iso, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1366, height: 768 } });
  await setup(ctx, iso);
  const page = await ctx.newPage();
  const errors = []; watchErrors(page, errors);
  await page.goto(APP + '?broker=' + BROKER + '&leerkracht');
  await page.waitForTimeout(800);
  if (opts.docx !== false) {
    await page.click('#tTabs [data-tab=rooster]');
    await page.setInputFiles('#wFile', FIX(opts.docx || 'dagklapper-voorbeeld.docx'));
    await expect(page.locator('#wStatus')).toContainText('Ingelezen', { timeout: 10000 });
    await page.click('#tTabs [data-tab=nu]');
  }
  return { ctx, page, errors };
}
async function kid(browser, iso, code, params = '') {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await setup(ctx, iso);
  const page = await ctx.newPage();
  const errors = []; watchErrors(page, errors);
  await page.goto(APP + '?broker=' + BROKER + '&klas=' + code + params);
  return { ctx, page, errors };
}

test('leerkrachtscherm: alle tabbladen passen zonder scrollen', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00');
  for (const tab of ['nu', 'rooster', 'klas']) {
    await t.page.click(`#tTabs [data-tab=${tab}]`);
    await t.page.waitForTimeout(300);
    expect(await t.page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
  expect(t.errors).toEqual([]);
  await t.ctx.close();
});

test('dagklapper: rooster, taken en klaaropdracht worden goed gelezen', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00');
  await expect(t.page.locator('#nVak')).toHaveText('Rekenen');
  await expect(t.page.locator('#nProg')).toContainText('Werkboek opdracht 1-6');
  await t.page.click('#tTabs [data-tab=rooster]');
  await expect(t.page.locator('#wCheck')).toContainText('Alles goed gelezen');
  expect(t.errors).toEqual([]);
  await t.ctx.close();
});

test('dagklapper met fouten: controle noemt de punten', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00', { docx: 'dagklapper-fouten.docx' });
  await t.page.click('#tTabs [data-tab=rooster]');
  await expect(t.page.locator('#wCheck')).toContainText('geen begintijd');
  await expect(t.page.locator('#wCheck')).toContainText('taken samen 80 min');
  await t.page.click('#tTabs [data-tab=nu]');
  await expect(t.page.locator('#sPillTxt')).toContainText('aandachtspunt');
  await t.ctx.close();
});

test('versleuteld: iPad volgt de leerkracht, voortgang en melding komen door', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00');
  const code = (await t.page.locator('#tCode').textContent()).trim();
  await t.page.waitForTimeout(6000); // weekplanning versturen
  const k = await kid(browser, '2026-11-19T09:20:00+01:00', code);
  await expect(k.page.locator('#kVak')).toHaveText('Rekenen', { timeout: 15000 });
  await expect(k.page.locator('#kTask')).toHaveText('Blok 3 les 9');
  await k.page.click('#kTasks li:nth-child(1) .box');
  await expect(t.page.locator('#nProg')).toContainText('1/1', { timeout: 20000 });
  await t.page.click('#mBtn'); await t.page.click('#mPresets button >> nth=0');
  await expect(k.page.locator('#kAlert')).toBeVisible({ timeout: 10000 });
  await k.page.click('#kAlertOk');
  await t.page.click('#tPause');
  await expect(k.page.locator('.kPaused').first()).toBeVisible({ timeout: 10000 });
  expect([...t.errors, ...k.errors]).toEqual([]);
  await t.ctx.close(); await k.ctx.close();
});

test('afluisteren op de server levert geen leesbare tekst op', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00');
  await t.page.waitForTimeout(6000);
  const mqtt = require('mqtt');
  const seen = await new Promise(res => {
    const c = mqtt.connect(BROKER); const out = [];
    c.on('connect', () => c.subscribe('#'));
    c.on('message', (topic, m) => out.push(topic + ' ' + m.toString()));
    setTimeout(() => { c.end(true); res(out.join('\n')); }, 1500);
  });
  expect(seen.length).toBeGreaterThan(0);
  for (const secret of ['Rekenen', 'Stillezen', 'breuken', (await t.page.locator('#tCode').textContent()).trim()]) expect(seen).not.toContain(secret);
  await t.ctx.close();
});

test('leerling: vak start vanzelf, taak wordt de hoofdtimer', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00');
  const code = (await t.page.locator('#tCode').textContent()).trim();
  await t.page.waitForTimeout(6000);
  await t.ctx.close(); // leerkrachtscherm dicht: de iPad moet het zelf doen
  const k = await kid(browser, '2026-11-19T09:20:00+01:00', code);
  await expect(k.page.locator('#kVak')).toHaveText('Rekenen', { timeout: 15000 });
  await expect(k.page.locator('#kExtras')).toBeHidden(); // klaaropdrachten pas als alles af is
  await k.page.click('#kTasks li:nth-child(1) .box');
  await expect(k.page.locator('#kSub')).toHaveText('Werkboek opdracht 1-6');
  await expect(k.page.locator('#kVakLine')).toContainText('Hele vak');
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('leerling: ochtendscherm en pauzescherm', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T08:10:00+01:00');
  const code = (await t.page.locator('#tCode').textContent()).trim();
  await t.page.waitForTimeout(6000);
  const k = await kid(browser, '2026-11-19T08:10:00+01:00', code);
  await expect(k.page.locator('#kMHello')).toHaveText('Goedemorgen!', { timeout: 15000 });
  await expect(k.page.locator('#kMFirst')).toContainText('08:30');
  await k.ctx.close();
  const k2 = await kid(browser, '2026-11-19T10:05:00+01:00', code);
  await expect(k2.page.locator('#kTask')).toHaveText('Pauze', { timeout: 15000 });
  await expect(k2.page.locator('#kSub')).toContainText('Pauze tot 10:15');
  await k2.ctx.close();
  await t.ctx.close();
});

test('telefoon: bediening past in de breedte', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00', { viewport: { width: 390, height: 844 } });
  expect(await t.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(t.page.locator('#tPause')).toBeVisible();
  expect(t.errors).toEqual([]);
  await t.ctx.close();
});

test('oefenstand in het leerlingbeeld gebruikt echte blokken', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T17:05:00+01:00');
  const code = (await t.page.locator('#tCode').textContent()).trim();
  await t.page.waitForTimeout(6000);
  const k = await kid(browser, '2026-11-19T17:05:00+01:00', code, '&kijk=1');
  await k.page.waitForTimeout(3000);
  await k.page.click('#demoBar [data-a=start]');
  await expect(k.page.locator('#kVak')).not.toHaveText('');
  const tasks = await k.page.locator('#kTasks li').allTextContents();
  expect(tasks.join(' ')).not.toContain('instructietafel'); // geen verzonnen taken
  expect(await k.page.evaluate(() => localStorage.getItem('kt_role'))).toBeNull(); // leerkracht blijft leerkracht
  expect(k.errors).toEqual([]);
  await k.ctx.close(); await t.ctx.close();
});
