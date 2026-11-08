// Local asset preparation only. All 58 supplied candidates are needed by /sounds.
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const source = path.resolve("../art/audio/kenney");
const output = path.resolve("public/sfx");
await mkdir(output, { recursive: true });
const files = (await readdir(source)).filter((file) => /\.ogg$|^LICENSE-.*\.txt$/.test(file)).sort();
for (const file of files) await copyFile(path.join(source, file), path.join(output, file));
let ffmpeg = process.env.SFX_FFMPEG;
if (!ffmpeg && spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0) ffmpeg = "ffmpeg";
if (!ffmpeg) {
  const probe = spawnSync("uv", ["--no-config", "run", "--index-url", "https://pypi.org/simple", "-q", "--no-project", "--with", "imageio-ffmpeg", "python", "-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], {
    encoding: "utf8", timeout: 120000, env: { ...process.env, UV_CACHE_DIR: path.join(tmpdir(), "oathroll-audio-uv") },
  });
  if (probe.status === 0) ffmpeg = probe.stdout.trim();
}
const candidates = files.filter((file) => file.endsWith(".ogg"));
if (ffmpeg) for (const file of candidates) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(output, file), "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path.join(output, file.replace(/\.ogg$/, ".m4a"))], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`AAC conversion failed for ${file}: ${result.stderr}`);
}
await writeFile(path.join(output, "formats.json"), JSON.stringify({ aac: !!ffmpeg }) + "\n");
const credit = `Sound effects: Kenney (kenney.nl), Impact Sounds, Casino Audio and RPG Audio, CC0 1.0\n\nAll ${candidates.length} supplied candidates are included for /sounds. Game mappings: lib/sound.ts.\nFiles (AAC copies use the same basename):\n${candidates.map((file) => `- ${file}`).join("\n")}\n`;
await writeFile(path.join(output, "CREDITS.txt"), credit);
console.log(`${candidates.length} Kenney candidates copied; ${ffmpeg ? "Ogg + AAC 96 kb/s" : "Ogg only (converter unavailable)"}.`);
