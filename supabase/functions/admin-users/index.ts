import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://www.votemyai.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-admin-password, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

// F1: Constant-time password comparison (fixed: no length leak)
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

// F3: In-memory rate limiting for admin endpoints
const adminAttempts = new Map<string, { count: number; resetAt: number }>();
const ADMIN_MAX_ATTEMPTS = 10;
const ADMIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkAdminRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = adminAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    adminAttempts.set(ip, { count: 1, resetAt: now + ADMIN_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= ADMIN_MAX_ATTEMPTS;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!checkAdminRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const adminPass = req.headers.get("x-admin-password");
  const adminPw = Deno.env.get("ADMIN_PASSWORD");
  if (!adminPass || !adminPw || !timingSafeEqual(adminPass, adminPw)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Use service_role key to access auth.users
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch all users with pagination (listUsers defaults to 50 per page)
  const allUsers: any[] = [];
  let page = 1;
  const perPage = 300;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    allUsers.push(...data.users);
    // Stop when we got fewer than a full page
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

  return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
