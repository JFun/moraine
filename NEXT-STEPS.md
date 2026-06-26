# Moraine — Post-Launch Next Steps

*June 25, 2026. Moraine v1.0 is **submitted and in App Store review** (not yet live). This is the prioritized plan for what's next — written against the one lesson that's haunted every prior project: **the build is never the problem; distribution is.***

## Where it stands (honest snapshot)

**Shipped & strong:** a genuinely *differentiated* puzzle (solve-to-par gravity, not an arcade scorer — the open lane the audit found), **30 hand-made 6×6 boards**, a **BFS solver** that proves every board solvable with optimal par (the moat discipline, executed), crisp DOM-tile iOS rendering, procedural audio, App Store listing + screenshots, and **Firebase Analytics wired in.** You also renamed after research — the audit worked.

**The gap (the thing that matters now):** Moraine shipped **without the loop.** No daily mode, no share card, no streak — i.e., *no structural reason for player N to bring player N+1, and no daily-return habit.* And content is **finite** (30 boards → a hard retention ceiling; finish them and there's nothing new). This is the same shape as Block Blossom → Tinker Lab → … : a polished game with no growth engine. Closing this is the entire job now.

## ✅ UPDATE (June 26, 2026) — P1 loop is BUILT and wired (v1.1 ready)

The daily + share + streak loop now ships via **`@studio/growth-loop`** (the hero
package in the `jfun` studio monorepo), adopted here as its **first consumer** —
the inlined copy lives at `web/js/growth-loop.js`. Wired in `web/js/game.js`:

- **Daily** — a deterministic board pick from the bank by the day seed (one
  instance for everyone, no server); the ★ calendar button in the top bar starts it.
- **One-attempt lock** + **streak** (🔥 N-day) on the win card.
- **Spoiler-free share card** (canvas→PNG) carrying the instant-play link
  `?d=<day>&ref=<id>`; inbound links auto-open that daily.
- **k-funnel** (`daily_start → daily_solve → card_share → link_open →
  play_from_link`) routed through the existing `Track` analytics — stable names.

Verified parity-safe: `scripts/dev/test.sh` still green (engine/boards/solver
untouched) and the full daily flow was browser-tested (win→lock→streak→share,
plus level-mode regression). **Remaining for an actual v1.1 ship:** bump the iOS
build number + `cap sync` + archive/upload once v1.0 clears review; the generator
(P2) still feeds the daily long-term (today it rotates the 30-board bank).

## P0 — Use the review window: build the loop NOW (it's a gift, not a wait)

The app isn't live, so there's no data to read yet — which makes the review wait the **single best block of focused build time you'll get.** Don't sit idle refreshing App Store Connect. The plan: build **P1 (daily + share + streak)** and **P2 (the generator)** *now*, so the moment v1.0 is approved you either fold them into the launch or fire them as an immediate **v1.1 fast-follow**. Launching loop-less and "adding it later" is exactly how the last games went quiet.

**Also prep while you wait (cheap, high-value):**
- **Confirm the analytics funnel events** are right — `install → board_1_start → board_1_clear → board_5/10/30 → return` — so the day it's live, day-1 data is actually actionable (don't discover gaps after launch).
- **Stand up the web build** on a URL (P3) — ready to be the instant-play surface for share links at launch.
- **Draft the launch seeding:** the 2–3 puzzle/daily-game communities, the clippers, the build-in-public posts — written before you need them.
- **Review contingency:** Moraine is original + differentiated (you did the audit + the rename), so rejection risk is low — but given the *Gravity Flip* scar, keep a one-line review note ready articulating the original solve-to-par mechanic in case Apple asks.

## P-launch — The day it goes live: read the data, then act

Only once it's live can you read Firebase — and then it decides everything:

- **The funnel:** install → board 1 → board 5 / 10 / 30. **Where do they drop?** (Onboarding? A difficulty wall? Or finishers just run out at 30?) Plus **D1/D7 return** and session length.
- If players **drop on the first few boards** → it's *fun/onboarding* (P4), not distribution; fix before amplifying.
- If players **finish boards and leave** → core is fun, the gap is the **loop + content** → ship P1/P2 (already built during review — just turn them on).
- If **almost nobody installs** → it's discovery → lean on the share loop + web surface (P1/P3).

*Don't amplify a game you haven't confirmed retains — but do have the loop built and waiting so you can move the instant the data says go.*

## P1 — Ship the growth loop (the #1 lever; the thing we designed but didn't ship)

A solved puzzle with a par is **inherently shareable** — this is Moraine's Wordle moment, and it's missing. Add, in this order:

1. **Daily board** — one board for everyone each day (deterministic from the date). Gives a *reason to return* the 30 fixed boards can't, and a shared thing to compare. (Bridge: hand-curate/rotate a daily from your board bank until the generator (P2) exists.)
2. **Share card** — spoiler-free, ownable: *"Moraine #142 — solved in 4 ⭐ (par 4)"* with a tiny result motif + the link. This is the ad; design it like the product depends on it (it does). Web Share API on iOS; canvas→PNG.
3. **Streak** — consecutive daily solves. The retention spine.
4. **Instrument the loop:** `daily_start → daily_solve{swipes,par} → card_share → link_open → play_from_link`, so you can read **share-rate** and **k-factor** — the only growth scoreboard.

This is the single highest-leverage thing you can build, and it doubles as the fix for finite content.

## P2 — The generator (turn the solver into infinite fair boards)

You already have the BFS **solver**; the missing half is a **generator** that emits candidate boards and keeps only those the solver proves solvable inside a target par band (your Lanthorn band discipline). That unlocks: an endless supply, a real difficulty curve, and an infinite **daily** — removing the 30-board ceiling for good. This is your moat (fair, par-rated, un-clonable content), so it's worth doing right — but *after* P0 confirms the core retains and P1 proves the loop pulls.

## P3 — Distribution pushes (you're web-first — use it)

- **Publish the web build** (you have `web/`) on its own URL + CrazyGames; every share link should open *instant play, no install* — the lowest-friction acquisition there is, and what makes P1's share loop convert.
- **Seed the card:** puzzle/daily-game communities (Reddit, X), 2–3 micro-clippers — a satisfying cascade clip is native short-form content.
- **Build-in-public** the cascade/par moments (your proven solo channel).
- **ASO polish:** make sure the title/subtitle/keywords say *"daily gravity puzzle"* once the daily ships; the icon/screenshots are already done.

## P4 — Iterate fun/retention (driven by P0)

If P0 shows early drop-off: tighten onboarding (the par-1 self-teach is good — confirm the jump to par-2/3 isn't a cliff), add a gentle hint/undo affordance, and re-check the difficulty curve. Small, data-pointed fixes — not a redesign.

## P5 — Monetization (only after the loop + retention prove out)

Reach before revenue (your standing rule). Once daily + streak retain a cohort: a light cosmetic/board-pack IAP or a non-intrusive ad on retry — never paywall the daily. Don't touch this until P0–P1 are green.

## The one-line plan

**Read the Firebase data → if the core retains, ship the daily + share + streak loop (and the generator behind it) → push it through the web/share surface.** Moraine is the best-crafted, most-differentiated thing you've shipped; the only question left is whether you give it the loop it launched without. Don't let this one go quiet by default.
