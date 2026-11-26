/* Base Bomber — konfigurasi cloud save (Supabase).
   KOSONG (default) = game jalan penuh di save lokal per-perangkat.
   Untuk aktifin sync cloud lintas device:
   1. Buat project gratis di https://supabase.com (langkah lengkap di SAVE_SETUP.md).
   2. Isi supabaseUrl + supabaseAnonKey di bawah, lalu deploy ulang.
   JANGAN isi service_role key di sini — anon key saja (aman dibaca browser;
   akses dibatasi RLS di tabel player_saves). */
window.BASEBOMBER_SAVE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
