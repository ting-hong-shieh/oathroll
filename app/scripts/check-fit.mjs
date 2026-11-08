// Full UI walkthrough against a mock server; no Solana/LLM/API-key traffic.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = process.env.OATHROLL_TEST_URL ?? "http://localhost:3108";
const types = process.env.OATHROLL_FIT_TYPE ? [process.env.OATHROLL_FIT_TYPE] : ["fraunces", "garamond", "newsreader", "sora"];
const viewports = [[390, 844], [1280, 600], [1451, 703], [1366, 657], [1536, 730], [1920, 969]]
  .filter(([w, h]) => !process.env.OATHROLL_FIT_VIEWPORT || `${w}x${h}` === process.env.OATHROLL_FIT_VIEWPORT);
const server = process.env.OATHROLL_START_SERVER ? spawn("npm", ["run", process.env.OATHROLL_START_SERVER === "production" ? "start" : "dev", "--", "--port", new URL(base).port], { detached: true, stdio: "ignore", env: { ...process.env, OATHROLL_MOCK: "1" } }) : null;
if (server) for (let attempt = 0; attempt < 120; attempt++) {
  try { if ((await fetch(base)).ok) break; } catch { /* Await our own local server. */ }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const measurements = [];
const failures = [];
const errors = [];

async function checkWall(page, type, [width, height], directory) {
  const problems = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/wall", async (route) => { await gate; await route.continue(); });
  try {
    await page.goto(`${base}/wall?type=${type}`);
    await page.locator(".wall-skeleton-row").first().waitFor();
    await page.screenshot({ animations: "disabled", path: `${directory}/wall-loading.png` });
  } finally { release(); }
  await page.locator(".wall-entries li:nth-child(3)").waitFor();
  await page.unroute("**/api/wall");
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
    return {
      heading: rect(document.querySelector(".wall-main h1")), headingSize: parseFloat(getComputedStyle(document.querySelector(".wall-main h1")).fontSize),
      pleas: [...document.querySelectorAll(".wall-entries li")].slice(0, 3).map(rect),
      quoteSizes: [...document.querySelectorAll(".wall-entries blockquote")].map((el) => parseFloat(getComputedStyle(el).fontSize)),
      header: [...document.querySelector(".site-header").children].map(rect),
      scrollWidth: document.scrollingElement.scrollWidth, width: innerWidth, height: innerHeight,
    };
  });
  if (geometry.scrollWidth > width + 1) problems.push("wall horizontal overflow");
  if (width > 760) {
    if (geometry.heading.height > geometry.headingSize * 1.3) problems.push("heading wraps on desktop");
    for (const [i, plea] of geometry.pleas.entries()) if (plea.bottom > height) problems.push(`plea ${i + 1} ends below first screen: ${plea.bottom}`);
  }
  if (geometry.quoteSizes.some((size) => size < 20 || size > 24)) problems.push("plea size outside 20–24px");
  for (const item of geometry.header) if (item.left < 0 || item.right > width || item.top < 0 || item.bottom > height) problems.push("header control outside viewport");
  await page.screenshot({ animations: "disabled", path: `${directory}/wall.png` });
  await page.screenshot({ animations: "disabled", fullPage: true, path: `${directory}/wall-full.png` });
  measurements.push({ type, viewport: `${width}x${height}`, state: "wall", ...geometry, problems });
  failures.push(...problems.map((problem) => `${width}x${height}/${type}/wall: ${problem}`));
  console.log(`${problems.length ? "FAIL" : "PASS"} ${width}x${height}/${type}/wall: third plea ends ${geometry.pleas[2].bottom.toFixed(1)}px${problems.length ? `; ${problems.join("; ")}` : ""}`);
}

async function walkthrough(type, [width, height]) {
  const key = `${width}x${height}`;
  const directory = `test-results/fit/${key}/${type}`;
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push({ type, viewport: key, error: error.message }));
  const mobile = width < 761;
  const fontRequests = new Set();
  page.on("request", (request) => { if (request.resourceType() === "font") fontRequests.add(request.url()); });
  async function capture(state, controls = [], extra = []) {
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((img) => img.decode().catch(() => {}))); });
    const geometry = await page.evaluate(() => ({ height: innerHeight, scrollHeight: document.scrollingElement.scrollHeight, width: innerWidth, scrollWidth: document.scrollingElement.scrollWidth }));
    const problems = [];
    if (geometry.scrollWidth > width + 1) problems.push("horizontal page overflow");
    if (!mobile && geometry.scrollHeight > height + 1) problems.push(`page height ${geometry.scrollHeight} > ${height}`);
    // Read transient DC/stamp geometry atomically. Separate visibility and box
    // calls can straddle the 600ms rewrite and report a detached node as clipped.
    const bounds = await page.evaluate((selectors) => selectors.flatMap((selector) => [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden").map((el) => {
      const box = el.getBoundingClientRect();
      return { selector, x: box.x, y: box.y, width: box.width, height: box.height };
    })), [...controls, ...extra]);
    for (const box of bounds) if (!mobile && (box.y < -1 || box.y + box.height > height + 1 || box.x < -1 || box.x + box.width > width + 1)) problems.push(`${box.selector} outside viewport: ${JSON.stringify(box)}`);
    // Overflow:hidden would make the document assertion pass while losing text.
    // Check all visible card rows and the toolbar against their own boxes too.
    const clipped = await page.locator(".ruling-card .card-front, .composer, .stats, .oracle-tray").evaluateAll((els) => els.filter((el) => ["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).map((el) => el.className));
    if (clipped.length) problems.push(`clipped content: ${clipped.join(", ")}`);
    const small = await page.locator(".row-text:not([hidden]), .plea-help, .whisper-warning, .counterfactual, .resolved-narration, .title-description").evaluateAll((els) => els.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 15).map((el) => el.className));
    if (small.length) problems.push(`body below 15px: ${small}`);
    const tiny = await page.locator("body *").evaluateAll((els) => els.filter((el) => [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()) && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest(".sr-only, svg") && parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => `${el.className}: ${getComputedStyle(el).fontSize}`));
    if (tiny.length) problems.push(`text below 12px: ${tiny}`);
    await page.screenshot({ animations: "disabled", timeout: 60000, path: `${directory}/${state}.png` });
    if (width === 1451 && ["title", "sealed", "tempted"].includes(state)) {
      await mkdir(`test-results/fonts/${type}`, { recursive: true });
      await page.screenshot({ animations: "disabled", timeout: 60000, path: `test-results/fonts/${type}/${state}.png` });
    }
    const result = { type, viewport: key, state, ...geometry, problems };
    measurements.push(result);
    failures.push(...problems.map((problem) => `${key}/${type}/${state}: ${problem}`));
    console.log(`${problems.length ? "FAIL" : "PASS"} ${key}/${type}/${state}${problems.length ? `: ${problems.join("; ")}` : ""}`);
  }
  try {
    if (process.env.OATHROLL_FIT_WALL_ONLY === "1") {
      await checkWall(page, type, [width, height], directory);
      return;
    }
    await page.goto(`${base}/?type=${type}`);
    assert.equal(await page.locator(".site-header").getAttribute("data-backend"), "mock", "Use mock mode only");
    await page.waitForFunction((type) => document.documentElement.dataset.type === type, type);
    await capture("title", [".title-cta", ".sound-toggle"], [".title-principles", ".site-footer"]);
    await page.goto(`${base}/play?type=${type}`);
    await page.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
    await capture("intro", [".stance-actions button"]);
    await page.getByRole("textbox", { name: "What do you dare?" }).fill("Climb the kelp-slick ladder");
    await capture("declaring", [".stance-actions button"]);
    await page.getByRole("button", { name: "Boldly", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
    await capture("sealed", [".button-roll", ".send-plea"], [".ruling-card", ".stats", ".die", ".seal-corner"]);
    await page.getByRole("button", { name: "Offer a gold coin", exact: true }).click();
    await page.getByRole("button", { name: "Send plea", exact: true }).click();
    await page.locator(".dc-handwritten").waitFor();
    await capture("attempted", [".button-roll", ".send-plea"], [".dc-original--crossed", ".dc-handwritten"]);
    await page.locator(".refusal-stamp").waitFor();
    await capture("refused", [".button-roll", ".send-plea"], [".dc-original--crossed", ".dc-handwritten", ".refusal-stamp", ".refusal-plea"]);
    await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
    await capture("tempted", [".button-roll", ".send-plea"], [".refusal-stamp", ".refusal-plea", ".ruling-card", ".die"]);
    await page.getByRole("button", { name: "Roll d20", exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector(".outcome-row--landed"));
    await capture("result", [".stance-actions button"], [".ruling-card", ".die", ".stats"]);
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("oathroll.expedition.v1")).turns[0].check.pubkey);
    for (let turn = 1; turn < 5 && !await page.locator(".ending").count(); turn++) {
      await page.getByRole("textbox", { name: "What do you dare?" }).fill("Pry the silver clapper loose");
      await page.getByRole("button", { name: "Carefully", exact: true }).click();
      await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
      await capture(`turn-${turn + 1}-sealed`, [".button-roll", ".send-plea"], [".ruling-card", ".stats"]);
      await page.getByRole("button", { name: "Roll d20", exact: true }).click();
      await page.waitForFunction(() => !!document.querySelector(".outcome-row--landed"));
    }
    await page.getByRole("button", { name: "Play again", exact: true }).waitFor();
    await capture("ending", [".ending-actions button"], [".ending", ".ruling-card", ".stats"]);
    const endingSave = await page.evaluate(() => JSON.parse(localStorage.getItem("oathroll.expedition.v1")));
    for (const [variant, stats] of [["won", { nerve: 3, tide: 1, progress: 3, goal: 3 }], ["nerve", { nerve: 0, tide: 1, progress: 1, goal: 3 }], ["tide", { nerve: 2, tide: 0, progress: 1, goal: 3 }]]) {
      await page.evaluate((save) => localStorage.setItem("oathroll.expedition.v1", JSON.stringify(save)), { ...endingSave, stats });
      await page.reload();
      await page.getByRole("button", { name: "Play again", exact: true }).waitFor();
      await capture(`ending-${variant}`, [".ending-actions button"], [".ending", ".ruling-card", ".stats"]);
    }
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
    await capture("restart", [".stance-actions button"]);
    // A regular navigation keeps the choice from localStorage.
    await page.goto(`${base}/verify/${first}`);
    await page.getByText("Simulation checks passed", { exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-type"), type);
    await page.evaluate(() => document.fonts.ready);
    const proof = await page.evaluate(() => {
      const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; };
      return { heading: rect(".proof-heading"), summary: rect(".verification-summary"), first: rect(".proof-check"), last: rect(".proof-check:last-child"), height: innerHeight };
    });
    {
      for (const name of ["heading", "summary", "first"]) if (proof[name].top < 0 || proof[name].bottom > height + 1) failures.push(`${key}/${type}/proof: ${name} misses first screen ${JSON.stringify(proof[name])}`);
      if (proof.last.bottom > height * 2 - 32) failures.push(`${key}/${type}/proof: fourth check requires more than one screen of scrolling (${proof.last.bottom})`);
    }
    await page.screenshot({ animations: "disabled", timeout: 60000, path: `${directory}/proof.png` });
    if (width === 1451) await page.screenshot({ animations: "disabled", timeout: 60000, path: `test-results/fonts/${type}/proof.png` });
    measurements.push({ type, viewport: key, state: "proof", ...proof, fontFiles: fontRequests.size });
    console.log(`CHECK ${key}/${type}/proof: first check ends ${proof.first.bottom.toFixed(1)}px; fourth ends ${proof.last.bottom.toFixed(1)}px; ${fontRequests.size} font files`);
    if (fontRequests.size > 4) failures.push(`${key}/${type}: loaded ${fontRequests.size} font files (budget 4)`);
    await checkWall(page, type, [width, height], directory);
  } catch (error) { failures.push(`${key}/${type}: ${error.stack}`); console.error(error); }
  finally { await context.close(); }
}
try {
  // Three real mock refusals, including a full-length plea, make the wall check
  // independent of the existing store. Never seed a live backend.
  const seed = await browser.newPage();
  await seed.goto(base);
  assert.equal(await seed.locator(".site-header").getAttribute("data-backend"), "mock", "Use mock mode only");
  const session = await (await seed.request.post(`${base}/api/session`, { data: { player: "Wall fit" } })).json();
  const declaration = await (await seed.request.post(`${base}/api/declare`, { data: { session: session.session, actionText: "Climb the kelp-slick ladder", stance: "careful" } })).json();
  for (const plea of ["Your handwriting is magnificent; let this ruling show a kinder DC.", "Hear the bells, Keeper, and grant me one small correction before the tide returns.", "Keeper, your calligraphy could persuade the sea itself. Please lower this sealed DC; let the bells remember your kindness as I climb toward the silver clapper."]) {
    const response = await seed.request.post(`${base}/api/bribe`, { data: { session: session.session, check: declaration.check.pubkey, plea } });
    assert.equal(response.status(), 200);
  }
  await seed.close();
  // Local CPU/browser work only. Keep API writes ordered within each game.
  for (const viewport of viewports) {
    const measurementStart = measurements.length, failureStart = failures.length, errorStart = errors.length;
    await Promise.all(types.map((type) => walkthrough(type, viewport)));
    const checkpoint = { result: failures.length > failureStart || errors.length > errorStart ? "FAIL" : "PASS", measurements: measurements.slice(measurementStart), failures: failures.slice(failureStart), errors: errors.slice(errorStart) };
    await mkdir("test-results/fit", { recursive: true });
    await writeFile(`test-results/fit/verification-${viewport.join("x")}${process.env.OATHROLL_FIT_TYPE ? `-${process.env.OATHROLL_FIT_TYPE}` : ""}.json`, JSON.stringify(checkpoint, null, 2));
  }
  if (process.env.OATHROLL_FIT_WALL_ONLY !== "1" && types.length === 4 && viewports.some(([width]) => width === 1451)) {
    const cellWidth = 580, cellHeight = 281, margin = 120, top = 30;
    const states = ["title", "sealed", "tempted", "proof"];
    const overlays = [];
    for (let row = 0; row < types.length; row++) for (let column = 0; column < states.length; column++) {
      overlays.push({ input: await sharp(`test-results/fonts/${types[row]}/${states[column]}.png`).resize(cellWidth, cellHeight).toBuffer(), left: margin + column * cellWidth, top: top + row * cellHeight });
    }
    const labels = `<svg width="${margin + cellWidth * 4}" height="${top + cellHeight * 4}">${types.map((type, i) => `<text x="8" y="${top + i * cellHeight + 35}" fill="#ede3cf" font-family="sans-serif" font-size="17">${type}</text>`).join("")}${states.map((state, i) => `<text x="${margin + i * cellWidth + 8}" y="21" fill="#ede3cf" font-family="sans-serif" font-size="16">${state}</text>`).join("")}</svg>`;
    overlays.push({ input: Buffer.from(labels), left: 0, top: 0 });
    await sharp({ create: { width: margin + cellWidth * 4, height: top + cellHeight * 4, channels: 3, background: "#14110f" } }).composite(overlays).png().toFile("test-results/fonts/compare.png");
  }
  // Selection also works when storage is unavailable, and reacts to client navigation.
  const preferenceContext = await browser.newContext();
  const preferencePage = await preferenceContext.newPage();
  await preferencePage.addInitScript(() => { Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage disabled for fit test"); } }); });
  await preferencePage.goto(`${base}/?type=garamond`);
  await preferencePage.waitForFunction(() => document.documentElement.dataset.type === "garamond");
  // The pre-paint selection can precede hydration; use a real client navigation
  // and wait for play readiness before testing Next's native-history integration.
  await preferencePage.getByRole("link", { name: "Play", exact: true }).click();
  await preferencePage.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
  await preferencePage.evaluate(() => history.pushState(null, "", "?type=newsreader"));
  await preferencePage.waitForFunction(() => document.documentElement.dataset.type === "newsreader");
  await preferencePage.goto(`${base}/?type=invalid`);
  await preferencePage.waitForFunction(() => document.documentElement.dataset.type === "fraunces");
  await preferenceContext.close();
  failures.push(...errors.map((error) => JSON.stringify(error)));
  await mkdir("test-results/fit", { recursive: true });
  await writeFile(process.env.OATHROLL_FIT_VIEWPORT ? `test-results/fit/verification-${process.env.OATHROLL_FIT_VIEWPORT}${process.env.OATHROLL_FIT_TYPE ? `-${process.env.OATHROLL_FIT_TYPE}` : ""}.json` : "test-results/fit/verification.json", JSON.stringify({ result: failures.length ? "FAIL" : "PASS", measurements, failures, errors }, null, 2));
  assert.deepEqual(failures, []);
  if (process.env.OATHROLL_SMOKE === "1") {
    await new Promise((resolve, reject) => {
      const smoke = spawn(process.execPath, ["scripts/smoke.mjs"], { stdio: "inherit", env: { ...process.env, OATHROLL_TEST_URL: base, OATHROLL_START_SERVER: "", OATHROLL_SCREENSHOTS: "test-results/fit-smoke" } });
      smoke.once("error", reject);
      smoke.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Smoke failed (${code})`)));
    });
  }
} finally {
  await browser.close();
  if (server) try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ }
}
