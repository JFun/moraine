/* Gravity-puzzle engine — the deterministic heart (PRD §1, 03 "slide/settle + cascade").
   Shared by the web app (browser global `GravityEngine`) and the node toolchain
   (`require`) — same code path, so the determinism golden + solver reproduce the
   browser exactly.

   House rules (PRD §0, CLAUDE.md "The engine, precisely"):
   - One verb: a swipe sets gravity (U/D/L/R). Every loose block slides to the far
     wall/blocker and settles. Blocks STACK, never merge (not 2048).
   - After settling, any FULL row or column clears (walls count toward fullness,
     like Lanthorn; a line that is all walls never "clears" — guarded below).
   - Cascade: cleared cells leave gaps, remaining blocks slide again under the SAME
     gravity → may complete new lines → clear again → chain, until stable.
   - applySwipe is a PURE function of (grid, dir): same board + same swipe sequence
     → identical result, always. Par, daily boards and golden tests depend on it.

   Cell values: 0 empty · 1 loose block · 2 fixed wall · 3 target block (a block that
   is also a goal — "targets" mode wins when none remain). Targets slide & stack
   like plain blocks; their target-ness travels with them. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GravityEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EMPTY = 0, BLOCK = 1, WALL = 2, TARGET = 3;
  const DIRS = ["U", "D", "L", "R"];

  const isLoose  = v => v === BLOCK || v === TARGET;   // slides under gravity
  const isFilled = v => v !== EMPTY;                   // counts toward line fullness

  function cloneGrid(g) { return g.map(row => row.slice()); }

  // Coordinates along one settle "line", in increasing index order.
  // For U/D a line is a column (index = col); for L/R a line is a row (index = row).
  function lineCoords(N, dir, lineIndex) {
    const coords = [];
    if (dir === "U" || dir === "D") for (let r = 0; r < N; r++) coords.push([r, lineIndex]);
    else for (let c = 0; c < N; c++) coords.push([lineIndex, c]);
    return coords;
  }

  // Slide every loose block toward `dir` until it hits an edge, wall, or settled
  // block. Mutates `grid` in place. Returns the list of moves (for animation):
  // {fr,fc,tr,tc,val}. Walls partition each line into independent segments; within
  // a segment loose blocks compact (stably) toward the gravity end.
  function settle(grid, dir) {
    const N = grid.length;
    const toward = (dir === "D" || dir === "R");   // compact toward the high index?
    const moves = [];
    for (let li = 0; li < N; li++) {
      const coords = lineCoords(N, dir, li);
      const vals = coords.map(([r, c]) => grid[r][c]);
      let start = 0;
      for (let i = 0; i <= N; i++) {
        if (i === N || vals[i] === WALL) {
          // segment is the half-open range [start, i) — never contains a wall
          const seg = [];
          for (let k = start; k < i; k++) if (vals[k] !== EMPTY) seg.push({ val: vals[k], from: k });
          for (let k = start; k < i; k++) { const [r, c] = coords[k]; grid[r][c] = EMPTY; }
          for (let j = 0; j < seg.length; j++) {
            const dest = toward ? (i - seg.length + j) : (start + j);
            const [r, c] = coords[dest];
            grid[r][c] = seg[j].val;
            if (dest !== seg[j].from) {
              const [fr, fc] = coords[seg[j].from];
              moves.push({ fr, fc, tr: r, tc: c, val: seg[j].val });
            }
          }
          start = i + 1;
        }
      }
    }
    return moves;
  }

  // Full rows/cols that contain at least one clearable (loose) cell. The loose
  // guard means an all-wall line is never reported (it would clear nothing and
  // loop the cascade forever).
  function fullLines(grid) {
    const N = grid.length;
    const rows = [], cols = [];
    for (let r = 0; r < N; r++) {
      let full = true, loose = false;
      for (let c = 0; c < N; c++) { const v = grid[r][c]; if (v === EMPTY) { full = false; break; } if (isLoose(v)) loose = true; }
      if (full && loose) rows.push(r);
    }
    for (let c = 0; c < N; c++) {
      let full = true, loose = false;
      for (let r = 0; r < N; r++) { const v = grid[r][c]; if (v === EMPTY) { full = false; break; } if (isLoose(v)) loose = true; }
      if (full && loose) cols.push(c);
    }
    return { rows, cols };
  }

  // Empty every loose cell in the given rows/cols (walls survive). Returns the
  // cleared cells (for the clear flash). Intersection cells are cleared once.
  function clearLines(grid, rows, cols) {
    const N = grid.length, cleared = [];
    const wipe = (r, c) => { const v = grid[r][c]; if (isLoose(v)) { cleared.push({ r, c, val: v }); grid[r][c] = EMPTY; } };
    for (const r of rows) for (let c = 0; c < N; c++) wipe(r, c);
    for (const c of cols) for (let r = 0; r < N; r++) wipe(r, c);
    return cleared;
  }

  // One swipe: settle, then clear+cascade under the same gravity until stable.
  // Mutates `grid`. Returns {steps, changed}. `steps` is the animation script:
  //   {type:"slide", moves:[...]}  ·  {type:"clear", cells:[...], rows, cols}
  // `changed` is false iff the swipe was a complete no-op (nothing moved/cleared)
  // — callers should not count a no-op swipe.
  function applySwipe(grid, dir) {
    const steps = [];
    let changed = false;
    const m0 = settle(grid, dir);
    if (m0.length) { steps.push({ type: "slide", moves: m0 }); changed = true; }
    while (true) {
      const { rows, cols } = fullLines(grid);
      if (!rows.length && !cols.length) break;
      const cleared = clearLines(grid, rows, cols);
      if (!cleared.length) break;            // safety: nothing actually removed
      changed = true;
      steps.push({ type: "clear", cells: cleared, rows, cols });
      const m = settle(grid, dir);
      if (m.length) steps.push({ type: "slide", moves: m });
    }
    return { steps, changed };
  }

  function countLoose(grid)  { let n = 0; for (const row of grid) for (const v of row) if (isLoose(v))  n++; return n; }
  function countTargets(grid) { let n = 0; for (const row of grid) for (const v of row) if (v === TARGET) n++; return n; }

  // Win: "targets" mode → every target block cleared; "clear" mode → board empty
  // of all loose blocks (walls may remain — they're scenery).
  function isWon(grid, mode) {
    return mode === "targets" ? countTargets(grid) === 0 : countLoose(grid) === 0;
  }

  // Apply a whole swipe sequence to a copy (used by the golden test + solver).
  function run(grid, dirs) {
    const g = cloneGrid(grid);
    for (const d of dirs) applySwipe(g, d);
    return g;
  }

  // Stable string key of a board state (solver visited-set / transposition table).
  function key(grid) { return grid.map(row => row.join("")).join("|"); }

  // Runtime solvability check (for UX dead-end detection). BFS over swipe
  // sequences, bounded by maxStates so it can never hang the UI. Returns true if a
  // winning sequence exists. FAIL-OPEN: if the bound is hit without deciding,
  // returns true — we'd rather miss a dead end than falsely declare one. 6×6
  // boards explore only tens of states, so the bound is never hit in practice.
  function solvable(grid, mode, maxStates) {
    maxStates = maxStates || 100000;
    if (isWon(grid, mode)) return true;
    const seen = new Set([key(grid)]);
    let frontier = [grid], count = 1;
    while (frontier.length) {
      const next = [];
      for (const g of frontier) {
        for (const d of DIRS) {
          const g2 = cloneGrid(g);
          if (!applySwipe(g2, d).changed) continue;
          if (isWon(g2, mode)) return true;
          const k = key(g2);
          if (seen.has(k)) continue;
          seen.add(k);
          if (++count > maxStates) return true; // fail-open
          next.push(g2);
        }
      }
      frontier = next;
    }
    return false;
  }

  return {
    EMPTY, BLOCK, WALL, TARGET, DIRS,
    isLoose, isFilled, cloneGrid,
    settle, fullLines, clearLines, applySwipe,
    countLoose, countTargets, isWon, run, key, solvable,
  };
});
