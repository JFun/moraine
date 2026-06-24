# Moraine

A minimalist gravity puzzle you **solve**, not an arcade scorer. Swipe to choose
which way gravity pulls; every loose block slides to that wall, full rows/columns
clear, and the gaps cascade — until the board (or every glowing target) is empty,
in as few swipes as you can. One verb: swipe.

## Run it

```bash
python3 -m http.server 4173 -d web
# open http://localhost:4173
```

Swipe (or arrow keys / WASD) to set gravity. `Z` undo · `R` reset · `N` next board.
`?slow=12` slows the cascade animation for inspection.

## What's here

| | |
|---|---|
| `web/js/engine.js` | The deterministic heart: `settle(grid,dir)` + clear/cascade loop. Pure function of (board, dir) — same board + swipes ⇒ identical result. Runs in the browser (global) and node (require). |
| `web/js/boards.js` | 30 hand-made 6×6 boards, par 1→6. Two goals: `clear` (empty the board) and `targets` (clear the glowing blocks; plain blocks are tools). Walls are fixed **and** count toward line fullness. |
| `web/js/game.js` | DOM-tile render + swipe input + slide/clear/cascade animation + win/par/stars + level grid + finale. (Tiles are individual DOM elements, not a canvas, so the iOS WKWebView compositor pixel-snaps them and nothing shimmers between moves.) |
| `web/js/audio.js` | Procedural Web Audio SFX (no asset files). |
| `scripts/dev/solver.cjs` | BFS solver — a validation tool. Proves every board solvable and computes optimal par. |
| `scripts/dev/test.sh` | syntax → engine determinism golden + rules → board solvability/par invariants. Run after every change. |
| `ios/` | Capacitor iOS wrapper (`npx cap sync ios`; `scripts/dev/deploy_ios.sh` to build + install on a paired device). |

## The promise the tests enforce

Every shipped board is **solver-proven solvable** and its displayed **par is the
BFS-optimal swipe count** — a designed, fair, par-scored puzzle, not an endless
scorer. The harness fails if any board is unsolvable or mis-par'd. Par-1 boards may
be mash-solvable (the rule self-teaches); every par≥2 board is verified to need real
planning.
