import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://www.votemyai.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-admin-password, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  const maxLen = Math.max(bufA.byteLength, bufB.byteLength);
  let diff = bufA.byteLength ^ bufB.byteLength;
  for (let i = 0; i < maxLen; i++) {
    diff |= (bufA[i] || 0) ^ (bufB[i] || 0);
  }
  return diff === 0;
}

// P3: Persistent rate limiting via Supabase table
const ADMIN_MAX_ATTEMPTS = 10;

async function checkAdminRateLimit(supabase: any, ip: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from("admin_rate_limits")
    .select("attempts, reset_at")
    .eq("ip", ip)
    .single();

  if (!existing || new Date(existing.reset_at) < new Date()) {
    await supabase
      .from("admin_rate_limits")
      .upsert({
        ip,
        attempts: 1,
        reset_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    return true;
  }

  if (existing.attempts >= ADMIN_MAX_ATTEMPTS) {
    return false;
  }

  await supabase
    .from("admin_rate_limits")
    .update({ attempts: existing.attempts + 1 })
    .eq("ip", ip);

  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "Server config missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkAdminRateLimit(supabase, ip))) {
    return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const adminPass = req.headers.get("x-admin-password");
  const adminPw = Deno.env.get("ADMIN_PASSWORD");
  if (!adminPass || !adminPw || !timingSafeEqual(adminPass, adminPw)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const allUsers: any[] = [];
  let page = 1;
  const perPage = 300;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    allUsers.push(...data.users);
    if (data.users.length < perPage) break;
    page++;
  }

  const users = allUsers.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.user_metadata?.display_name || u.user_metadata?.name || null,
    avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
    created_at: u.created_at,
  }));

  // Also fetch contact_messages (service_role bypasses RLS)
  const { data: messages } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });

  return new Response(JSON.stringify({ users, messages: messages || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
