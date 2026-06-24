/* Dev scratch: solve an arbitrary raw board. Iterate board ideas fast.
   node scripts/dev/try.cjs <mode clear|targets> "<rows joined by />" */
const path = require("path");
const E = require(path.join(__dirname, "..", "..", "web", "js", "engine.js"));
const { parse } = require(path.join(__dirname, "..", "..", "web", "js", "boards.js"));
const { solve, trivialByMashing } = require(path.join(__dirname, "solver.cjs"));
const mode = process.argv[2];
const grid = parse(process.argv[3].split("/"));
const res = solve(grid, mode);
const mash = trivialByMashing(grid, mode);
console.log(JSON.stringify({ mode, solvable: res.solvable, par: res.par, solution: res.solution, mash, states: res.states }));
