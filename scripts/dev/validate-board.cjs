/* Validate a candidate board before it's added to boards.js. Prints a JSON verdict
   with par, solvability, the optimal line, search size (states = difficulty proxy),
   whether it's mash-trivial, and whether it uses a cascade / has an ordering trap.

   Usage:
     node scripts/dev/validate-board.cjs <mode> <row0> <row1> <row2> <row3> <row4> <row5>
   where mode is "targets" or "clear" and each row is 6 chars of  . # W T
   Example:
     node scripts/dev/validate-board.cjs targets ".....T" "......" "......" "......" "......" "#####." */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { solve, trivialByMashing, usesCascade, hasOrderingTrap } = require(path.join(__dirname, "solver.cjs"));

const CH = { ".": 0, "#": 1, W: 2, T: 3 };
const mode = process.argv[2];
const rows = process.argv.slice(3);

function fail(msg) { console.log(JSON.stringify({ valid: false, error: msg })); process.exit(1); }
if (mode !== "targets" && mode !== "clear") fail("mode must be 'targets' or 'clear'");
if (rows.length !== 6) fail("need exactly 6 rows, got " + rows.length);
for (const r of rows) {
  if (r.length !== 6) fail("row must be 6 chars: " + JSON.stringify(r));
  for (const c of r) if (!(c in CH)) fail("bad char " + JSON.stringify(c) + " in " + JSON.stringify(r));
}

const grid = rows.map(r => r.split("").map(c => CH[c]));
const res = solve(grid, mode, 16);
const out = {
  valid: res.solvable,
  mode, rows,
  par: res.par,
  solvable: res.solvable,
  solution: res.solution,
  states: res.states,                 // search size — the honest difficulty proxy
  mash: trivialByMashing(grid, mode), // non-null = solvable by spamming one direction
  usesCascade: usesCascade(grid, mode),
  hasOrderingTrap: hasOrderingTrap(grid, mode),
};
console.log(JSON.stringify(out, null, 2));
