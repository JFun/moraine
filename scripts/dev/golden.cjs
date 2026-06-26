// Determinism golden for @jfun/growth-loop (the daily + share loop).
//
// DETERMINISM IS SACRED. The daily is "the same board for everyone on day N" and
// a shared link (?d=<day>) must open the SAME instance the sharer saw — that holds
// only if dayIndex / seedForDay / the board-pick / the variant are pure, stable
// functions of the date that NEVER change their output. This test pins their exact
// values; if a change moves any of them it WILL desync live clients, so the test
// fails loudly and the change must come with a migration plan (not a silent edit).
//
// Run by scripts/dev/test.sh. Node-only (requires the UMD modules directly).
"use strict";
const path = require("path");

// Streak persists to localStorage; shim it so the streak logic is testable in Node.
globalThis.localStorage = (() => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    get length() { return m.size; },
  };
})();

const GL = require(path.join(__dirname, "..", "..", "web", "js", "growth-loop.js"));
const { BOARDS } = require(path.join(__dirname, "..", "..", "web", "js", "boards.js"));

let fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log("  ok   " + label); }
  else { fail++; console.error("  FAIL " + label + "  got " + a + "  want " + e); }
}

const LAUNCH = new Date("2026-06-25T00:00:00Z");
const DI = 20629;   // dayIndex(LAUNCH) — the launch day handle

// ---- dayIndex: days since the Unix epoch, timezone-independent ----
eq(GL.Daily.dayIndex(new Date("1970-01-01T00:00:00Z")), 0, "dayIndex(epoch) = 0");
eq(GL.Daily.dayIndex(new Date("1970-01-02T00:00:00Z")), 1, "dayIndex(+1 day) = 1");
eq(GL.Daily.dayIndex(LAUNCH), DI, "dayIndex(launch 2026-06-25) = 20629");
eq(GL.Daily.dayIndex(new Date("2026-06-25T23:59:59Z")), DI,
   "dayIndex is constant across a UTC day (tz-independent)");

// ---- the daily board pick depends on BOARDS.length; pin it so a growing bank
//      can't silently reshuffle every day's instance (that would desync clients
//      mid-rollout). If this trips, the daily needs a bank-size-independent seed. ----
eq(BOARDS.length, 30, "BOARDS.length = 30 (daily-pick modulus)");

// ---- seedForDay: the well-mixed RNG seed (pinned hashes) ----
eq(GL.Daily.seedForDay(0), 0, "seedForDay(0) = 0");
eq(GL.Daily.seedForDay(DI), 2787696485, "seedForDay(launch) = 2787696485");

// ---- launch week: the exact daily board id everyone gets, by day ----
const WEEK = ["leftchannel", "slabdetour", "topshelf", "well", "hook", "bend", "slabdetour"];
WEEK.forEach((id, k) => {
  const idx = GL.Daily.seedForDay(DI + k) % BOARDS.length;
  eq(BOARDS[idx].id, id, `daily board for day +${k} = ${id}`);
});

// ---- share-card variant rotation (per-day, stable) ----
const VARIANTS = ["percentile", "challenge", "score", "percentile", "challenge", "score", "percentile"];
VARIANTS.forEach((v, k) => eq(GL.ShareCard.pickVariant(DI + k), v, `variant for day +${k} = ${v}`));

// ---- human puzzle number relative to the launch epoch ----
GL.configure({ epoch: LAUNCH });
eq(GL.Daily.number(DI), 1, "launch day = Daily #1");
eq(GL.Daily.number(DI + 1), 2, "next day = Daily #2");
eq(GL.Daily.number(DI - 5), 1, "pre-launch clamps to #1");

// ---- streak: same day no-op, +1 consecutive, any gap resets, lapse on display ----
localStorage.clear();
eq(GL.Streak.bump(100).count, 1, "streak: first completion = 1");
eq(GL.Streak.bump(100).count, 1, "streak: same day = no-op");
eq(GL.Streak.bump(101).count, 2, "streak: consecutive day = +1");
eq(GL.Streak.bump(103).count, 1, "streak: a gap resets to 1");
eq(GL.Streak.current().best, 2, "streak: best is retained across a reset");
eq(GL.Streak.display(103), 1, "streak display: today = count");
eq(GL.Streak.display(104), 1, "streak display: the day after = count (not yet lapsed)");
eq(GL.Streak.display(105), 0, "streak display: after a missed day = 0 (lapsed)");

if (fail) { console.error("\nGOLDEN FAILED (" + fail + ") — determinism changed; clients will desync."); process.exit(1); }
console.log("growth-loop determinism golden: OK");
