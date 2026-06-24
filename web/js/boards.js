/* Hand-made boards (PRD §3 MVP, 03 Stage 0). NO generator yet — these exist to
   answer "is the swipe-gravity-cascade SOLVE fun?". Each board is solver-proven
   solvable with a known par (scripts/dev/engine-tests.cjs asserts it; never ship
   an unsolvable board — CLAUDE.md non-negotiable).

   Notation (6 chars per row): '.' empty · '#' block · 'W' wall (fixed) · 'T'
   target block. `par` is the BFS-optimal swipe count, locked by tests.

   Two goals are in play (the HUD shows which):
   - mode "targets" — clear every glowing T; plain '#' are tools.
   - mode "clear"   — empty the board of every loose '#' (no targets).
   Walls are fixed and count toward filling a line. Every par≥2 board has a UNIQUE
   optimal solution line (no redraws) and is not solvable by mashing one direction;
   a few boards deliberately use a cascade chain or an ordering trap (asserted by
   the tests via scripts/dev/validate-board.cjs). The list is ordered as the
   progression ladder (par 1→6); the Levels screen unlocks them in order. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GravityBoards = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CH = { ".": 0, "#": 1, "W": 2, "T": 3 };

  function parse(rows) {
    return rows.map(line => line.split("").map(ch => {
      if (!(ch in CH)) throw new Error("bad board char: " + JSON.stringify(ch));
      return CH[ch];
    }));
  }

  // Ordered ladder, par 1→6. Early boards self-teach; the wall boards carry the
  // planning depth; clear-mode + cascade + ordering-trap boards are spread through
  // the middle for variety.
  const BOARDS = [
    // ---- par 1: teach the verb (mashing one direction IS the lesson) ----
    {
      id: "drop", name: "First Drop", mode: "targets", par: 1,
      hint: "Swipe to drop everything that way.",
      rows: [".....T", "......", "......", "......", "......", "#####."],
    },
    {
      id: "well", name: "Down the Well", mode: "targets", par: 1,
      rows: ["T.....", "#.....", "#.....", "#.....", "#.....", ".WWWWW"],
    },
    {
      id: "avalanche", name: "Avalanche", mode: "targets", par: 1,
      rows: [".T####", "#####.", ".#####", "#####.", ".#####", "#####."],
    },
    // ---- par 2 ----
    {
      id: "tuck", name: "Tucked Away", mode: "targets", par: 2,
      rows: ["T.....", "......", "......", "WWWWW.", "....##", "###..#"],
    },
    {
      id: "slot", name: "Slot Machine", mode: "targets", par: 2,
      rows: ["......", "...T..", "......", ".WWWWW", ".....#", "#####."],
    },
    {
      id: "leftchannel", name: "Left Channel", mode: "targets", par: 2,
      rows: ["......", "W....T", "W.....", "W.....", "W....#", "W....#"],
    },
    {
      id: "topshelf", name: "Over the Ledge", mode: "targets", par: 2,
      rows: ["......", "WWWWW.", "......", "......", "#.....", "T....."],
    },
    {
      id: "sweep", name: "Clean Sweep", mode: "clear", par: 2,
      hint: "New goal — clear every block off the board.",
      rows: [".....W", ".#####", "......", "......", "......", "......"],
    },
    {
      id: "sidepocket", name: "Side Pocket", mode: "clear", par: 2,
      rows: ["W.....", "W.....", "W..###", "W..###", "......", "......"],
    },
    // ---- par 3 ----
    {
      id: "bend", name: "Around the Bend", mode: "targets", par: 3,
      rows: ["T.....", "......", "......", ".WWWWW", "......", "####.."],
    },
    {
      id: "chain", name: "Chain Reaction", mode: "targets", par: 3,
      hint: "Chain the clears to reach the light.",
      rows: ["..#...", "..#.#.", "WWWWW.", "..#...", "..T.##", "......"],
    },
    {
      id: "hook", name: "Hook", mode: "targets", par: 3,
      rows: [".T....", "......", "WWWWW.", "......", ".WWWWW", "#....."],
    },
    {
      id: "vault", name: "Corner Vault", mode: "targets", par: 3,
      rows: ["WWW...", "WWW..#", ".....#", "......", "#.....", "T....."],
    },
    {
      id: "stovepipe", name: "Stovepipe", mode: "targets", par: 3,
      rows: ["..#...", "..#...", "..#...", "......", "WW...T", "WWWW.."],
    },
    {
      id: "undertow", name: "Undertow", mode: "targets", par: 3,
      rows: ["......", ".WWWWW", "......", ".....#", ".....#", "#T...#"],
    },
    {
      id: "handoff", name: "Hand Off", mode: "clear", par: 3,
      rows: ["###...", "###...", "......", "......", ".....W", "..WW.W"],
    },
    // ---- par 4 ----
    {
      id: "rightcap", name: "Right Cap", mode: "targets", par: 4,
      rows: ["....WW", "....WW", "....#.", ".#.#..", ".#.#..", "T...#."],
    },
    {
      id: "slabdetour", name: "Slab Detour", mode: "targets", par: 4,
      rows: [".#....", "#.WW..", "#.WW..", "#.WW..", "#.WW..", "##...T"],
    },
    {
      id: "cross", name: "Crossroads", mode: "targets", par: 4,
      hint: "Two lights — mind the order.",
      rows: ["#.....", "...#..", "#.....", ".T...T", ".WWWWW", "...#.."],
    },
    {
      id: "rapids", name: "Twin Rapids", mode: "targets", par: 4,
      rows: ["T.....", "WWWWW.", "......", "......", ".WWWWW", "#....#"],
    },
    {
      id: "quiet", name: "Quiet Corners", mode: "targets", par: 4,
      rows: [".WWWW.", "......", "...T..", "....#.", "T.....", ".WWWW."],
    },
    {
      id: "shelfstep", name: "Shelf and Step", mode: "targets", par: 4,
      rows: ["....#.", "WWWW#.", "......", "......", "......", "T....T"],
    },
    {
      id: "pinwheel", name: "Pinwheel", mode: "clear", par: 4,
      rows: ["WW##..", "..##..", "......", "......", "..##..", "..##WW"],
    },
    {
      id: "twinshelf", name: "Twin Shelf", mode: "clear", par: 4,
      rows: ["....#.", "....#.", "##....", "......", "WWWWW.", "WWWWW."],
    },
    {
      id: "roundtrip", name: "Round Trip", mode: "clear", par: 4,
      rows: ["......", ".###..", ".###..", "......", "W.....", "W.WW.."],
    },
    // ---- par 5 ----
    {
      id: "twin", name: "Twin Stars", mode: "targets", par: 5,
      rows: ["T....T", "......", "WWWWW.", "......", ".WWWWW", "#....#"],
    },
    {
      id: "ironcurtain", name: "Iron Curtain", mode: "targets", par: 5,
      rows: ["....T.", "....W.", "....W.", "......", "......", "#####."],
    },
    {
      id: "diagonal", name: "Diagonal Seed", mode: "targets", par: 5,
      rows: ["....T.", "....#.", "W.....", ".W....", "#..W..", "#.#..#"],
    },
    {
      id: "farbank", name: "Far Bank", mode: "targets", par: 5,
      rows: ["......", "#.....", "....#.", "......", "......", "T.W.W#"],
    },
    // ---- par 6: the finale ----
    {
      id: "double", name: "Double Trouble", mode: "targets", par: 6,
      rows: ["....T.", "......", "WWW.WW", "......", "WWW.WW", "##.###"],
    },
  ];

  function toGrid(board) { return parse(board.rows); }

  return { BOARDS, parse, toGrid, CH };
});
