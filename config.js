// Подключение общей библиотеки форматов (Supabase).
// supabaseUrl — «Project URL» из Supabase: Project Settings → API (Data API).
// supabaseAnonKey — публичный ключ «anon» / «publishable». Он и должен быть на сайте:
// что можно делать с данными, решают правила доступа (RLS) из supabase/shared-library.sql.
// Секретный ключ service_role сюда НЕ вставлять.
// Пока поля пустые, общая библиотека выключена, а «Мои форматы» работают как обычно.
window.RASKLADKA_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
