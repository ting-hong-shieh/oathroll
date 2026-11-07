// Capture recorded mock states at the review's three viewport sizes.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const base = process.env.OATHROLL_TEST_URL ?? "http://localhost:3100";
const output = process.env.OATHROLL_SCREENSHOTS ?? "test-results/uiux";
const { states, check } = JSON.parse(await readFile(`${output}/states.json`, "utf8"));
const server = process.env.OATHROLL_START_SERVER ? spawn("npm", ["run", "start", "--", "--port", new URL(base).port || "3000"], { detached: true, stdio: "ignore", env: { ...process.env, OATHROLL_MOCK: "1" } }) : null;
if (server) for (let i = 0; i < 100; i++) {
  try { if ((await fetch(base)).ok) break; } catch { /* Await local production build. */ }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const visible = async (locator) => locator.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
const errors = [];
const measurements = [];
try {
  for (const [name, viewport, deviceScaleFactor] of [
    ["1080p-125pct", { width: 1536, height: 864 }, 1.25],
    ["720p", { width: 1280, height: 720 }, 1],
    ["mobile", { width: 390, height: 844 }, 1],
  ]) {
    if (process.env.OATHROLL_CAPTURE_VIEWPORT && name !== process.env.OATHROLL_CAPTURE_VIEWPORT) continue;
    const directory = `${output}/matrix/${name}`;
    await mkdir(directory, { recursive: true });
    const context = await browser.newContext({ viewport, deviceScaleFactor, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    assert.equal(await page.locator(".site-header").getAttribute("data-backend"), "mock", "Capture only mock mode");
    async function capture(label) {
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((img) => img.decode().catch(() => {}))); window.scrollTo(0, 0); });
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}/${label}: horizontal overflow`);
      // No decorative mottos or old terminology may return in rendered copy.
      const text = await page.locator("body").innerText();
      assert.ok(!/\bledger\b|\boath\b|\bfate\b|\bexpedition\b|\btale\b|\bfutures?\b|the chain/i.test(text), `${name}/${label}: stale terminology`);
      assert.ok(!/\bbargains?\b/i.test(text.replace(/The Wall of\s+Refused Bargains/i, "")), `${name}/${label}: stale bargain copy`);
      assert.equal(await page.locator(".header-motto, .chapter-bar, .margin-sigil, .card-bottom, .illustration-note, .plate-label, .bold-label, .proof-timeline, .proof-footer").count(), 0);
      assert.equal(await page.locator("a").evaluateAll((els) => els.filter((el) => el.textContent.includes("↗") && !el.href.startsWith("https://explorer.solana.com/")).length), 0);
      await page.screenshot({ path: `${directory}/${label}-viewport.png` });
      await page.screenshot({ path: `${directory}/${label}-full.png`, fullPage: true });
    }
    await capture("01-title");
    await page.goto(`${base}/play`);
    await page.getByRole("button", { name: /Climb the kelp-slick ladder/ }).waitFor();
    await page.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
    assert.equal(await page.locator(".button-roll").count(), 0, "No roll before sealing");
    assert.equal(await page.locator(".narration-log").evaluate((el) => el.scrollTop), 0, "Intro begins at its first line");
    await capture("02-intro");
    for (const [stateName, save] of Object.entries(states)) {
      // The server has since rolled these turns. Replay the recorded sealed
      // response for this still image; proof/receipt below use current API data.
      await page.unrouteAll();
      const latest = save.turns.at(-1).check;
      await page.route(`**/api/check/${latest.pubkey}`, (route) => route.fulfill({ json: { check: latest } }));
      await page.evaluate((save) => localStorage.setItem("oathroll.expedition.v1", JSON.stringify(save)), save);
      await page.goto(`${base}/play`);
      if (stateName === "ending") {
        await page.getByRole("button", { name: "Play again", exact: true }).waitFor();
        await capture(stateName);
        assert.ok(await visible(page.locator(".ending")), `${name}: ending fits ${JSON.stringify(await page.locator(".ending").boundingBox())}`);
        assert.ok(await visible(page.getByRole("button", { name: "Play again", exact: true })), `${name}: restart fits`);
      } else {
        await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
        if (stateName === "tempted") await page.getByText("REFUSED BY SOLANA", { exact: true }).waitFor();
        if (name !== "mobile") assert.ok(await visible(page.locator(".button-roll")), `${name}/${stateName}: Roll fits first screen`);
        else {
          const card = await page.locator(".ruling-card").boundingBox();
          const form = await page.locator(".composer").boundingBox();
          assert.ok(card.y + card.height <= form.y, "Mobile ruling precedes plea input");
          assert.ok(await page.getByRole("button", { name: "Send plea", exact: true }).isVisible());
        }
      }
      if (stateName !== "ending") await capture(stateName);
      measurements.push({ viewport: name, state: stateName, rollInFirstScreen: stateName === "ending" ? null : await visible(page.locator(".button-roll")), endingInFirstScreen: stateName === "ending" ? await visible(page.locator(".ending")) : null });
    }
    await page.unrouteAll();
    await page.goto(`${base}/verify/${check}`);
    await page.getByText("Simulation checks passed", { exact: true }).waitFor();
    assert.ok(await page.locator(".verification-summary + #amendment").count(), "Refused change directly follows summary");
    await capture("proof");
    await page.goto(`${base}/r/${check}`);
    await page.locator(".receipt-card").waitFor();
    assert.ok((await page.locator(".receipt-oath").innerText()).includes("Solana refused."));
    assert.equal(await page.locator(".receipt-oath blockquote").count(), 1);
    await capture("receipt");
    await page.goto(`${base}/wall`);
    await page.locator(".wall-entries blockquote").first().waitFor();
    assert.ok(!(await page.locator(".wall-meta").first().innerText()).includes("Taipei"));
    await capture("wall");
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = { result: "PASS", measurements, screenshots: `${output}/matrix` };
  await writeFile(`${output}/matrix/verification${process.env.OATHROLL_CAPTURE_VIEWPORT ? `-${process.env.OATHROLL_CAPTURE_VIEWPORT}` : ""}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  if (server) try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ }
}
