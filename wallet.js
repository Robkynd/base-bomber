/* Base Bomber — Connect Wallet (Base Account).
   Uses the Base Account SDK (@base-org/account, pinned 2.6.0 via unpkg CDN)
   when available, and falls back to an injected window.ethereum wallet
   (MetaMask / Coinbase Wallet extension).
   Identity only: requests accounts + chain id. NO transactions, NO signing
   (SIWE via wallet_connect is the upgrade path if verified auth is needed). */
(function () {
  'use strict';

  var BASE_CHAIN_ID_HEX = '0x2105'; // 8453
  var BASE_CHAIN_ID_DEC = 8453;
  var APP_NAME = 'Base Bomber';
  var APP_LOGO_URL = 'https://robkynd.github.io/base-bomber/concept.webp';

  var provider = null;      // active EIP-1193 provider
  var providerKind = null;  // 'base-account' | 'injected'
  var baseAccountSdk = null; // memoized SDK instance
  var eventsWired = false;

  function shortAddr(addr) {
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  function setStatus(text, connected) {
    var el = document.getElementById('walletStatus');
    if (!el) return;
    el.textContent = text;
    if (connected) el.classList.add('connected');
    else el.classList.remove('connected');
  }

  function setButtons(label, connected) {
    var btns = document.querySelectorAll('.wallet-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = label;
      if (connected) btns[i].classList.add('connected');
      else btns[i].classList.remove('connected');
    }
  }

  /* Tell the app (game.js) about a wallet change: connect or disconnect.
     Event name kept as 'bombchain:wallet' so game.js needs no change. */
  function notifyWallet(address, chainId) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('bombchain:wallet', {
      detail: { address: address || null, chainId: chainId || null }
    }));
  }

  function updateUI(address, chainId) {
    var isBase = !!chainId && String(chainId).toLowerCase() === BASE_CHAIN_ID_HEX;
    var via = providerKind === 'base-account' ? 'Base Account' : 'wallet';
    var chainLabel = isBase ? 'Base ✓' : ('Chain ' + parseInt(chainId, 16));
    setButtons(shortAddr(address) + ' · ' + chainLabel, true);
    setStatus(isBase
      ? 'Connected via ' + via + ' to Base (chain 8453) as ' + shortAddr(address) + '.'
      : 'Connected via ' + via + ' as ' + shortAddr(address) + ' on chain ' + parseInt(chainId, 16) +
        ' — switch to Base (8453) to play on Base.', true);
    notifyWallet(address, chainId);
  }

  /* Base Account SDK (CDN). Returns an EIP-1193 provider, or null if the
     SDK script failed to load (offline / CDN blocked). Memoized: the SDK
     keeps session state in IndexedDB, so create it once. */
  function getBaseAccountProvider() {
    if (baseAccountSdk) return baseAccountSdk.getProvider();
    if (typeof window === 'undefined' || typeof window.createBaseAccountSDK !== 'function') return null;
    try {
      baseAccountSdk = window.createBaseAccountSDK({
        appName: APP_NAME,
        appLogoUrl: APP_LOGO_URL,
        appChainIds: [BASE_CHAIN_ID_DEC],
      });
      return baseAccountSdk.getProvider();
    } catch (e) {
      return null;
    }
  }

  /* Prefer Base Account; fall back to an injected wallet. */
  function pickProvider() {
    var p = getBaseAccountProvider();
    if (p) { providerKind = 'base-account'; return p; }
    if (typeof window !== 'undefined' && window.ethereum) {
      providerKind = 'injected';
      return window.ethereum;
    }
    return null;
  }

  /* Try to switch to Base (8453). Best-effort: if the user declines or the
     provider can't switch, we keep playing and updateUI shows the warning. */
  async function ensureBaseChain() {
    if (!provider) return;
    try {
      var cid = await provider.request({ method: 'eth_chainId' });
      if (String(cid).toLowerCase() === BASE_CHAIN_ID_HEX) return;
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
    } catch (e) { /* declined / unsupported — non-fatal */ }
  }

  async function connect() {
    provider = pickProvider();
    if (!provider) {
      setStatus('No wallet found in this browser. Install Coinbase Wallet (Base Account) or MetaMask, then tap Connect again.');
      return;
    }
    wireEvents();
    try {
      setStatus('Connecting…');
      var accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts.length) { setStatus('No account selected.'); return; }
      await ensureBaseChain();
      var chainId = await provider.request({ method: 'eth_chainId' });
      updateUI(accounts[0], chainId);
    } catch (err) {
      setStatus('Connection cancelled. You can still play as a guest.');
    }
  }

  function onAccountsChanged(accounts) {
    if (!provider) return;
    if (accounts && accounts.length) {
      provider.request({ method: 'eth_chainId' })
        .then(function (cid) { updateUI(accounts[0], cid); })
        .catch(function () {});
    } else {
      setButtons('Connect Wallet', false);
      setStatus('Wallet disconnected. You can still play as a guest.');
      notifyWallet(null, null);
    }
  }

  function onChainChanged(chainId) {
    if (!provider) return;
    provider.request({ method: 'eth_accounts' })
      .then(function (accs) { if (accs && accs.length) updateUI(accs[0], chainId); })
      .catch(function () {});
  }

  function wireEvents() {
    if (eventsWired || !provider || typeof provider.on !== 'function') return;
    provider.on('accountsChanged', onAccountsChanged);
    provider.on('chainChanged', onChainChanged);
    eventsWired = true;
  }

  function init() {
    var btns = document.querySelectorAll('.wallet-btn');
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', connect);
    /* Silent restore: the Base Account SDK persists the session, so a
       returning player is already connected — show it without a prompt.
       HANYA kalau wallet ini pernah connect sebelumnya (alamat tersimpan di
       localStorage oleh game.js). Tanpa guard ini, restore async bisa
       menimpa pilihan login lain (guest/email) yang ditekan duluan. */
    provider = pickProvider();
    if (!provider) return;
    wireEvents();
    var savedAddr = null;
    try {
      if (typeof localStorage !== 'undefined') savedAddr = localStorage.getItem('bombchain.wallet');
    } catch (e) {}
    if (!savedAddr) return;
    provider.request({ method: 'eth_accounts' })
      .then(function (accs) {
        if (!accs || !accs.length) return;
        return provider.request({ method: 'eth_chainId' })
          .then(function (cid) { updateUI(accs[0], cid); })
          .catch(function () {});
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
