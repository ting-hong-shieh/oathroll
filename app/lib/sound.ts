// Browser-only, gesture-gated audio. No context, requests or timers at import time.
import formats from "@/public/sfx/formats.json";
const numbered = (prefix: string, count: number, start = 0, pad = 3) =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i + start).padStart(pad, "0")}.ogg`);
export const SOUND_CANDIDATES = {
  seal: [...numbered("impactSoft_heavy_", 5), ...numbered("impactSoft_medium_", 3)],
  throw: [...numbered("dice-shake-", 3, 1, 1), ...numbered("dice-throw-", 3, 1, 1)],
  land: [...numbered("die-throw-", 4, 1, 1), ...numbered("dice-grab-", 2, 1, 1)],
  rewrite: [...numbered("drawKnife", 3, 1, 1), ...numbered("cloth", 4, 1, 1), ...numbered("bookFlip", 3, 1, 1)],
  refused: [...numbered("impactWood_heavy_", 5), ...numbered("impactPlank_medium_", 3)],
  crack: [...numbered("impactWood_light_", 3), ...numbered("impactGlass_light_", 3)],
  page: [...numbered("bookFlip", 3, 1, 1), ...numbered("bookPlace", 3, 1, 1), "bookClose.ogg", "bookOpen.ogg", ...numbered("creak", 3, 1, 1)],
  title: numbered("impactBell_heavy_", 5),
  win: numbered("impactBell_heavy_", 5),
  loss: numbered("impactBell_heavy_", 5),
  distant: numbered("impactBell_heavy_", 5),
  button: ["metalClick.ogg"],
};
export type SoundEvent = keyof typeof SOUND_CANDIDATES;
type Mapping = { files: readonly string[]; db: number; rate?: number; scratch?: boolean };
// Edit just the files on one line to remap an event. Empty files means silence,
// except rewrite's synthesised pen scratch. Peaks are measured after master.
export const SOUND_MAP: Record<SoundEvent, Mapping> = {
  seal: { files: ["impactSoft_heavy_000.ogg", "impactSoft_medium_001.ogg"], db: -12 },
  throw: { files: ["dice-throw-1.ogg", "dice-throw-2.ogg"], db: -14 },
  land: { files: ["die-throw-1.ogg", "die-throw-2.ogg"], db: -12 },
  rewrite: { files: [], scratch: true, db: -22 },
  refused: { files: ["impactWood_heavy_000.ogg", "impactWood_heavy_001.ogg"], db: -9 },
  crack: { files: ["impactWood_light_000.ogg", "impactWood_light_001.ogg"], db: -14 },
  page: { files: ["bookFlip1.ogg", "bookFlip2.ogg"], db: -22 },
  title: { files: ["impactBell_heavy_000.ogg"], db: -17 },
  win: { files: ["impactBell_heavy_000.ogg"], db: -15 },
  loss: { files: ["impactBell_heavy_000.ogg"], db: -18, rate: .8 },
  distant: { files: ["impactBell_heavy_000.ogg"], db: -40 },
  button: { files: [], db: -28 },
};

const MASTER = .8;
const listeners = new Set<() => void>();
let enabled = true, initialized = false, unlocked = false, scene = "silent", epoch = 0;
let context: AudioContext | undefined, master: GainNode, sea: GainNode, duck: GainNode;
let seaStarted = false, ambience = true, bellTimer: ReturnType<typeof setTimeout> | undefined;
let duckUntil = 0;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const downloads = new Map<string, Promise<ArrayBuffer | null>>();
const peaks = new WeakMap<AudioBuffer, number>();
const voices = new Set<AudioBufferSourceNode>();
const choose = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)];
const allowed = () => typeof window !== "undefined" && ["/", "/play", "/sounds"].includes(window.location.pathname) && scene !== "silent" && !document.hidden;
const audible = () => enabled && unlocked && allowed();

function ramp(param: AudioParam, value: number, seconds: number) {
  if (!context) return;
  param.cancelAndHoldAtTime(context.currentTime);
  param.linearRampToValueAtTime(value, context.currentTime + seconds);
}

function download(file: string): Promise<ArrayBuffer | null> {
  const cached = downloads.get(file);
  if (cached) return cached;
  const audio = document.createElement("audio");
  const ogg = !!audio.canPlayType('audio/ogg; codecs="vorbis"');
  if (!ogg && (!formats.aac || !audio.canPlayType('audio/mp4; codecs="mp4a.40.2"'))) return Promise.resolve(null);
  const url = `/sfx/${ogg ? file : file.replace(/\.ogg$/, ".m4a")}`;
  const pending = fetch(url).then((response) => {
    if (!response.ok) throw new Error("Audio unavailable");
    return response.arrayBuffer();
  }).catch(() => { downloads.delete(file); return null; });
  downloads.set(file, pending);
  return pending;
}

function preload() {
  // Encoded bytes can be fetched silently before the gesture. Decoding and all
  // audio nodes still wait for unlock; put the first-click bell first in queue.
  for (const file of new Set([...SOUND_MAP.title.files, ...Object.values(SOUND_MAP).flatMap((event) => event.files)])) void download(file);
}

function load(file: string): Promise<AudioBuffer | null> {
  if (!context) return Promise.resolve(null);
  const cached = buffers.get(file);
  if (cached) return cached;
  const ctx = context;
  const pending = download(file).then((bytes) => bytes ? ctx.decodeAudioData(bytes) : null).then((buffer) => {
    if (!buffer) return null;
    let peak = .0001;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      for (const sample of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
    }
    peaks.set(buffer, peak);
    return buffer;
  }).catch(() => { buffers.delete(file); return null; }); // Audio failure never blocks play.
  buffers.set(file, pending);
  return pending;
}

function stopVoices() {
  if (!context) return;
  // Let master finish its short mute ramp before stopping; avoid clicks.
  for (const voice of voices) { try { voice.stop(context.currentTime + .025); } catch { /* Already ended. */ } }
  voices.clear();
}

function updateAmbience() {
  if (!context) return;
  const active = audible() && ambience;
  ramp(sea.gain, active ? 1 : 0, active ? 3 : .15);
  if (!active) { clearTimeout(bellTimer); bellTimer = undefined; }
  if (active && !bellTimer) bellTimer = setTimeout(() => {
    bellTimer = undefined;
    if (audible() && ambience) void play("distant");
    updateAmbience();
  }, 40000 + Math.random() * 50000);
}

function startSea() {
  if (!context || seaStarted) return;
  seaStarted = true;
  const buffer = context.createBuffer(1, context.sampleRate * 12, context.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0, peak = .0001;
  for (let i = 0; i < data.length; i++) {
    brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02;
    data[i] = brown; peak = Math.max(peak, Math.abs(brown));
  }
  for (let i = 0; i < data.length; i++) data[i] *= .8 / peak;
  // Crossfade the seam of the noise loop to avoid a recurring click.
  const seam = Math.floor(context.sampleRate * .1);
  for (let i = 0; i < seam; i++) {
    const mix = i / seam;
    data[data.length - seam + i] = data[data.length - seam + i] * (1 - mix) + data[i] * mix;
  }
  const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true; noise.loopStart = .1;
  const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 550; filter.Q.value = .5;
  const swell = context.createGain(); swell.gain.value = .025;
  const lfo = context.createOscillator(); lfo.frequency.value = 1 / 8;
  const depth = context.createGain(); depth.gain.value = .005;
  lfo.connect(depth).connect(swell.gain);
  noise.connect(filter).connect(swell).connect(sea).connect(duck).connect(master);
  noise.start(); lfo.start();
}

// Must be called synchronously inside a real pointer/keyboard gesture.
export function unlock() {
  initialize();
  if (!enabled || !allowed()) return;
  try {
    if (unlocked && context?.state === "running") return;
    if (!context) {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      context = new AudioCtor();
      master = context.createGain(); master.gain.value = MASTER;
      const ceiling = context.createDynamicsCompressor();
      ceiling.threshold.value = -6; ceiling.knee.value = 0; ceiling.ratio.value = 12;
      ceiling.attack.value = .003; ceiling.release.value = .2;
      master.connect(ceiling).connect(context.destination);
      sea = context.createGain(); sea.gain.value = 0;
      duck = context.createGain(); duck.gain.value = 1;
    }
    unlocked = true;
    void context.resume().catch(() => {});
    startSea();
    for (const file of new Set([...SOUND_MAP.title.files, ...Object.values(SOUND_MAP).flatMap((event) => event.files)])) void load(file);
    updateAmbience();
  } catch { /* Unsupported/disabled audio leaves the game usable. */ }
}

function scratch(): AudioBuffer {
  const buffer = context!.createBuffer(1, context!.sampleRate * .18, context!.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / data.length) ** 2;
  peaks.set(buffer, 1);
  return buffer;
}

export async function play(event: SoundEvent, candidate?: string) {
  if (!audible() || !context) return;
  const generation = epoch, started = performance.now(), spec = SOUND_MAP[event];
  const file = candidate ?? choose(spec.files);
  const buffer = file ? await load(file) : spec.scratch ? scratch() : null;
  // Never deliver a queued sound into a different route/state, or long after its frame.
  if (!buffer || !audible() || !context || generation !== epoch || performance.now() - started > (scene === "audition" ? 10000 : 120)) return;
  const source = context.createBufferSource(); source.buffer = buffer;
  source.playbackRate.value = (spec.rate ?? 1) * (.95 + Math.random() * .1);
  const gain = context.createGain();
  gain.gain.value = 10 ** (spec.db / 20) / MASTER / (peaks.get(buffer) ?? 1);
  const filter = context.createBiquadFilter();
  filter.type = event === "rewrite" && !file ? "bandpass" : "lowpass";
  filter.frequency.value = event === "distant" ? 1200 : event === "rewrite" && !file ? 1700 : 18000;
  filter.Q.value = .5;
  // Short envelopes prevent hard starts, cut tails and cap overlap.
  const now = context.currentTime, duration = Math.min(buffer.duration / source.playbackRate.value, event === "distant" ? 8 : 4);
  const envelope = context.createGain(); envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(1, now + .004);
  envelope.gain.setValueAtTime(1, now + Math.max(.005, duration - .04));
  envelope.gain.linearRampToValueAtTime(0, now + duration);
  if (voices.size >= 3) { const oldest = voices.values().next().value; try { oldest?.stop(now + .01); } catch { /* Already ended. */ } }
  voices.add(source);
  source.connect(gain).connect(filter).connect(envelope).connect(master);
  source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); filter.disconnect(); envelope.disconnect(); };
  source.start(now); source.stop(now + duration);
  if (event !== "distant") {
    duckUntil = Math.max(duckUntil, now + duration);
    duck.gain.cancelAndHoldAtTime(now);
    duck.gain.linearRampToValueAtTime(.5, now + .025);
    duck.gain.setValueAtTime(.5, duckUntil);
    duck.gain.linearRampToValueAtTime(1, duckUntil + .6);
  }
}

export function initialize() {
  if (initialized) return;
  initialized = true;
  try { enabled = localStorage.getItem("oathroll-sound") !== "off"; } catch { /* Storage is optional. */ }
  listeners.forEach((listener) => listener());
}
export function setEnabled(value: boolean) {
  enabled = value; epoch++;
  try { localStorage.setItem("oathroll-sound", value ? "on" : "off"); } catch { /* Storage is optional. */ }
  if (context) { ramp(master.gain, value && allowed() ? MASTER : 0, .02); if (!value) stopVoices(); }
  if (value && allowed()) preload();
  updateAmbience(); listeners.forEach((listener) => listener());
}
export const getEnabled = () => enabled;
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function setScene(value: "game" | "audition" | "silent") {
  if (scene === value) return;
  if (scene !== value) ambience = value === "game";
  scene = value; epoch++;
  if (enabled && allowed()) preload();
  refreshVisibility();
}
export function refreshVisibility() {
  epoch++;
  if (context) { ramp(master.gain, audible() ? MASTER : 0, .02); if (!audible()) stopVoices(); }
  updateAmbience();
}
export function setAmbience(value: boolean) {
  ambience = value;
  updateAmbience();
}
