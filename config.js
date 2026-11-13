// Подключение общей библиотеки форматов (Supabase).
// supabaseUrl — «Project URL» из Supabase: Project Settings → API (Data API).
// supabaseAnonKey — публичный ключ «anon» / «publishable». Он и должен быть на сайте:
// что можно делать с данными, решают правила доступа (RLS) из supabase/shared-library.sql.
// Секретный ключ service_role / sb_secret_ сюда НЕ вставлять.
window.RASKLADKA_CONFIG = {
  supabaseUrl: 'https://wrivraarzsghtjyirioa.supabase.co',
  supabaseAnonKey: 'sb_publishable_6kEbzVcT1eQzSRat5_wcxw_-Q_MAWMP',
};
