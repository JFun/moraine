/* Dev scratch: trace a board through a swipe sequence to eyeball the engine.
   node scripts/dev/trace.cjs "<6 rows joined by /> " <dirs e.g. DLU>
   or:  node scripts/dev/trace.cjs <boardId> <dirs> */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { BOARDS, toGrid, parse } = require(path.join(__dirname, "..", "..", "web", "js", "boards.js"));
const GLYPH = { 0: ".", 1: "#", 2: "W", 3: "T" };
const show = g => g.map(r => r.map(v => GLYPH[v]).join("")).join("\n");

const arg = process.argv[2] || "";
let grid, mode = "clear";
const b = BOARDS.find(x => x.id === arg);
if (b) { grid = toGrid(b); mode = b.mode; }
else grid = parse(arg.split("/"));

console.log("start:\n" + show(grid) + "\n");
const dirs = (process.argv[3] || "").split("");
for (const d of dirs) {
  const { changed } = E.applySwipe(grid, d);
  console.log(`swipe ${d} (changed=${changed}):\n` + show(grid) +
    `   loose=${E.countLoose(grid)} targets=${E.countTargets(grid)} won=${E.isWon(grid, mode)}\n`);
}
