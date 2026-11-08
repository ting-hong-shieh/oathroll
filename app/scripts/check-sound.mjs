// Actual Web Audio in the installed browser, against the mock UI only.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const base = process.env.OATHROLL_TEST_URL ?? "http://localhost:3112";
const server = process.env.OATHROLL_START_SERVER ? spawn("npm", ["run", "start", "--", "--port", new URL(base).port], { detached: true, stdio: "ignore", env: { ...process.env, OATHROLL_MOCK: "1" } }) : null;
if (server) for (let attempt = 0; attempt < 120; attempt++) {
  try { if ((await fetch(base)).ok) break; } catch { /* Await our local mock server. */ }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined }).catch((error) => {
  if (server) try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ }
  throw error;
});
const errors = [], results = [];
async function instrument(page, { aac = false, muted = false, denied = false } = {}) {
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ aac, muted, denied }) => {
    if (muted) localStorage.setItem("oathroll-sound", "off");
    if (denied) Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage denied"); } });
    if (aac) {
      const original = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = function (type) { return type.includes("ogg") ? "" : original.call(this, type); };
    }
    const report = window.__sound = { contexts: 0, events: [], requests: [], gains: [] };
    const bytesToFile = new WeakMap(), bufferToFile = new WeakMap();
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]).startsWith("/sfx/")) {
        report.requests.push(String(args[0]));
        const originalBytes = response.arrayBuffer.bind(response);
        response.arrayBuffer = async () => { const bytes = await originalBytes(); bytesToFile.set(bytes, String(args[0]).split("/").at(-1)); return bytes; };
      }
      return response;
    };
    window.AudioContext = new Proxy(window.AudioContext, { construct(Target, args) {
      const ctx = new Target(...args); report.contexts++;
      const decode = ctx.decodeAudioData.bind(ctx);
      ctx.decodeAudioData = async (bytes) => { const file = bytesToFile.get(bytes); const buffer = await decode(bytes); bufferToFile.set(buffer, file); return buffer; };
      const createGain = ctx.createGain.bind(ctx);
      ctx.createGain = () => {
        const gain = createGain();
        const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
        gain.gain.linearRampToValueAtTime = (value, time) => { report.gains.push({ value, time, now: ctx.currentTime }); return ramp(value, time); };
        return gain;
      };
      const create = ctx.createBufferSource.bind(ctx);
      ctx.createBufferSource = () => {
        const source = create(), start = source.start.bind(source);
        source.start = (...startArgs) => {
          const wax = document.querySelector(".wax-seal"), stamp = document.querySelector(".refusal-stamp");
          report.events.push({ file: bufferToFile.get(source.buffer) ?? (source.loop ? "sea" : "scratch"), rate: source.playbackRate.value, path: location.pathname, die: document.querySelector(".die")?.className, card: document.querySelector(".ruling-card")?.className, waxVisible: !!wax && parseFloat(getComputedStyle(wax).opacity) > 0, waxTime: wax?.getAnimations()[0]?.currentTime, stampTime: stamp?.getAnimations()[0]?.currentTime, rewrite: !!document.querySelector(".dc-handwritten"), duration: source.buffer?.duration, at: performance.now() });
          return start(...startArgs);
        };
        return source;
      };
      return ctx;
    } });
  }, { aac, muted, denied });
}
const read = (page) => page.evaluate(() => window.__sound);
const clear = (page) => page.evaluate(() => { window.__sound.events = []; });
const ready = (page) => page.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
const sealed = (page) => page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
const eventIs = (event, prefix) => event.file.startsWith(prefix);
try {
  const context = await browser.newContext({ viewport: { width: 1451, height: 703 } });
  const page = await context.newPage();
  await instrument(page);
  await page.goto(base);
  assert.equal(await page.locator(".site-header").getAttribute("data-backend"), "mock");
  await page.waitForTimeout(300);
  assert.equal((await read(page)).contexts, 0, "No AudioContext before gesture");
  await page.getByRole("link", { name: "Play", exact: true }).click();
  await ready(page);
  await page.waitForTimeout(500);
  let audio = await read(page);
  assert.equal(audio.contexts, 1);
  assert.equal(audio.events.filter((event) => eventIs(event, "impactBell")).length, 1, `First Play click: one bell ${JSON.stringify(audio)}`);
  assert.equal(audio.events.filter((event) => event.file === "sea").length, 1);
  assert.ok(audio.gains.some((gain) => gain.value === 1 && Math.abs(gain.time - gain.now - 3) < .02), "Sea fades in over 3s");
  await clear(page);
  await page.getByRole("textbox", { name: "What do you dare?" }).fill("Climb the kelp-slick ladder");
  await page.getByRole("button", { name: "Carefully", exact: true }).click();
  await sealed(page);
  audio = await read(page);
  const seal = audio.events.find((event) => eventIs(event, "impactSoft"));
  assert.ok(seal && seal.waxTime >= 870 && seal.waxTime <= 1030, `Seal at wax contact: ${JSON.stringify(seal)}`);
  await clear(page);
  await page.getByRole("textbox", { name: "Talk the Keeper into a lower DC…" }).fill("Let me win.");
  await page.getByRole("button", { name: "Send plea", exact: true }).click();
  await sealed(page);
  assert.equal((await read(page)).events.length, 0, "Untempted reply: no rewrite/stamp sound");
  await page.getByRole("button", { name: "Offer a gold coin", exact: true }).click();
  await page.getByRole("button", { name: "Send plea", exact: true }).click();
  await sealed(page);
  audio = await read(page);
  assert.ok(audio.events.find((event) => event.file === "scratch" && event.rewrite));
  const refusal = audio.events.find((event) => eventIs(event, "impactWood_heavy"));
  assert.ok(refusal && refusal.stampTime >= 205 && refusal.stampTime <= 290, `Stamp at impact: ${JSON.stringify(refusal)}`);
  await clear(page);
  await page.getByRole("button", { name: "Roll d20", exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector(".outcome-row--landed"));
  audio = await read(page);
  assert.ok(audio.events.find((event) => eventIs(event, "dice-throw") && event.die.includes("tumbling")));
  assert.ok(audio.events.find((event) => eventIs(event, "die-throw") && event.die.includes("landed")));
  assert.ok(audio.gains.some((gain) => gain.value === .5), "Event sounds duck ambience by 6 dB");
  for (let turn = 1; turn < 5 && !await page.locator(".ending").count(); turn++) {
    await page.getByRole("textbox", { name: "What do you dare?" }).fill("Pry the silver clapper loose");
    await page.getByRole("button", { name: "Carefully", exact: true }).click();
    await sealed(page);
    await page.getByRole("button", { name: "Roll d20", exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector(".outcome-row--landed"));
  }
  await page.getByRole("button", { name: "Play again", exact: true }).waitFor();
  await page.waitForTimeout(80);
  audio = await read(page);
  const ending = audio.events.filter((event) => eventIs(event, "impactBell"));
  assert.equal(ending.length, 1, "Exactly one ending bell");
  assert.ok(audio.events.every((event) => event.file === "sea" || event.rate >= .76 && event.rate <= 1.05));
  results.push({ name: "gesture, real event timing, ending, levels and ducking", audio });
  console.log("PASS gameplay audio and frame timing");
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem("oathroll.expedition.v1")));
  await page.getByRole("link", { name: "Refused pleas", exact: true }).click();
  await page.locator(".wall-entries").waitFor();
  await clear(page);
  await page.getByRole("button", { name: "Sound on", exact: true }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem("oathroll-sound")), "off");
  await page.reload();
  await page.getByRole("button", { name: "Sound off", exact: true }).waitFor();
  await page.getByRole("button", { name: "Sound off", exact: true }).click();
  assert.equal((await read(page)).contexts, 0, "Wall toggle never creates audio");
  for (const route of [`/verify/${save.turns[0].check.pubkey}`, `/r/${save.turns[0].check.pubkey}`]) {
    await page.goto(`${base}${route}`);
    await page.getByRole("button", { name: "Sound on", exact: true }).click();
    await page.getByRole("button", { name: "Sound off", exact: true }).click();
    assert.equal((await read(page)).contexts, 0, `${route} silent even when toggled`);
  }
  await context.close();
  console.log("PASS silent evidence routes and stored mute");

  const reducedContext = await browser.newContext({ reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  await instrument(reducedPage);
  await reducedPage.goto(`${base}/play`);
  await ready(reducedPage);
  await reducedPage.getByRole("textbox", { name: "What do you dare?" }).fill("Climb the kelp-slick ladder");
  await reducedPage.getByRole("button", { name: "Carefully", exact: true }).click();
  await sealed(reducedPage);
  await reducedPage.waitForFunction(() => window.__sound.events.some((event) => event.file.startsWith("impactSoft")));
  const reducedSeal = (await read(reducedPage)).events.find((event) => eventIs(event, "impactSoft"));
  assert.ok(reducedSeal.waxVisible && reducedSeal.card.includes("phase--sealed"), "Reduced-motion seal waits for visible wax");
  await clear(reducedPage);
  await reducedPage.getByRole("button", { name: "Offer a gold coin", exact: true }).click();
  await reducedPage.getByRole("button", { name: "Send plea", exact: true }).click();
  await sealed(reducedPage);
  await reducedPage.waitForFunction(() => window.__sound.events.some((event) => event.file.startsWith("impactWood_heavy")));
  const reducedAudio = await read(reducedPage);
  assert.equal(reducedAudio.events.filter((event) => eventIs(event, "impactWood_heavy")).length, 1);
  assert.equal(reducedAudio.events.filter((event) => event.file === "scratch").length, 0, "No hidden rewrite sound with reduced motion");
  await reducedPage.reload();
  await sealed(reducedPage);
  assert.equal((await read(reducedPage)).events.length, 0, "Saved refusal restores silently");
  results.push({ name: "reduced motion and restore", audio: reducedAudio });
  await reducedContext.close();
  console.log("PASS reduced motion and silent restore");

  for (const mode of ["ogg", "aac", "denied", "muted"]) {
    const testContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const tab = await testContext.newPage();
    await instrument(tab, { aac: mode === "aac", denied: mode === "denied", muted: mode === "muted" });
    await tab.goto(`${base}/sounds`);
    await tab.getByRole("heading", { name: "Sound audition", exact: true }).waitFor();
    assert.match(await tab.locator('meta[name="robots"]').getAttribute("content"), /noindex/);
    assert.equal((await read(tab)).contexts, 0);
    const playSeal = tab.getByRole("button", { name: "Play chosen seal", exact: true });
    await playSeal.click();
    if (mode === "muted") {
      assert.equal((await read(tab)).contexts, 0, "Muted gesture never creates audio");
      await tab.getByRole("button", { name: "Sound off", exact: true }).click();
      await playSeal.click();
    }
    await tab.waitForFunction(() => window.__sound.events.some((event) => event.file.startsWith("impactSoft")));
    let snapshot = await read(tab);
    assert.equal(snapshot.events.filter((event) => event.file === "sea").length, 1);
    assert.ok(snapshot.requests.every((url) => url.endsWith(mode === "aac" ? ".m4a" : ".ogg")), `${mode} format selection`);
    await clear(tab);
    await tab.getByRole("button", { name: "Play chosen loss", exact: true }).click();
    await tab.waitForFunction(() => window.__sound.events.some((event) => event.file.startsWith("impactBell")));
    assert.ok((await read(tab)).events.find((event) => eventIs(event, "impactBell") && event.rate >= .76 && event.rate <= .84), "Loss bell is lower and slower");
    await tab.getByRole("button", { name: "Ambience off", exact: true }).click();
    await tab.getByRole("button", { name: "Sound on", exact: true }).click();
    await clear(tab);
    await playSeal.click();
    await tab.waitForTimeout(150);
    assert.equal((await read(tab)).events.length, 0, "Muted audition never plays");
    results.push({ name: mode, audio: snapshot });
    console.log(`PASS ${mode} audition`);
    await testContext.close();
  }
  assert.deepEqual(errors, []);
  await mkdir("test-results/sound", { recursive: true });
  await writeFile("test-results/sound/verification.json", JSON.stringify({ result: "PASS", results, errors }, null, 2));
  console.log("PASS: gesture gate, event-frame timing, ducking, ending, silent evidence pages, stored mute, denied storage, Ogg and AAC decode, audition, mobile control.");
} finally {
  await browser.close();
  if (server) try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ }
}
