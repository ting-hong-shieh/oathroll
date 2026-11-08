// Spending caps for a public deployment. Each costly request (new session, declare, plea, roll)
// costs one unit: it calls the Keeper model, sends a devnet transaction, or both.
// Off unless OATHROLL_PUBLIC_QUOTA=1, so local play is unchanged. Per-IP counters live in this process.

import { readFileSync, renameSync, writeFileSync } from "node:fs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

class QuotaError extends Error {
  status = 429;
}

const perIp = new Map<string, number[]>();
let day = { start: Date.now(), used: 0 };
let loaded = false;

// The daily count survives restarts when OATHROLL_QUOTA_STATE names a writable file (one small JSON),
// so crashing the server does not refill the budget. Per-IP counts stay in memory.
function loadDay() {
  loaded = true;
  const file = process.env.OATHROLL_QUOTA_STATE;
  if (!file) return;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (Number.isFinite(saved.start) && Number.isFinite(saved.used)) day = { start: saved.start, used: saved.used };
  } catch { /* first run, or unreadable: start a fresh day */ }
}

function saveDay() {
  const file = process.env.OATHROLL_QUOTA_STATE;
  if (!file) return;
  try { writeFileSync(`${file}.tmp`, JSON.stringify(day)); renameSync(`${file}.tmp`, file); }
  catch (e) { console.error("quota state not saved:", (e as Error).message); }
}

function limit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

export function spend(request: Request) {
  if (process.env.OATHROLL_PUBLIC_QUOTA !== "1") return;
  if (!loaded) loadDay();
  const now = Date.now();
  if (now - day.start >= DAY) day = { start: now, used: 0 };
  if (day.used >= limit("OATHROLL_DAILY_UNITS", 1500)) {
    throw new QuotaError("The table is closed for today: the public demo has used its daily budget. Please come back tomorrow.");
  }
  const ip = clientIp(request);
  const recent = (perIp.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= limit("OATHROLL_HOURLY_UNITS_PER_IP", 60)) {
    const wait = Math.ceil((HOUR - (now - recent[0])) / 60000);
    throw new QuotaError(`You've played a lot this hour. The Keeper needs a rest: try again in about ${wait} minutes.`);
  }
  recent.push(now);
  perIp.set(ip, recent);
  day.used += 1;
  saveDay();
  if (perIp.size > 5000) {
    for (const [key, times] of perIp) if (!times.some((t) => now - t < HOUR)) perIp.delete(key);
  }
}
