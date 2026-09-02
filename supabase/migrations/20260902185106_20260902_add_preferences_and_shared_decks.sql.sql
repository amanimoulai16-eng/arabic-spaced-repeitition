-- Add preferred_lang and preferred_theme to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_lang text DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS preferred_theme text DEFAULT 'dark';

-- Add daily limits to user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS new_cards_per_day integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS max_reviews_per_day integer DEFAULT 50;

-- Create shared_decks table for deck sharing
CREATE TABLE IF NOT EXISTS shared_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_code text NOT NULL UNIQUE DEFAULT substr(encode(gen_random_bytes(8), 'hex'), 1, 8),
  deck_name text NOT NULL,
  deck_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shared_decks ENABLE ROW LEVEL SECURITY;

-- Owners can manage their own shared decks
CREATE POLICY "select_own_shared_decks" ON shared_decks FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "insert_own_shared_decks" ON shared_decks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "delete_own_shared_decks" ON shared_decks FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

-- Anyone authenticated can look up a deck by share_code (read-only)
CREATE POLICY "select_by_share_code" ON shared_decks FOR SELECT
  TO authenticated USING (true);

-- Allow updating own shared decks
CREATE POLICY "update_own_shared_decks" ON shared_decks FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Index for share_code lookups
CREATE INDEX IF NOT EXISTS idx_shared_decks_share_code ON shared_decks(share_code);
