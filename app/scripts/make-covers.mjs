// Code draws every letter. Supplied art is read only; outputs stay in app by default.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(root, process.env.OATHROLL_COVERS_DIR || "art/final/covers");
await mkdir(output, { recursive: true });
const data = async (file, mime) => `data:${mime};base64,${(await readFile(path.resolve(root, file))).toString("base64")}`;
const [hero, seal, fraunces, plex] = await Promise.all([
  data("../art/final/hero_B.webp", "image/webp"),
  data("../art/blender/final/seal_intact.webp", "image/webp"),
  data("public/fonts/fraunces.ttf", "font/ttf"), data("public/fonts/ibm-plex-mono.ttf", "font/ttf"),
]);
const coverURL = process.env.OATHROLL_COVER_URL || "http://localhost:3000";
const server = process.env.OATHROLL_START_SERVER ? spawn("npm", ["run", "start", "--", "--port", new URL(coverURL).port || "3000"], { cwd: root, detached: true, stdio: "ignore" }) : null;
if (server) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(coverURL)).ok) break; } catch { /* Wait for the local production server. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
try {
  let card = null;
  // Optional real mock UI capture. Check the public header before opening /play.
  if (process.env.OATHROLL_COVER_URL || server) {
    const base = coverURL;
    const live = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
    await live.goto(base);
    if (await live.locator(".site-header").getAttribute("data-backend") !== "mock") throw new Error("Cover captures require mock mode; no live calls were made.");
    await live.goto(`${base}/play`);
    await live.getByRole("button", { name: /Climb the kelp-slick ladder/ }).click();
    await live.getByRole("button", { name: "Carefully", exact: true }).click();
    await live.waitForFunction(() => document.querySelector(".button-roll")?.disabled === false);
    await live.getByRole("textbox", { name: "Talk the Keeper into a lower DC…" }).fill("Your handwriting is magnificent. Surely a smaller number would look even finer?");
    await live.getByRole("button", { name: "Send plea", exact: true }).click();
    await live.getByText("REFUSED BY SOLANA", { exact: true }).waitFor();
    await live.addStyleTag({ content: ".bribe-refusal, .refusal-stamp { display: none !important; }" });
    const capture = await live.locator(".card-front").screenshot();
    await writeFile(path.join(output, "sealed-card-source.png"), capture);
    card = `data:image/png;base64,${capture.toString("base64")}`;
    await live.close();
  }
  const common = `@font-face{font-family:Fraunces;src:url('${fraunces}');font-weight:100 900}@font-face{font-family:Plex;src:url('${plex}')}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:#14110f;color:#ede3cf;font-family:Fraunces,serif}.dot{color:#bd4632}.mono{font-family:Plex,monospace}.frame{position:relative;width:100vw;height:100vh;overflow:hidden}`;
  const designs = [
    {
      name: "cover_1120x560", width: 1120, height: 560,
      // Fit the full vertical scene, crop its side margins into a 2:1 ink field,
      // so both the moon at the top and wax at the bottom survive the frame.
      css: `.hero{position:absolute;height:100%;width:auto;right:0;top:0;mask-image:linear-gradient(90deg,transparent,#000 18%)}.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,17,15,.70),rgba(20,17,15,.55) 50%,transparent 100%)}.copy{position:absolute;left:300px;top:82px;width:520px}h1{font-size:150px;line-height:1;margin:0 0 22px;font-weight:600;letter-spacing:-10px}p{font-size:43px;font-style:italic;line-height:1.13;margin:0;color:#d6b97a;max-width:520px;text-shadow:0 2px 12px #14110f}footer{position:absolute;left:30px;bottom:20px;font:20px Plex;color:#ede3cf;text-shadow:0 1px 6px #14110f;letter-spacing:-.5px}`,
      html: `<img class="hero" src="${hero}"/><div class="shade"></div><div class="copy"><h1>Oathroll<span class="dot">.</span></h1><p>Talk the AI game master into cheating. Solana won't let it.</p></div><footer>MLH SOLANA HACKATHON 2026 · DEVNET · MAGICBLOCK VRF</footer>`,
    },
    {
      name: "square_512", width: 512, height: 512,
      css: `.seal{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}`,
      html: `<img class="seal" src="${seal}"/>`,
    },
    {
      name: "thumb_1280x720", width: 1280, height: 720,
      css: `.paper{position:absolute;left:-26px;top:24px;width:655px;height:780px;background:#e8ddc6;color:#362b22;border:1px solid #c4b18d;transform:rotate(-3deg);overflow:hidden;box-shadow:12px 12px 40px #0008}.ui-card{width:100%;height:auto;min-height:100%;object-fit:cover;object-position:top}.fallback{padding:32px;font-size:30px}.fallback h2{font-size:45px;font-weight:500}.fallback img{width:150px;float:right}.fallback p{border-top:1px solid #a08b6b;padding-top:18px}.stamp{position:absolute;left:26px;top:275px;width:580px;padding:18px 6px;border:9px double #ac3325;color:#ac3325;background:#eadfc9ed;font:70px/1.06 Plex;text-align:center;transform:rotate(-8deg);letter-spacing:-3px;box-shadow:0 4px 18px #4a27191a}.quote{position:absolute;left:30px;bottom:42px;width:565px;padding:18px 22px;background:#e8ddc6;font-size:27px;font-style:italic;color:#564a3b;transform:rotate(-3deg)}.right{position:absolute;left:678px;top:125px;width:565px}.right h1{font-size:112px;font-weight:600;letter-spacing:-7px;margin:0}.right p{font-size:86px;line-height:1.05;color:#d6b97a;font-style:italic;margin:35px 0}.right small{font:19px/1.6 Plex;color:#c8bba6}`,
      html: `<div class="paper">${card ? `<img class="ui-card" src="${card}"/>` : `<div class="fallback"><span class="mono">THE KEEPER’S RULING · SEALED</span><img src="${seal}"/><h2>Climb the kelp-slick ladder</h2><strong>DC 10</strong><p>Disaster · 1</p><p>Setback · 2–9</p><p>Success · 10–19</p><p>Triumph · 20</p></div>`}</div><div class="stamp">REFUSED BY<br/>SOLANA</div><div class="quote">“Your handwriting is magnificent. Surely a smaller number would look even finer?”</div><div class="right"><h1>Oathroll<span class="dot">.</span></h1><p>It can't<br/>cheat.</p><small>THE KEEPER TRIED DC 2.<br/>SOLANA REFUSED.</small></div>`,
    },
  ];
  for (const design of designs) {
    const page = await browser.newPage({ viewport: { width: design.width, height: design.height }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${common}${design.css}</style></head><body><main class="frame">${design.html}</main></body></html>`);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((img) => img.decode())); });
    const file = path.join(output, `${design.name}.png`);
    await page.screenshot({ path: file });
    for (const [width, height] of [[280, 140], [110, 110]]) {
      await sharp(file).resize(width, height, { fit: "contain", background: "#14110f", position: "centre", kernel: "lanczos3" }).png().toFile(path.join(output, `${design.name}_preview_${width}x${height}.png`));
    }
    if (design.name === "cover_1120x560") await sharp(file).extract({ left: 280, top: 0, width: 560, height: 560 }).png().toFile(path.join(output, "cover_center_560x560.png"));
    await page.close();
  }
  console.log(`Covers and Lanczos previews: ${output}${card ? " (real mock UI card)" : " (HTML card)"}`);
} finally { await browser.close(); if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ } } }
