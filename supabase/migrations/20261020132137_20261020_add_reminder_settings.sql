/*
# Add daily review reminder settings

## 1. Modified Tables
### `user_settings`
- Added `reminder_enabled` (boolean, default false) — whether the user has
  turned on daily review reminders.
- Added `reminder_time` (text, nullable) — the local time of day at which to
  remind the user, in 24-hour "HH:MM" format (e.g. "09:30"). Null means
  reminders are configured but no time picked yet; defaults to 09:00 in the app.

## 2. Security
- No new policies needed — `user_settings` already has owner-scoped RLS via
  `user_id = auth.uid()`. The new columns are covered by those existing
  policies.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='user_settings' AND column_name='reminder_enabled') THEN
    ALTER TABLE public.user_settings ADD COLUMN reminder_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='user_settings' AND column_name='reminder_time') THEN
    ALTER TABLE public.user_settings ADD COLUMN reminder_time text;
  END IF;
END $$;
