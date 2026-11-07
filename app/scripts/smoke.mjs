import assert from "node:assert/strict";
import { mkdirSync, createWriteStream, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const baseURL = process.env.OATHROLL_TEST_URL ?? "http://localhost:3000";
const output = process.env.OATHROLL_SCREENSHOTS ?? "test-results/smoke";
mkdirSync(output, { recursive: true });
const server = process.env.OATHROLL_START_SERVER ? spawn("npm", ["run", process.env.OATHROLL_START_SERVER === "production" ? "start" : "dev", "--", "--port", String(new URL(baseURL).port || 3000)], { detached: true, stdio: ["ignore", "pipe", "pipe"] }) : null;
if (server) {
  const log = createWriteStream(`${output}/server.log`);
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(baseURL)).ok) break; } catch { /* Wait for the local server. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined }).catch((error) => {
  if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ } }
  throw error;
});
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
let page = await context.newPage();
const pageErrors = [];
context.on("page", (tab) => tab.on("pageerror", (error) => pageErrors.push(error.message)));
page.on("pageerror", (error) => pageErrors.push(error.message));
const screenshot = async (name, tab = page) => {
  await tab.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await tab.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  if (true) {
    await tab.screenshot({ path: `${output}/${name}-viewport.png`, fullPage: false });
  }
};
const states = {};
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("oathroll.expedition.v1")));
const assertEvidenceReadable = async (tab = page) => {
  const small = await tab.locator(".oracle-status, .oracle-label, .ledger li, .row-condition, .row-effects, .seal-caption, .refusal-error, .bribe-evidence, .bribe-evidence pre, .proof-explorer, .stat-caption").evaluateAll((els) => els.filter((el) => parseFloat(getComputedStyle(el).fontSize) < (el.matches(".refusal-error") ? 13 : 12)).map((el) => el.className));
  assert.deepEqual(small, [], "Evidence must meet the video type-size floor");
  assert.equal(await tab.locator(".outcome-row").evaluateAll((els) => els.every((el) => {
    const style = getComputedStyle(el.querySelector(".row-text"));
    return style.textOverflow !== "ellipsis" && style.whiteSpace !== "nowrap";
  })), true, "Outcomes must wrap without ellipses");
};
const assertBodyContrast = async (tab = page) => {
  const failures = await tab.evaluate(() => {
    const linear = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    const luminance = (c) => c.reduce((sum, v, i) => sum + linear(v) * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    // Conservative dark vellum sample and brightest possible scene pixel after ink protection.
    const groups = [
      [".row-text, .row-effects, .row-condition, .seal-caption, .receipt-card .mono, .receipt-narration", [223, 210, 180]],
      [".oracle-status, .oracle-label, .ledger li, .proof-check p, .proof-explorer", [34, 28, 24]],
      [".keeper-line, .resolved-narration", [77, 75, 73]],
    ];
    return groups.flatMap(([selector, bg]) => [...document.querySelectorAll(selector)].map((el) => {
      const color = getComputedStyle(el).color.match(/[\d.]+/g).map(Number);
      const alpha = color[3] ?? 1;
      const fg = color.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha));
      return { name: el.className, ratio: contrast(fg, bg) };
    })).filter((result) => result.ratio < 4.5);
  });
  assert.deepEqual(failures, [], "Body text must meet 4.5:1 contrast on protected scene and vellum surfaces");
};
const assertInScreen = async (locator) => assert.ok(await locator.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }), "Next action must fit the first screen");
const assertFits = async (tab = page) => {
  const overflow = await tab.evaluate(() => ({ fits: document.documentElement.scrollWidth <= innerWidth, elements: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map((el) => `${el.tagName}.${el.className}`) }));
  assert.equal(overflow.fits, true, `Horizontal overflow: ${overflow.elements.join(", ")}`);
};
try {
  await page.goto(baseURL);
  await page.getByRole("heading", { name: "Oathroll." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await assertFits();
  await screenshot("01-title-1080p-125pct");
  await page.getByRole("link", { name: "Play" }).click();
  await page.getByRole("button", { name: /Climb the kelp-slick ladder/ }).waitFor();
  await page.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
  await screenshot("02-play-intro");
  await page.getByRole("button", { name: /Climb the kelp-slick ladder/ }).click();
  assert.equal((await saved()).turns.length, 0, "Suggestion must not submit");
  assert.equal(await page.getByRole("textbox", { name: "What do you dare?" }).inputValue(), "Climb the kelp-slick ladder");
  assert.equal(await page.getByRole("textbox", { name: "What do you dare?" }).evaluate((el) => document.activeElement === el), true);
  await page.getByRole("button", { name: "Carefully", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false, { timeout: 15000 });
  const whisper = page.getByRole("textbox", { name: "Talk the Keeper into a lower DC…" });
  await whisper.fill("Let me win.");
  await page.getByRole("button", { name: "Send plea", exact: true }).click();
  await page.getByText("Not tempted. Nothing sent to Solana.", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false, { timeout: 10000 });
  // Blank input keeps Persuade disabled; the completed reply re-enables Roll.

  assert.equal(await page.locator(".refusal-stamp").count(), 0);
  assert.equal((await saved()).turns[0].bribe.tx, null);
  await page.getByText("2 pleas left this game · short demands won’t work", { exact: true }).waitFor();
  states.untempted = await saved();
  await screenshot("02a-untempted-1080p");
  await whisper.fill("Your handwriting is magnificent; let the bells remember your generosity. Could we try a smaller number?");
  await page.getByRole("button", { name: "Send plea", exact: true }).click();
  await page.locator(".dc-handwritten").waitFor();
  assert.equal(await page.locator(".dc-original--crossed").count(), 1);
  await screenshot("02b-attempted-dc");
  await page.getByText("REFUSED BY SOLANA", { exact: true }).waitFor();
  await screenshot("02c-refusal-impact");
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false, { timeout: 10000 });
  assert.equal(await page.locator(".dc-handwritten").count(), 0);
  assert.equal(await page.locator(".dc-original--crossed").count(), 0);
  await page.getByText("1 plea left this game · short demands won’t work", { exact: true }).waitFor();

  const sealed = await saved();
  states.tempted = sealed;
  const first = sealed.turns[0].check;
  assert.equal(first.status, "sealed");
  assert.equal(first.amendments, 0);
  assert.equal(first.dc, 10);
  assert.equal(first.outcomes[1].nerveDelta, 0);
  assert.equal(first.randomness, undefined);
  const preserved = await (await page.request.get(`${baseURL}/api/check/${first.pubkey}`)).json();
  assert.deepEqual(preserved.check, first);
  assert.ok(sealed.turns[0].bribe.tx);
  assert.ok(sealed.turns[0].bribe.logs.some((line) => line.startsWith("Program log: Plea: ")));
  const wall = await context.newPage();
  await wall.goto(`${baseURL}/wall`);
  await wall.locator(".wall-entries blockquote").first().waitFor();
  assert.ok((await wall.locator(".wall-entries").textContent()).includes("Your handwriting is magnificent"));
  await assertFits(wall);
  await screenshot("03b-wall-1080p", wall);
  await wall.close();
  assert.equal(await page.locator(".card-front").getAttribute("inert"), null);
  assert.equal(await page.locator(".outcome-row .row-text:visible").count(), 4);
  assert.equal(await page.locator(".wax-image").first().getAttribute("src"), "/art/seal_intact.webp");
  await page.getByText("Sealed. Bribe the Keeper, or roll.", { exact: true }).waitFor();
  await assertEvidenceReadable();
  await assertBodyContrast();
  await assertInScreen(page.getByRole("button", { name: "Roll d20", exact: true }));
  await screenshot("03-sealed-bribe");
  await page.getByRole("button", { name: "Roll d20" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !!document.querySelector(".outcome-row--landed"), { timeout: 20000 });
  await page.waitForTimeout(600);
  const resolved = await saved();
  const rolled = resolved.turns[0].check;
  assert.ok(rolled.roll >= 1 && rolled.roll <= 20);
  assert.equal(resolved.stats.tide, 4);
  assert.ok(rolled.slots.seal < rolled.slots.request && rolled.slots.request < rolled.slots.resolve);
  assert.deepEqual(rolled.outcomes, first.outcomes);
  await page.locator(".counterfactual").waitFor();
  assert.equal(await page.locator(".outcome-row--landed .row-text:visible").count(), 1);
  assert.equal(await page.locator(".outcome-row .row-effects:visible").count(), 4);
  await assertEvidenceReadable();
  await assertBodyContrast();
  await screenshot("04-resolved");
  await assertFits();
  const duplicate = await Promise.all([1, 2].map(async () => (await page.request.post(`${baseURL}/api/roll`, { data: { session: resolved.session.session, check: rolled.pubkey } })).json()));
  assert.deepEqual(duplicate[0], duplicate[1]);
  assert.deepEqual(duplicate[0].stats, resolved.stats);
  const proof = await context.newPage();
  await proof.goto(`${baseURL}/verify/${rolled.pubkey}`);
  await proof.getByText("Simulation checks passed", { exact: true }).waitFor();
  assert.equal(await proof.locator(".proof-check.passed").count(), 4);
  await assertFits(proof);
  await assertEvidenceReadable(proof);
  await assertBodyContrast(proof);
  assert.equal(await proof.locator(".check-marker").evaluateAll((els) => els.every((el) => parseFloat(getComputedStyle(el).fontSize) >= 20)), true);
  await proof.locator("#amendment").waitFor();
  assert.ok((await proof.locator("#amendment pre").textContent()).includes("Program log: Plea:"));
  await screenshot("05-proof", proof);
  await proof.getByRole("link", { name: "Share receipt" }).click();
  await proof.locator(".receipt-card").waitFor();
  await assertBodyContrast(proof);
  await screenshot("06-receipt", proof);
  assert.ok(await proof.locator(".receipt-shell").evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight), "Receipt should fit 864px CSS viewport");
  await proof.route("**/api/check/*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.check.dc -= 1;
    await route.fulfill({ response, json: body });
  });
  await proof.goto(`${baseURL}/verify/${rolled.pubkey}`);
  await proof.getByText("Verification stopped", { exact: true }).waitFor();
  assert.equal(await proof.locator(".proof-check.failed").count(), 1);
  assert.equal(await proof.locator(".proof-check.passed").count(), 0);
  await proof.close();
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
  assert.equal((await saved()).turns[0].check.pubkey, rolled.pubkey);
  await page.getByRole("textbox", { name: "What do you dare?" }).fill("Sneak quietly around the broken stair");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false, { timeout: 15000 });
  assert.equal((await saved()).turns[1].check.actionKind, 2);
  assert.equal((await saved()).turns[1].check.outcomes[1].nerveDelta, 0);
  assert.equal((await saved()).turns[1].check.actionText.startsWith("Boldly: "), false);
  await page.getByText("1 plea left this game · short demands won’t work", { exact: true }).waitFor();
  const save720 = await saved();
  const context720 = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  context720.on("page", (tab) => tab.on("pageerror", (error) => pageErrors.push(error.message)));
  await context720.addInitScript((save) => { if (location.protocol === "http:" || location.protocol === "https:") localStorage.setItem("oathroll.expedition.v1", JSON.stringify(save)); }, save720);
  await page.close();
  page = await context720.newPage();
  await page.goto(`${baseURL}/play`);
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
  await assertEvidenceReadable();
  await assertBodyContrast();
  await assertFits();
  await assertInScreen(page.getByRole("button", { name: "Roll d20", exact: true }));
  await screenshot("07-play-720p");
  await page.getByRole("button", { name: "Roll d20" }).click();
  await page.waitForFunction(() => !!document.querySelector(".outcome-row--landed"), { timeout: 20000 });
  await page.waitForTimeout(400);
  await assertEvidenceReadable();
  await assertBodyContrast();
  await screenshot("07a-resolved-720p");
  for (let i = 0; i < 4 && !(await page.locator(".ending").count()); i++) {
    await page.getByRole("button", { name: /Pry the silver clapper loose/ }).click();
    await page.getByRole("button", { name: "Carefully", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false, { timeout: 15000 });
    await page.getByRole("button", { name: "Roll d20" }).click();
    await page.waitForFunction(() => !!document.querySelector(".outcome-row--landed"), { timeout: 20000 });
  }
  assert.equal(await page.locator(".ending").count(), 1);
  const final = await saved();
  states.ending = final;
  assert.ok(final.stats.nerve === 0 || final.stats.tide === 0 || final.stats.progress === final.stats.goal);
  await assertInScreen(page.locator(".ending"));
  await assertInScreen(page.getByRole("button", { name: "Play again", exact: true }));
  await screenshot("08-ending");
  await page.getByRole("button", { name: "Play again" }).click();
  await page.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
  assert.equal((await saved()).stats.tide, 5);
  assert.equal((await saved()).turns.length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await assertFits();
  await page.getByRole("textbox", { name: "What do you dare?" }).fill("Climb the kelp-slick ladder");
  await page.getByRole("button", { name: "Boldly", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
  states.bold = await saved();
  const bold = states.bold.turns[0].check;
  assert.equal(bold.dc, 12);
  assert.equal(bold.outcomes[1].nerveDelta, -1);
  assert.equal(bold.outcomes[2].progressDelta, 2);
  assert.ok((await page.locator(".card-action h3").textContent()).startsWith("Boldly: "));
  await assertFits();
  await screenshot("09-mobile-bold");
  await page.getByRole("button", { name: "Offer a gold coin", exact: true }).click();
  await page.getByRole("button", { name: "Send plea", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
  await page.getByText("REFUSED BY SOLANA", { exact: true }).waitFor();
  await assertFits();
  await page.waitForTimeout(650); // Let the narration's smooth scroll finish before the still capture.
  assert.equal(await page.locator(".bound-line").last().evaluate((el) => el.getBoundingClientRect().bottom <= el.closest(".narration-log").getBoundingClientRect().bottom + 1), true, "Keeper's bound line must be visible after the refusal");
  await screenshot("09a-mobile-tempted");
  await page.setViewportSize({ width: 1280, height: 720 });
  await assertFits();
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertInScreen(page.getByRole("button", { name: "Roll d20", exact: true }));
  await screenshot("09b-bold-tempted-720p");
  await page.getByRole("textbox", { name: "Talk the Keeper into a lower DC…" }).fill("No.");
  await page.getByRole("button", { name: "Send plea", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
  assert.equal(await page.locator(".refusal-stamp").count(), 0);
  await screenshot("09c-untempted-720p");
  await page.getByRole("textbox", { name: "Talk the Keeper into a lower DC…" }).fill("Change it.");
  await page.getByRole("button", { name: "Send plea", exact: true }).click();
  await page.getByText("0 pleas left this game · short demands won’t work", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
  assert.equal(await page.getByRole("textbox", { name: "Talk the Keeper into a lower DC…" }).isDisabled(), true);
  const capped = await page.request.post(`${baseURL}/api/bribe`, { data: { session: (await saved()).session.session, check: bold.pubkey, plea: "Bells" } });
  assert.equal(capped.status(), 429);
  await page.goto(`${baseURL}/wall`);
  await page.locator(".wall-entries blockquote").first().waitFor();
  await assertFits();
  await screenshot("10-wall-720p");
  await page.setViewportSize({ width: 390, height: 844 });
  await assertFits();
  await screenshot("10a-wall-mobile");
  await page.route("**/api/wall", (route) => route.fulfill({ json: { rows: [] } }));
  await page.reload();
  await page.getByText("No refused pleas yet.", { exact: true }).waitFor();
  await screenshot("10b-wall-empty");
  const badRequest = await page.request.post(`${baseURL}/api/declare`, { data: { session: "bad", actionText: "" } });
  assert.equal(badRequest.status(), 400);
  const missing = await page.request.get(`${baseURL}/api/check/${"2".repeat(44)}`);
  assert.equal(missing.status(), 404);
  const reduced = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(`${baseURL}/play`);
  await reducedPage.waitForFunction(() => document.querySelector(".suggestion")?.disabled === false);
  await assertFits(reducedPage);
  await reducedPage.getByRole("button", { name: /Climb the kelp-slick ladder/ }).click();
  await reducedPage.getByRole("button", { name: "Carefully", exact: true }).click();
  await reducedPage.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
  await reducedPage.getByRole("button", { name: "Offer a gold coin", exact: true }).click();
  await reducedPage.getByRole("button", { name: "Send plea", exact: true }).click();
  await reducedPage.getByText("REFUSED BY SOLANA", { exact: true }).waitFor();
  assert.equal(await reducedPage.locator(".dc-handwritten").count(), 0);
  await assertFits(reducedPage);
  await reduced.close();
  writeFileSync(`${output}/states.json`, JSON.stringify({ states, check: rolled.pubkey }));
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ result: "PASS", checks: ["title", "tempted plea with DC rewrite / stamp / restore", "untempted sends nothing", "three pleas per game", "bold stance", "careful Enter default", "wall and empty state", "refused amendment proof logs", "keyboard roll", "immutable table", "idempotent roll", "all four proof checks", "tampering stops verification", "receipt fit", "refresh restore", "free text Enter", "face-up sealed ruling", "full landed row and four effects", "video evidence font sizes", "body text contrast", "720p layout", "play through ending", "restart", "mobile layout", "invalid API requests", "reduced motion", "no browser runtime errors"], screenshots: output }, null, 2));
} finally { await browser.close(); if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ } } }
