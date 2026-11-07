import { existsSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Only these two Blender exports are approved for the frontend.
for (const file of ["seal_intact.webp", "seal_cracked.webp"]) {
  const seal = path.resolve("../art/blender/final", file);
  if (existsSync(seal)) copyFileSync(seal, path.join("public/art", file));
}
const source = path.resolve("../art/final");
if (!existsSync(source) && existsSync("public/art/manifest.json")) {
  console.log("Art slots: retaining the bundled assets (no external drop folder)");
  process.exit(0);
}
const files = existsSync(source) ? readdirSync(source).filter((file) => /\.(webp|png|jpe?g|avif)$/i.test(file) && !/side_by_side|tiling_check|contact/i.test(file)) : [];
for (const file of files) copyFileSync(path.join(source, file), path.join("public/art", file));
const find = (pattern) => { const file = files.find((file) => pattern.test(file)); return file ? `/art/${file}` : null; };
const scenes = [find(/scene_ladder/i), find(/scene_ghost/i), find(/scene_clapper/i), find(/scene_tide/i)].filter(Boolean);
writeFileSync("public/art/manifest.json", JSON.stringify({ hero: find(/hero_A/i) ?? find(/hero|title/i), scene: find(/scene_ladder/i) ?? find(/scene|belfry|ladder|chamber/i), keeper: find(/keeper/i), vellum: find(/vellum_tile/i) ?? find(/vellum|paper/i), scenes }, null, 2) + "\n");
console.log(`Art slots: ${files.length} supplied images`);
