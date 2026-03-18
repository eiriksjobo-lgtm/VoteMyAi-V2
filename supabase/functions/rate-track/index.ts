import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Hent IP fra request
    const ip_address =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";

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

    // --- SJEKK EKSISTERENDE RATING ---
    const { data: existing } = await supabase
      .from("anonymous_ratings")
      .select("id, anon_token, ip_address")
      .eq("track_id", track_id)
      .or(`anon_token.eq.${anon_token},ip_address.eq.${ip_address}`);

    const tokenMatch = existing?.find((r) => r.anon_token === anon_token);
    const ipMatch = existing?.find((r) => r.ip_address === ip_address);

    if (tokenMatch) {
      // Samme token → oppdater scoren
      await supabase
        .from("anonymous_ratings")
        .update({ score, ip_address })
        .eq("id", tokenMatch.id);
    } else if (ipMatch) {
      // Annen token men samme IP → avvis
      return new Response(
        JSON.stringify({ error: "Allerede ratet fra dette nettverket." }),
        { status: 409, headers: corsHeaders }
      );
    } else {
      // Helt ny rating
      const { error: insertErr } = await supabase
        .from("anonymous_ratings")
        .insert({ track_id, anon_token, ip_address, score });

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: "Kunne ikke lagre rating." }),
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // --- OPPDATER avg_rating & rating_count på tracks ---
    // Paginate past the 1000-row PostgREST cap
    const allScores: number[] = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data: page } = await supabase
        .from("anonymous_ratings")
        .select("score")
        .eq("track_id", track_id)
        .range(offset, offset + PAGE - 1);
      if (!page || page.length === 0) break;
      page.forEach((r) => allScores.push(r.score));
      if (page.length < PAGE) break;
      offset += PAGE;
    }

    const avg = allScores.length
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;

    await supabase
      .from("tracks")
      .update({
        avg_rating: Math.round(avg * 100) / 100,
        rating_count: allScores.length,
      })
      .eq("id", track_id);

    return new Response(
      JSON.stringify({
        success: true,
        avg_rating: Math.round(avg * 100) / 100,
        rating_count: allScores.length,
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