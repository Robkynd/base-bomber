/* Base Bomber — Connect Wallet stub (Base).
   Read-only: requests accounts + chain id from window.ethereum.
   NO transactions, NO signing, NO eth_call / network calls to the chain. */
(function () {
  'use strict';

  var BASE_CHAIN_ID_HEX = '0x2105'; // 8453

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
     Logika connect di bawah tidak diubah — ini hanya pemberitahuan. */
  function notifyWallet(address, chainId) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent('bombchain:wallet', {
      detail: { address: address || null, chainId: chainId || null }
    }));
  }

  function updateUI(address, chainId) {
    var isBase = !!chainId && String(chainId).toLowerCase() === BASE_CHAIN_ID_HEX;
    var chainLabel = isBase ? 'Base ✓' : ('Chain ' + parseInt(chainId, 16));
    setButtons(shortAddr(address) + ' · ' + chainLabel, true);
    setStatus(isBase
      ? 'Connected to Base (chain 8453) as ' + shortAddr(address) + '.'
      : 'Connected as ' + shortAddr(address) + ' on chain ' + parseInt(chainId, 16) +
        ' — switch to Base (8453) to play on Base.', true);
    notifyWallet(address, chainId);
  }

  async function connect() {
    if (typeof window === 'undefined' || !window.ethereum) {
      setStatus('No wallet found in this browser. Install MetaMask or Coinbase Wallet, then tap Connect again.');
      return;
    }
    try {
      var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts.length) { setStatus('No account selected.'); return; }
      var chainId = await window.ethereum.request({ method: 'eth_chainId' });
      updateUI(accounts[0], chainId);
    } catch (err) {
      setStatus('Connection cancelled. You can still play as a guest.');
    }
  }

  function init() {
    var btns = document.querySelectorAll('.wallet-btn');
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', connect);
    if (window.ethereum && typeof window.ethereum.on === 'function') {
      window.ethereum.on('accountsChanged', function (accounts) {
        if (accounts && accounts.length) {
          window.ethereum.request({ method: 'eth_chainId' })
            .then(function (cid) { updateUI(accounts[0], cid); })
            .catch(function () {});
        } else {
          setButtons('Connect Wallet', false);
          setStatus('Wallet disconnected. You can still play as a guest.');
          notifyWallet(null, null);
        }
      });
      window.ethereum.on('chainChanged', function (chainId) {
        window.ethereum.request({ method: 'eth_accounts' })
          .then(function (accs) { if (accs && accs.length) updateUI(accs[0], chainId); })
          .catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
