# Base Bomber — Jalur Grant (Base Batches / Builder Grant)

## Yang sudah ada
- Game jalan: auto-battler, 4 fighter (strategi Balanced/Aggressive/Greedy/Defensive), monster, sudden death, token + wall-pass
- Splash retro pixel art, login pop-up (wallet stub / email lokal / guest), dashboard, leaderboard (placeholder), profile
- Fighter NFT: placeholder (`nft: null`) — belum ada kontrak/mint
- Token: angka lokal di browser, belum on-chain
- Hosting: belum ada (masih file lokal/standalone)

## Yang kurang (biar layak grant)
1. **Hosting HTTPS publik (wajib)** — game harus live di URL publik (Vercel/Netlify, gratis). Ini juga syarat daftar Base Dashboard.
2. **Wallet beneran** — ganti stub dengan Base Account (passkey, tanpa ekstensi) atau wagmi + Coinbase Wallet/MetaMask. Base Account paling "Base".
3. **Fitur on-chain beneran (minimal satu):**
   - Leaderboard on-chain (smart contract nyatet skor/token), atau
   - Fighter NFT (mint fighter jadi NFT polos, sesuai rencana awal), atau
   - Klaim token hasil main ke on-chain.
   Tanpa ini, game cuma web biasa, bukan aplikasi on-chain.
4. **Builder Codes** — kode dari Base Dashboard yang dipasang di transaksi aplikasi. Syarat pertama buat layak Builder Grant (sampai $5.000).
5. **Daftar di Base Dashboard** — biar aplikasi muncul di Coinbase Wallet.
6. **Bukti pemakaian** — produk jalan + ada yang pakai/transaksi tercatat (minimal beberapa orang coba).

## Urutan kerja
- **Fase 1** — Hosting + daftar Base Dashboard.
- **Fase 2** — Wallet beneran (Base Account).
- **Fase 3** — Kontrak on-chain (leaderboard dan/atau fighter NFT), testnet dulu baru mainnet.
- **Fase 4** — Builder Codes + polish.
- **Fase 5** — Daftar grant (pitch + demo + kirim).

## Yang butuh dari Roby
- Pilih hosting (Vercel/Netlify) + akun Base Dashboard.
- Dana gas kecil buat deploy kontrak (nanti dikasih preview angkanya dulu sebelum apa pun dikirim).
- Keputusan gas/skip tiap fase.

## Catatan jujur
- Grant itu kompetitif, tidak dijamin dapat.
- Base Bomber sudah ~80% jalan, jadi jalurnya lebih pendek daripada mulai dari nol.
- Kontrak on-chain butuh kehati-hatian (testnet dulu, cek keamanan, gas).
