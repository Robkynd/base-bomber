/* Base Bomber v1 — Bomberman-like, single player vs AI.
   Pure HTML/CSS/JS. No build step, no framework, no external assets.
   Canvas 2D only. Exposes window.BaseBomber for debugging / tests. */
(function () {
  'use strict';

  /* ================= Config ================= */
  var COLS = 19, ROWS = 15, TILE = 32;
  var BOMB_FUSE = 2000;      // ms
  var EXPLOSION_MS = 500;     // ms
  var PLAYER_SIZE = 24;
  var BASE_SPEED = 150;       // px / s
  var MAX_SPEED = 230;
  var INVULN_MS = 2000;

  /* Pacing: matches must end with a winner in ~2-3 min. */
  var BASE_RANGE = 3;         // fighter bomb range (was 2: blasts too small to catch anyone)
  var SD_START_SEC = 90;      // sudden death starts if no winner by this match time
  var SD_RANGE = 4;           // bomb range during sudden death
  var SD_FUSE = 1200;         // bomb fuse (ms) during sudden death
  var SD_STRIKE_MS = 6000;    // storm strike interval (ms) during sudden death
  var SD_MONSTER_MULT = 1.5;  // monster speed multiplier during sudden death

  var T_EMPTY = 0, T_HARD = 1, T_SOFT = 2, T_MED = 3, T_TOUGH = 4;
  var P_TOKEN = 'token', P_WALLPASS = 'wallpass';
  var WALLPASS_MS = 12000; // 12 detik tembus tembok
  var BLOCK_MAX_HP = [0, 0, 1, 2, 3]; // by tile type: soft 1 hit, med 2 hits, tough 3 hits
  function isDestructible(t) { return t === T_SOFT || t === T_MED || t === T_TOUGH; }

  /* Arena map: 4 fighter spawns (corners) + central monster gate. */
  var SPAWNS = [
    { x: 1, y: 1, label: 'P1', color: '#3b82f6' },
    { x: 17, y: 1, label: 'P2', color: '#ef4444' },
    { x: 1, y: 13, label: 'P3', color: '#22c55e' },
    { x: 17, y: 13, label: 'P4', color: '#eab308' }
  ];
  var MONSTER_GATE = [{ x: 9, y: 6 }, { x: 9, y: 7 }, { x: 9, y: 8 }];

  /* Deterministic RNG so each map level always has the same layout. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= State ================= */
  var state = {
    screen: 'menu', // menu | playing | paused | levelclear | gameover
    level: 1,
    score: 0,
    lives: 3,
    timeSec: 0,
    timeMs: 0,
    grid: [],
    powerups: {},   // "x,y" -> { type, hidden, value? }
    blockHp: {},    // "x,y" -> current HP of a destructible block
    tokens: 0,      // total token currency collected
    stageTokens: 0, // token pool for this stage (random 1000-2000)
    stageTokensGot: 0, // tokens collected this stage
    bombs: [],      // { x, y, fuse, range, passable }
    explosions: {}, // "x,y" -> until (timeMs)
    enemies: [],    // { tx,ty,fromX,fromY,toX,toY,dx,dy,progress,speed,px,py }
    fighters: [],   // auto-battler fighters (see makeFighter); player is fighters[0]
    player: null,   // { px,py,dir,speed,maxBombs,range,invulnUntil,moving,animT }
    walletAddress: null, // logged-in Base wallet address (persisted in localStorage)
    guest: false,   // guest mode: can play without a wallet
    email: null,    // logged-in email identity (persisted in localStorage, no OTP yet)
    suddenDeath: false, // sudden-death backstop active (escalates lethality so a match ends)
    sdNextStrike: 0, // timeMs of the next storm strike during sudden death
    hitCauses: { bomb: 0, monster: 0, storm: 0 }, // hits landed, by cause (debug/test)
    deathCauses: { bomb: 0, monster: 0, storm: 0 }, // KOs, by cause (debug/test)
    blastExposures: 0 // fighters standing on a blast cell when a bomb went off (debug/test)
  };

  var input = { up: false, down: false, left: false, right: false };

  /* Player's chosen AI strategy (persists across levels/restarts in this session). */
  var playerStrategy = 'balanced';
  var STRATEGIES = ['balanced', 'aggressive', 'greedy', 'defensive'];

  /* ================= Views / login ================= */
  var VIEWS = ['splash', 'dashboard', 'game', 'leaderboard', 'profile'];
  var viewEls = {};
  var currentView = 'dashboard';
  var pendingPlay = false;  // Play was requested while logged out; start the game after login
  var pendingView = null;   // view to return to after login (default: dashboard)

  // Kunci localStorage + event wallet sengaja tetap 'bombchain.*':
  // nama game diganti ke Base Bomber 2026-11-26, tapi kunci ini
  // dipertahankan supaya login + statistik yang sudah tersimpan tidak ke-reset.
  var WALLET_KEY = 'bombchain.wallet';
  var GUEST_KEY = 'bombchain.guest';
  var EMAIL_KEY = 'bombchain.email';
  var STATS_KEY = 'bombchain.stats';
  var stats = { tokens: 0, score: 0, level: 0, played: false }; // best local stats, persisted

  /* ================= DOM ================= */
  var canvas, ctx;
  var els = {};
  var hudCache = {};

  function $(id) { return document.getElementById(id); }

  function init() {
    canvas = $('gameCanvas');
    if (canvas) ctx = canvas.getContext('2d');
    els.hudLives = $('hudLives');
    els.hudScore = $('hudScore');
    els.hudTime = $('hudTime');
    els.hudLevel = $('hudLevel');
    els.hudWallpass = $('hudWallpass');
    els.hudSudden = $('hudSudden');
    els.hudTokens = $('hudTokens');
    els.msg = $('msg');
    els.overlay = $('overlay');
    els.overlayTitle = $('overlayTitle');
    els.overlayText = $('overlayText');
    els.overlayBtn = $('overlayBtn');
    els.overlayBtn2 = $('overlayBtn2');
    viewEls = {
      splash: $('view-splash'),
      dashboard: $('view-dashboard'),
      game: $('game'),
      leaderboard: $('view-leaderboard'),
      profile: $('view-profile')
    };
    els.dashPlayerTitle = $('dashPlayerTitle');
    els.dashPlayerStats = $('dashPlayerStats');
    els.dashLoginBtn = $('dashLoginBtn');
    els.dashBoardBtn = $('dashBoardBtn');
    els.dashProfileBtn = $('dashProfileBtn');
    els.loginMsg = $('loginMsg');
    els.loginGuestBtn = $('loginGuestBtn');
    els.loginEmailForm = $('loginEmailForm');
    els.loginEmailInput = $('loginEmailInput');
    els.loginModal = $('loginModal');
    els.loginModalBackdrop = $('loginModalBackdrop');
    els.loginModalClose = $('loginModalClose');
    els.profileAddr = $('profileAddr');
    els.profileStats = $('profileStats');
    els.profileLoginBtn = $('profileLoginBtn');
    els.profileLogoutBtn = $('profileLogoutBtn');
    wireButtons();
    wireStrategy();
    wireKeys();
    wireNav();
    wireLoginButtons();
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('bombchain:wallet', onWalletEvent);
    }
    loadStats();
    restoreLogin();
    showView('splash');
    renderDashboard();
    renderProfile();
    // Attract-mode backdrop: a map rendered behind the dashboard.
    var m = generateMap(1);
    state.grid = m.grid;
    state.powerups = m.powerups;
    state.blockHp = m.blockHp;
    state.tokens = 0;
    state.stageTokens = m.stageTokenPool;
    state.stageTokensGot = 0;
    state.enemies = [];
    state.player = freshPlayer();
    updateHUD(true);
    requestAnimationFrame(loop);
  }

  /* ================= Helpers ================= */
  function shuffle(arr, rng) {
    var rand = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function freshPlayer() {
    return {
      px: 1 * TILE + (TILE - PLAYER_SIZE) / 2,
      py: 1 * TILE + (TILE - PLAYER_SIZE) / 2,
      dir: 'down', speed: BASE_SPEED, maxBombs: 1, range: BASE_RANGE,
      invulnUntil: 0, wallpassUntil: 0, moving: false, animT: 0
    };
  }

  /* ================= Fighters (auto-battler, stage 1) ================= */
  function makeFighter(spawn, id, name, color, personality) {
    return {
      id: id, name: name, color: color, personality: personality,
      spawn: spawn,
      px: spawn.x * TILE + (TILE - PLAYER_SIZE) / 2,
      py: spawn.y * TILE + (TILE - PLAYER_SIZE) / 2,
      dir: 'down', speed: BASE_SPEED, maxBombs: 1, range: BASE_RANGE,
      invulnUntil: 0, wallpassUntil: 0, moving: false, animT: 0,
      lives: 3, alive: true, tokens: 0,
      nft: null, // placeholder: fighter will be a plain NFT later; no contract/mint/tx here
      ai: { thinkT: 0, dir: null, wantBomb: false }
    };
  }

  function fighterTile(f) {
    return { x: Math.floor((f.px + PLAYER_SIZE / 2) / TILE), y: Math.floor((f.py + PLAYER_SIZE / 2) / TILE) };
  }

  function fighterTileSolid(f, tx, ty) {
    if (!f) return true;
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    var t = state.grid[ty][tx];
    if (t === T_HARD) return true;
    if (isDestructible(t)) {
      if (state.timeMs < f.wallpassUntil) return false;
      return true;
    }
    for (var i = 0; i < state.bombs.length; i++) {
      var b = state.bombs[i];
      if (b.x === tx && b.y === ty && !b.passable) return true;
    }
    return false;
  }

  function hitsSolidFor(f, px, py) {
    if (!f) return true;
    var x0 = Math.floor(px / TILE), x1 = Math.floor((px + PLAYER_SIZE - 1) / TILE);
    var y0 = Math.floor(py / TILE), y1 = Math.floor((py + PLAYER_SIZE - 1) / TILE);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (fighterTileSolid(f, tx, ty)) return true;
      }
    }
    return false;
  }

  /* ================= Map ================= */
  function generateMap(level, seed) {
    var rng = mulberry32(seed == null ? level * 1000 + 7 : seed);
    var grid = [], x, y;
    for (y = 0; y < ROWS; y++) {
      grid[y] = [];
      for (x = 0; x < COLS; x++) {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ||
            (x % 2 === 0 && y % 2 === 0)) grid[y][x] = T_HARD;
        else grid[y][x] = T_EMPTY;
      }
    }
    // Keep spawn safe zones + monster gate free of soft blocks.
    // Safe zone = spawn cell + its 2 neighbours toward the arena.
    var keepClear = {};
    SPAWNS.forEach(function (s) {
      keepClear[s.x + ',' + s.y] = true;
      keepClear[(s.x + (s.x === 1 ? 1 : -1)) + ',' + s.y] = true;
      keepClear[s.x + ',' + (s.y + (s.y === 1 ? 1 : -1))] = true;
    });
    MONSTER_GATE.forEach(function (g) { keepClear[g.x + ',' + g.y] = true; });
    var free = [];
    for (y = 1; y < ROWS - 1; y++) {
      for (x = 1; x < COLS - 1; x++) {
        if (grid[y][x] === T_EMPTY && !keepClear[x + ',' + y]) free.push([x, y]);
      }
    }
    shuffle(free, rng);
    var powerups = {};
    var blockHp = {};
    var softCount = Math.floor(free.length * 0.68);
    // Tier split by exact count: 60% soft (1 hit), 30% med (2 hits), 10% tough (3 hits).
    var nSoft = Math.round(softCount * 0.6);
    var nMed = Math.round(softCount * 0.3);
    for (var i = 0; i < softCount; i++) {
      var c = free[i];
      var tier = i < nSoft ? T_SOFT : i < nSoft + nMed ? T_MED : T_TOUGH;
      grid[c[1]][c[0]] = tier;
      blockHp[c[0] + ',' + c[1]] = BLOCK_MAX_HP[tier];
      if (rng() < 0.28) {
        var types = [P_TOKEN, P_WALLPASS];
        powerups[c[0] + ',' + c[1]] = { type: types[Math.floor(rng() * 2)], hidden: true };
      }
    }
    // Token pool for this stage: random 1000-2000, split across the token pickups.
    // The BIGGEST reward hides in a TOUGH (3-hit) wall.
    var tokenKeys = Object.keys(powerups).filter(function (k) { return powerups[k].type === P_TOKEN; });
    function isToughKey(k) {
      var parts = k.split(',');
      return grid[+parts[1]][+parts[0]] === T_TOUGH;
    }
    if (!tokenKeys.some(isToughKey)) {
      var toughPowerKeys = Object.keys(powerups).filter(isToughKey);
      if (toughPowerKeys.length > 0) {
        var conv = toughPowerKeys[Math.floor(rng() * toughPowerKeys.length)];
        powerups[conv].type = P_TOKEN;
        tokenKeys.push(conv);
      } else {
        var toughCells = [];
        for (var yy = 1; yy < ROWS - 1; yy++) for (var xx = 1; xx < COLS - 1; xx++) {
          if (grid[yy][xx] === T_TOUGH) toughCells.push(xx + ',' + yy);
        }
        var add = toughCells[Math.floor(rng() * toughCells.length)];
        powerups[add] = { type: P_TOKEN, hidden: true };
        tokenKeys.push(add);
      }
    }
    var pool = 1000 + Math.floor(rng() * 1001);
    var weights = [], wsum = 0;
    tokenKeys.forEach(function () { var w = 0.5 + rng(); weights.push(w); wsum += w; });
    var values = [];
    var assigned = 0;
    tokenKeys.forEach(function (k, i) {
      var v = (i === tokenKeys.length - 1) ? pool - assigned : Math.round(pool * weights[i] / wsum);
      values.push(v);
      assigned += v;
    });
    var maxIdx = 0;
    values.forEach(function (v, i) { if (v > values[maxIdx]) maxIdx = i; });
    var toughTokenKeys = tokenKeys.filter(isToughKey);
    var toughPick = toughTokenKeys[Math.floor(rng() * toughTokenKeys.length)];
    var toughIdx = tokenKeys.indexOf(toughPick);
    if (toughIdx !== maxIdx) {
      var tmp = values[toughIdx]; values[toughIdx] = values[maxIdx]; values[maxIdx] = tmp;
    }
    tokenKeys.forEach(function (k, i) { powerups[k].value = values[i]; });
    return { grid: grid, powerups: powerups, blockHp: blockHp, stageTokenPool: pool, spawns: SPAWNS, monsterGate: MONSTER_GATE };
  }

  function tileSolid(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    var t = state.grid[ty][tx];
    if (t === T_HARD || isDestructible(t)) return true;
    for (var i = 0; i < state.bombs.length; i++) {
      var b = state.bombs[i];
      if (b.x === tx && b.y === ty && !b.passable) return true;
    }
    return false;
  }

  /* ================= Enemies ================= */
  function randomValidDir(tx, ty, notDx, notDy) {
    var dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      if (d[0] === notDx && d[1] === notDy) continue;
      if (!tileSolid(tx + d[0], ty + d[1])) return d;
    }
    return null;
  }

  function spawnEnemies(level) {
    var count = Math.min(3 + level, 6); // level 1 = 4 bots (was 3: too little pressure)
    var spots = [], x, y;
    // Monsters emerge from the central gate, then spread out.
    var gate = { x: 9, y: 7 };
    function isSpawnCorner(cx, cy) {
      return (cx <= 2 && cy <= 2) || (cx >= COLS - 3 && cy <= 2) ||
             (cx <= 2 && cy >= ROWS - 3) || (cx >= COLS - 3 && cy >= ROWS - 3);
    }
    for (y = 1; y < ROWS - 1; y++) {
      for (x = 1; x < COLS - 1; x++) {
        if (state.grid[y][x] !== T_EMPTY || isSpawnCorner(x, y)) continue;
        if (Math.abs(x - gate.x) + Math.abs(y - gate.y) <= 5) spots.push([x, y]);
      }
    }
    // Fallback: any empty cell outside the spawn corners.
    var seen = {};
    spots.forEach(function (s) { seen[s[0] + ',' + s[1]] = true; });
    if (spots.length < count) {
      for (y = 1; y < ROWS - 1; y++) {
        for (x = 1; x < COLS - 1; x++) {
          if (state.grid[y][x] === T_EMPTY && !isSpawnCorner(x, y) && !seen[x + ',' + y]) spots.push([x, y]);
        }
      }
    }
    shuffle(spots);
    var list = [];
    for (var i = 0; i < count && i < spots.length; i++) {
      var s = spots[i];
      var e = {
        tx: s[0], ty: s[1], fromX: s[0], fromY: s[1],
        toX: s[0], toY: s[1], dx: 0, dy: 0,
        progress: 0, speed: Math.min(1.7 + (level - 1) * 0.2, 2.6),
        px: s[0] * TILE, py: s[1] * TILE
      };
      var d = randomValidDir(e.tx, e.ty, 0, 0);
      if (d) { e.dx = d[0]; e.dy = d[1]; e.toX = e.tx + d[0]; e.toY = e.ty + d[1]; }
      list.push(e);
    }
    return list;
  }

  function enemyTile(e) {
    return { x: Math.floor((e.px + TILE / 2) / TILE), y: Math.floor((e.py + TILE / 2) / TILE) };
  }

  /* ================= Player ================= */
  function playerTile() {
    var p = state.player;
    return { x: Math.floor((p.px + PLAYER_SIZE / 2) / TILE), y: Math.floor((p.py + PLAYER_SIZE / 2) / TILE) };
  }

  /* Player collision: wall-pass lets you walk through destructible blocks. */
  function playerTileSolid(tx, ty) {
    if (!state.player) return true;
    return fighterTileSolid(state.player, tx, ty);
  }

  function hitsSolid(px, py) {
    return hitsSolidFor(state.player, px, py);
  }

  function moveFighter(f, dt) {
    var dx = 0, dy = 0;
    if (f.ai.dir === 'left') dx = -1;
    else if (f.ai.dir === 'right') dx = 1;
    else if (f.ai.dir === 'up') dy = -1;
    else if (f.ai.dir === 'down') dy = 1;
    f.moving = false;
    if (dx === 0 && dy === 0) return;
    f.dir = dx !== 0 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    // Grid alignment: when moving along one axis, steer the other axis toward
    // the current tile's center first, so the fighter fits through corridors
    // instead of catching a pillar/wall corner while fleeing. (A fighter
    // straddling a tile boundary would otherwise get stuck pushing against
    // a pillar it is only partly overlapping.)
    var ft = fighterTile(f);
    var step = f.speed * dt;
    if (dy !== 0) {
      var cx = ft.x * TILE + (TILE - PLAYER_SIZE) / 2;
      if (Math.abs(f.px - cx) > 1) {
        var npx = f.px + Math.max(-step, Math.min(step, cx - f.px));
        if (!hitsSolidFor(f, npx, f.py)) f.px = npx;
        if (Math.abs(f.px - cx) > 1) { f.moving = true; f.animT += dt; return; }
      }
    } else {
      var cy = ft.y * TILE + (TILE - PLAYER_SIZE) / 2;
      if (Math.abs(f.py - cy) > 1) {
        var npy = f.py + Math.max(-step, Math.min(step, cy - f.py));
        if (!hitsSolidFor(f, f.px, npy)) f.py = npy;
        if (Math.abs(f.py - cy) > 1) { f.moving = true; f.animT += dt; return; }
      }
    }
    var nx = f.px + dx * f.speed * dt;
    var ny = f.py + dy * f.speed * dt;
    if (!hitsSolidFor(f, nx, f.py)) f.px = nx;
    if (!hitsSolidFor(f, f.px, ny)) f.py = ny;
    f.moving = true;
    f.animT += dt;
  }

  /* Legacy wrapper: direct input is ignored in auto-battler mode (update uses AI). */
  function movePlayer(dt) {
    var p = state.player;
    if (!p || !p.ai) return;
    var dir = null;
    if (input.left) dir = 'left';
    else if (input.right) dir = 'right';
    else if (input.up) dir = 'up';
    else if (input.down) dir = 'down';
    p.ai.dir = dir;
    moveFighter(p, dt);
  }

  function placeBombFor(f) {
    if (state.screen !== 'playing') return false;
    if (f.alive === false) return false;
    var t = fighterTile(f);
    for (var i = 0; i < state.bombs.length; i++) {
      if (state.bombs[i].x === t.x && state.bombs[i].y === t.y) return false;
    }
    var own = 0;
    state.bombs.forEach(function (b) { if (b.owner === f.id) own++; });
    if (own >= f.maxBombs) return false;
    var fuse = state.suddenDeath ? SD_FUSE : BOMB_FUSE;
    state.bombs.push({ x: t.x, y: t.y, fuse: fuse, range: f.range, passable: true, owner: f.id });
    return true;
  }

  /* Legacy wrapper. */
  function placeBomb() {
    return placeBombFor(state.player);
  }

  function updateBombPassable() {
    var fighters = (state.fighters && state.fighters.length) ? state.fighters : [state.player];
    state.bombs.forEach(function (b) {
      if (!b.passable) return;
      var bx = b.x * TILE, by = b.y * TILE;
      var overlap = false;
      fighters.forEach(function (f) {
        if (!f || f.alive === false) return;
        if (f.px < bx + TILE && f.px + PLAYER_SIZE > bx &&
            f.py < by + TILE && f.py + PLAYER_SIZE > by) overlap = true;
      });
      if (!overlap) b.passable = false;
    });
  }

  /* ================= Bombs & explosions ================= */
  function explosionCells(x, y, range) {
    var cells = [{ x: x, y: y }];
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      for (var i = 1; i <= range; i++) {
        var cx = x + dirs[d][0] * i, cy = y + dirs[d][1] * i;
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) break;
        var t = state.grid[cy][cx];
        if (t === T_HARD) break;
        cells.push({ x: cx, y: cy });
        if (isDestructible(t)) break; // blast stops after hitting a destructible block
      }
    }
    return cells;
  }

  /* Damage a destructible block by 1 HP; destroy it at 0 HP. */
  function damageBlock(x, y) {
    var key = x + ',' + y;
    var hp = state.blockHp[key];
    if (hp == null) hp = BLOCK_MAX_HP[state.grid[y][x]];
    hp -= 1;
    if (hp <= 0) {
      state.grid[y][x] = T_EMPTY;
      delete state.blockHp[key];
      state.score += 10;
      var pu = state.powerups[key];
      if (pu && pu.hidden) pu.hidden = false; // reveal power-up
    } else {
      state.blockHp[key] = hp;
    }
  }

  function explodeBomb(bomb) {
    var cells = explosionCells(bomb.x, bomb.y, bomb.range);
    var until = state.timeMs + EXPLOSION_MS;
    var cellSet = {};
    cells.forEach(function (c) {
      state.explosions[c.x + ',' + c.y] = until;
      cellSet[c.x + ',' + c.y] = true;
      if (isDestructible(state.grid[c.y][c.x])) damageBlock(c.x, c.y);
    });
    // Chain-react other bombs caught in the blast.
    state.bombs.forEach(function (ob) {
      if (cellSet[ob.x + ',' + ob.y]) ob.fuse = 0;
    });
    // Damage enemies.
    state.enemies = state.enemies.filter(function (e) {
      var et = enemyTile(e);
      if (cellSet[et.x + ',' + et.y]) { state.score += 100; return false; }
      return true;
    });
    // Damage any fighter caught in the blast.
    var fighters = (state.fighters && state.fighters.length) ? state.fighters : [state.player];
    fighters.forEach(function (f) {
      if (!f || f.alive === false) return;
      var ft = fighterTile(f);
      if (cellSet[ft.x + ',' + ft.y]) {
        state.blastExposures++;
        hitFighter(f, 'bomb');
      }
    });
    updateHUD();
  }

  function updateBombs(dt) {
    var i;
    for (i = 0; i < state.bombs.length; i++) state.bombs[i].fuse -= dt * 1000;
    var guard = 0;
    while (guard++ < 50) {
      var idx = -1;
      for (i = 0; i < state.bombs.length; i++) {
        if (state.bombs[i].fuse <= 0) { idx = i; break; }
      }
      if (idx < 0) break;
      var b = state.bombs.splice(idx, 1)[0];
      explodeBomb(b);
      if (state.screen !== 'playing') return;
    }
    var now = state.timeMs;
    for (var k in state.explosions) {
      if (state.explosions[k] <= now) delete state.explosions[k];
    }
  }

  /* ================= Enemies update ================= */
  /* Nearest LIVING fighter to an enemy (Manhattan distance, tile space). */
  function nearestLivingFighterTile(e) {
    var et = enemyTile(e);
    var best = null, bd = Infinity;
    var fighters = (state.fighters && state.fighters.length) ? state.fighters : [state.player];
    fighters.forEach(function (f) {
      if (!f || f.alive === false) return;
      var ft = fighterTile(f);
      var d = Math.abs(ft.x - et.x) + Math.abs(ft.y - et.y);
      if (d < bd) { bd = d; best = ft; }
    });
    return best;
  }

  /* Step that shortens the Manhattan distance to the nearest living fighter.
     Falls back to null (random wander) when boxed in. */
  function chaseDir(e) {
    var target = nearestLivingFighterTile(e);
    if (!target) return null;
    var cands = [];
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
      var nx = e.tx + dd[0], ny = e.ty + dd[1];
      if (tileSolid(nx, ny)) return;
      cands.push({ dx: dd[0], dy: dd[1], dist: Math.abs(nx - target.x) + Math.abs(ny - target.y) });
    });
    if (!cands.length) return null;
    cands.sort(function (a, b) { return a.dist - b.dist; });
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].dx === -e.dx && cands[i].dy === -e.dy && cands.length > 1) continue;
      return [cands[i].dx, cands[i].dy];
    }
    return [cands[0].dx, cands[0].dy];
  }

  function updateEnemies(dt) {
    state.enemies.forEach(function (e) {
      e.progress += e.speed * dt;
      if (e.progress >= 1) {
        e.tx = e.toX; e.ty = e.toY;
        var d = chaseDir(e);
        if (!d) d = randomValidDir(e.tx, e.ty, -e.dx, -e.dy);
        if (!d) d = randomValidDir(e.tx, e.ty, 0, 0); // try the reverse way
        if (d) {
          e.dx = d[0]; e.dy = d[1];
          e.fromX = e.tx; e.fromY = e.ty;
          e.toX = e.tx + d[0]; e.toY = e.ty + d[1];
        } else {
          e.fromX = e.tx; e.fromY = e.ty;
          e.toX = e.tx; e.toY = e.ty;
          e.dx = 0; e.dy = 0;
        }
        e.progress = 0;
      }
      e.px = (e.fromX + (e.toX - e.fromX) * e.progress) * TILE;
      e.py = (e.fromY + (e.toY - e.fromY) * e.progress) * TILE;
    });
    // Touching a bot costs a life — monsters chase the nearest living fighter.
    var targets = (state.fighters && state.fighters.length) ? state.fighters : [state.player];
    targets.forEach(function (f) {
      if (!f || f.alive === false) return;
      var fc = { x: f.px + PLAYER_SIZE / 2, y: f.py + PLAYER_SIZE / 2 };
      state.enemies.forEach(function (e) {
        var ec = { x: e.px + TILE / 2, y: e.py + TILE / 2 };
        var ddx = fc.x - ec.x, ddy = fc.y - ec.y;
        if (ddx * ddx + ddy * ddy < 24 * 24) hitFighter(f, 'monster');
      });
    });
  }

  /* ================= Power-ups ================= */
  function collectPowerupFor(f) {
    var pt = fighterTile(f);
    var pu = state.powerups[pt.x + ',' + pt.y];
    if (pu && !pu.hidden) {
      delete state.powerups[pt.x + ',' + pt.y];
      applyPowerupFor(f, pu.type, pu.value);
    }
  }

  function applyPowerupFor(f, type, value) {
    if (type === P_TOKEN) {
      var v = value || 0;
      f.tokens = (f.tokens || 0) + v;
      if (f === state.player) {
        state.tokens += v;
        state.stageTokensGot += v;
        showMsg('+' + v + ' Token!');
      }
    }
    else if (type === P_WALLPASS) {
      f.wallpassUntil = state.timeMs + WALLPASS_MS;
      if (f === state.player) showMsg('Tembus Tembok! 12 detik');
    }
    state.score += 50;
    updateHUD();
  }

  /* Legacy wrappers. */
  function checkPowerup() {
    collectPowerupFor(state.player);
  }

  function applyPowerup(type, value) {
    applyPowerupFor(state.player, type, value);
  }

  /* ================= Sudden death (pacing backstop) ================= */
  /* After SD_START_SEC without a winner, escalate lethality so the match
     always ends: bigger + faster bombs, faster monsters, and a storm that
     strikes one random living fighter every SD_STRIKE_MS. Each strike
     removes exactly 1 life from the match total, so a winner is forced
     (at most 11 strikes from 4x3 lives) — never a simultaneous wipe. */
  function startSuddenDeath() {
    state.suddenDeath = true;
    state.sdNextStrike = state.timeMs + SD_STRIKE_MS;
    state.fighters.forEach(function (f) { if (f.alive !== false) f.range = SD_RANGE; });
    state.enemies.forEach(function (e) { e.speed = e.speed * SD_MONSTER_MULT; });
    showMsg('⚠️ SUDDEN DEATH! Badai datang — bertahanlah!');
    updateHUD(true);
  }

  function stormStrike() {
    var alive = state.fighters.filter(function (f) { return f.alive !== false; });
    if (alive.length <= 1) return;
    var target = alive[Math.floor(Math.random() * alive.length)];
    target.invulnUntil = 0; // the storm always lands (bypasses respawn invulnerability)
    hitFighter(target, 'storm');
    showMsg('⚡ Badai menghantam ' + (target.name || 'fighter') + '!');
    state.sdNextStrike = state.timeMs + SD_STRIKE_MS;
  }

  /* ================= Life / level flow ================= */
  function hitFighter(f, cause) {
    if (!f || f.alive === false) return;
    if (state.timeMs < f.invulnUntil) return;
    if (cause && state.hitCauses[cause] != null) state.hitCauses[cause]++;
    f.lives = (f.lives == null ? 3 : f.lives) - 1;
    if (f === state.player) { state.lives = f.lives; updateHUD(); }
    if (f.lives <= 0) {
      if (cause && state.deathCauses[cause] != null) state.deathCauses[cause]++;
      f.alive = false;
      if (f === state.player) showMsg('Kamu KO!');
      else if (f.name) showMsg(f.name + ' KO!');
      return;
    }
    var s = f.spawn || SPAWNS[0];
    f.px = s.x * TILE + (TILE - PLAYER_SIZE) / 2;
    f.py = s.y * TILE + (TILE - PLAYER_SIZE) / 2;
    f.invulnUntil = state.timeMs + INVULN_MS;
    // Re-think at once after respawning, so a monster camping the spawn
    // is answered immediately instead of up to 0.25s later.
    if (f.ai) f.ai.thinkT = 0;
    if (f === state.player) showMsg('Ouch! -1 life');
  }

  /* Legacy wrapper. */
  function hitPlayer() {
    hitFighter(state.player);
  }

  function levelClear() {
    state.screen = 'levelclear';
    var bonus = 500 * state.level;
    state.score += bonus;
    updateHUD();
    showOverlay('Level ' + state.level + ' Clear!',
      'Bonus +' + bonus + ' points. Score: ' + state.score +
      ' · Token stage ini: ' + state.stageTokensGot + ' / ' + state.stageTokens,
      'Next Level ▶', function () { startLevel(state.level + 1); });
  }

  function gameOver(note) {
    state.screen = 'gameover';
    updateHUD();
    recordStats();
    showOverlay('Game Over',
      (note ? note + ' ' : '') + 'Score: ' + state.score + ' · Level reached: ' + state.level,
      '↻ Main Lagi', function () { newGame(); });
  }

  /* One fighter left standing: they win the match. */
  function matchWinner(w) {
    state.screen = 'levelclear';
    var bonus = 500 * state.level;
    state.score += bonus;
    updateHUD();
    recordStats();
    var title = w === state.player ? '🏆 Kamu Menang!' : '🏆 ' + w.name + ' Menang!';
    var text = w.name + ' — Token: ' + (w.tokens || 0) + ' · Score: ' + state.score +
      ' · Level: ' + state.level + ' · Bonus +' + bonus;
    showOverlay(title, text,
      'Next Level ▶', function () {
        // A fresh match next level: if the player was KO'd, restore 3 lives.
        if (state.player && (state.player.lives == null || state.player.lives <= 0)) {
          state.player.lives = 3;
          state.lives = 3;
        }
        startLevel(state.level + 1);
      },
      '↻ Main Lagi', function () { newGame(); });
  }

  function togglePause() {
    if (state.screen === 'playing') {
      state.screen = 'paused';
      showOverlay('Paused', 'Take a breath. Your bombs are waiting.',
        '▶ Resume', function () { state.screen = 'playing'; hideOverlay(); });
    } else if (state.screen === 'paused') {
      state.screen = 'playing';
      hideOverlay();
    }
  }

  function newGame() {
    state.score = 0;
    state.tokens = 0;
    state.lives = 3;
    state.timeSec = 0;
    state.timeMs = 0;
    state.hitCauses = { bomb: 0, monster: 0, storm: 0 };
    state.deathCauses = { bomb: 0, monster: 0, storm: 0 };
    state.blastExposures = 0;
    state.player = freshPlayer();
    startLevel(1);
  }

  function startLevel(level) {
    state.level = level;
    stats.played = true;
    if (level > stats.level) stats.level = level;
    saveStats();
    var m = generateMap(level);
    state.grid = m.grid;
    state.powerups = m.powerups;
    state.blockHp = m.blockHp;
    state.stageTokens = m.stageTokenPool;
    state.stageTokensGot = 0;
    state.bombs = [];
    state.explosions = {};
    state.enemies = spawnEnemies(level);
    state.suddenDeath = false;
    state.sdNextStrike = 0;
    // Auto-battler roster: player + 3 rivals. Player lives/tokens carry over between levels.
    var prevLives = (state.player && state.player.lives != null) ? state.player.lives : 3;
    var prevTokens = (state.player && state.player.tokens != null) ? state.player.tokens : 0;
    state.fighters = [
      makeFighter(SPAWNS[0], 0, 'Kamu', '#3b82f6', playerStrategy),
      makeFighter(SPAWNS[1], 1, 'Rival 1', '#ef4444', 'aggressive'),
      makeFighter(SPAWNS[2], 2, 'Rival 2', '#22c55e', 'greedy'),
      makeFighter(SPAWNS[3], 3, 'Rival 3', '#eab308', 'defensive')
    ];
    state.fighters[0].lives = prevLives;
    state.fighters[0].tokens = prevTokens;
    state.player = state.fighters[0];
    state.lives = prevLives;
    state.player.invulnUntil = state.timeMs + 1000;
    state.player.dir = 'down';
    state.screen = 'playing';
    hideOverlay();
    updateHUD(true);
  }

  function startGame() {
    showView('game');
    newGame();
  }

  function toMenu() {
    state.screen = 'menu';
    showView('dashboard');
    hideOverlay();
  }

  /* ================= Fighter AI (auto-battler, stage 1) ================= */
  function dangerSet() {
    var set = {};
    state.bombs.forEach(function (b) {
      explosionCells(b.x, b.y, b.range).forEach(function (c) { set[c.x + ',' + c.y] = true; });
    });
    return set;
  }

  /* BFS from start over tiles walkable for f. Returns dist + parent maps. */
  function bfsFrom(f, start) {
    var dist = {}, parent = {};
    var key = function (x, y) { return x + ',' + y; };
    var queue = [start];
    dist[key(start.x, start.y)] = 0;
    while (queue.length) {
      var cur = queue.shift();
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = cur.x + dirs[i][0], ny = cur.y + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (dist[key(nx, ny)] !== undefined) continue;
        if (fighterTileSolid(f, nx, ny)) continue;
        dist[key(nx, ny)] = dist[key(cur.x, cur.y)] + 1;
        parent[key(nx, ny)] = key(cur.x, cur.y);
        queue.push({ x: nx, y: ny });
      }
    }
    return { dist: dist, parent: parent };
  }

  /* First tile to step to on the BFS path from start to target (null if already there / unreachable). */
  function firstStep(bfs, start, target) {
    var key = function (x, y) { return x + ',' + y; };
    var tk = key(target.x, target.y);
    if (bfs.dist[tk] === undefined) return null;
    var cur = tk;
    while (bfs.parent[cur] && bfs.parent[cur] !== key(start.x, start.y)) cur = bfs.parent[cur];
    if (cur === key(start.x, start.y)) return null;
    var parts = cur.split(',');
    return { x: +parts[0], y: +parts[1] };
  }

  function dirTo(from, to) {
    if (!to) return null;
    if (to.x > from.x) return 'right';
    if (to.x < from.x) return 'left';
    if (to.y > from.y) return 'down';
    if (to.y < from.y) return 'up';
    return null;
  }

  function randomValidDirFor(f) {
    var ft = fighterTile(f);
    var dirs = shuffle([
      { dx: 1, dy: 0, dir: 'right' }, { dx: -1, dy: 0, dir: 'left' },
      { dx: 0, dy: 1, dir: 'down' }, { dx: 0, dy: -1, dir: 'up' }
    ]);
    for (var i = 0; i < dirs.length; i++) {
      var nx = ft.x + dirs[i].dx, ny = ft.y + dirs[i].dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (fighterTileSolid(f, nx, ny)) continue;
      return dirs[i].dir;
    }
    return null;
  }

  /* BFS over tiles walkable for f, treating danger cells as blocked (except the
     start tile). Goal movement uses this so a fighter never walks into a blast
     to reach a monster, power-up or bomb spot. */
  function bfsSafeFrom(f, start, danger) {
    var dist = {}, parent = {};
    var key = function (x, y) { return x + ',' + y; };
    var queue = [start];
    dist[key(start.x, start.y)] = 0;
    while (queue.length) {
      var cur = queue.shift();
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = cur.x + dirs[i][0], ny = cur.y + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        var nk = key(nx, ny);
        if (dist[nk] !== undefined) continue;
        if (danger[nk]) continue; // never path through a blast
        if (fighterTileSolid(f, nx, ny)) continue;
        dist[nk] = dist[key(cur.x, cur.y)] + 1;
        parent[nk] = key(cur.x, cur.y);
        queue.push({ x: nx, y: ny });
      }
    }
    return { dist: dist, parent: parent };
  }

  /* Dijkstra escape: entering a danger cell costs 9 (1 + 8), a safe cell 1.
     Returns { dist: costMap, parent } — dist is compatible with firstStep.
     The flee picks the cheapest safe cell; if none is reachable, the cheapest
     cell overall (least blast exposure on the way out). */
  function escapeBFS(f, start, danger) {
    var dist = {}, parent = {};
    var key = function (x, y) { return x + ',' + y; };
    var open = [start];
    dist[key(start.x, start.y)] = 0;
    while (open.length) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) {
        if (dist[key(open[i].x, open[i].y)] < dist[key(open[bi].x, open[bi].y)]) bi = i;
      }
      var cur = open.splice(bi, 1)[0];
      var cd = dist[key(cur.x, cur.y)];
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var j = 0; j < 4; j++) {
        var nx = cur.x + dirs[j][0], ny = cur.y + dirs[j][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        var nk = key(nx, ny);
        if (fighterTileSolid(f, nx, ny)) continue;
        var nc = cd + 1 + (danger[nk] ? 8 : 0);
        if (dist[nk] === undefined || nc < dist[nk]) {
          dist[nk] = nc;
          parent[nk] = key(cur.x, cur.y);
          open.push({ x: nx, y: ny });
        }
      }
    }
    return { dist: dist, parent: parent };
  }

  /* A random adjacent step that is walkable and NOT in a blast (null if none).
     Safer fallback than randomValidDirFor when a fighter has no goal. */
  function randomSafeDirFor(f, danger) {
    var ft = fighterTile(f);
    var dirs = shuffle([
      { dx: 1, dy: 0, dir: 'right' }, { dx: -1, dy: 0, dir: 'left' },
      { dx: 0, dy: 1, dir: 'down' }, { dx: 0, dy: -1, dir: 'up' }
    ]);
    for (var i = 0; i < dirs.length; i++) {
      var nx = ft.x + dirs[i].dx, ny = ft.y + dirs[i].dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (danger[nx + ',' + ny]) continue;
      if (fighterTileSolid(f, nx, ny)) continue;
      return dirs[i].dir;
    }
    return null;
  }

  /* Can the fighter reach a tile outside the blast of a bomb placed at (tx,ty) before it blows?
     The fighter has ~2s of fuse; BFS distance <= 6 tiles is comfortably reachable. */
  function hasSafeEscapeAt(f, tx, ty, extraDanger) {
    var blast = {};
    explosionCells(tx, ty, f.range).forEach(function (c) { blast[c.x + ',' + c.y] = true; });
    var dist = {}, queue = [{ x: tx, y: ty }];
    dist[tx + ',' + ty] = 0;
    while (queue.length) {
      var cur = queue.shift();
      var d = dist[cur.x + ',' + cur.y];
      if (d > 0 && !blast[cur.x + ',' + cur.y] && !(extraDanger && extraDanger[cur.x + ',' + cur.y])) return true;
      if (d >= 6) continue;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = cur.x + dirs[i][0], ny = cur.y + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (dist[nx + ',' + ny] !== undefined) continue;
        if (fighterTileSolid(f, nx, ny)) continue;
        dist[nx + ',' + ny] = d + 1;
        queue.push({ x: nx, y: ny });
      }
    }
    return false;
  }

  function hasSafeEscape(f, extraDanger) {
    var ft = fighterTile(f);
    return hasSafeEscapeAt(f, ft.x, ft.y, extraDanger);
  }

  /* ================= Monster awareness ================= */
  /* Tiles within Manhattan `radius` of any monster (a danger layer for
     pathing: a fighter never walks onto/near a monster by accident). */
  function monsterSet(radius) {
    var set = {};
    state.enemies.forEach(function (e) {
      var et = enemyTile(e);
      for (var dx = -radius; dx <= radius; dx++) {
        for (var dy = -radius; dy <= radius; dy++) {
          if (Math.abs(dx) + Math.abs(dy) <= radius) {
            set[(et.x + dx) + ',' + (et.y + dy)] = true;
          }
        }
      }
    });
    return set;
  }

  /* Nearest monster to the fighter, in Manhattan tiles (Infinity if none). */
  function nearestMonsterDist(f) {
    var ft = fighterTile(f);
    var best = Infinity;
    state.enemies.forEach(function (e) {
      var et = enemyTile(e);
      var d = Math.abs(et.x - ft.x) + Math.abs(et.y - ft.y);
      if (d < best) best = d;
    });
    return best;
  }

  function mergeDanger(a, b) {
    var out = {};
    for (var k in a) out[k] = true;
    for (var k2 in b) out[k2] = true;
    return out;
  }

  /* Flee direction away from monsters: BFS to a reachable tile (<=4 steps)
     that maximises the minimum distance to any monster, then the first step
     toward it. Blast cells are never chosen as the destination. */
  function fleeMonsterDir(f, danger) {
    if (!state.enemies.length) return null;
    var ft = fighterTile(f);
    var bfs = bfsFrom(f, ft);
    var best = null, bestScore = -Infinity;
    for (var k in bfs.dist) {
      if (bfs.dist[k] > 4) continue;
      if (danger[k]) continue;
      var parts = k.split(',');
      var tx = +parts[0], ty = +parts[1];
      var minD = Infinity;
      state.enemies.forEach(function (e) {
        var et = enemyTile(e);
        var d = Math.abs(et.x - tx) + Math.abs(et.y - ty);
        if (d < minD) minD = d;
      });
      var score = minD * 10 - bfs.dist[k];
      if (score > bestScore) { bestScore = score; best = { x: tx, y: ty }; }
    }
    if (!best) return null;
    return dirTo(ft, firstStep(bfs, ft, best));
  }

  function thinkFighter(f, dt) {
    f.ai.thinkT -= dt;
    if (f.ai.thinkT > 0) return;
    f.ai.wantBomb = false;
    var ft = fighterTile(f);
    var danger = dangerSet();
    // Monster awareness: tiles near a monster are danger for pathing/fleeing.
    // Defensive keeps a wider berth (2 tiles); the rest keep 1 tile.
    var mRadius = f.personality === 'defensive' ? 2 : 1;
    var mDanger = monsterSet(mRadius);
    var mDist = nearestMonsterDist(f);
    var allDanger = mergeDanger(danger, mDanger);
    var inDanger = !!danger[ft.x + ',' + ft.y];
    if (!inDanger && f.personality === 'defensive') {
      for (var i = 0; i < state.bombs.length; i++) {
        var b = state.bombs[i];
        if (Math.abs(b.x - ft.x) + Math.abs(b.y - ft.y) <= 2) { inDanger = true; break; }
      }
    }
    // While in danger, re-think every frame so the flee stays responsive
    // (a bomb placed next to the fighter is answered in 0.05s, not 0.25s).
    // Same when a monster is within 3 tiles: the fighter must notice the
    // moment it enters flee range instead of standing still to place a bomb.
    f.ai.thinkT = (inDanger || mDist <= 3) ? 0.05 : 0.25;
    if (inDanger) {
      // Dijkstra escape: blast cells cost extra, so the flee path never
      // routes through a blast when a safe way out exists. Monster-adjacent
      // tiles cost extra too, so the flee does not run into a monster.
      var esc = escapeBFS(f, ft, allDanger);
      var safe = null, sd = Infinity;
      for (var k in esc.dist) {
        if (allDanger[k]) continue;
        if (esc.dist[k] < sd) { sd = esc.dist[k]; safe = k; }
      }
      if (safe) {
        var sp = safe.split(',');
        f.ai.dir = dirTo(ft, firstStep(esc, ft, { x: +sp[0], y: +sp[1] }));
      } else {
        // No safe tile reachable: step toward the least-dangerous reachable cell.
        var best = null, bd = Infinity;
        for (var k2 in esc.dist) {
          if (k2 === ft.x + ',' + ft.y) continue;
          if (esc.dist[k2] < bd) { bd = esc.dist[k2]; best = k2; }
        }
        if (best) {
          var bp = best.split(',');
          f.ai.dir = dirTo(ft, firstStep(esc, ft, { x: +bp[0], y: +bp[1] }));
        } else {
          f.ai.dir = randomSafeDirFor(f, allDanger);
        }
      }
      f.ai.wantBomb = false;
      return;
    }
    // Monster awareness: a monster within touching distance is an urgent
    // threat — flee at once (re-think every frame while it is close).
    // A monster closes from 2 tiles to a touch in ~0.5s (sudden death),
    // faster than the 0.25s think interval, so every fighter flees at 2
    // tiles to have time to escape. Aggressive still bombs point-blank:
    // at 2 tiles it plants a bomb (blast range 3 still reaches the monster)
    // and the bomb-danger flee next frame carries it out.
    var fleeRadius = 2;
    if (mDist <= fleeRadius) {
      f.ai.thinkT = 0.05;
      if (f.personality === 'aggressive' && hasSafeEscape(f, danger)) {
        // Point-blank bomb: plant it, then the bomb-danger flee next frame
        // carries the fighter out. The blast (range 3) still reaches the monster.
        f.ai.dir = null;
        f.ai.wantBomb = true;
        return;
      }
      var md = fleeMonsterDir(f, danger);
      // Never stand still with a monster close: if no safe flee exists,
      // take any walkable step — moving is better than waiting to be touched.
      f.ai.dir = md || randomSafeDirFor(f, allDanger) || randomValidDirFor(f);
      f.ai.wantBomb = false;
      return;
    }
    // Goal movement: safe BFS by default — a fighter never walks into a blast
    // OR next to a monster for a power-up or a bomb spot. Only the aggressive
    // fighter takes the risk of stepping into a blast to chase a monster
    // (its character), and the flee above is what usually saves it — when it
    // is too deep or too late, the bomb still lands.
    var bfs = bfsSafeFrom(f, ft, allDanger);
    // Aggressive: chase the nearest monster (within 6 tiles). Aggressive
    // takes the risk: its chase BFS only blocks monster tiles (not blasts),
    // so it may step into a blast to reach the monster — but never onto a
    // monster's own tile. The flee above usually saves it — sometimes not.
    if (f.personality === 'aggressive' && state.enemies.length) {
      var nearest = null, nd = Infinity;
      state.enemies.forEach(function (e) {
        var et = enemyTile(e);
        var d = Math.abs(et.x - ft.x) + Math.abs(et.y - ft.y);
        if (d < nd) { nd = d; nearest = et; }
      });
      if (nearest && nd <= 6) {
        var bfsChase = bfsSafeFrom(f, ft, monsterSet(0));
        var adj = null, ad = Infinity;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
          var ax = nearest.x + dd[0], ay = nearest.y + dd[1];
          if (ax < 0 || ay < 0 || ax >= COLS || ay >= ROWS) return;
          if (fighterTileSolid(f, ax, ay)) return;
          var d2 = bfsChase.dist[ax + ',' + ay];
          if (d2 === undefined) return;
          if (d2 < ad) { ad = d2; adj = { x: ax, y: ay }; }
        });
        if (adj) {
          if (ad === 0) {
            f.ai.dir = null;
            if (hasSafeEscape(f, danger)) f.ai.wantBomb = true;
            else f.ai.dir = randomSafeDirFor(f, danger);
          } else {
            f.ai.dir = dirTo(ft, firstStep(bfsChase, ft, adj));
          }
          return;
        }
      }
    }
    // Nearest reachable open power-up (greedy searches further).
    var puTarget = null, puDist = Infinity;
    var puRange = f.personality === 'greedy' ? Infinity : 8;
    for (var k in state.powerups) {
      var pu = state.powerups[k];
      if (pu.hidden) continue;
      var d = bfs.dist[k];
      if (d === undefined || d > puRange) continue;
      if (d < puDist) { puDist = d; puTarget = k; }
    }
    if (puTarget) {
      var pp = puTarget.split(',');
      f.ai.dir = dirTo(ft, firstStep(bfs, ft, { x: +pp[0], y: +pp[1] }));
      return;
    }
    // Nearest destructible block next to a reachable empty tile from which a bomb can be safely placed.
    var blockTarget = null, blockDist = Infinity;
    for (var y = 1; y < ROWS - 1; y++) {
      for (var x = 1; x < COLS - 1; x++) {
        if (!isDestructible(state.grid[y][x])) continue;
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (var i = 0; i < 4; i++) {
          var nx = x + dirs[i][0], ny = y + dirs[i][1];
          if (state.grid[ny][nx] !== T_EMPTY) continue;
          var d = bfs.dist[nx + ',' + ny];
          if (d === undefined) continue;
          if (!hasSafeEscapeAt(f, nx, ny, danger)) continue;
          if (d < blockDist) { blockDist = d; blockTarget = { x: nx, y: ny }; }
        }
      }
    }
    if (blockTarget) {
      if (blockDist === 0) {
        f.ai.dir = null;
        var safe = hasSafeEscape(f, danger);
        if (safe) f.ai.wantBomb = true;
        else f.ai.dir = randomSafeDirFor(f, danger);
      } else {
        f.ai.dir = dirTo(ft, firstStep(bfs, ft, blockTarget));
      }
      return;
    }
    f.ai.dir = randomSafeDirFor(f, danger);
  }

  /* ================= Update ================= */
  /* If wall-pass expired while standing inside a block, push out to the nearest empty tile. */
  function ejectFromBlockFor(f) {
    var pt = fighterTile(f);
    if (!isDestructible(state.grid[pt.y][pt.x])) return;
    var seen = {}, queue = [[pt.x, pt.y]];
    seen[pt.x + ',' + pt.y] = true;
    while (queue.length) {
      var c = queue.shift();
      if (state.grid[c[1]][c[0]] === T_EMPTY) {
        f.px = c[0] * TILE + (TILE - PLAYER_SIZE) / 2;
        f.py = c[1] * TILE + (TILE - PLAYER_SIZE) / 2;
        return;
      }
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = c[0] + dirs[i][0], ny = c[1] + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        var k = nx + ',' + ny;
        if (!seen[k]) { seen[k] = true; queue.push([nx, ny]); }
      }
    }
  }

  function ejectFromBlock() {
    ejectFromBlockFor(state.player);
  }

  function update(dt) {
    state.timeMs += dt * 1000;
    state.timeSec += dt;
    // Auto-battler: AI drives every fighter, including the player. api.input is ignored.
    (state.fighters || []).forEach(function (f) {
      if (f.alive === false) return;
      thinkFighter(f, dt);
      moveFighter(f, dt);
      if (f.ai.wantBomb) {
        if (placeBombFor(f)) f.ai.thinkT = 0; // re-think next frame: flee from own bomb at once
        f.ai.wantBomb = false;
      }
      if (state.timeMs >= f.wallpassUntil) ejectFromBlockFor(f);
      collectPowerupFor(f);
    });
    updateBombPassable();
    updateBombs(dt);
    if (state.screen !== 'playing') return;
    updateEnemies(dt);
    if (state.screen !== 'playing') return;
    // Sudden-death backstop (placed right before the win check so a strike
    // that leaves 1 fighter ends the match immediately, before a monster
    // could touch the last fighter in the same frame).
    if (autoBattlerActive()) {
      if (!state.suddenDeath && state.timeSec >= SD_START_SEC) startSuddenDeath();
      if (state.suddenDeath && state.timeMs >= state.sdNextStrike) stormStrike();
    }
    // Auto-battler win check: the match runs until 1 fighter is left.
    // Monsters running out does NOT end the level — fighters keep bombing each other.
    if (autoBattlerActive()) {
      var alive = state.fighters.filter(function (f) { return f.alive !== false; });
      if (alive.length === 1) { matchWinner(alive[0]); return; }
      if (alive.length === 0) { gameOver('Semua fighter gugur.'); return; }
    } else if (state.enemies.length === 0 && state.screen === 'playing') {
      levelClear();
    }
    updateHUD();
  }

  /* ================= HUD / overlay / messages ================= */
  function updateHUD(force) {
    var lives = String(state.lives), score = String(state.score),
        time = fmtTime(state.timeSec), level = String(state.level);
    if (force || hudCache.lives !== lives) { if (els.hudLives) els.hudLives.textContent = lives; hudCache.lives = lives; }
    if (force || hudCache.score !== score) { if (els.hudScore) els.hudScore.textContent = score; hudCache.score = score; }
    var tokens = String(state.tokens);
    if (force || hudCache.tokens !== tokens) { if (els.hudTokens) els.hudTokens.textContent = tokens; hudCache.tokens = tokens; }
    if (force || hudCache.time !== time) { if (els.hudTime) els.hudTime.textContent = time; hudCache.time = time; }
    if (force || hudCache.level !== level) { if (els.hudLevel) els.hudLevel.textContent = level; hudCache.level = level; }
    var wp = state.player ? Math.max(0, Math.ceil((state.player.wallpassUntil - state.timeMs) / 1000)) : 0;
    if (els.hudWallpass) {
      els.hudWallpass.hidden = wp <= 0;
      var wpText = '👻 ' + wp + 's';
      if (force || hudCache.wp !== wpText) { els.hudWallpass.textContent = wpText; hudCache.wp = wpText; }
    }
    if (els.hudSudden) els.hudSudden.hidden = !state.suddenDeath;
  }

  function showOverlay(title, text, btnLabel, onBtn, btn2Label, onBtn2) {
    if (!els.overlay) return;
    if (els.overlayTitle) els.overlayTitle.textContent = title;
    if (els.overlayText) els.overlayText.textContent = text;
    if (els.overlayBtn) {
      els.overlayBtn.textContent = btnLabel;
      els.overlayBtn.onclick = onBtn;
    }
    if (els.overlayBtn2) {
      if (btn2Label) {
        els.overlayBtn2.textContent = btn2Label;
        els.overlayBtn2.onclick = onBtn2;
        els.overlayBtn2.hidden = false;
      } else {
        els.overlayBtn2.hidden = true;
      }
    }
    els.overlay.hidden = false;
  }

  function hideOverlay() {
    if (els.overlay) els.overlay.hidden = true;
    if (els.overlayBtn2) els.overlayBtn2.hidden = true;
  }

  function showMsg(text) {
    if (!els.msg) return;
    els.msg.textContent = text;
    setTimeout(function () { if (els.msg) els.msg.textContent = ''; }, 1600);
  }

  /* Input has no effect in auto-battler mode: the AI drives every fighter. */
  function autoBattlerActive() {
    return !!(state.fighters && state.fighters.length);
  }

  /* Strategy picker: sets the player fighter's AI personality live. */
  function setStrategy(name) {
    if (STRATEGIES.indexOf(name) < 0) return false;
    playerStrategy = name;
    if (state.fighters && state.fighters[0]) state.fighters[0].personality = name;
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      var btns = document.querySelectorAll('.strat-btn');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-strategy') === name;
        if (on) btns[i].classList.add('active');
        else btns[i].classList.remove('active');
      }
    }
    return true;
  }

  function wireStrategy() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    var btns = document.querySelectorAll('.strat-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          setStrategy(btn.getAttribute('data-strategy'));
        });
      })(btns[i]);
    }
  }

  /* ================= Input wiring ================= */
  function wireButtons() {
    var play = $('playBtn'); if (play) play.addEventListener('click', requestPlay);
    var splashPlay = $('splashPlayBtn'); if (splashPlay) splashPlay.addEventListener('click', requestPlay);
    var pause = $('pauseBtn'); if (pause) pause.addEventListener('click', togglePause);
    var restart = $('restartBtn'); if (restart) restart.addEventListener('click', function () { newGame(); });
    var menu = $('menuBtn'); if (menu) menu.addEventListener('click', toMenu);
  }

  function wireKeys() {
    window.addEventListener('keydown', function (e) {
      var k = e.key;
      var handled = true;
      if (k === 'Escape' && isLoginModalOpen()) cancelLogin();
      else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
      else if (k === 'Enter') { if (state.screen === 'menu') requestPlay(); }
      else handled = false;
      if (handled && state.screen !== 'menu') e.preventDefault();
    });
  }

  /* ================= Rendering ================= */
  function render() {
    if (!ctx) return;
    drawGround();
    drawPowerups();
    drawBombs();
    drawExplosions();
    drawEnemies();
    drawPlayer();
  }

  /* Chunky 3D cube tile: light top face, darker front edge. */
  function drawCube(px, py, top, body, dark) {
    ctx.fillStyle = body;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = top;
    ctx.fillRect(px + 2, py + 2, TILE - 4, 11);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + TILE - 5, TILE - 4, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(px + 2, py + 2, TILE - 4, 2);
  }

  /* Crack lines on a damaged block; level = hits taken so far. */
  function drawCracks(px, py, level) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + 6, py + 8);
    ctx.lineTo(px + 14, py + 16);
    ctx.lineTo(px + 10, py + 24);
    ctx.moveTo(px + 24, py + 6);
    ctx.lineTo(px + 18, py + 14);
    ctx.lineTo(px + 24, py + 22);
    ctx.stroke();
    if (level >= 2) {
      ctx.beginPath();
      ctx.moveTo(px + 4, py + 20);
      ctx.lineTo(px + 12, py + 14);
      ctx.lineTo(px + 20, py + 20);
      ctx.moveTo(px + 16, py + 4);
      ctx.lineTo(px + 22, py + 10);
      ctx.stroke();
    }
  }

  function drawGround() {
    var x, y;
    for (y = 0; y < ROWS; y++) {
      for (x = 0; x < COLS; x++) {
        var px = x * TILE, py = y * TILE;
        ctx.fillStyle = (x + y) % 2 === 0 ? '#16281a' : '#132315';
        ctx.fillRect(px, py, TILE, TILE);
        var t = state.grid[y][x];
        if (t === T_HARD) {
          drawCube(px, py, '#5b6b8c', '#3a4358', '#232a3d');
          ctx.fillStyle = '#232a3d';
          ctx.fillRect(px + 7, py + 6, 4, 4);
          ctx.fillRect(px + TILE - 11, py + 6, 4, 4);
        } else if (isDestructible(t)) {
          if (t === T_SOFT) drawCube(px, py, '#d08a3e', '#b07030', '#7a4a1a');
          else if (t === T_MED) drawCube(px, py, '#a06a2e', '#7a4f1e', '#4a2d10');
          else drawCube(px, py, '#8a7a5a', '#6b5d45', '#453c2c');
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px + 3, py + 15, TILE - 6, 2);
          ctx.fillRect(px + 15, py + 4, 2, 11);
          var hp = state.blockHp[x + ',' + y];
          var max = BLOCK_MAX_HP[t];
          if (hp != null && hp < max) drawCracks(px, py, max - hp);
        }
      }
    }
  }

  function drawPowerups() {
    for (var k in state.powerups) {
      var pu = state.powerups[k];
      if (pu.hidden) continue;
      var parts = k.split(',');
      var cx = (+parts[0]) * TILE + TILE / 2, cy = (+parts[1]) * TILE + TILE / 2;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
      if (pu.type === P_TOKEN) drawToken(cx, cy);
      else drawGhost(cx, cy);
    }
  }

  function drawMiniBomb(cx, cy) {
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(cx, cy + 1, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx + 3, cy - 4); ctx.quadraticCurveTo(cx + 7, cy - 8, cx + 5, cy - 9); ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(cx + 5, cy - 9, 2, 0, Math.PI * 2); ctx.fill();
  }

  function drawToken(cx, cy) {
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
    drawMiniBomb(cx, cy);
  }

  function drawGhost(cx, cy) {
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.arc(cx, cy - 1, 8, Math.PI, 0);
    ctx.lineTo(cx + 8, cy + 7);
    ctx.lineTo(cx + 4, cy + 3);
    ctx.lineTo(cx, cy + 7);
    ctx.lineTo(cx - 4, cy + 3);
    ctx.lineTo(cx - 8, cy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(cx - 3, cy - 2, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 3, cy - 2, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function drawBombs() {
    state.bombs.forEach(function (b) {
      var cx = b.x * TILE + TILE / 2, cy = b.y * TILE + TILE / 2;
      var pulse = 1 + 0.08 * Math.sin(state.timeMs / 90);
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.arc(cx, cy, 11 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#374151';
      ctx.beginPath(); ctx.arc(cx - 3, cy - 3, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx + 6, cy - 8); ctx.quadraticCurveTo(cx + 12, cy - 14, cx + 9, cy - 16); ctx.stroke();
      var flick = (state.timeMs % 200) < 100;
      ctx.fillStyle = flick ? '#facc15' : '#f97316';
      ctx.beginPath(); ctx.arc(cx + 9, cy - 16, 3, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawExplosions() {
    var now = state.timeMs;
    for (var k in state.explosions) {
      var remain = state.explosions[k] - now;
      if (remain <= 0) continue;
      var parts = k.split(',');
      var px = (+parts[0]) * TILE, py = (+parts[1]) * TILE;
      var a = 0.55 + 0.45 * (remain / EXPLOSION_MS);
      var flick = (now % 120) < 60;
      ctx.globalAlpha = a;
      ctx.fillStyle = flick ? '#f97316' : '#ea580c';
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(px + 7, py + 7, TILE - 14, TILE - 14);
      ctx.fillStyle = '#fff7ed';
      ctx.fillRect(px + 12, py + 12, TILE - 24, TILE - 24);
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemies() {
    state.enemies.forEach(function (e) {
      var cx = e.px + TILE / 2, cy = e.py + TILE / 2;
      var wob = Math.sin(state.timeMs / 160 + e.tx * 3) * 1.5;
      ctx.fillStyle = '#c026d3';
      ctx.beginPath(); ctx.arc(cx, cy + wob * 0.4, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a21caf';
      ctx.beginPath(); ctx.arc(cx, cy + wob * 0.4 + 4, 11, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx - 5, cy - 3 + wob * 0.4, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy - 3 + wob * 0.4, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.arc(cx - 5 + e.dx * 1.5, cy - 3 + wob * 0.4, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5 + e.dx * 1.5, cy - 3 + wob * 0.4, 1.8, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawFighter(f) {
    if (!f) return;
    if (f.alive === false) { // eliminated: faint KO marker at last position
      ctx.globalAlpha = 0.4;
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(f.name + ' KO', f.px + PLAYER_SIZE / 2, f.py - 4);
      ctx.globalAlpha = 1;
      return;
    }
    if (state.timeMs < f.invulnUntil && Math.floor(state.timeMs / 120) % 2 === 0) return; // blink
    var wallpass = state.timeMs < f.wallpassUntil;
    if (wallpass) ctx.globalAlpha = 0.65; // ghostly while passing through walls
    var cx = f.px + PLAYER_SIZE / 2, cy = f.py + PLAYER_SIZE / 2;
    var bob = f.moving ? Math.sin(f.animT * 18) * 1.5 : 0;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.arc(cx, cy + bob * 0.3, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f.color || '#2563eb';
    ctx.beginPath(); ctx.arc(cx, cy - 3 + bob * 0.3, 11, Math.PI, 0); ctx.fill();
    ctx.fillRect(cx - 11, cy - 4 + bob * 0.3, 22, 3);
    var ex = f.dir === 'left' ? -2 : f.dir === 'right' ? 2 : 0;
    var ey = f.dir === 'up' ? -2 : f.dir === 'down' ? 2 : 0;
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(cx - 4 + ex, cy + 1 + ey, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4 + ex, cy + 1 + ey, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e293b';
    var step = f.moving ? Math.sin(f.animT * 18) * 3 : 0;
    ctx.fillRect(cx - 8, cy + 9, 6, 4);
    ctx.fillRect(cx + 2, cy + 9 + step * 0.3, 6, 4);
    if (wallpass) {
      ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.stroke();
    }
    if (f.name) {
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(f.name, cx, cy - 16);
    }
    if (f.lives != null && f.lives > 0) { // lives as small red hearts above the name
      var hearts = '';
      for (var i = 0; i < f.lives; i++) hearts += '♥';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f87171';
      ctx.fillText(hearts, cx, cy - 26);
    }
    if (f === state.player) { // white ring marks the player fighter
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    if (state.fighters && state.fighters.length) {
      state.fighters.forEach(function (f) { drawFighter(f); });
    } else if (state.player) {
      drawFighter(state.player); // attract-mode backdrop
    }
  }

  /* ================= Main loop ================= */
  var lastTs = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    if (state.screen === 'playing') update(dt);
    render();
  }

  /* ================= Views (SPA router) ================= */
  function showView(name) {
    if (VIEWS.indexOf(name) < 0) name = 'dashboard';
    currentView = name;
    if (typeof document !== 'undefined' && document.body && document.body.classList) {
      if (name === 'splash') document.body.classList.add('splash');
      else document.body.classList.remove('splash');
    }
    VIEWS.forEach(function (v) {
      var el = viewEls[v];
      if (el) el.hidden = (v !== name);
    });
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      var links = document.querySelectorAll('.nav-link');
      for (var i = 0; i < links.length; i++) {
        var on = links[i].getAttribute('data-view') === name;
        if (on) links[i].classList.add('active');
        else links[i].classList.remove('active');
      }
    }
    if (name === 'dashboard') renderDashboard();
    if (name === 'profile') renderProfile();
    return name;
  }

  /* Play with a login gate: logged in (or already playing) -> game;
     logged out -> login view, then auto-start after login/guest. */
  function requestPlay() {
    if (state.screen === 'playing' || state.screen === 'paused' ||
        state.screen === 'levelclear' || state.screen === 'gameover') {
      showView('game');
      return;
    }
    if (!isLoggedIn()) {
      pendingPlay = true;
      openLoginModal();
      return;
    }
    startGame();
  }

  function wireNav() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    var links = document.querySelectorAll('.nav-link');
    for (var i = 0; i < links.length; i++) {
      (function (link) {
        link.addEventListener('click', function (e) {
          if (e && e.preventDefault) e.preventDefault();
          var v = link.getAttribute('data-view');
          if (v === 'game') requestPlay();
          else showView(v);
        });
      })(links[i]);
    }
  }

  function wireLoginButtons() {
    function goLogin() { pendingView = currentView; openLoginModal(); }
    if (els.dashLoginBtn) els.dashLoginBtn.addEventListener('click', goLogin);
    if (els.profileLoginBtn) els.profileLoginBtn.addEventListener('click', goLogin);
    if (els.profileLogoutBtn) els.profileLogoutBtn.addEventListener('click', logout);
    if (els.dashBoardBtn) els.dashBoardBtn.addEventListener('click', function () { showView('leaderboard'); });
    if (els.dashProfileBtn) els.dashProfileBtn.addEventListener('click', function () { showView('profile'); });
    if (els.loginGuestBtn) els.loginGuestBtn.addEventListener('click', loginGuest);
    if (els.loginEmailForm) els.loginEmailForm.addEventListener('submit', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      loginEmail();
    });
    if (els.loginModalClose) els.loginModalClose.addEventListener('click', cancelLogin);
    if (els.loginModalBackdrop) els.loginModalBackdrop.addEventListener('click', cancelLogin);
  }

  /* ================= Login modal (pop-up pilihan login) ================= */
  function isLoginModalOpen() {
    return !!(els.loginModal && !els.loginModal.hidden);
  }

  function openLoginModal() {
    if (els.loginModal) els.loginModal.hidden = false;
  }

  function closeLoginModal() {
    if (els.loginModal) els.loginModal.hidden = true;
  }

  /* Tutup modal tanpa login (tombol × / klik backdrop / Escape):
     batalkan permintaan Play yang tertunda. */
  function cancelLogin() {
    closeLoginModal();
    pendingPlay = false;
    pendingView = null;
  }

  /* ================= Login state ================= */
  function shortAddr(addr) {
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  function isLoggedIn() {
    return !!(state.walletAddress || state.guest || state.email);
  }

  function getWalletAddress() {
    return state.walletAddress || null;
  }

  function persistLogin() {
    try {
      if (typeof localStorage === 'undefined') return;
      if (state.walletAddress) localStorage.setItem(WALLET_KEY, state.walletAddress);
      else localStorage.removeItem(WALLET_KEY);
      if (state.guest) localStorage.setItem(GUEST_KEY, '1');
      else localStorage.removeItem(GUEST_KEY);
      if (state.email) localStorage.setItem(EMAIL_KEY, state.email);
      else localStorage.removeItem(EMAIL_KEY);
    } catch (e) {}
  }

  function restoreLogin() {
    try {
      if (typeof localStorage === 'undefined') return;
      var w = localStorage.getItem(WALLET_KEY);
      if (w) state.walletAddress = w;
      state.guest = localStorage.getItem(GUEST_KEY) === '1';
      var em = localStorage.getItem(EMAIL_KEY);
      if (em) state.email = em;
    } catch (e) {}
    if (state.walletAddress && typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      var btns = document.querySelectorAll('.wallet-btn');
      for (var i = 0; i < btns.length; i++) btns[i].textContent = shortAddr(state.walletAddress);
    }
  }

  /* Wallet connected/disconnected (event dispatched by wallet.js). */
  function onWalletEvent(e) {
    var d = (e && e.detail) || {};
    if (d.address) {
      state.walletAddress = d.address;
      state.guest = false;
      state.email = null;
      persistLogin();
      if (isLoginModalOpen()) {
        if (els.loginMsg) { els.loginMsg.style.color = ''; els.loginMsg.textContent = 'Login berhasil! ✓'; }
        var go = pendingPlay ? 'play' : (pendingView || 'dashboard');
        pendingPlay = false; pendingView = null;
        setTimeout(function () {
          closeLoginModal();
          if (go === 'play') startGame();
          else showView(go);
        }, 500);
      } else {
        renderDashboard();
        renderProfile();
      }
    } else if (state.walletAddress) {
      // Wallet disconnected.
      state.walletAddress = null;
      persistLogin();
      renderDashboard();
      renderProfile();
    }
  }

  function loginGuest() {
    state.guest = true;
    state.walletAddress = null;
    state.email = null;
    persistLogin();
    if (els.loginMsg) { els.loginMsg.style.color = ''; els.loginMsg.textContent = 'Mode guest aktif — selamat bermain!'; }
    var go = pendingPlay ? 'play' : (pendingView || 'dashboard');
    pendingPlay = false; pendingView = null;
    setTimeout(function () {
      closeLoginModal();
      if (go === 'play') startGame();
      else showView(go);
    }, 400);
  }

  /* Login pakai email (identitas lokal, tanpa OTP/verifikasi kode —
     email disimpan di perangkat; verifikasi beneran butuh layanan
     seperti Privy/Magic dan jadi langkah berikutnya). */
  function loginEmail() {
    var input = els.loginEmailInput;
    var email = input && input.value ? String(input.value).trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      if (els.loginMsg) { els.loginMsg.style.color = '#f87171'; els.loginMsg.textContent = 'Masukkan email yang valid.'; }
      return;
    }
    state.email = email;
    state.walletAddress = null;
    state.guest = false;
    persistLogin();
    if (els.loginMsg) { els.loginMsg.style.color = ''; els.loginMsg.textContent = 'Login email aktif — selamat bermain!'; }
    var go = pendingPlay ? 'play' : (pendingView || 'dashboard');
    pendingPlay = false; pendingView = null;
    setTimeout(function () {
      closeLoginModal();
      if (go === 'play') startGame();
      else showView(go);
    }, 400);
  }

  function logout() {
    state.walletAddress = null;
    state.guest = false;
    state.email = null;
    persistLogin();
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      var btns = document.querySelectorAll('.wallet-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].textContent = 'Connect Wallet';
        btns[i].classList.remove('connected');
      }
    }
    renderDashboard();
    renderProfile();
    showView('dashboard');
  }

  /* ================= Local stats ================= */
  function saveStats() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  function loadStats() {
    try {
      if (typeof localStorage === 'undefined') return;
      var raw = localStorage.getItem(STATS_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') stats = p;
      }
    } catch (e) {}
  }

  function recordStats() {
    if (state.tokens > stats.tokens) stats.tokens = state.tokens;
    if (state.score > stats.score) stats.score = state.score;
    if (state.level > stats.level) stats.level = state.level;
    stats.played = true;
    saveStats();
  }

  function getStats() {
    return {
      tokens: Math.max(state.tokens || 0, stats.tokens || 0),
      score: Math.max(state.score || 0, stats.score || 0),
      level: stats.played ? Math.max(state.level || 0, stats.level || 0) : 0
    };
  }

  function renderDashboard() {
    var s = getStats();
    if (els.dashPlayerTitle) {
      els.dashPlayerTitle.textContent = isLoggedIn()
        ? (state.walletAddress ? shortAddr(state.walletAddress)
          : (state.email ? state.email : 'Mode Guest'))
        : 'Belum login';
    }
    if (els.dashPlayerStats) {
      els.dashPlayerStats.textContent = isLoggedIn()
        ? '🪙 Token ' + s.tokens + ' · ⭐ Score ' + s.score + ' · Level ' + s.level
        : 'Login dengan wallet Base untuk melacak skor & tokenmu.';
    }
    if (els.dashLoginBtn) els.dashLoginBtn.hidden = isLoggedIn();
  }

  function renderProfile() {
    var s = getStats();
    if (els.profileAddr) {
      els.profileAddr.textContent = state.walletAddress
        ? state.walletAddress
        : (state.email ? state.email
          : (state.guest ? 'Mode Guest (tanpa wallet)' : 'Belum login'));
    }
    if (els.profileStats) {
      els.profileStats.textContent = isLoggedIn()
        ? '🪙 Token ' + s.tokens + ' · ⭐ Score ' + s.score + ' · Level ' + s.level + ' · Strategi: ' + playerStrategy
        : 'Login dulu untuk melihat profil & statistikmu.';
    }
    if (els.profileLoginBtn) els.profileLoginBtn.hidden = isLoggedIn();
    if (els.profileLogoutBtn) els.profileLogoutBtn.hidden = !isLoggedIn();
  }

  /* ================= Public API (debug / tests) ================= */
  var api = {
    state: state, input: input,
    COLS: COLS, ROWS: ROWS, TILE: TILE,
    SPAWNS: SPAWNS, MONSTER_GATE: MONSTER_GATE,
    T_SOFT: T_SOFT, T_MED: T_MED, T_TOUGH: T_TOUGH,
    P_TOKEN: P_TOKEN, P_WALLPASS: P_WALLPASS, WALLPASS_MS: WALLPASS_MS,
    generateMap: generateMap, spawnEnemies: spawnEnemies, damageBlock: damageBlock,
    makeFighter: makeFighter, thinkFighter: thinkFighter,
    bfsSafeFrom: bfsSafeFrom, escapeBFS: escapeBFS, randomSafeDirFor: randomSafeDirFor,
    monsterSet: monsterSet, nearestMonsterDist: nearestMonsterDist,
    fleeMonsterDir: fleeMonsterDir, mergeDanger: mergeDanger,
    setStrategy: setStrategy, nearestLivingFighterTile: nearestLivingFighterTile,
    moveFighter: moveFighter, placeBombFor: placeBombFor,
    hitFighter: hitFighter, collectPowerupFor: collectPowerupFor,
    fighterTile: fighterTile,
    newGame: newGame, startLevel: startLevel, startGame: startGame,
    showView: showView, requestPlay: requestPlay,
    isLoggedIn: isLoggedIn, getWalletAddress: getWalletAddress,
    getStats: getStats, loginGuest: loginGuest, loginEmail: loginEmail, logout: logout,
    openLoginModal: openLoginModal, closeLoginModal: closeLoginModal,
    cancelLogin: cancelLogin, isLoginModalOpen: isLoginModalOpen,
    getCurrentView: function () { return currentView; },
    placeBomb: placeBomb, explodeBomb: explodeBomb, explosionCells: explosionCells,
    hitPlayer: hitPlayer, update: update, render: render,
    playerTile: playerTile, tileSolid: tileSolid,
    applyPowerup: applyPowerup
  };
  if (typeof window !== 'undefined') window.BaseBomber = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
