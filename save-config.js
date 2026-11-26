/* Base Bomber — konfigurasi cloud save (Supabase).
   URL + publishable key diisi 2026-11-26 (project Roby). Publishable key
   memang dirancang untuk kode client-side (bukan rahasia seperti
   service_role) — akses dibatasi RLS di tabel player_saves.
   JANGAN taruh service_role key di sini. Lihat SAVE_SETUP.md. */
window.BASEBOMBER_SAVE_CONFIG = {
  supabaseUrl: 'https://ybslhdgknotvprbftjqr.supabase.co',
  supabaseAnonKey: 'sb_publishable_rKsFLcqxghlONWkPxNWj3A_YVS6I1bv',
};
