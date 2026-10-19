/*
# Add profile picture support

## 1. Storage Bucket
- Create private bucket `avatars` for user profile pictures.
- Each user's avatar stored at path `<uid>/avatar.<ext>` (one file per user,
  overwritten on re-upload).

## 2. Modified Tables
### `profiles`
- Added `avatar_url` (text, nullable) — public URL path to the user's avatar
  in the `avatars` bucket, or null if they use the default initials avatar.

## 3. Security
- Storage policies: users can read any avatar (avatars are displayed to other
  users in shared contexts) but can only write/update/delete files under their
  own uid/ prefix.
- `profiles.avatar_url` is covered by existing profiles RLS (ownership via id).
- The `avatars` bucket is private; reads go through signed URLs or the storage
  API with RLS. For simplicity and since avatars are non-sensitive display
  data, the bucket is public-readable so <img src> works directly.
*/

-- Add avatar_url column to profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='profiles' AND column_name='avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- Create public-readable avatars bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read avatars (they are display-only profile pictures)
DROP POLICY IF EXISTS "read_avatars" ON storage.objects;
CREATE POLICY "read_avatars" ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'avatars');

-- Users can manage only their own avatar folder (uid/...)
DROP POLICY IF EXISTS "insert_own_avatar" ON storage.objects;
CREATE POLICY "insert_own_avatar" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "update_own_avatar" ON storage.objects;
CREATE POLICY "update_own_avatar" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "delete_own_avatar" ON storage.objects;
CREATE POLICY "delete_own_avatar" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
