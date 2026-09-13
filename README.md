# Кредитний менеджер

React + Vite + Supabase. Дані акаунтів і кредитів зберігаються у Supabase, тому один email/password можна використовувати на ПК, телефоні та інших пристроях. Supabase Auth відповідає за акаунти, а Postgres + RLS — за приватність даних.

## 1. Створити Supabase project
1. Створи проєкт у Supabase.
2. Відкрий **SQL Editor** і виконай `supabase_schema.sql` повністю.
3. У Supabase → **Project Settings → API** скопіюй Project URL та publishable/anon key.

## 2. Локальний запуск
1. Створи файл `.env` у корені за прикладом `.env.example`.
2. Вкажи:

```env
VITE_SUPABASE_URL=https://dejkdndptcotqikqsiho.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

3. Виконай:

```bash
npm install
npm run dev
```

Сайт: `http://localhost:5173`

## 3. Render
Для Render Static Site:
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`

У Render → Environment додай:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Після зміни env зроби новий deploy.

## 4. Старі локальні дані
Попередня версія зберігала дані у `localStorage`. Якщо у цьому браузері вже є кредити/ліміти для того самого email, після входу в новий хмарний акаунт сайт покаже кнопку **Імпортувати локальні дані**. Паролі зі старої локальної версії не переносяться: новий пароль зберігає Supabase Auth.

## Безпека
У фронтенді використовується тільки publishable/anon key. Service role key у браузер додавати не можна. Усі таблиці мають RLS-політики на `auth.uid()`.

## Поточний Supabase

Проєкт уже налаштований для використання змінних `VITE_SUPABASE_URL` і `VITE_SUPABASE_ANON_KEY`. Файл `.env` не додається до Git завдяки `.gitignore`. Для Render значення цих двох змінних треба додати в **Environment**.
