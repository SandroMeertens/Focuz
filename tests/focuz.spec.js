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
  // nieuw apparaat: vraag naar bestaande klascode -> nieuwe klas
  if (await page.locator('#modal').isVisible()) { await page.click('#mOk'); await page.waitForTimeout(300); }
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
  for (const tab of ['nu', 'rooster']) {
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
  await expect(t.page.locator('#sPill')).toHaveAttribute('title', /aandachtspunt/);
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
  // leerlingbeeld opent op het apparaat van de leerkracht (zelfde browserprofiel)
  const kp = await t.ctx.newPage(); const kerr = []; watchErrors(kp, kerr);
  await kp.goto(APP + '?broker=' + BROKER + '&klas=' + code + '&kijk=1');
  const k = { page: kp, errors: kerr, ctx: { close: async () => {} } };
  await k.page.waitForTimeout(3000);
  await k.page.click('#demoBar [data-a=start]');
  await expect(k.page.locator('#kVak')).not.toHaveText('');
  const tasks = await k.page.locator('#kTasks li').allTextContents();
  expect(tasks.join(' ')).not.toContain('instructietafel'); // geen verzonnen taken
  expect(await k.page.evaluate(() => localStorage.getItem('kt_role'))).toBe('teacher'); // leerkracht blijft leerkracht
  expect(k.errors).toEqual([]);
  await k.ctx.close(); await t.ctx.close();
});

test('ochtendscherm wordt gevuld vanuit de dagklapper en de dag', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-20T08:05:00+01:00');
  await t.page.click('#tTabs [data-tab=rooster]');
  await t.page.click('details.opt >> nth=0');
  await expect(t.page.locator('#oPrev')).toContainText('Fijne vrijdag!');
  await expect(t.page.locator('#oPrev')).toContainText('Weektaak pakken');
  await expect(t.page.locator('#oPrev')).toContainText('Gymspullen klaarzetten');
  const code = (await t.page.locator('#tCode').textContent()).trim();
  await t.page.waitForTimeout(6000);
  const k = await kid(browser, '2026-11-20T08:05:00+01:00', code);
  await expect(k.page.locator('#kMText')).toHaveText('Fijne vrijdag!', { timeout: 15000 });
  await expect(k.page.locator('#kMTasks')).toContainText('Huiswerk op tafel');
  await expect(k.page.locator('#kMTasks')).toContainText('Huiswerk klaarleggen');
  await expect(k.page.locator('#kMTasks')).not.toContainText('Jas ophangen en tas weg');
  await expect(k.page.locator('#kMTasks')).toContainText('Leesboek op je tafel');
  await expect(k.page.locator('#kMTasks')).toContainText('Werkboeken klaarleggen voor rekenen');
  await expect(k.page.locator('#kMTasks')).toContainText('iPad pakken');
  await expect(k.page.locator('#kMFirstSec')).toBeHidden();
  expect([...t.errors, ...k.errors]).toEqual([]);
  await k.ctx.close(); await t.ctx.close();
});

test('na het laatste blok: afsluiting met de volgende lesdag', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T15:00:00+01:00');
  const code = (await t.page.locator('#tCode').textContent()).trim();
  await t.page.waitForTimeout(6000);
  const k = await kid(browser, '2026-11-19T15:00:00+01:00', code);
  await expect(k.page.locator('#kFreeTitle')).toHaveText('Fijne middag!', { timeout: 15000 });
  await expect(k.page.locator('#kFreeText')).toContainText('Morgen beginnen we om 08:30');
  expect([...t.errors, ...k.errors]).toEqual([]);
  await k.ctx.close(); await t.ctx.close();
});

test('"Tijd is om" verdwijnt na 10 minuten vanzelf', async ({ browser }) => {
  const k = await kid(browser, '2026-11-20T18:26:00+01:00', 'ABCDEF', '&kijk=1');
  await k.page.waitForTimeout(1500);
  await k.page.evaluate(() => { tState = {v:3,sid:'OUD',status:'running',endAt:Date.now()-60*60000,total:30*60000,vak:'Stillezen',task:'Bookflix'}; state = effState(); render(); });
  await k.page.waitForTimeout(800);
  await expect(k.page.locator('#kid')).not.toHaveClass(/done/);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('huiswerk en toetsen: uit de dagklapper naar iPad, leerkracht en thuis', async ({ browser }) => {
  const iso = '2026-11-24T10:20:00+01:00';
  const t = await teacher(browser, iso, { docx: 'dagklapper-huiswerk.docx' });
  const code = await t.page.locator('#tCode').innerText();
  await t.page.click('#tTabs [data-tab=rooster]');
  await expect(t.page.locator('#hwSum')).toContainText('items');
  // leerling: knop, lijst gesorteerd, morgen gemarkeerd, afvinken
  const k = await kid(browser, iso, code);
  await expect(k.page.locator('#kHwBtn')).toBeVisible({ timeout: 10000 });
  await k.page.click('#kHwBtn');
  const first = k.page.locator('#kHwList .hwlist li').first();
  await expect(first).toContainText('Taal toets');                 // 24 nov = vandaag staat bovenaan
  await expect(k.page.locator('#kHwList')).toContainText('Taal toets');
  await expect(k.page.locator('#kHwList')).not.toContainText('Toets blink'); // 23 nov is voorbij
  await expect(k.page.locator('#kHwList')).toContainText('vrijdag');
  await k.page.locator('#kHwList li', { hasText: 'Toets Engels' }).click();
  await expect(k.page.locator('#kHwList li', { hasText: 'Toets Engels' })).toHaveClass(/ok/);
  // leerkracht ziet het afvinken
  await t.page.locator('details.opt summary', { hasText: 'Huiswerk en toetsen' }).click();
  await expect(t.page.locator('#hwT li', { hasText: 'Toets Engels' })).toContainText('1 van 1 klaar', { timeout: 20000 });
  // thuis: alleen de planning
  const h = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setup(h, iso);
  const hp = await h.newPage(); const herr = []; watchErrors(hp, herr);
  await hp.goto(APP + '?broker=' + BROKER + '&thuis=' + code);
  await expect(hp.locator('#thuis')).toBeVisible();
  await expect(hp.locator('#hList')).toContainText('Toets Engels', { timeout: 10000 });
  await expect(hp.locator('#kid')).toBeHidden();
  expect([...t.errors, ...k.errors, ...herr]).toEqual([]);
  await t.ctx.close(); await k.ctx.close(); await h.close();
});

test('oefenbalk alleen voor de leerkracht, niet op een leerling-iPad', async ({ browser }) => {
  const iso = '2026-11-19T09:20:00+01:00';
  const k = await kid(browser, iso, 'ABCDEF', '&kijk=1');
  await k.page.waitForTimeout(1200);
  await expect(k.page.locator('#demoBar')).toHaveCount(0);
  expect(k.page.url()).not.toContain('kijk');
  await k.ctx.close();
  // op het apparaat van de leerkracht werkt het leerlingbeeld wel
  const t = await teacher(browser, iso, { docx: false });
  const code = await t.page.locator('#tCode').innerText();
  const p2 = await t.ctx.newPage();
  await p2.goto(APP + '?broker=' + BROKER + '&klas=' + code + '&kijk=1');
  await expect(p2.locator('#demoBar')).toBeVisible();
  await t.ctx.close();
});

test('knop Dagklapper bijwerken leest het bestand opnieuw in', async ({ browser }) => {
  const t = await teacher(browser, '2026-11-19T09:20:00+01:00');
  await t.page.click('#tTabs [data-tab=rooster]');
  await t.page.click('#wOpt summary');
  const [fc] = await Promise.all([t.page.waitForEvent('filechooser'), t.page.click('#wUpd')]);
  await fc.setFiles(FIX('dagklapper-voorbeeld.docx'));
  await expect(t.page.locator('#wStatus')).toContainText('Ingelezen');
  expect(t.errors).toEqual([]);
  await t.ctx.close();
});

test('tweede apparaat: bestaande klascode invoeren houdt de iPads gekoppeld', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await setup(ctx, '2026-11-19T09:20:00+01:00');
  const page = await ctx.newPage(); const errors = []; watchErrors(page, errors);
  await page.goto(APP + '?broker=' + BROKER + '&leerkracht');
  await expect(page.locator('#modal')).toBeVisible();
  await page.fill('#mInput', 'kq7m2x');
  await page.click('#mOk');
  await expect(page.locator('#tCode')).toHaveText('KQ7M2X');
  await page.click('#tTabs [data-tab=rooster]');
  await expect(page.locator('#kSum')).toContainText('KQ7M2X');
  expect(errors).toEqual([]);
  await ctx.close();
});
