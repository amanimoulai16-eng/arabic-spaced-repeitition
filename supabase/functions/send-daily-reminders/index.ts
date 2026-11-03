import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

type ReminderUser = {
  user_id: string;
  reminder_time: string | null;
};

type PushSubRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** True if the current UTC HH:MM is at or past the given reminder_time. */
function reminderTimePassed(reminderTime: string | null, now: Date): boolean {
  if (!reminderTime) return true; // no time set — always eligible
  const [h, m] = reminderTime.split(":").map(Number);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const targetMin = h * 60 + m;
  return nowMin >= targetMin;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // --- Auth: accept CRON_SECRET header or the service-role key ---
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const isCron = cronSecret && cronHeader === cronSecret;
  const isServiceKey =
    authHeader.startsWith("Bearer ") &&
    authHeader.slice(7) === serviceRoleKey;

  if (!isCron && !isServiceKey) {
    return new Response(
      JSON.stringify({ status: "error", error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // --- Configure web-push VAPID ---
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@tikrar.app";

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ status: "error", error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
      { auth: { persistSession: false } },
    );

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // --- 1. Users with reminders enabled ---
    const { data: reminderUsers, error: ruErr } = await supabase
      .from("user_settings")
      .select("user_id, reminder_time")
      .eq("reminder_enabled", true);

    if (ruErr) throw new Error(ruErr.message);

    if (!reminderUsers || reminderUsers.length === 0) {
      return new Response(
        JSON.stringify({ status: "ok", sent: 0, failed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let failed = 0;

    for (const u of reminderUsers as ReminderUser[]) {
      // --- 2. Skip if reminder time hasn't passed yet ---
      if (!reminderTimePassed(u.reminder_time, now)) continue;

      // --- 3. Skip if already reminded today ---
      const { data: logRow } = await supabase
        .from("reminder_sent_log")
        .select("last_sent_date")
        .eq("user_id", u.user_id)
        .maybeSingle();

      if (logRow && logRow.last_sent_date === today) continue;

      // --- 4. Count due cards (next_review_at <= now) ---
      const nowIso = now.toISOString();
      const { count: dueCount } = await supabase
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.user_id)
        .lte("next_review_at", nowIso);

      if (!dueCount || dueCount === 0) continue;

      // --- 5. Fetch push subscriptions for this user ---
      const { data: subs, error: subsErr } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", u.user_id);

      if (subsErr || !subs || subs.length === 0) continue;

      const body = `عندك ${dueCount} بطاقة للمراجعة اليوم`;
      const payload = JSON.stringify({
        title: "تكرار",
        body,
        tag: "tikrar-daily-reminder",
        url: "/",
      });

      let anySent = false;

      for (const s of subs as PushSubRow[]) {
        const subscription = {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        };

        try {
          await webpush.sendNotification(subscription, payload, {
            TTL: 86400,
          });
          anySent = true;
          sent++;
        } catch (err) {
          const statusCode =
            (err as { statusCode?: number }).statusCode ?? 0;
          // 404 / 410 — subscription no longer valid; remove it
          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", s.id);
          }
          failed++;
        }
      }

      // --- 6. Log the send so we don't double-fire today ---
      if (anySent) {
        await supabase
          .from("reminder_sent_log")
          .upsert(
            { user_id: u.user_id, last_sent_date: today },
            { onConflict: "user_id" },
          );
      }
    }

    return new Response(
      JSON.stringify({ status: "ok", sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return new Response(
      JSON.stringify({ status: "error", error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
