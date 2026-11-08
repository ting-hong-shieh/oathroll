// Render each card in cards.json to a PNG sequence (30 fps). Transparent cards keep alpha.
// Usage: node render_cards.cjs <outDir> [id ...]
const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const OUT = process.argv[2];
const only = new Set(process.argv.slice(3));
const cards = JSON.parse(fs.readFileSync(path.join(__dirname, "cards.json"), "utf8"));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_EXE, args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  for (const c of cards) {
    if (only.size && !only.has(c.id)) continue;
    const dir = path.join(OUT, c.id);
    fs.mkdirSync(dir, { recursive: true });
    const url = "file://" + path.join(__dirname, "cards.html") + "?" + new URLSearchParams(c.params).toString();
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const n = Math.round(c.dur * 30);
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => window.seek(t), i / 30);
      await page.screenshot({ path: path.join(dir, `${String(i).padStart(4, "0")}.png`), omitBackground: !c.opaque });
    }
    console.log(c.id, n, "frames");
  }
  await browser.close();
})();
