/*
# Add multi-user auth: profiles, categories, per-user settings + ownership-scoped RLS

## Overview
Converts the app from single-tenant (no auth) to multi-user (authenticated).
Each user sees only their own cards, categories, review logs, and settings.

## 1. New Tables

### `profiles`
Stores user display information, linked to Supabase's built-in `auth.users`.
- id (uuid PK, FK -> auth.users ON DELETE CASCADE)
- display_name (text, nullable)
- created_at (timestamptz)

### `categories`
User-defined categories/subjects for organizing cards.
- id (uuid PK)
- user_id (uuid, FK -> auth.users ON DELETE CASCADE, DEFAULT auth.uid())
- name (text, not null)
- color (text, nullable)
- created_at (timestamptz)
- UNIQUE(user_id, name)

### `user_settings`
Per-user custom interval schedules (replaces the old single-row `settings` table).
- user_id (uuid PK, FK -> auth.users ON DELETE CASCADE)
- intervals (int[], default [1,3,7,14,30,30])
- updated_at (timestamptz)

## 2. Modified Tables

### `cards`
- Added `user_id` (uuid, FK -> auth.users ON DELETE CASCADE, DEFAULT auth.uid())
- Added `category_id` (uuid, FK -> categories ON DELETE SET NULL, nullable)

### `review_log`
- Added `user_id` (uuid, FK -> auth.users ON DELETE CASCADE, DEFAULT auth.uid())

## 3. Security (RLS)

All tables use `TO authenticated` with ownership checks via `auth.uid() = user_id`.
Old anon policies on cards/review_log/settings are dropped.

## 4. Trigger

Auto-creates a `profiles` row when a new user signs up in `auth.users`.
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- ============================================================
-- CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_categories" ON categories;
CREATE POLICY "select_own_categories" ON categories FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_categories" ON categories;
CREATE POLICY "insert_own_categories" ON categories FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_categories" ON categories;
CREATE POLICY "update_own_categories" ON categories FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_categories" ON categories;
CREATE POLICY "delete_own_categories" ON categories FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- USER_SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  intervals int[] NOT NULL DEFAULT ARRAY[1,3,7,14,30,30]::int[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_user_settings" ON user_settings;
CREATE POLICY "select_own_user_settings" ON user_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_settings" ON user_settings;
CREATE POLICY "insert_own_user_settings" ON user_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_user_settings" ON user_settings;
CREATE POLICY "update_own_user_settings" ON user_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_user_settings" ON user_settings;
CREATE POLICY "delete_own_user_settings" ON user_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- ADD COLUMNS TO cards
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='user_id') THEN
    ALTER TABLE cards ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='category_id') THEN
    ALTER TABLE cards ADD COLUMN category_id uuid REFERENCES categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Replace cards RLS policies: authenticated-only with ownership check
DROP POLICY IF EXISTS "anon_select_cards" ON cards;
DROP POLICY IF EXISTS "anon_insert_cards" ON cards;
DROP POLICY IF EXISTS "anon_update_cards" ON cards;
DROP POLICY IF EXISTS "anon_delete_cards" ON cards;

DROP POLICY IF EXISTS "select_own_cards" ON cards;
CREATE POLICY "select_own_cards" ON cards FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_cards" ON cards;
CREATE POLICY "insert_own_cards" ON cards FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_cards" ON cards;
CREATE POLICY "update_own_cards" ON cards FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_cards" ON cards;
CREATE POLICY "delete_own_cards" ON cards FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- ADD COLUMN TO review_log
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='review_log' AND column_name='user_id') THEN
    ALTER TABLE review_log ADD COLUMN user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Replace review_log RLS policies
DROP POLICY IF EXISTS "anon_select_review_log" ON review_log;
DROP POLICY IF EXISTS "anon_insert_review_log" ON review_log;
DROP POLICY IF EXISTS "anon_delete_review_log" ON review_log;

DROP POLICY IF EXISTS "select_own_review_log" ON review_log;
CREATE POLICY "select_own_review_log" ON review_log FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_review_log" ON review_log;
CREATE POLICY "insert_own_review_log" ON review_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_review_log" ON review_log;
CREATE POLICY "delete_own_review_log" ON review_log FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_review_log_user_id ON review_log(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
