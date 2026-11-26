/* BombChain — headless pacing test: does a match finish with a winner?
   Runs N organic sims (update 0.05s per step, up to 180s game-time each)
   with varied player strategies and reports winner / time / KOs.
   Run: node ~/workspace/bomberman/tests/pacing-test.js */
'use strict';

/* ---------- Fake DOM (same pattern as nav-smoke-test.js) ---------- */
function makeClassList() {
  var s = new Set();
  return {
    add: function (c) { s.add(c); },
    remove: function (c) { s.delete(c); },
    contains: function (c) { return s.has(c); }
  };
}
var CTX = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '', textAlign: '',
  fillRect: function () {}, beginPath: function () {}, arc: function () {},
  fill: function () {}, stroke: function () {}, moveTo: function () {}, lineTo: function () {},
  quadraticCurveTo: function () {}, closePath: function () {}, fillText: function () {}
};
function makeEl(id, classes, attrs) {
  var el = {
    id: id || '', hidden: false, textContent: '', onclick: null,
    classList: makeClassList(), _handlers: {}, _attrs: attrs || {},
    addEventListener: function (t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    click: function () {
      var hs = this._handlers.click || [];
      hs.forEach(function (f) { f({ preventDefault: function () {} }); });
      if (typeof this.onclick === 'function') this.onclick();
    },
    getAttribute: function (k) { return this._attrs[k] || null; },
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getContext: function () { return CTX; }
  };
  (classes || []).forEach(function (c) { el.classList.add(c); });
  return el;
}
var byId = {};
var viewEls = [], navLinks = [], walletBtns = [], stratBtns = [];
function reg(el) { if (el.id) byId[el.id] = el; return el; }

function setupDOM() {
  byId = {}; viewEls = []; navLinks = []; walletBtns = []; stratBtns = [];
  ['dashboard', 'login', 'game', 'leaderboard', 'profile'].forEach(function (v) {
    var id = v === 'game' ? 'game' : 'view-' + v;
    var el = reg(makeEl(id, ['view']));
    el.hidden = (v !== 'dashboard');
    viewEls.push(el);
  });
  [['dashboard', 'Dashboard'], ['game', 'Play'], ['leaderboard', 'Leaderboard'], ['profile', 'Profile']]
    .forEach(function (pair) {
      var el = makeEl('', ['nav-link'], { 'data-view': pair[0] });
      if (pair[0] === 'dashboard') el.classList.add('active');
      navLinks.push(el);
    });
  walletBtns.push(reg(makeEl('walletBtnTop', ['wallet-btn'])));
  walletBtns.push(reg(makeEl('loginConnectBtn', ['wallet-btn'])));
  ['balanced', 'aggressive', 'greedy', 'defensive'].forEach(function (s) {
    var el = makeEl('', ['strat-btn'], { 'data-strategy': s });
    if (s === 'balanced') el.classList.add('active');
    stratBtns.push(el);
  });
  ['hudLives', 'hudScore', 'hudTime', 'hudLevel', 'hudWallpass', 'hudTokens',
   'hudSudden',
   'msg', 'overlay', 'overlayTitle', 'overlayText', 'overlayBtn', 'overlayBtn2',
   'dashPlayerTitle', 'dashPlayerStats', 'dashLoginBtn', 'dashBoardBtn', 'dashProfileBtn',
   'loginMsg', 'loginGuestBtn', 'profileAddr', 'profileStats',
   'profileLoginBtn', 'profileLogoutBtn', 'walletStatus',
   'pauseBtn', 'restartBtn', 'menuBtn', 'playBtn'].forEach(function (id) { reg(makeEl(id)); });
  reg(makeEl('gameCanvas'));
  global.document = {
    readyState: 'complete',
    getElementById: function (id) { return byId[id] || null; },
    querySelectorAll: function (sel) {
      if (sel === '.view') return viewEls;
      if (sel === '.nav-link') return navLinks;
      if (sel === '.wallet-btn') return walletBtns;
      if (sel === '.strat-btn') return stratBtns;
      return [];
    },
    addEventListener: function () {}
  };
}
var winHandlers = {};
function setupGlobals() {
  winHandlers = {};
  global.window = {
    addEventListener: function (t, fn) { (winHandlers[t] = winHandlers[t] || []).push(fn); },
    dispatchEvent: function (ev) { (winHandlers[ev.type] || []).forEach(function (f) { f(ev); }); },
    ethereum: undefined
  };
  global.CustomEvent = function (type, opts) {
    this.type = type;
    this.detail = (opts && opts.detail) || {};
  };
  global.requestAnimationFrame = function () {};
}
var LS = {
  _d: {},
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
global.localStorage = LS;

function loadApp() {
  delete require.cache[require.resolve('/home/hatch/workspace/bomberman/game.js')];
  delete require.cache[require.resolve('/home/hatch/workspace/bomberman/wallet.js')];
  var api = require('/home/hatch/workspace/bomberman/game.js');
  require('/home/hatch/workspace/bomberman/wallet.js');
  return api;
}

/* ---------- One organic sim ---------- */
function runSim(api, strategy, maxSec) {
  api.setStrategy(strategy);
  api.newGame();
  var S = api.state;
  var steps = Math.round(maxSec / 0.05);
  var winner = null, endSec = null, suddenAt = null;
  var koTimes = [];
  var prevAlive = 4;
  for (var i = 0; i < steps; i++) {
    api.update(0.05);
    if (suddenAt === null && S.suddenDeath) suddenAt = S.timeSec;
    var aliveNow = S.fighters.filter(function (f) { return f.alive !== false; }).length;
    if (aliveNow < prevAlive) { koTimes.push(S.timeSec); prevAlive = aliveNow; }
    if (S.screen === 'levelclear') {
      var alive = S.fighters.filter(function (f) { return f.alive !== false; });
      winner = alive.length ? alive[0].name : '?';
      endSec = S.timeSec;
      break;
    }
    if (S.screen === 'gameover') { winner = null; endSec = S.timeSec; break; }
  }
  var kos = S.fighters.filter(function (f) { return f.alive === false; }).length;
  var livesLost = 0;
  S.fighters.forEach(function (f) { livesLost += 3 - Math.max(0, f.lives || 0); });
  return {
    strategy: strategy, winner: winner, endSec: endSec,
    kos: kos, livesLost: livesLost,
    suddenAt: suddenAt, koTimes: koTimes,
    alive: S.fighters.filter(function (f) { return f.alive !== false; }).length,
    screen: S.screen
  };
}

function main() {
  var strategies = ['balanced', 'aggressive', 'greedy', 'defensive', 'balanced'];
  var maxSec = 180;
  setupDOM(); setupGlobals();
  var api = loadApp();
  console.log('== Pacing sim: ' + strategies.length + ' match, maks ' + maxSec + ' dtk game-time ==');
  var results = strategies.map(function (s, idx) {
    var r = runSim(api, s, maxSec);
    console.log('  match ' + (idx + 1) + ' [' + s + ']: ' +
      (r.winner ? 'PEMENANG ' + r.winner + ' @ ' + r.endSec.toFixed(1) + ' dtk' : 'STALL (' + r.screen + ', ' + r.alive + ' hidup)') +
      ' | KO=' + r.kos + ' @ [' + r.koTimes.map(function (t) { return t.toFixed(0); }).join(',') + ']' +
      ' | nyawa hilang=' + r.livesLost +
      (r.suddenAt !== null ? ' | sudden death @ ' + r.suddenAt.toFixed(1) + ' dtk' : ''));
    return r;
  });
  var finished = results.filter(function (r) { return !!r.winner; });
  var times = finished.map(function (r) { return r.endSec; }).sort(function (a, b) { return a - b; });
  var median = times.length ? times[Math.floor(times.length / 2)] : null;
  var avgKo = results.reduce(function (a, r) { return a + r.kos; }, 0) / results.length;
  console.log('HASIL: ' + finished.length + '/' + results.length + ' selesai dengan pemenang' +
    (median !== null ? ' | median waktu ' + median.toFixed(1) + ' dtk' : '') +
    ' | rata-rata KO ' + avgKo.toFixed(1) + '/match');
  process.exit(finished.length === results.length ? 0 : 1);
}
main();
