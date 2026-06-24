/* MORAINE — greybox game shell (PRD §5: grid + swipe-gravity + cascade + the
   "clear the board" win + swipe-count + juice). One verb: swipe a direction.
   The engine (engine.js) is the deterministic truth; this file animates its
   `steps` output and handles input / win / undo / level flow.

   The board is rendered as DOM tiles (one <div> per filled cell), NOT a canvas.
   On iOS WKWebView a single canvas bitmap gets resampled at sub-pixel positions
   whenever the screen re-composites, so every tile edge shimmers between moves.
   DOM elements are pixel-snapped individually by the compositor → rock-solid when
   idle. Motion is done with the Web Animations API (only runs DURING a swipe).

   NAME: "Moraine" (chosen 2026 — "Gravity Shift" was taken, 02-PRIOR-ART). Storage
   keys use the `moraine.*` prefix; a one-time migration in index.html copies any
   pre-rename `sediment.*` values forward so saved progress carries over. Bundle id
   is com.jfun.moraine. */
(function () {
  "use strict";
  const E = window.GravityEngine;
  const { BOARDS, toGrid } = window.GravityBoards;
  const Track = window.Track || { ev() {} };
  const Sfx = window.Sfx || { unlock() {}, slide() {}, clear() {}, blocked() {}, win() {}, dead() {}, tap() {}, toggle() { return false; }, get enabled() { return false; } };
  const N = 6;
  const { EMPTY, BLOCK, WALL, TARGET } = E;

  // ---- DOM ----
  const $ = id => document.getElementById(id);
  const boardEl = $("board");
  const elName = $("bnLabel"), elGoal = $("bnGoal"), elSwipes = $("cSwipes"), elPar = $("cPar");
  const elCounter = $("counter"), elHint = $("hint");
  const winCard = $("winCard"), winStars = $("winStars"), winTitle = $("winTitle"), winLine = $("winLine");

  // ---- progress (best swipes per board) ----
  const PKEY = "moraine.progress.v1";
  let progress = {};
  try { progress = JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) {}
  const saveProgress = () => { try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch (e) {} };

  // ---- state ----
  let cur = 0;                 // board index
  let board, grid, mode, par; // current board (grid = logical truth)
  let swipes = 0, won = false, stuck = false, firstSwipeDone = false, wallTipActive = false;
  const WALLTIP_KEY = "moraine.seen.walltip.v1";
  const hasWall = g => g.some(row => row.some(v => v === WALL));
  let history = [];           // undo stack: [{grid, swipes}]
  let playing = false;        // a swipe animation is in flight
  let animToken = 0;          // bumped on loadBoard to abandon stale animations

  // ?slow=N scales animation durations (dev aid for inspecting the cascade).
  const SLOW = Math.max(1, +(new URLSearchParams(location.search).get("slow")) || 1);
  const SLIDE_MS = 130 * SLOW, CLEAR_MS = 185 * SLOW;
  const EASE_SLIDE = "cubic-bezier(.22,.7,.3,1)";   // ~ease-out-cubic
  const EASE_CLEAR = "cubic-bezier(.4,0,.7,1)";
  const DIR_VEC = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

  const cloneGrid = g => g.map(r => r.slice());

  // ---------- board lifecycle ----------
  function loadBoard(i) {
    animToken++;                // abandon any in-flight swipe animation
    cur = (i + BOARDS.length) % BOARDS.length;
    board = BOARDS[cur];
    grid = toGrid(board);
    mode = board.mode; par = board.par;
    swipes = 0; won = false; stuck = false; firstSwipeDone = false;
    history = []; playing = false;
    winCard.classList.add("hidden");
    $("stuckCard").classList.add("hidden");
    $("finaleOverlay").classList.add("hidden");
    elName.textContent = board.name;
    elGoal.textContent = mode === "targets" ? "clear the lights" : "clear the board";
    elPar.textContent = par;
    updateHud();
    // First time the player meets a board with walls, call out that the grey
    // walls count toward completing a line (shown once ever; stays visible on
    // this board instead of fading on the first swipe).
    wallTipActive = false;
    let seenWallTip = false;
    try { seenWallTip = !!localStorage.getItem(WALLTIP_KEY); } catch (e) {}
    if (!seenWallTip && hasWall(grid)) {
      elHint.textContent = "Grey walls never move — but they still fill a line.";
      wallTipActive = true;
      try { localStorage.setItem(WALLTIP_KEY, "1"); } catch (e) {}
    } else {
      elHint.textContent = board.hint || (mode === "targets" ? "Clear every glowing block." : "Clear every block.");
    }
    elHint.style.opacity = "1";
    Track.ev("board_start", { board: board.id, par });
    resize();                   // geometry + sockets (first time / on change)
    renderBoard();              // tiles for this board
    // First board: a bobbing "swipe down" cue in the empty middle.
    if (cur === 0 && !firstSwipeDone) showSwipeCue(); else hideSwipeCue();
  }

  function updateHud() {
    elSwipes.textContent = swipes;
    elCounter.classList.toggle("over", swipes > par && !won);
  }

  // ---------- input → swipe ----------
  function trySwipe(dir) {
    if (won || stuck || playing) return;
    const work = cloneGrid(grid);
    const res = E.applySwipe(work, dir);
    if (!res.changed) {                 // nothing slid or cleared → not a swipe
      nudgeBoard(dir); buzz("medium", 8); Sfx.blocked();
      return;
    }
    history.push({ grid: cloneGrid(grid), swipes });
    if (history.length > 200) history.shift();
    swipes++;
    grid = work;                        // logical state is now final
    playing = true;
    Sfx.slide();
    if (!firstSwipeDone) { firstSwipeDone = true; hideSwipeCue(); if (!wallTipActive) elHint.style.opacity = "0"; }
    updateHud();
    buzz("light", 12);
    playSteps(res.steps);               // async; finishSwipe() at the end
  }

  function undo() {
    if (playing || !history.length) return;
    const prev = history.pop();
    grid = prev.grid; swipes = prev.swipes;
    // Undo is allowed AFTER a win too (rewind the finish to chase a lower count),
    // so clear the won/stuck state and their cards.
    stuck = false; won = false;
    $("stuckCard").classList.add("hidden");
    winCard.classList.add("hidden");
    $("finaleOverlay").classList.add("hidden");
    renderBoard(); updateHud(); buzz("light", 6);
  }
  function reset() {
    if (playing) return;
    Track.ev("board_reset", { board: board.id });
    loadBoard(cur);
  }

  function finishSwipe(tok) {
    if (tok !== animToken) return;      // board changed mid-animation
    playing = false;
    renderBoard();                      // canonical DOM == final grid
    if (E.isWon(grid, mode)) { onWin(); return; }
    updateHud();
    // The board can be swiped into a state with no winning sequence left. Detect
    // it immediately (bounded BFS) and tell the player, instead of letting them
    // swipe into a void. Undo/Reset recover.
    if (!E.solvable(grid, mode)) showStuck();
  }

  function showStuck() {
    stuck = true;
    buzz("error", [10, 30, 10]); Sfx.dead();
    setTimeout(() => $("stuckCard").classList.remove("hidden"), 240);
  }

  function onWin() {
    won = true;
    const beat = swipes <= par;
    const prevBest = progress[board.id];
    const improved = prevBest !== undefined && swipes < prevBest;   // beat your own record
    if (prevBest === undefined || swipes < prevBest) { progress[board.id] = swipes; saveProgress(); }
    Track.ev("board_win", { board: board.id, par, swipes, beatPar: beat });
    updateHud();
    // Last board → a proper finale (big congrats + run summary + "more coming"),
    // NOT the routine win card.
    if (cur >= BOARDS.length - 1) { buzz("success", [18, 40, 18, 40, 30]); Sfx.win(); showFinale(improved); return; }
    buzz("success", [18, 40, 18]); Sfx.win();
    winStars.textContent = swipes <= par ? "★★★" : swipes <= par + 1 ? "★★" : "★";
    // par is the solver's OPTIMUM (the true minimum) — the "goal". You can only ever
    // MATCH it, never beat it; matching = ★★★ "Perfect!".
    winTitle.textContent = swipes <= par ? "Perfect!" : "Solved!";
    winLine.innerHTML = `Solved in <b>${swipes}</b> · goal ${par}` + (improved ? ` · <b class="newbest">new best!</b>` : "");
    $("btnNext").textContent = "Next ›";
    setTimeout(() => winCard.classList.remove("hidden"), 360);
  }

  // ---------- grand finale ----------
  // Reaching the last board means every earlier board was already cleared (each
  // unlocks only after the previous is solved), so the totals below cover the
  // whole ladder.
  function showFinale(improved) {
    let stars = 0, perfect = 0;
    const maxStars = BOARDS.length * 3;
    for (const b of BOARDS) {
      const best = progress[b.id];
      if (best === undefined) continue;
      stars += best <= b.par ? 3 : best <= b.par + 1 ? 2 : 1;
      if (best <= b.par) perfect++;
    }
    $("finStars").textContent = stars;
    $("finStarsMax").textContent = maxStars;
    $("finPerfect").textContent = perfect;
    $("finPerfectMax").textContent = BOARDS.length;
    $("finFlawless").classList.toggle("hidden", perfect !== BOARDS.length);
    $("finLevelLine").textContent =
      `All ${BOARDS.length} levels solved · final board in ${swipes}` + (improved ? " · new best!" : "");
    Track.ev("game_complete", { stars, maxStars, perfect, levels: BOARDS.length, finalSwipes: swipes });
    launchConfetti();
    setTimeout(() => $("finaleOverlay").classList.remove("hidden"), 360);
  }

  function launchConfetti() {
    const layer = $("finConfetti");
    layer.innerHTML = "";
    const colors = ["var(--block)", "var(--target)", "var(--good)", "#b8c0ff"];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 30; i++) {
      const p = document.createElement("i");
      p.className = "confetti";
      const dur = 1.7 + Math.random() * 1.8;
      p.style.cssText =
        `left:${Math.random() * 100}%;` +
        `width:${6 + Math.random() * 5}px;height:${9 + Math.random() * 7}px;` +
        `background:${colors[i % colors.length]};` +
        `--drift:${(Math.random() * 2 - 1) * 50}px;--rot:${(Math.random() * 2 - 1) * 720}deg;` +
        `animation:confettiFall ${dur}s linear ${(Math.random() * 0.7).toFixed(2)}s forwards;`;
      frag.appendChild(p);
    }
    layer.appendChild(frag);
  }

  // Haptics. On iOS WKWebView navigator.vibrate is a no-op, so use the Capacitor
  // Haptics plugin's native Taptic feedback when running natively. This is a
  // no-bundler app (plain <script> tags), so the plugin's JS shim is NOT loaded
  // and Capacitor.Plugins.Haptics is undefined — resolve the bridge proxy
  // explicitly with Capacitor.registerPlugin('Haptics') (the documented no-build
  // path), falling back to Capacitor.Plugins just in case. `kind` picks the iOS
  // feel; `web` is the vibrate ms / pattern for the web + Android fallback.
  let _haptics;                 // undefined = unresolved, null = unavailable
  function haptics() {
    if (_haptics !== undefined) return _haptics;
    const Cap = window.Capacitor;
    if (!Cap || !(Cap.isNativePlatform && Cap.isNativePlatform())) { _haptics = null; return _haptics; }
    try { _haptics = (Cap.registerPlugin && Cap.registerPlugin("Haptics")) || (Cap.Plugins && Cap.Plugins.Haptics) || null; }
    catch (e) { _haptics = (Cap.Plugins && Cap.Plugins.Haptics) || null; }
    return _haptics;
  }
  function buzz(kind, web) {
    try {
      const H = haptics();
      if (H) {
        if (kind === "success" || kind === "warning" || kind === "error") H.notification({ type: kind.toUpperCase() });
        else H.impact({ style: kind === "medium" ? "MEDIUM" : kind === "heavy" ? "HEAVY" : "LIGHT" });
      } else if (navigator.vibrate) {
        navigator.vibrate(web);
      }
    } catch (e) {}
  }

  // ---------- geometry ----------
  let SIZE = 0, PAD = 0, GAP = 0, CELL = 0;
  let lastSize = -1;
  function resize() {
    const stage = $("stage");
    const avail = Math.min(stage.clientWidth, stage.clientHeight);
    const newSize = Math.max(220, Math.floor(avail));
    if (newSize === lastSize) return;   // nothing changed → don't rebuild
    lastSize = newSize;
    SIZE = newSize;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    boardEl.style.width = boardEl.style.height = SIZE + "px";
    boardEl.style.borderRadius = (SIZE * 0.05) + "px";
    // Center, but SNAP the container to the device-pixel grid.
    boardEl.style.left = Math.round((stage.clientWidth - SIZE) / 2 * dpr) / dpr + "px";
    boardEl.style.top = Math.round((stage.clientHeight - SIZE) / 2 * dpr) / dpr + "px";
    PAD = SIZE * 0.045;
    const inner = SIZE - PAD * 2;
    GAP = inner * 0.02;
    CELL = (inner - (N - 1) * GAP) / N;
    buildSockets();
    renderBoard();
  }
  const cellX = c => PAD + c * (CELL + GAP);
  const cellY = r => PAD + r * (CELL + GAP);
  const RADP = 22;            // tile/socket corner radius, % of cell (matches old 0.22)

  // ---------- DOM board ----------
  let tiles;                  // N×N of tile elements (or null) — current rendered state
  function place(el, r, c) {
    el.style.left = cellX(c) + "px";
    el.style.top = cellY(r) + "px";
    el.style.width = el.style.height = CELL + "px";
  }
  function buildSockets() {
    boardEl.querySelectorAll(".socket").forEach(el => el.remove());
    const frag = document.createDocumentFragment();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const el = document.createElement("div");
      el.className = "socket";
      place(el, r, c);
      frag.appendChild(el);
    }
    boardEl.appendChild(frag);
  }
  function makeTile(v) {
    const el = document.createElement("div");
    el.className = "tile " + (v === WALL ? "wall" : v === TARGET ? "target" : "block");
    return el;
  }
  function renderBoard() {
    boardEl.querySelectorAll(".tile").forEach(el => el.remove());
    tiles = Array.from({ length: N }, () => Array(N).fill(null));
    const frag = document.createDocumentFragment();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = grid[r][c];
      if (v === EMPTY) continue;
      const el = makeTile(v);
      place(el, r, c);
      frag.appendChild(el);
      tiles[r][c] = el;
    }
    boardEl.appendChild(frag);
  }

  // ---------- swipe cue (board 0, before first swipe) ----------
  function showSwipeCue() {
    hideSwipeCue();
    const cue = document.createElement("div");
    cue.id = "swipeCue";
    cue.innerHTML =
      '<svg viewBox="0 0 44 40" fill="none" stroke="#b3bbff" stroke-width="5" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="6,6 22,20 38,6"/><polyline points="6,20 22,34 38,20"/></svg>';
    boardEl.appendChild(cue);
  }
  function hideSwipeCue() { const c = $("swipeCue"); if (c) c.remove(); }

  // ---------- no-op feedback: a short directional shake of the board ----------
  function nudgeBoard(dir) {
    const [dx, dy] = DIR_VEC[dir];
    boardEl.style.setProperty("--nx", dx * 7 + "px");
    boardEl.style.setProperty("--ny", dy * 7 + "px");
    boardEl.classList.remove("nudge");
    void boardEl.offsetWidth;           // reflow → restart the keyframe
    boardEl.classList.add("nudge");
  }

  // ---------- animation (Web Animations API) ----------
  // Each engine step is played in order; the next starts when the previous
  // settles. No requestAnimationFrame — these only run during a swipe.
  async function playSteps(steps) {
    const tok = animToken;
    let clears = 0;
    for (const step of steps) {
      if (tok !== animToken) return;    // board switched out under us
      if (step.type === "slide") await animSlide(step.moves);
      else { Sfx.clear(clears++); await animClear(step.cells); }
    }
    finishSwipe(tok);
  }

  // Visuals run on the Web Animations API; the LOGICAL progression is driven by
  // setTimeout so a swipe still completes (and never soft-locks) even if the page
  // is hidden mid-swipe, where WAAPI animations pause and `.finished` never fires.
  function animSlide(moves) {
    const moved = moves.map(m => ({ m, el: tiles[m.fr][m.fc] }));
    for (const { m, el } of moved) {
      if (!el) continue;
      const dx = cellX(m.tc) - cellX(m.fc), dy = cellY(m.tr) - cellY(m.fr);
      el._anim = el.animate(
        [{ transform: "translate(0,0)" }, { transform: `translate(${dx}px,${dy}px)` }],
        { duration: SLIDE_MS, easing: EASE_SLIDE, fill: "forwards" }
      );
    }
    return new Promise(resolve => setTimeout(() => {
      for (const m of moves) tiles[m.fr][m.fc] = null;   // clear all sources first
      for (const { m, el } of moved) {
        if (!el) continue;
        if (el._anim) { el._anim.cancel(); el._anim = null; }   // drop held transform
        el.style.left = cellX(m.tc) + "px";
        el.style.top = cellY(m.tr) + "px";
        tiles[m.tr][m.tc] = el;
      }
      resolve();
    }, SLIDE_MS));
  }

  function animClear(cells) {
    const els = cells.map(cc => tiles[cc.r][cc.c]).filter(Boolean);
    for (const cc of cells) tiles[cc.r][cc.c] = null;
    for (const el of els) el.animate(
      [{ transform: "scale(1)", opacity: 1, filter: "brightness(1)" },
       { transform: "scale(1.36)", opacity: 0, filter: "brightness(2)" }],
      { duration: CLEAR_MS, easing: EASE_CLEAR, fill: "forwards" }
    );
    return new Promise(resolve => setTimeout(() => {
      els.forEach(el => el.remove());
      resolve();
    }, CLEAR_MS));
  }

  // ---------- pointer / keyboard ----------
  let down = null;
  boardEl.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; boardEl.setPointerCapture(e.pointerId); });
  boardEl.addEventListener("pointerup", e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down = null;
    // A finished board (won/stuck) whose result card was dismissed via its ✕ — the
    // close only PEEKS at the board; any tap or swipe brings the card back, so the
    // player is never stranded with a frozen board and no visible way forward.
    if (won) {
      const card = cur >= BOARDS.length - 1 ? $("finaleOverlay") : winCard;
      if (card.classList.contains("hidden")) card.classList.remove("hidden");
      return;
    }
    if (stuck) {
      const sc = $("stuckCard");
      if (sc.classList.contains("hidden")) sc.classList.remove("hidden");
      return;
    }
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (Math.max(adx, ady) < 20) return;
    trySwipe(adx > ady ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U"));
  });
  boardEl.addEventListener("pointercancel", () => { down = null; });

  // Kill iOS rubber-band scroll/zoom: a swipe should move blocks, never the page.
  // (Swipes are read from pointer events, so blocking touchmove doesn't affect
  // them.) The Levels list is allowed to scroll.
  document.addEventListener("touchmove", e => {
    if (!(e.target.closest && e.target.closest(".overlayCard"))) e.preventDefault();
  }, { passive: false });
  document.addEventListener("gesturestart", e => e.preventDefault());   // block pinch-zoom

  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    const map = { arrowup: "U", w: "U", arrowdown: "D", s: "D", arrowleft: "L", a: "L", arrowright: "R", d: "R" };
    if (map[k]) { e.preventDefault(); trySwipe(map[k]); }
    else if (k === "z") undo();
    else if (k === "r") reset();
    else if ((k === "n" || k === "enter") && won) goNext();
  });

  // Advance to the next board — but the LAST board doesn't silently wrap back to
  // board 1 (that read as a bug); it opens the Levels picker instead.
  function goNext() {
    if (cur >= BOARDS.length - 1) { $("finaleOverlay").classList.add("hidden"); openLevels(); }
    else loadBoard(cur + 1);
  }

  // ---------- buttons / levels ----------
  $("btnNext").onclick = goNext;
  $("btnStuckRetry").onclick = reset;
  $("btnWinClose").onclick = () => winCard.classList.add("hidden");
  $("btnStuckClose").onclick = () => $("stuckCard").classList.add("hidden");
  const btnSound = $("btnSound");
  const syncSound = () => { btnSound.textContent = Sfx.enabled ? "🔊" : "🔇"; };
  btnSound.onclick = () => { Sfx.toggle(); syncSound(); Sfx.tap(); };
  syncSound();

  $("btnLevels").onclick = openLevels;
  $("btnLevelsClose").onclick = () => $("levelsOverlay").classList.add("hidden");

  // ---- finale buttons ----
  const finaleOverlay = $("finaleOverlay");
  $("btnFinaleLevels").onclick = () => { finaleOverlay.classList.add("hidden"); openLevels(); };
  $("btnFinaleClose").onclick = () => finaleOverlay.classList.add("hidden");
  finaleOverlay.addEventListener("click", e => { if (e.target.id === "finaleOverlay") finaleOverlay.classList.add("hidden"); });

  // ---- how-to-play intro (shown once; reopenable from Levels) ----
  const INTRO_KEY = "moraine.seen.intro.v1";
  const openIntro = () => { $("introOverlay").classList.remove("hidden"); startDemo(); };
  const closeIntro = () => {
    $("introOverlay").classList.add("hidden");
    stopDemo();
    try { localStorage.setItem(INTRO_KEY, "1"); } catch (e) {}
  };
  $("btnIntroClose").onclick = closeIntro;
  $("btnHowto").onclick = () => { $("levelsOverlay").classList.add("hidden"); openIntro(); };
  $("introOverlay").addEventListener("click", e => { if (e.target.id === "introOverlay") closeIntro(); });
  $("levelsOverlay").addEventListener("click", e => { if (e.target.id === "levelsOverlay") $("levelsOverlay").classList.add("hidden"); });

  // A level is unlocked if it's the first one, or the PREVIOUS one has been solved.
  // (Re-tapping an unlocked level restarts it — the only voluntary restart path now
  // that the footer Restart is gone.)
  const isUnlocked = i => i === 0 || progress[BOARDS[i].id] !== undefined || progress[BOARDS[i - 1].id] !== undefined;
  const starsFor = (best, par) => best == null ? "" : best <= par ? "★★★" : best <= par + 1 ? "★★" : "★";

  function openLevels() {
    const gridEl = $("levelGrid");
    gridEl.innerHTML = "";
    const cleared = BOARDS.filter(b => progress[b.id] !== undefined).length;
    $("levelsTitle").textContent = "Levels · " + cleared + "/" + BOARDS.length;
    BOARDS.forEach((b, i) => {
      const best = progress[b.id];
      const solved = best !== undefined;
      const unlocked = isUnlocked(i);
      const div = document.createElement("button");
      div.className = "lvl" + (solved ? " solved" : "") + (!unlocked ? " locked" : "") + (i === cur ? " current" : "");
      if (!unlocked) {
        div.innerHTML = `<span class="lock">🔒</span><span class="nm">${b.name}</span>`;
        div.disabled = true;
      } else {
        div.innerHTML =
          `<span class="num">${i + 1}</span><span class="nm">${b.name}</span>` +
          (solved
            ? `<span class="lvstars">${starsFor(best, b.par)}</span><span class="lvbest">best ${best}</span>`
            : `<span class="par">goal ${b.par}</span>`);
        div.onclick = () => { $("levelsOverlay").classList.add("hidden"); loadBoard(i); };
      }
      gridEl.appendChild(div);
    });
    $("levelsOverlay").classList.remove("hidden");
  }

  // ---------- how-to-play animated demo ----------
  // A self-contained 4×4 loop showing the whole core move: swipe (arrow) → a
  // glowing block slides down and stacks → the bottom row (incl. a wall) fills →
  // it clears → the wall stays. Runs only while the intro card is open. (This is
  // still a small canvas — it's transient, always animating, and not the idle
  // board, so the compositor-shimmer issue doesn't apply.)
  const demoCanvas = $("demo"), dctx = demoCanvas.getContext("2d");
  const demoCapEl = $("demoCap");
  const DN = 4;
  let demoRAF = 0, demoT0 = 0, demoW = 0, demoCell = 0, demoPad = 0, demoGap = 0, demoCap = "";
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const dX = c => demoPad + c * (demoCell + demoGap);
  const dY = r => demoPad + r * (demoCell + demoGap);

  function demoSize() {
    const css = 220, dpr = Math.min(window.devicePixelRatio || 1, 3);
    demoCanvas.style.width = demoCanvas.style.height = css + "px";
    demoCanvas.width = demoCanvas.height = Math.floor(css * dpr);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    demoW = css; demoPad = css * 0.06; demoGap = css * 0.035;
    demoCell = (css - demoPad * 2 - (DN - 1) * demoGap) / DN;
  }

  function dRR(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    dctx.beginPath();
    dctx.moveTo(x + r, y);
    dctx.arcTo(x + w, y, x + w, y + h, r); dctx.arcTo(x + w, y + h, x, y + h, r);
    dctx.arcTo(x, y + h, x, y, r); dctx.arcTo(x, y, x + w, y, r);
    dctx.closePath();
  }

  function dPiece(kind, x, y, s, opt) {
    opt = opt || {};
    const sc = opt.scale || 1, a = opt.alpha == null ? 1 : opt.alpha, ss = s * sc, off = (s - ss) / 2;
    x += off; y += off; const rad = ss * 0.22;
    dctx.save(); dctx.globalAlpha = a;
    if (kind === "wall") {
      dRR(x, y, ss, ss, rad); dctx.fillStyle = "#3a4068"; dctx.fill();
      dctx.restore(); return;
    }
    const isT = kind === "target", flat = isT ? "#ffc24a" : "#5b6cff";
    if (opt.flash) { dctx.shadowColor = "rgba(110,125,255,.4)"; dctx.shadowBlur = s * 0.15 * 1.7; }
    dRR(x, y, ss, ss, rad); dctx.fillStyle = flat; dctx.fill(); dctx.shadowBlur = 0;
    dRR(x + ss * 0.12, y + ss * 0.1, ss * 0.76, ss * 0.3, rad * 0.6); dctx.fillStyle = "rgba(255,255,255,.08)"; dctx.fill();
    if (isT) {
      const cx = x + ss / 2, cy = y + ss / 2, d = ss * 0.2;
      dctx.beginPath(); dctx.moveTo(cx, cy - d); dctx.lineTo(cx + d, cy); dctx.lineTo(cx, cy + d); dctx.lineTo(cx - d, cy); dctx.closePath();
      dctx.fillStyle = "rgba(255,255,255,.9)"; dctx.fill();
    }
    dctx.restore();
  }

  function demoArrow(now) {
    const t = (now % 1000) / 1000, cx = demoW / 2;
    const y = demoW * 0.40 + demoW * 0.09 * easeOut(Math.min(1, t * 1.3)), a = demoCell * 0.3;
    dctx.save();
    dctx.globalAlpha = 0.2 + 0.5 * Math.sin(t * Math.PI);
    dctx.strokeStyle = "#b8c0ff"; dctx.lineWidth = 4; dctx.lineCap = "round"; dctx.lineJoin = "round";
    dctx.beginPath(); dctx.moveTo(cx - a, y - a * 0.5); dctx.lineTo(cx, y + a * 0.55); dctx.lineTo(cx + a, y - a * 0.5); dctx.stroke();
    dctx.restore();
  }

  // Bottom row preset: block · wall · block · (gap). A target falls into the gap.
  function demoFrame(now) {
    demoRAF = requestAnimationFrame(demoFrame);
    if (!demoT0) demoT0 = now;
    const t = (now - demoT0) % 3200;
    dctx.clearRect(0, 0, demoW, demoW);
    for (let r = 0; r < DN; r++) for (let c = 0; c < DN; c++) {
      dRR(dX(c), dY(r), demoCell, demoCell, demoCell * 0.22);
      dctx.fillStyle = "rgba(255,255,255,.03)"; dctx.fill();
      dctx.strokeStyle = "rgba(255,255,255,.05)"; dctx.lineWidth = 1; dctx.stroke();
    }
    const base = () => { dPiece("block", dX(0), dY(3), demoCell); dPiece("wall", dX(1), dY(3), demoCell); dPiece("block", dX(2), dY(3), demoCell); };
    let cap;
    if (t < 1000) {                       // idle + swipe arrow
      base(); dPiece("target", dX(3), dY(0), demoCell); demoArrow(now);
      cap = "Swipe to set gravity";
    } else if (t < 1420) {                // target slides down into the gap
      base();
      const f = easeOut((t - 1000) / 420);
      dPiece("target", dX(3), dY(0) + (dY(3) - dY(0)) * f, demoCell);
      cap = "Everything slides that way";
    } else if (t < 2000) {                // full row clears — the wall counts toward it
      const f = (t - 1420) / 580;
      dPiece("wall", dX(1), dY(3), demoCell);
      dctx.save();                        // ring the wall: it completes the row too
      dctx.globalAlpha = Math.sin(Math.min(1, f) * Math.PI) * 0.9;
      dRR(dX(1) - 3, dY(3) - 3, demoCell + 6, demoCell + 6, demoCell * 0.26);
      dctx.strokeStyle = "#aab3ff"; dctx.lineWidth = 3; dctx.stroke();
      dctx.restore();
      for (const c of [0, 2]) dPiece("block", dX(c), dY(3), demoCell, { scale: 1 + 0.3 * f, alpha: 1 - f, flash: f });
      dPiece("target", dX(3), dY(3), demoCell, { scale: 1 + 0.3 * f, alpha: 1 - f, flash: f });
      cap = "Row's full — the grey wall counts too";
    } else {                              // cleared; wall remains
      dPiece("wall", dX(1), dY(3), demoCell);
      cap = "Walls stay put — clear the rest";
    }
    if (cap !== demoCap) { demoCap = cap; demoCapEl.textContent = cap; }
  }

  function startDemo() { if (demoRAF) return; demoSize(); demoT0 = 0; demoRAF = requestAnimationFrame(demoFrame); }
  function stopDemo() { if (demoRAF) { cancelAnimationFrame(demoRAF); demoRAF = 0; } }

  // ---------- go ----------
  // iOS won't start audio until a user gesture; resume on first interaction.
  ["pointerdown", "keydown"].forEach(ev => window.addEventListener(ev, () => Sfx.unlock(), { passive: true }));
  window.addEventListener("resize", resize);

  loadBoard(0);
  let seenIntro = false;
  try { seenIntro = !!localStorage.getItem(INTRO_KEY); } catch (e) {}
  if (!seenIntro) openIntro();   // first launch → teach the rules
})();
