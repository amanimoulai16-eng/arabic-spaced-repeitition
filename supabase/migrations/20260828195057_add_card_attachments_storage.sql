/*
# Add card attachments: storage bucket + attachments column + policies

## 1. Storage Bucket
Create a private storage bucket `card-attachments` for user-uploaded images and PDFs.
Each user's files are stored under a path prefixed with their auth uid.

## 2. Modified Tables
### `cards`
- Added `attachments` (jsonb, default '[]') — array of {path, name, type, size}
  storing metadata for uploaded files in Supabase Storage.

## 3. Security
- Storage policies: users can read/write only files under their own uid/ prefix.
- cards.attachments is covered by existing cards RLS (ownership via user_id).
*/

-- Add attachments column to cards
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='attachments') THEN
    ALTER TABLE cards ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-attachments', 'card-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can manage only their own folder (uid/...)
DROP POLICY IF EXISTS "select_own_attachments" ON storage.objects;
CREATE POLICY "select_own_attachments" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'card-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "insert_own_attachments" ON storage.objects;
CREATE POLICY "insert_own_attachments" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'card-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "update_own_attachments" ON storage.objects;
CREATE POLICY "update_own_attachments" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'card-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'card-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "delete_own_attachments" ON storage.objects;
CREATE POLICY "delete_own_attachments" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'card-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
