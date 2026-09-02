/*
# Create spaced-repetition tables (single-tenant, no auth)

1. New Tables
- `cards`: stores study cards with their SRS scheduling state
  - id (uuid PK)
  - title (text, not null) — the card's prompt/title
  - category (text, not null) — e.g. "اللغات", "الدراسة", "المهارات"
  - description (text) — the answer/details revealed during review
  - interval_index (int, default 0) — index into the interval ladder [1,3,7,14,30]
  - due_date (date, default today) — when the card is next due
  - review_count (int, default 0) — total times reviewed
  - created_at (timestamptz)
  - last_reviewed_at (timestamptz, nullable)
- `review_log`: one row per review action, used for streak computation
  - id (uuid PK)
  - card_id (uuid FK -> cards, cascade delete)
  - rating (text) — "hard" | "good" | "easy"
  - reviewed_at (date, default today) — the calendar day the review happened

2. Security
- Enable RLS on both tables.
- Single-tenant (no sign-in): allow anon + authenticated full CRUD because the data is intentionally shared/public.
*/

CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  interval_index int NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  review_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at timestamptz
);

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cards" ON cards;
CREATE POLICY "anon_select_cards" ON cards FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cards" ON cards;
CREATE POLICY "anon_insert_cards" ON cards FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cards" ON cards;
CREATE POLICY "anon_update_cards" ON cards FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cards" ON cards;
CREATE POLICY "anon_delete_cards" ON cards FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS review_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating text NOT NULL,
  reviewed_at date NOT NULL DEFAULT CURRENT_DATE
);

ALTER TABLE review_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_review_log" ON review_log;
CREATE POLICY "anon_select_review_log" ON review_log FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_review_log" ON review_log;
CREATE POLICY "anon_insert_review_log" ON review_log FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_review_log" ON review_log;
CREATE POLICY "anon_delete_review_log" ON review_log FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cards_due_date ON cards(due_date);
CREATE INDEX IF NOT EXISTS idx_review_log_reviewed_at ON review_log(reviewed_at);
