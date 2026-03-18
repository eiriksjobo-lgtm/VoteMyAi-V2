import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Validation patterns
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANON_TOKEN_RE = /^anon_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// F2: Proper IPv4/IPv6 validation
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[\da-fA-F:]{2,39}$/;
function isValidIP(ip: string): boolean {
  if (IPV4_RE.test(ip)) {
    return ip.split(".").every((o) => { const n = parseInt(o, 10); return n >= 0 && n <= 255; });
  }
  return IPV6_RE.test(ip);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { track_id, score, anon_token } = await req.json();

    // Valider input
    if (!track_id || !score || !anon_token) {
      return new Response(
        JSON.stringify({ error: "Mangler data" }),
        { status: 400, headers: corsHeaders }
      );
    }
    if (score < 1 || score > 5 || !Number.isInteger(score)) {
      return new Response(
        JSON.stringify({ error: "Score må være 1-5" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // K1: Validate format before using in queries
    if (!UUID_RE.test(track_id)) {
      return new Response(
        JSON.stringify({ error: "Ugyldig track_id" }),
        { status: 400, headers: corsHeaders }
      );
    }
    if (!ANON_TOKEN_RE.test(anon_token)) {
      return new Response(
        JSON.stringify({ error: "Ugyldig anon_token" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // P2: Use only cf-connecting-ip — reject if missing
    const ip_address = req.headers.get("cf-connecting-ip");

    if (!ip_address) {
      return new Response(
        JSON.stringify({ error: "Unable to verify request origin" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (!isValidIP(ip_address)) {
      return new Response(
        JSON.stringify({ error: "Unable to verify request origin" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Supabase-klient med service_role (full tilgang)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- RATE LIMITING ---
    // Short window: max 20 ratings per 60 seconds (bot detection)
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();

    const { count: tokenBurst } = await supabase
      .from("anonymous_ratings")
      .select("*", { count: "exact", head: true })
      .eq("anon_token", anon_token)
      .gte("created_at", oneMinAgo);

    if ((tokenBurst || 0) >= 20) {
      return new Response(
        JSON.stringify({ error: "For mange ratings. Vent litt." }),
        { status: 429, headers: corsHeaders }
      );
    }

    // Hourly window: max 200 ratings per hour per token, 300 per IP
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count: tokenCount } = await supabase
      .from("anonymous_ratings")
      .select("*", { count: "exact", head: true })
      .eq("anon_token", anon_token)
      .gte("created_at", oneHourAgo);

    if ((tokenCount || 0) >= 200) {
      return new Response(
        JSON.stringify({ error: "For mange ratings. Vent litt." }),
        { status: 429, headers: corsHeaders }
      );
    }

    const { count: ipCount } = await supabase
      .from("anonymous_ratings")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip_address)
      .gte("created_at", oneHourAgo);

    if ((ipCount || 0) >= 300) {
      return new Response(
        JSON.stringify({ error: "For mange ratings fra dette nettverket." }),
        { status: 429, headers: corsHeaders }
      );
    }

    // --- COOLDOWN: 1 second ---
    const oneSecAgo = new Date(Date.now() - 1000).toISOString();

    const { data: recentRating } = await supabase
      .from("anonymous_ratings")
      .select("id")
      .eq("anon_token", anon_token)
      .gte("created_at", oneSecAgo)
      .limit(1);

    if (recentRating && recentRating.length > 0) {
      return new Response(
        JSON.stringify({ error: "Vent litt mellom ratings." }),
        { status: 429, headers: corsHeaders }
      );
    }

    // K5: Check IP conflict first, then upsert (eliminates race condition)
    // Check if a DIFFERENT token from same IP already rated this track
    const { data: ipConflict } = await supabase
      .from("anonymous_ratings")
      .select("id")
      .eq("track_id", track_id)
      .eq("ip_address", ip_address)
      .neq("anon_token", anon_token)
      .limit(1);

    if (ipConflict && ipConflict.length > 0) {
      return new Response(
        JSON.stringify({ error: "Allerede ratet fra dette nettverket." }),
        { status: 409, headers: corsHeaders }
      );
    }

    // Atomic upsert: insert or update on (track_id, anon_token)
    const { error: upsertErr } = await supabase
      .from("anonymous_ratings")
      .upsert(
        { track_id, anon_token, ip_address, score },
        { onConflict: "track_id,anon_token" }
      );

    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: "Rating failed. Please try again." }),
        { status: 500, headers: corsHeaders }
      );
    }

    // H1: Use SQL aggregate instead of fetching all rows in JS
    const { data: stats, error: statsErr } = await supabase
      .rpc("get_track_stats", { p_track_id: track_id });

    // F5: If RPC fails, don't overwrite tracks with avg=0/count=0
    if (statsErr || !stats || stats.length === 0) {
      // Rating was saved, but stats update skipped — return success
      return new Response(
        JSON.stringify({
          success: true,
          your_score: score,
          stats_updated: false,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    const avg = parseFloat(stats[0].avg_score) || 0;
    const count = parseInt(stats[0].total_count, 10) || 0;
    const roundedAvg = Math.round(avg * 100) / 100;

    await supabase
      .from("tracks")
      .update({
        avg_rating: roundedAvg,
        rating_count: count,
      })
      .eq("id", track_id);

    return new Response(
      JSON.stringify({
        success: true,
        avg_rating: roundedAvg,
        rating_count: count,
        your_score: score,
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Serverfeil" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
