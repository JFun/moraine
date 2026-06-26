/* @jfun/growth-loop — the hero. The one piece of shared code that attacks the
   real problem (distribution): a drop-in daily + streak + spoiler-free share card
   + the k-funnel, fully instrumented, so no future game launches loop-less again.

   The package owns the loop; the game owns the gameplay. The game passes in its
   result (+ an optional NON-SPOILING motif and a play link); it gets back a
   deterministic daily, a one-attempt lock, a streak, a shareable card, and a
   uniform k-funnel in whatever analytics sink is wired.

   Shipped as ONE UMD file (the no-build ethos — same pattern as Moraine's
   engine.js): a browser `<script>` exposes `window.GrowthLoop`; Node `require`
   gets the same object (so the determinism golden runs the exact browser code);
   `index.mjs`/`index.js` re-export the named API for ESM/CJS consumers.

   DETERMINISM IS SACRED. `Daily.dayIndex` and `Daily.seedForDate` are pure
   functions of the UTC date — same date → identical output on every client,
   forever. The daily + share loop is broken the instant two clients disagree, so
   those two are pinned by a golden test (scripts/dev/golden.cjs). */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GrowthLoop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const DAY_MS = 86400000;

  // ---- configuration (namespace isolates localStorage; sink routes the funnel) ----
  let NS = "gl";
  let sink = null;             // analytics sink: { ev(name, params) } — defaults to window.Track
  let epochIndex = 0;          // dayIndex of the game's launch day → human "#N"

  function configure(opts) {
    opts = opts || {};
    if (opts.namespace) NS = String(opts.namespace);
    if (opts.track) sink = opts.track;
    if (opts.epoch != null) epochIndex = (typeof opts.epoch === "number") ? opts.epoch : dayIndex(opts.epoch);
    return { namespace: NS, epoch: epochIndex };
  }
  function track(name, params) {
    const s = sink || (root && root.Track) || null;
    if (s && typeof s.ev === "function") { try { s.ev(name, params || {}); } catch (e) {} }
  }

  // ---- localStorage helpers (guarded — Node / private mode degrade to no-op) ----
  function lsGet(k) { try { return root.localStorage.getItem(NS + "." + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(NS + "." + k, v); } catch (e) {} }

  // =====================================================================
  // Daily — scarcity. One instance/day, one attempt, a streak. The day
  // handle is `dayIndex` (a monotonic UTC integer); `seedForDate` is the
  // well-mixed RNG seed for that day. Both are pure functions of the date.
  // =====================================================================

  // UTC day index — days since the Unix epoch. Monotonic, timezone-independent:
  // every client in the world shares one daily instance. THE day handle.
  function dayIndex(date) {
    const d = date || new Date();
    const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.floor(utc / DAY_MS);
  }

  // A well-mixed 32-bit seed derived from a day index (xmur3 finalize). Feed it to
  // a deterministic RNG (mulberry32) to pick the day's board/layout so consecutive
  // days don't pick adjacent content.
  function hashDay(di) {
    let h = di | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }
  // Seed for a date (default today) or for a raw day handle — both pure functions.
  function seedForDate(date) { return hashDay(dayIndex(date)); }
  function seedForDay(di) { return hashDay((di == null ? dayIndex() : di) | 0); }

  // Human-facing puzzle number ("Moraine #142") — day index relative to the
  // game's launch epoch (configure({epoch})). 1-based; clamps at ≥1.
  function number(day) {
    const di = (day == null) ? dayIndex() : day;
    return Math.max(1, di - epochIndex + 1);
  }

  const PLAYED = day => "played." + ((day == null) ? dayIndex() : day);

  function isPlayed(day) { return lsGet(PLAYED(day)) != null; }
  function playedResult(day) { try { return JSON.parse(lsGet(PLAYED(day))); } catch (e) { return null; } }
  // One-attempt lock: records the result so a reload shows it instead of replaying.
  function markPlayed(day, result) {
    const di = (day == null) ? dayIndex() : day;
    lsSet(PLAYED(di), JSON.stringify(result || {}));
    return di;
  }

  // ?d=<day>&ref=<id> — the invite. parseLink reads it; buildLink writes one that
  // opens the exact instance instantly on web (no install). Organic by construction.
  function parseLink(search) {
    const q = new URLSearchParams(search != null ? search : (root.location ? root.location.search : ""));
    const out = {};
    if (q.has("d")) { const n = parseInt(q.get("d"), 10); if (Number.isInteger(n)) out.d = n; }  // ignore a non-integer ?d (NaN) — never let it drive the daily
    if (q.has("ref")) out.ref = q.get("ref");
    return out;
  }
  function buildLink(base, params) {
    params = params || {};
    const u = new URL(base, root.location ? root.location.href : "https://example.com");
    if (params.d != null) u.searchParams.set("d", String(params.d));
    if (params.ref != null) u.searchParams.set("ref", String(params.ref));
    return u.toString();
  }

  const Daily = {
    DAY_MS, dayIndex, seedForDate, seedForDay, number,
    isPlayed, playedResult, markPlayed,
    parseLink, buildLink,
    // convenience: the whole descriptor for today (or a given date)
    forDate(date) { const di = dayIndex(date); return { dayIndex: di, seed: seedForDate(date), number: number(di), played: isPlayed(di) }; },
    today() { return this.forDate(new Date()); },
  };

  // =====================================================================
  // Streak — consecutive daily completions (the retention spine). Operates
  // on dayIndex so "yesterday + 1 = today" is a plain integer comparison.
  // =====================================================================
  const SKEY = "streak.v1";
  function streakRead() { try { return JSON.parse(lsGet(SKEY)) || { count: 0, lastDay: null, best: 0 }; } catch (e) { return { count: 0, lastDay: null, best: 0 }; } }
  function streakWrite(s) { lsSet(SKEY, JSON.stringify(s)); return s; }

  const Streak = {
    current() { return streakRead(); },
    // Record a completion for `day` (dayIndex; default today). Same day → no-op;
    // exactly +1 from lastDay → extend; any gap → reset to 1. Returns the streak.
    bump(day) {
      const di = (day == null) ? dayIndex() : day;
      const s = streakRead();
      // Only the most-recent day ever advances the streak. A bad or back-filled day —
      // a non-integer handle, or solving a friend's OLDER shared ?d link — must NEVER
      // rewind lastDay or collapse a healthy streak (that was the worst sweep finding).
      if (!Number.isInteger(di)) return s;
      if (s.lastDay != null && di <= s.lastDay) return s;   // same day (already counted) or an older day (ignore)
      s.count = (s.lastDay === di - 1) ? s.count + 1 : 1;   // consecutive extends; a true gap resets to 1
      s.lastDay = di;
      if (!s.best || s.count > s.best) s.best = s.count;
      return streakWrite(s);
    },
    // Streak as displayed BEFORE today is counted: a gap silently lapses to 0 so
    // the HUD doesn't show a stale number the morning after a miss.
    display(day) {
      const di = (day == null) ? dayIndex() : day;
      const s = streakRead();
      if (s.lastDay === di || s.lastDay === di - 1) return s.count;
      return 0;
    },
  };

  // =====================================================================
  // ShareCard — the ad. Spoiler-free always; ownable signature; carries the
  // instant-play link; supports A/B variants. Canvas → PNG, Web Share fallback.
  // =====================================================================
  const VARIANTS = ["score", "percentile", "challenge"];

  // Deterministic-but-rotating variant pick: keyed off the day so a given day
  // shows one consistent variant per device, but variants rotate across days.
  // (linkOpen/playFromLink attribute conversions back to the winning variant.)
  function pickVariant(day) {
    const di = (day == null) ? dayIndex() : day;
    return VARIANTS[((di % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  }
  function variantLine(variant, ctx) {
    ctx = ctx || {};
    switch (variant) {
      case "percentile": return ctx.percentile != null ? ("Beat " + ctx.percentile + "% of the world") : (ctx.line || "");
      case "challenge":  return "Same board — beat me?";
      case "score":
      default:           return ctx.line || "";
    }
  }

  const ShareCard = {
    VARIANTS, pickVariant, variantLine,

    // Render a spoiler-free 1080×1080 card to a Blob (PNG). NEVER draws the
    // solution. `motif` (optional) must be a pre-obfuscated thumbnail the game
    // guarantees does not reveal today's answer. Returns null when no canvas
    // (e.g. Node) — callers fall back to a text share.
    async render(opts) {
      opts = opts || {};
      if (typeof document === "undefined") return null;
      const S = 1080, P = 96;
      const cv = document.createElement("canvas");
      cv.width = S; cv.height = S;
      const g = cv.getContext("2d");

      // background
      const bg = g.createLinearGradient(0, 0, S, S);
      bg.addColorStop(0, opts.bg1 || "#14213d");
      bg.addColorStop(1, opts.bg2 || "#0a1124");
      g.fillStyle = bg; g.fillRect(0, 0, S, S);

      // optional non-spoiling motif, centered
      if (opts.motif) {
        try {
          const img = await loadImage(opts.motif);
          const m = S * 0.42, x = (S - m) / 2, y = S * 0.30;
          g.globalAlpha = 0.95; g.drawImage(img, x, y, m, m); g.globalAlpha = 1;
        } catch (e) {}
      }

      g.textAlign = "center"; g.fillStyle = opts.fg || "#ffffff";
      // title + ownable "#N"
      g.font = "700 88px -apple-system, system-ui, sans-serif";
      g.fillText(opts.title || "Daily", S / 2, P + 88);
      g.font = "700 64px -apple-system, system-ui, sans-serif";
      g.fillStyle = opts.accent || "#fca311";
      g.fillText("#" + (opts.n != null ? opts.n : ""), S / 2, P + 168);
      // the line (variant copy)
      if (opts.line) {
        g.fillStyle = opts.fg || "#ffffff";
        g.font = "500 56px -apple-system, system-ui, sans-serif";
        wrapText(g, opts.line, S / 2, S * 0.80, S - 2 * P, 70);
      }
      // signature / curiosity hook
      g.fillStyle = (opts.fg || "#ffffff"); g.globalAlpha = 0.6;
      g.font = "500 36px -apple-system, system-ui, sans-serif";
      g.fillText(opts.footer || "play the same board →", S / 2, S - P);
      g.globalAlpha = 1;

      return await new Promise(res => cv.toBlob(b => res(b), "image/png"));
    },

    // Share via the Web Share API (files when supported, else URL+text), falling
    // back to a PNG download. Returns the channel used: "share-files" |
    // "share-text" | "download" | "none".
    async share(blobOrOpts, opts) {
      let blob = null, o = opts || {};
      if (blobOrOpts instanceof Blob) blob = blobOrOpts;
      else if (blobOrOpts) o = blobOrOpts;
      const nav = root.navigator;
      const text = o.text || "";
      const url = o.url || "";
      const file = blob ? new File([blob], (o.filename || "share") + ".png", { type: "image/png" }) : null;

      try {
        if (nav && nav.canShare && file && nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], text, url, title: o.title || "" });
          return "share-files";
        }
        if (nav && nav.share) { await nav.share({ text, url, title: o.title || "" }); return "share-text"; }
      } catch (e) { if (e && e.name === "AbortError") return "none"; }

      if (blob && typeof document !== "undefined") {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (o.filename || "share") + ".png";
        document.body.appendChild(a); a.click(); a.remove();
        return "download";
      }
      return "none";
    },
  };

  function loadImage(src) {
    return new Promise((res, rej) => {
      if (typeof src !== "string" && src && src.width) return res(src); // already an image/canvas
      const img = new Image();
      img.onload = () => res(img); img.onerror = rej; img.src = src;
    });
  }
  function wrapText(g, text, cx, y, maxW, lh) {
    const words = String(text).split(" "); let line = "", lines = [];
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const start = y - (lines.length - 1) * lh / 2;
    lines.forEach((ln, i) => g.fillText(ln, cx, start + i * lh));
  }

  // =====================================================================
  // LoopTrack — the only growth scoreboard. Bake the funnel into the package
  // so every game measures k identically. Stable event names (don't rename —
  // dashboards depend on them). Derived: share-rate, link-CTR, k.
  // =====================================================================
  const LoopTrack = {
    dailyStart(day) { track("daily_start", { day: norm(day), seed: seedForDate(dayDate(day)) }); },
    dailySolve(r) { r = r || {}; track("daily_solve", { swipes: r.swipes, par: r.par, beatPar: (r.swipes != null && r.par != null) ? (r.swipes <= r.par) : undefined }); },
    cardShare(r) { r = r || {}; track("card_share", { variant: r.variant, channel: r.channel }); },
    linkOpen(r) { r = r || {}; track("link_open", { ref: r.ref, variant: r.variant }); },
    playFromLink(r) { r = r || {}; track("play_from_link", { ref: r.ref, variant: r.variant }); },
  };
  function norm(day) { return (day == null) ? dayIndex() : day; }
  function dayDate(day) { // reconstruct a Date from a dayIndex for seedForDate (UTC noon — safe)
    if (day == null) return new Date();
    return new Date(day * DAY_MS + DAY_MS / 2);
  }

  return { configure, Daily, Streak, ShareCard, LoopTrack, VERSION: "0.1.0" };
});
