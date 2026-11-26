# Base Bomber — Bomberman-like auto-battler on Base

An auto-battler Bomberman-style game: four AI fighters (including yours)
walk, place bombs, and fight monsters on their own. You pick a strategy,
then watch the match play out. Pure HTML/CSS/JS — no build step, no
framework. Built for the web first, with a Base on-chain roadmap.

**Live:** https://robkynd.github.io/base-bomber/

## What it is now

- **Arena 19×15** (608×480 canvas, 32px cube-style tiles), deterministic
  seeded maps. 4 corner spawns + a Monster Gate in the middle.
- **3-tier destructible blocks** — soft (1 bomb), med (2 bombs), tough
  (3 bombs). Blast stops at any destructible block.
- **Rewards** — Token currency (per-stage pool 1,000–2,000; biggest token
  guaranteed in a tough wall) + Tembus Tembok (walk through soft bricks
  for 12s; hard pillars still block).
- **4 AI fighters** — Kamu (balanced), Rival 1 (aggressive), Rival 2
  (greedy), Rival 3 (defensive). Each has 3 lives. Monsters chase the
  nearest living fighter. Last fighter standing wins.
- **Strategy picker** — Balanced / Aggressive / Greedy / Defensive,
  persists across levels.
- **Match completion** — sudden death from 90s (bigger blast, faster
  fuse, faster monsters, storm strike every 6s) guarantees a winner.
- **Splash screen** — full-screen retro pixel-art (boy + bomb chased by
  a hedgehog), one Play button inside the image.
- **Login pop-up** — Play opens a modal: Connect Wallet (Base stub),
  Login with Email (local identity, no OTP yet), or Guest. Login
  persists in localStorage; best stats too.
- **Dashboard / Leaderboard / Profile** — SPA views. Leaderboard is a
  placeholder (on-chain leaderboard is on the roadmap).

## Files

| File | What it is |
|---|---|
| `index.html` | SPA shell: splash, dashboard, game, leaderboard, profile + login modal |
| `style.css` | Mobile-first, portrait-friendly styling |
| `game.js` | Engine: map gen, fighters/AI, monsters, bombs, sudden death, login state |
| `wallet.js` | Connect Wallet stub (Base) — read-only, no tx, no signing |
| `build-standalone.js` | Builds `basebomber-standalone.html` (single-file bundle, images inlined) |
| `capacitor.config.json` | `com.basebomber.game` / `Base Bomber`, `webDir: "."` |
| `package.json` | `@capacitor/core` + `@capacitor/cli` (devDeps) |
| `concept.webp` | Concept art used as the dashboard hero |
| `splash-hero.webp` | Retro pixel-art splash (portrait) |
| `grant-plan.md` | Grant roadmap (Base Batches / Builder Grant) |
| `tests/` | Nav smoke test + pacing test (Node, no browser needed) |

## Run it (web)

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Or just double-click `index.html` — it works from `file://` too
(no fetch, no modules, no network needed).

## How to play

It is an **auto-battler** — there are no movement controls. Tap Play,
log in (wallet / email / guest), pick a strategy, and watch your
fighter. Pause with **P** / **Esc**. Start a match with **Enter**.

## Rules

- 19×15 grid: hard pillars (indestructible) + destructible blocks in
  3 tiers (soft 60% / med 30% / tough 10%).
- Token pickups add to your stage pool; the biggest token is always
  hidden in a tough wall. Tembus Tembok lets you walk through soft
  bricks for 12 seconds.
- Monsters spawn from the Monster Gate and chase the nearest living
  fighter. Touch a monster or stand in a blast = lose 1 life (3 lives).
- Score: +10 per brick, +100 per monster, +50 per power-up, +500×level
  clear bonus. Last fighter standing wins the match.
- Sudden death (from 90s): blast range +1, fuse 1.2s, monsters ×1.5
  speed, and a storm strike hits a random living fighter every 6s.

## Wallet

Connect Wallet uses `window.ethereum` if present: `eth_requestAccounts`
+ `eth_chainId` only. It shows a truncated address + chain id and marks
Base (chain 8453). Email login stores the address locally (no OTP yet).
No transactions, no signing, no chain RPC calls. Without a wallet it
shows a friendly message and the game still plays as guest.

## Roadmap (grant plan — see `grant-plan.md`)

1. Public HTTPS hosting (this repo via GitHub Pages) + Base Dashboard
   registration.
2. Real wallet (Base Account / wagmi).
3. On-chain features: leaderboard contract and/or fighter NFT mint.
4. Builder Codes + polish.
5. Apply: Base Batches / Builder Grant.

## Notes

- **Base Mini App is sunset** (Base docs, 13 Nov 2026): Base App is now
  Coinbase Wallet and supports standard web apps in its in-app browser —
  no manifest, no MiniKit. This game is a standard web app; the
  Farcaster Mini App standard is separate and still alive.
- **Not tested yet:** real-device playtest, Capacitor APK build (no
  Android SDK on this VM), wallet connect against a real injected
  provider.

## Tests

```bash
node tests/nav-smoke-test.js   # 54 checks: views, splash, login modal, wallet/email/guest
node tests/pacing-test.js      # 5 simulated matches must finish with a winner
```

<!-- Deployed via GitHub Pages from main. -->
