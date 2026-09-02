/*
# Extend cards table for تكرار redesign + add settings table

1. Modified Tables
- `cards`: added columns to support the redesigned تكرار app
  - resource (text, nullable) — optional source URL
  - linked_item_id (uuid, nullable, FK -> cards) — optional dependency on another card
  - question (text, nullable) — flashcard question (Q/A mode)
  - answer (text, nullable) — flashcard answer
  - intervals (int[], default [1,3,7,14,30,30]) — per-card interval ladder (copied from settings at creation)
  - stage_index (int, default 0) — current position in the interval ladder (renamed concept from interval_index)
  - next_review_at (timestamptz, default now) — when the card is next due (replaces due_date as the source of truth)
  - last_review_at (timestamptz, nullable) — when last reviewed (replaces last_reviewed_at)
  Note: existing columns (description, interval_index, due_date, last_reviewed_at, review_count) are kept for data safety.
  New code reads stage_index/next_review_at; old columns are not dropped.

2. New Tables
- `settings`: single-row table for the app's custom interval schedule
  - id (int PK, always 1)
  - intervals (int[], default [1,3,7,14,30,30])
  - updated_at (timestamptz)

3. Security
- Enable RLS on `settings`.
- Single-tenant: allow anon + authenticated full CRUD (intentionally shared/public).
- Add FK constraint on cards.linked_item_id -> cards(id) ON DELETE SET NULL.
*/

-- Add new columns to cards (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='resource') THEN
    ALTER TABLE cards ADD COLUMN resource text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='linked_item_id') THEN
    ALTER TABLE cards ADD COLUMN linked_item_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='question') THEN
    ALTER TABLE cards ADD COLUMN question text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='answer') THEN
    ALTER TABLE cards ADD COLUMN answer text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='intervals') THEN
    ALTER TABLE cards ADD COLUMN intervals int[] NOT NULL DEFAULT ARRAY[1,3,7,14,30,30]::int[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='stage_index') THEN
    ALTER TABLE cards ADD COLUMN stage_index int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='next_review_at') THEN
    ALTER TABLE cards ADD COLUMN next_review_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='last_review_at') THEN
    ALTER TABLE cards ADD COLUMN last_review_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='notes') THEN
    ALTER TABLE cards ADD COLUMN notes text NOT NULL DEFAULT '';
  END IF;
END $$;

-- FK on linked_item_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cards_linked_item_id_fkey' AND table_name = 'cards'
  ) THEN
    ALTER TABLE cards ADD CONSTRAINT cards_linked_item_id_fkey
      FOREIGN KEY (linked_item_id) REFERENCES cards(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Migrate existing rows: if stage_index is 0 but interval_index > 0, copy it
UPDATE cards SET stage_index = interval_index WHERE interval_index > stage_index;
UPDATE cards SET next_review_at = due_date::timestamptz WHERE next_review_at = created_at OR next_review_at = now();
UPDATE cards SET last_review_at = last_reviewed_at WHERE last_review_at IS NULL AND last_reviewed_at IS NOT NULL;
UPDATE cards SET notes = description WHERE notes = '' AND description != '';

-- Add index on next_review_at
CREATE INDEX IF NOT EXISTS idx_cards_next_review_at ON cards(next_review_at);

-- Settings table (single-row)
CREATE TABLE IF NOT EXISTS settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  intervals int[] NOT NULL DEFAULT ARRAY[1,3,7,14,30,30]::int[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE
  TO anon, authenticated USING (true);

-- Seed default settings row if not exists
INSERT INTO settings (id, intervals)
VALUES (1, ARRAY[1,3,7,14,30,30]::int[])
ON CONFLICT (id) DO NOTHING;
