/* BFS solver — a VALIDATION TOOL, not the product generator (that's post-fun-gate,
   03 Stage 1). Its only jobs in the greybox:
     1. prove every hand-made board is solvable (CLAUDE.md non-negotiable), and
     2. compute optimal par (the swipe count shown to the player).

   BFS over swipe sequences from a board state: branching ≤ 4 directions, pruned by
   a visited-state hash. First time a won state is reached = shortest = par.

   CLI:  node scripts/dev/solver.cjs            → report par/solvability for all boards
         node scripts/dev/solver.cjs <boardId>  → also print the optimal swipe line */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { BOARDS, toGrid } = require(path.join(__dirname, "..", "..", "web", "js", "boards.js"));

// BFS to optimal solution. maxDepth caps the search (tight boards solve shallow).
function solve(grid, mode, maxDepth = 14) {
  if (E.isWon(grid, mode)) return { solvable: true, par: 0, solution: [], states: 1 };
  const visited = new Set([E.key(grid)]);
  let frontier = [{ g: grid, path: [] }];
  let states = 1;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const d of E.DIRS) {
        const g2 = E.cloneGrid(node.g);
        const { changed } = E.applySwipe(g2, d);
        if (!changed) continue;                 // no-op swipe — don't count it
        const k = E.key(g2);
        if (visited.has(k)) continue;
        visited.add(k); states++;
        const pathArr = node.path.concat(d);
        if (E.isWon(g2, mode)) return { solvable: true, par: depth, solution: pathArr, states };
        next.push({ g: g2, path: pathArr });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { solvable: false, par: null, solution: null, states };
}

// Is this board a "mash one direction" trivial? (Solvable by repeating a single
// direction.) The product wants real planning, so we flag these — except par-1
// teaching boards, where mashing IS the lesson.
function trivialByMashing(grid, mode) {
  for (const d of E.DIRS) {
    const g = E.cloneGrid(grid);
    for (let i = 0; i < 12; i++) {
      const { changed } = E.applySwipe(g, d);
      if (E.isWon(g, mode)) return d;
      if (!changed) break;
    }
  }
  return null;
}

// Does the board's OPTIMAL solution fire a cascade chain — a single swipe whose
// resolution produces ≥2 line-clear steps (one clear drops blocks into another
// full line)? Used to prove a board actually teaches the cascade, not just slides.
function usesCascade(grid, mode) {
  const res = solve(grid, mode);
  if (!res.solvable) return false;
  const g = E.cloneGrid(grid);
  for (const d of res.solution) {
    const r = E.applySwipe(g, d);
    const clears = (r.steps || []).filter(s => s.type === "clear").length;
    if (clears >= 2) return true;
  }
  return false;
}

// Is there an ORDERING TRAP — the board is solvable from the start, but some legal
// first swipe leads to a non-won, UNSOLVABLE state (a wrong move strands you)?
function hasOrderingTrap(grid, mode) {
  if (!E.solvable(grid, mode)) return false;
  for (const d of E.DIRS) {
    const g = E.cloneGrid(grid);
    const r = E.applySwipe(g, d);
    if (!r.changed || E.isWon(g, mode)) continue;
    if (!E.solvable(g, mode)) return true;
  }
  return false;
}

function reportAll() {
  let allOk = true;
  console.log("id            mode     par  states  mash  status");
  console.log("------------- -------- ---- ------- ----- ------");
  for (const b of BOARDS) {
    const grid = toGrid(b);
    const res = solve(grid, b.mode);
    const mash = trivialByMashing(grid, b.mode);
    const parMatch = res.par === b.par;
    const ok = res.solvable && parMatch;
    if (!ok) allOk = false;
    const status = !res.solvable ? "UNSOLVABLE"
      : !parMatch ? `PAR≠${b.par} (got ${res.par})`
      : "ok";
    const mashLbl = mash ? (res.par <= 1 ? mash : `${mash}!`) : "-";
    console.log(
      b.id.padEnd(13), b.mode.padEnd(8),
      String(res.par).padStart(3), String(res.states).padStart(6),
      mashLbl.padStart(4), " ", status
    );
  }
  return allOk;
}

if (require.main === module) {
  const arg = process.argv[2];
  if (arg) {
    const b = BOARDS.find(x => x.id === arg);
    if (!b) { console.error("no board:", arg); process.exit(1); }
    const res = solve(toGrid(b), b.mode);
    console.log(JSON.stringify({ id: b.id, mode: b.mode, ...res }, null, 2));
  } else {
    const ok = reportAll();
    process.exit(ok ? 0 : 1);
  }
}

module.exports = { solve, trivialByMashing, usesCascade, hasOrderingTrap };
