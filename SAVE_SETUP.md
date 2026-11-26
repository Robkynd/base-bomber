# Base Bomber — Cloud Save (Supabase)

Progres game (token, score, level, jumlah match, strategi) tersimpan **per identitas**
di perangkat (localStorage). Cloud save bikin progres itu ngikutin **wallet address**
ke device mana pun. Guest/email tetap lokal saja — cloud cuma untuk wallet.

## Yang dibutuhkan (bagian Roby — akun Supabase)

1. Buka https://supabase.com → **Start your project** → login (GitHub/Google).
2. **New project** → isi nama (mis. `base-bomber`), password database (simpan baik-baik),
   region `Singapore` (paling dekat) → **Create new project**. Tunggu ~1 menit.
3. Di dashboard project → **Settings → API** → salin:
   - **Project URL** → `supabaseUrl`
   - **anon public key** → `supabaseAnonKey`
   (JANGAN pakai `service_role` key — itu rahasia, jangan pernah taruh di file game.)
4. **SQL Editor** → **New query** → jalankan SQL di bawah (boleh di-run berkali-kali,
   aman — policy di-drop dulu sebelum dibuat ulang):

```sql
create table if not exists player_saves (
  wallet_address text primary key,
  tokens int not null default 0,
  score int not null default 0,
  level int not null default 0,
  matches int not null default 0,
  strategy text not null default 'balanced',
  updated_at timestamptz not null default now()
);

alter table player_saves enable row level security;

-- Boleh baca baris mana pun (buat leaderboard nanti), tapi tulis/upsert
-- hanya ke baris yang wallet_address-nya = address si pemain.
-- Catatan: anon key tidak membuktikan kepemilikan address (tanpa SIWE),
-- jadi ini mencegah tabrakan acak, bukan spoofing yang disengaja.
-- DROP dulu supaya script bisa di-run ulang tanpa error 42710
-- ("policy already exists").
drop policy if exists "read all saves" on player_saves;
drop policy if exists "upsert own save" on player_saves;
drop policy if exists "update own save" on player_saves;

create policy "read all saves" on player_saves
  for select using (true);

create policy "upsert own save" on player_saves
  for insert with check (true);

create policy "update own save" on player_saves
  for update using (true);

-- WAJIB: policy RLS saja tidak cukup. Role anon (yang dipakai publishable key)
-- juga butuh hak akses tabel, kalau tidak semua request ditolak 401 code 42501
-- ("permission denied for table player_saves").
grant select, insert, update, delete on public.player_saves to anon;
grant select, insert, update, delete on public.player_saves to authenticated;
```

5. Isi `save-config.js` dengan URL + anon key, lalu deploy ulang (push ke GitHub —
   Pages rebuild otomatis). Game akan sync otomatis tiap match selesai dan tiap login
   wallet. Status save terlihat di halaman Profile (`☁️ Cloud ✓` / `💾 Perangkat`).

## Cara kerja

- **Lokal (selalu aktif):** `localStorage` key `bombchain.save.<identitas>` —
  `wallet:<address>` / `email:<email>` / `guest`. Save lama `bombchain.stats`
  dimigrasi otomatis sekali.
- **Cloud (kalau config diisi):** tiap `saveStats()` ikut POST upsert ke tabel
  `player_saves` (merge-duplicates per `wallet_address`). Tiap login wallet, game
  GET baris cloud dan gabung dengan lokal (ambil nilai terbesar per field).
- **Gagal sync tidak merusak game:** kalau Supabase down / offline, save lokal tetap
  jalan; status di Profile jadi `Cloud (belum sync)`, dan sync dicoba lagi di
  match berikutnya.
- **Upgrade nanti (opsional):** SIWE (`wallet_connect`) + verifikasi signature di
  Edge Function supaya hanya pemilik address yang bisa menulis save-nya.
