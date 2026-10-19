/*
# Add delete_user_account RPC function (Account Deletion / Danger Zone)

## Purpose
Allows an authenticated user to permanently delete their own account and all
associated data from a single server-side call. The frontend calls this via
`supabase.rpc('delete_user_account')`. This is required because the anon-key
client cannot delete rows from `auth.users` directly — that table is not exposed
through PostgREST and is only writable by the service role / postgres. Wrapping
the deletion in a SECURITY DEFINER function lets the user delete their own
auth.users row without exposing other users' rows.

## What gets deleted (all scoped to the calling user's auth.uid())
1. `storage.objects` rows in the `card-attachments` bucket whose folder prefix
   equals the user's uid — i.e. all uploaded images/PDFs the user owns.
2. `cards` rows where `user_id = uid`.
3. `categories` rows where `user_id = uid`.
4. `review_log` rows where `user_id = uid`.
5. `user_settings` rows where `user_id = uid`.
6. `shared_decks` rows where `owner_id = uid` (decks this user published).
7. `profiles` row where `id = uid`.
8. `auth.users` row where `id = uid` — this also invalidates the user's session
   and JWTs server-side.

## Security
- `SECURITY DEFINER` so the function runs with the owner's privileges and can
  reach `auth.users` and `storage.objects`, which the authenticated role cannot
  touch directly.
- `search_path = ''` to prevent search-path injection; schema-qualified names
  are used for every table reference.
- Guards: aborts with an exception if `auth.uid()` is null (no session) so an
  unauthenticated caller cannot invoke it.
- The function only ever deletes rows belonging to `auth.uid()` — it never
  accepts a user id as a parameter, eliminating any IDOR risk.
- `EXECUTE` granted ONLY to the `authenticated` role. Anon cannot call it.

## Idempotency
- All DELETE statements are no-ops if the user has no rows in that table.
- The function is created with `OR REPLACE` so re-running the migration is safe.
*/

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 1. Delete the user's uploaded files in the card-attachments storage bucket.
  DELETE FROM storage.objects
  WHERE bucket_id = 'card-attachments'
    AND (storage.foldername(name))[1] = uid::text;

  -- 2-6. Delete the user's rows from every app table.
  DELETE FROM public.cards        WHERE user_id  = uid;
  DELETE FROM public.categories   WHERE user_id  = uid;
  DELETE FROM public.review_log   WHERE user_id  = uid;
  DELETE FROM public.user_settings WHERE user_id = uid;
  DELETE FROM public.shared_decks WHERE owner_id = uid;
  DELETE FROM public.profiles     WHERE id       = uid;

  -- 7. Finally, delete the auth.users row. This invalidates their session.
  DELETE FROM auth.users WHERE id = uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Revoke default privileges, then grant execute only to authenticated users.
REVOKE EXECUTE ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
