/* Engine self-tests — the regression net (CLAUDE.md "Non-negotiables").
   Run via scripts/dev/test.sh after every code change. Covers:
     1. determinism golden — a pinned (board + swipe list) → fixed final state,
        the property par / daily boards / replays all depend on;
     2. core rules — stack-not-merge, walls immovable, no-op detection,
        targets travel with their block, walls count toward line fullness;
     3. board invariants — every shipped board is solver-solvable and its locked
        par is exact (never ship an unsolvable or mis-par'd board). */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { BOARDS, toGrid } = require(path.join(__dirname, "..", "..", "web", "js", "boards.js"));
const { solve, trivialByMashing, usesCascade, hasOrderingTrap } = require(path.join(__dirname, "solver.cjs"));

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error("  ✗ FAIL:", name); }
}
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) passed++;
  else { failed++; console.error(`  ✗ FAIL: ${name}\n      got  ${g}\n      want ${w}`); }
}
const parse = rows => rows.map(r => r.split("").map(ch => ({ ".": 0, "#": 1, W: 2, T: 3 }[ch])));

console.log("— determinism golden —");
{
  // corner board, swipes D then U. Pinned final state — exercises slide, full-line
  // clear (wall counts toward fullness), cascade, and a gravity reversal.
  const rows = ["#.....", "#.....", "#.....", "#.....", "#....W", ".####W"];
  const GOLDEN = "100000|100000|100000|100000|000002|000002";
  const g1 = parse(rows); for (const d of ["D", "U"]) E.applySwipe(g1, d);
  eq("golden corner D,U", E.key(g1), GOLDEN);
  // Re-running from a fresh parse is bit-identical (pure function of state+dir).
  const g2 = parse(rows); for (const d of ["D", "U"]) E.applySwipe(g2, d);
  eq("golden reproducible", E.key(g2), GOLDEN);
  // run() must not mutate its input grid.
  const src = parse(rows); const before = E.key(src); E.run(src, ["D", "U", "L"]);
  eq("run() does not mutate input", E.key(src), before);
}

console.log("— core rules —");
{
  // Stack, never merge: two blocks in a column settle to two adjacent cells.
  const g = parse(["#.....", "#.....", "......", "......", "......", "W....."]);
  E.settle(g, "D");
  eq("stack not merge (above wall)", E.key(g), "000000|000000|000000|100000|100000|200000");

  // Wall is immovable; a swipe that moves nothing reports changed=false (no-op).
  const w = parse(["W.....", "......", "......", "......", "......", "......"]);
  const r = E.applySwipe(w, "U");
  ok("wall immovable + no-op changed=false", !r.changed && E.key(w) === "200000|000000|000000|000000|000000|000000");

  // A target block travels with gravity and keeps its target identity (value 3).
  const t = parse(["...T..", "......", "......", "......", "......", "......"]);
  E.settle(t, "D");
  eq("target slides & keeps identity", E.key(t), "000000|000000|000000|000000|000000|000300");

  // Walls count toward fullness: 5 blocks + 1 wall in a row clears the blocks,
  // wall survives.
  const f = parse(["......", "......", "......", "......", "......", "#####W"]);
  const fr = E.applySwipe(f, "D");
  ok("wall completes a line; wall survives", fr.changed && E.key(f) === "000000|000000|000000|000000|000000|000002");
}

console.log("— runtime solvability (dead-end detection) —");
{
  // The dead state reached on-device: 3 loose blocks + 2 walls that can never
  // complete another line. Must read as unsolvable.
  const dead = parse(["......", "......", "......", "......", "....#W", "...##W"]);
  ok("dead end → solvable=false", E.solvable(dead, "clear") === false);
  // Every fresh board is solvable.
  for (const b of BOARDS) ok(`${b.id}: solvable() agrees`, E.solvable(toGrid(b), b.mode) === true);
  // A won board is trivially solvable.
  ok("empty board → solvable=true", E.solvable(parse(["......","......","......","......","......","......"]), "clear") === true);
}

console.log("— board invariants (solvable + par locked + no redraws) —");
{
  const lines = new Map();   // optimal solution line → board id (par≥2 only)
  for (const b of BOARDS) {
    const res = solve(toGrid(b), b.mode);
    ok(`${b.id}: solvable`, res.solvable);
    eq(`${b.id}: par == ${b.par}`, res.par, b.par);
    // Par-1 boards may be solvable by mashing one direction (the rule teaches
    // itself); par≥2 boards must require real planning (not single-direction)…
    if (b.par >= 2) {
      ok(`${b.id}: not mash-solvable`, trivialByMashing(toGrid(b), b.mode) === null);
      // …and must NOT be a redraw of another board (identical optimal line). This
      // is the net that would have caught Switchback≡Around-the-Bend, Two≡Tucked.
      const line = (res.solution || []).join("");
      ok(`${b.id}: unique optimal line${lines.has(line) ? " (dup of " + lines.get(line) + ")" : ""}`, !lines.has(line));
      lines.set(line, b.id);
    }
  }
  ok("have 30 boards", BOARDS.length === 30);
}

console.log("— tagged-mechanic boards (exercise the engine's deeper rules) —");
{
  // Boards added to use capabilities the original 12 never touched. These assert
  // the property holds so a future edit can't quietly defang them.
  const chain = BOARDS.find(b => b.id === "chain");
  ok("chain: optimal solution fires a cascade chain", chain && usesCascade(toGrid(chain), chain.mode));
  const cross = BOARDS.find(b => b.id === "cross");
  ok("cross: has an ordering trap (a wrong first swipe strands you)", cross && hasOrderingTrap(toGrid(cross), cross.mode));
  ok("≥2 clear-mode boards reclaim the 'clear the board' goal", BOARDS.filter(b => b.mode === "clear").length >= 2);
}

console.log(`\n${failed ? "✗" : "✓"} ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
