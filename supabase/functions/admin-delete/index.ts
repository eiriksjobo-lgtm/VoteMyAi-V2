import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://www.votemyai.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  // Clean expired entries and check/increment in one flow
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("admin_rate_limits")
    .select("attempts, reset_at")
    .eq("ip", ip)
    .single();

  if (!existing || new Date(existing.reset_at) < new Date()) {
    // No entry or expired — upsert fresh entry
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

  // Increment
  await supabase
    .from("admin_rate_limits")
    .update({ attempts: existing.attempts + 1 })
    .eq("ip", ip);

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "Server config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (!(await checkAdminRateLimit(supabase, ip))) {
    return new Response(JSON.stringify({ error: "Too many attempts. Try again later." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const password = req.headers.get("x-admin-password");
  const adminPw = Deno.env.get("ADMIN_PASSWORD");
  if (!password || !adminPw || !timingSafeEqual(password, adminPw)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { table, id, user_id } = await req.json();

    if (user_id) {
      const { error: e1 } = await supabase.from("comments").delete().eq("user_id", user_id);
      const { error: e2 } = await supabase.from("anonymous_ratings").delete().eq("user_id", user_id);

      const { data: userTracks } = await supabase.from("tracks").select("id").eq("user_id", user_id);
      if (userTracks && userTracks.length > 0) {
        const trackIds = userTracks.map((t: { id: string }) => t.id);
        await supabase.from("anonymous_ratings").delete().in("track_id", trackIds);
        await supabase.from("comments").delete().in("track_id", trackIds);
      }

      const { error: e3 } = await supabase.from("tracks").delete().eq("user_id", user_id);
      const { error: authErr } = await supabase.auth.admin.deleteUser(user_id);

      const errors = [e1, e2, e3, authErr].filter(Boolean);
      if (errors.length) {
        return new Response(JSON.stringify({ error: "Partial failure", details: errors }), {
          status: 207,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, message: "User and all data deleted" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!table || !id) {
      return new Response(JSON.stringify({ error: "Missing table or id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowed = ["tracks", "comments", "contact_messages", "anonymous_ratings"];
    if (!allowed.includes(table)) {
      return new Response(JSON.stringify({ error: "Table not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (table === "tracks") {
      await supabase.from("anonymous_ratings").delete().eq("track_id", id);
      await supabase.from("comments").delete().eq("track_id", id);
    }

    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
