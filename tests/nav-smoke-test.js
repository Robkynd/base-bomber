/* BombChain — headless smoke test: nav + dashboard + login + play gating.
   Stubs: document/window/requestAnimationFrame/canvas ctx/localStorage + mock ethereum.
   Run: node ~/workspace/bomberman/tests/nav-smoke-test.js */
'use strict';

var passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---------- Fake DOM ---------- */
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
    id: id || '', hidden: false, textContent: '', value: '', onclick: null, style: {},
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
  // Views (splash = tampilan pertama saat buka; login sekarang modal, bukan view)
  ['splash', 'dashboard', 'game', 'leaderboard', 'profile'].forEach(function (v) {
    var id = v === 'game' ? 'game' : 'view-' + v;
    var el = reg(makeEl(id, ['view']));
    el.hidden = (v !== 'splash');
    viewEls.push(el);
  });
  // Nav links (splash bukan item nav -> tidak ada yang aktif saat pertama buka)
  [['dashboard', 'Dashboard'], ['game', 'Play'], ['leaderboard', 'Leaderboard'], ['profile', 'Profile']]
    .forEach(function (pair) {
      var el = makeEl('', ['nav-link'], { 'data-view': pair[0] });
      navLinks.push(el);
    });
  // Wallet buttons (topbar + login view)
  walletBtns.push(reg(makeEl('walletBtnTop', ['wallet-btn'])));
  walletBtns.push(reg(makeEl('loginConnectBtn', ['wallet-btn'])));
  // Strategy buttons
  ['balanced', 'aggressive', 'greedy', 'defensive'].forEach(function (s) {
    var el = makeEl('', ['strat-btn'], { 'data-strategy': s });
    if (s === 'balanced') el.classList.add('active');
    stratBtns.push(el);
  });
  // HUD + game elements
  ['hudLives', 'hudScore', 'hudTime', 'hudLevel', 'hudWallpass', 'hudTokens',
   'msg', 'overlay', 'overlayTitle', 'overlayText', 'overlayBtn', 'overlayBtn2',
   'dashPlayerTitle', 'dashPlayerStats', 'dashLoginBtn', 'dashBoardBtn', 'dashProfileBtn',
   'loginMsg', 'loginGuestBtn', 'loginEmailForm', 'loginEmailInput', 'loginEmailBtn',
   'loginModal', 'loginModalBackdrop', 'loginModalClose',
   'profileAddr', 'profileStats',
   'profileLoginBtn', 'profileLogoutBtn', 'walletStatus',
   'pauseBtn', 'restartBtn', 'menuBtn', 'playBtn', 'splashPlayBtn'].forEach(function (id) { reg(makeEl(id)); });
  byId.loginModal.hidden = true; // modal mulai tertutup (sesuai atribut hidden di HTML)
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

/* ---------- Fake window / localStorage / ethereum ---------- */
var winHandlers = {};
var MOCK_ADDR = '0xAbC1234567890abcdef1234567890AbCDEF1234';
var mockEth = {
  request: function (opts) {
    if (opts.method === 'eth_requestAccounts') return Promise.resolve([MOCK_ADDR]);
    if (opts.method === 'eth_chainId') return Promise.resolve('0x2105');
    if (opts.method === 'eth_accounts') return Promise.resolve([MOCK_ADDR]);
    return Promise.resolve(null);
  },
  on: function () {}
};
function setupGlobals(withEth) {
  winHandlers = {};
  global.window = {
    addEventListener: function (t, fn) { (winHandlers[t] = winHandlers[t] || []).push(fn); },
    dispatchEvent: function (ev) { (winHandlers[ev.type] || []).forEach(function (f) { f(ev); }); },
    ethereum: withEth ? mockEth : undefined
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
function viewHidden(name) {
  var id = name === 'game' ? 'game' : 'view-' + name;
  return byId[id].hidden;
}
function navActive(name) {
  return navLinks.some(function (l) {
    return l.getAttribute('data-view') === name && l.classList.contains('active');
  });
}

(async function main() {
  console.log('== Fase A: default view + nav switching ==');
  setupDOM(); setupGlobals(true);
  var api = loadApp();

  check('default view = splash', api.getCurrentView() === 'splash');
  check('splash terlihat, view lain hidden',
    !viewHidden('splash') && viewHidden('dashboard') && viewHidden('game') &&
    viewHidden('leaderboard') && viewHidden('profile'));
  check('modal login mulai tertutup', byId.loginModal.hidden === true);
  check('tidak ada nav yang aktif di splash',
    !navActive('dashboard') && !navActive('game') && !navActive('leaderboard') && !navActive('profile'));
  check('belum login saat pertama buka', api.isLoggedIn() === false);
  check('dashboard tampil "Belum login"', byId.dashPlayerTitle.textContent === 'Belum login');
  check('stats awal 0', (function (s) { return s.tokens === 0 && s.score === 0 && s.level === 0; })(api.getStats()));

  // Tombol Play di splash saat belum login -> pop-up login (modal), splash tetap di belakang
  byId.splashPlayBtn.click();
  check('klik Play splash saat belum login -> modal login terbuka', api.isLoginModalOpen() === true);
  check('modal terbuka, view tetap splash', api.getCurrentView() === 'splash' && !viewHidden('splash'));
  // Tutup modal (×) -> kembali ke splash, tidak login
  byId.loginModalClose.click();
  check('tutup modal (×) -> modal tertutup + tetap splash + belum login',
    api.isLoginModalOpen() === false && api.getCurrentView() === 'splash' && api.isLoggedIn() === false);
  // Buka lagi via Play, lalu tutup via backdrop
  byId.splashPlayBtn.click();
  check('klik Play lagi -> modal terbuka', api.isLoginModalOpen() === true);
  byId.loginModalBackdrop.click();
  check('klik backdrop -> modal tertutup', api.isLoginModalOpen() === false);

  api.showView('game');
  check('pindah ke game + nav Play aktif', !viewHidden('game') && navActive('game'));
  check('splash ikut tersembunyi saat pindah view (regression: viewEls harus ada splash)',
    viewHidden('splash'));
  api.showView('leaderboard');
  check('pindah ke leaderboard + nav aktif', !viewHidden('leaderboard') && navActive('leaderboard'));
  api.showView('profile');
  check('pindah ke profile + nav aktif', !viewHidden('profile') && navActive('profile'));
  check('profile ajak login saat belum login', byId.profileAddr.textContent === 'Belum login');

  // Klik link nav Play saat belum login -> pop-up login (modal)
  var playLink = navLinks.filter(function (l) { return l.getAttribute('data-view') === 'game'; })[0];
  api.showView('dashboard');
  playLink.click();
  check('klik nav Play saat belum login -> modal login terbuka', api.isLoginModalOpen() === true);
  api.cancelLogin();

  console.log('== Fase B: guest login -> main ==');
  byId.splashPlayBtn.click(); // Play -> modal (pendingPlay = true)
  check('modal terbuka sebelum guest login', api.isLoginModalOpen() === true);
  byId.loginGuestBtn.click();
  await sleep(600);
  check('guest login -> game jalan (screen playing)', api.getCurrentView() === 'game' && api.state.screen === 'playing');
  check('modal tertutup setelah login', api.isLoginModalOpen() === false);
  check('guest tercatat login', api.isLoggedIn() === true);
  check('guest tersimpan di localStorage', LS.getItem('bombchain.guest') === '1');
  check('4 fighter aktif', api.state.fighters.length === 4);

  // 30 detik simulasi: tidak ada exception, fighter bergerak, blok rusak
  var p0 = api.state.fighters.map(function (f) { return [f.px, f.py]; });
  var hp0 = 0; Object.keys(api.state.blockHp).forEach(function (k) { hp0 += api.state.blockHp[k]; });
  for (var i = 0; i < 600; i++) api.update(0.05);
  api.render();
  var moved = api.state.fighters.every(function (f, j) {
    return Math.hypot(f.px - p0[j][0], f.py - p0[j][1]) > 5;
  });
  var hp1 = 0; Object.keys(api.state.blockHp).forEach(function (k) { hp1 += api.state.blockHp[k]; });
  check('sim 30 dtk tanpa exception, semua fighter bergerak', moved);
  check('blok rusak selama sim', hp1 < hp0);

  // Menu button -> dashboard
  byId.menuBtn.click();
  check('tombol Menu -> dashboard', api.getCurrentView() === 'dashboard' && api.state.screen === 'menu');

  // Logout -> kembali belum login
  api.logout();
  check('logout -> belum login + dashboard', api.isLoggedIn() === false && api.getCurrentView() === 'dashboard');
  check('logout hapus guest dari localStorage', LS.getItem('bombchain.guest') === null);

  console.log('== Fase B2: login email -> main ==');
  byId.splashPlayBtn.click(); // Play -> modal (pendingPlay = true)
  check('tekan Play saat logout -> modal login terbuka', api.isLoginModalOpen() === true);
  byId.loginEmailInput.value = 'roby@test.com';
  (byId.loginEmailForm._handlers.submit || []).forEach(function (f) { f({ preventDefault: function () {} }); });
  await sleep(600);
  check('email login -> game jalan (screen playing)', api.getCurrentView() === 'game' && api.state.screen === 'playing');
  check('email tercatat login', api.isLoggedIn() === true);
  check('email tersimpan di localStorage', LS.getItem('bombchain.email') === 'roby@test.com');
  api.showView('dashboard');
  check('dashboard tampil email', byId.dashPlayerTitle.textContent === 'roby@test.com');
  api.showView('profile');
  check('profile tampil email', byId.profileAddr.textContent === 'roby@test.com');
  // Email tidak valid -> ditolak, tetap belum login, modal tetap terbuka
  api.logout();
  check('logout hapus email dari localStorage', LS.getItem('bombchain.email') === null);
  api.openLoginModal();
  byId.loginEmailInput.value = 'bukan-email';
  (byId.loginEmailForm._handlers.submit || []).forEach(function (f) { f({ preventDefault: function () {} }); });
  await sleep(100);
  check('email tidak valid -> tetap belum login + modal tetap terbuka', api.isLoggedIn() === false && api.isLoginModalOpen() === true);
  check('email tidak valid -> pesan error tampil', byId.loginMsg.textContent.indexOf('valid') >= 0);

  console.log('== Fase C: wallet login (mock ethereum) ==');
  api.openLoginModal(); // modal sudah terbuka dari tes email tidak valid; pastikan terbuka
  byId.loginConnectBtn.click();
  await sleep(700);
  check('wallet connect -> logged in', api.isLoggedIn() === true);
  check('alamat wallet benar', api.getWalletAddress() === MOCK_ADDR);
  check('alamat tersimpan di localStorage', LS.getItem('bombchain.wallet') === MOCK_ADDR);
  check('setelah login kembali ke dashboard', api.getCurrentView() === 'dashboard');
  check('dashboard tampil alamat terpotong', byId.dashPlayerTitle.textContent === '0xAbC1...1234');
  check('tombol Log In dashboard hilang setelah login', byId.dashLoginBtn.hidden === true);

  // Play saat sudah login -> langsung main
  api.requestPlay();
  check('Play saat login -> langsung game', api.getCurrentView() === 'game' && api.state.screen === 'playing');
  // Stats tersimpan setelah startLevel (save per-identitas wallet)
  check('stats level >= 1 setelah main', api.getStats().level >= 1);
  check('stats tersimpan di localStorage', LS.getItem('bombchain.save.wallet:' + MOCK_ADDR.toLowerCase()) !== null);
  // Profile tampil alamat + statistik
  api.showView('profile');
  check('profile tampil alamat lengkap', byId.profileAddr.textContent === MOCK_ADDR);
  check('profile tampil statistik', byId.profileStats.textContent.indexOf('Token') >= 0);
  // Save per-identitas: wallet dan guest punya key sendiri-sendiri
  check('save wallet terpisah dari guest',
    LS.getItem('bombchain.save.wallet:' + MOCK_ADDR.toLowerCase()) !== null &&
    LS.getItem('bombchain.save.guest') !== null);
  check('status save wallet tanpa Supabase = perangkat (cloud belum setup)',
    api.getSaveStatus().indexOf('Perangkat') >= 0);

  console.log('== Fase D: reload (persistensi) + tanpa wallet ==');
  // Simulasi reload: DOM baru, localStorage sama, TANPA ethereum
  setupDOM(); setupGlobals(false);
  var api2 = loadApp();
  check('setelah reload tetap login (dari localStorage)', api2.isLoggedIn() === true);
  check('alamat pulih setelah reload', api2.getWalletAddress() === MOCK_ADDR);
  check('default view setelah reload = splash', api2.getCurrentView() === 'splash');
  check('stats pulih setelah reload', api2.getStats().level >= 1);
  // Connect tanpa wallet -> pesan install jelas
  api2.openLoginModal();
  byId.loginConnectBtn.click();
  await sleep(100);
  check('tanpa wallet -> pesan install MetaMask/Coinbase',
    byId.walletStatus.textContent.indexOf('MetaMask') >= 0 &&
    byId.walletStatus.textContent.indexOf('Coinbase') >= 0);

  console.log('\nHASIL: ' + passed + ' PASS, ' + failed + ' FAIL');
  process.exit(failed ? 1 : 0);
})().catch(function (e) {
  console.log('EXCEPTION: ' + (e && e.stack || e));
  process.exit(1);
});
