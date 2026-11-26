// Platformtest: dezelfde kernroute op elk soort apparaat en elke browser-engine
// (Chrome/Edge/Android = Chromium, Safari/iPad/iPhone = WebKit, Firefox = Gecko).
const { test, expect } = require('@playwright/test');
const path = require('path');
const APP = 'http://localhost:8898/index.html';
const BROKER = 'ws://localhost:8899';
const ISO = '2026-12-07T08:40:00+01:00';
const fakeTime = iso => `{const R=Date;const off=new R('${iso}')-R.now();
  class D extends R{constructor(...a){a.length?super(...a):super(R.now()+off)} static now(){return R.now()+off}};
  window.Date=D;try{sessionStorage.setItem('fz_intro','1')}catch(e){}}`;

async function open(browser, url) {
  const { browserName, defaultBrowserType, channel, ...opts } = test.info().project.use;
  const ctx = await browser.newContext({ ...opts, timezoneId: 'Europe/Amsterdam', locale: 'nl-NL', serviceWorkers: 'block' });
  await ctx.addInitScript(fakeTime(ISO));
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('http') && !u.startsWith('http://localhost:')) return r.abort(); return r.continue(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  return { ctx, page, errors };
}
// past alles op het scherm: geen horizontale en geen verticale scroll van de pagina
const fits = page => page.evaluate(() => {
  const d = document.documentElement;
  return { w: d.scrollWidth <= innerWidth + 1, h: d.scrollHeight <= innerHeight + 1, sw: d.scrollWidth, sh: d.scrollHeight, iw: innerWidth, ih: innerHeight };
});
const tap = async (page, sel) => { const l = page.locator(sel).first(); if (test.info().project.use.hasTouch) await l.tap(); else await l.click(); };

test('kernroute: leerkracht, koppelen, leerling, startpagina', async ({ browser }) => {
  // startpagina
  const h = await open(browser, APP);
  await expect(h.page.locator('#btnKid')).toBeVisible();
  expect(await fits(h.page)).toMatchObject({ w: true, h: true });
  await h.ctx.close();

  // leerkracht: nieuwe klas, startgids, dagklapper inlezen
  const t = await open(browser, APP + '?broker=' + BROKER + '&leerkracht');
  await expect(t.page.locator('#modal')).toBeVisible();
  await tap(t.page, '#mOk');
  await expect(t.page.locator('#wiz')).toBeVisible();
  await expect(t.page.locator('[data-wiz=done]')).toBeInViewport();
  await tap(t.page, '[data-wiz=done]');
  await tap(t.page, '#tTabs [data-tab=rooster]');
  await t.page.setInputFiles('#wFile', path.join(__dirname, 'fixtures', 'sjabloon.docx'));
  await expect(t.page.locator('#wSum')).toContainText('lesdagen');
  expect(await fits(t.page), 'Instellingen past op het scherm').toMatchObject({ w: true, h: true });
  await tap(t.page, '#tTabs [data-tab=nu]');
  await expect(t.page.locator('#nVak')).toHaveText('Rekenen');
  expect(await fits(t.page), 'Nu past op het scherm').toMatchObject({ w: true, h: true });
  const code = await t.page.locator('#tCode').textContent();

  // koppelscherm met QR-code
  await tap(t.page, '#sPill');
  await tap(t.page, '#tJoinBtn');
  await expect(t.page.locator('#jQr svg')).toBeVisible();
  await expect(t.page.locator('#jCode span')).toHaveCount(6);
  await tap(t.page, '#jClose');

  // leerling: volgt de les, vinkt af, weekplanning
  const k = await open(browser, APP + '?broker=' + BROKER + '&klas=' + code);
  await expect(k.page.locator('#kVak')).toHaveText('Rekenen', { timeout: 15000 });
  await expect(k.page.locator('#kTasks li').first()).toBeVisible();
  expect(await fits(k.page), 'leerlingscherm past op het scherm').toMatchObject({ w: true, h: true });
  await tap(k.page, '#kTasks li .box');
  await expect(k.page.locator('#kTasks li').first()).toHaveClass(/ok/);
  await expect(t.page.locator('#sPillTxt')).toHaveText('1 iPad', { timeout: 30000 });
  await tap(k.page, '#kWeekBtn');
  await expect(k.page.locator('#kWeekList li').first()).toBeVisible();
  expect(await fits(k.page), 'weekplanning past op het scherm').toMatchObject({ w: true, h: true });

  expect([...h.errors, ...t.errors, ...k.errors]).toEqual([]);
  await t.ctx.close(); await k.ctx.close();
});
