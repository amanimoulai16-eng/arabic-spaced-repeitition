import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Skeleton: no sending logic yet.
  // Step 3 will fill in: query users with due cards, send Web Push, log to reminder_sent_log.

  return new Response(JSON.stringify({ status: "ok", sent: 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
