import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://www.votemyai.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// K4: Timing-safe password comparison
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    // Compare against self to burn same time, then return false
    let x = 0;
    for (let i = 0; i < bufA.byteLength; i++) x |= bufA[i] ^ bufA[i];
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const password = req.headers.get("x-admin-password");
  const adminPw = Deno.env.get("ADMIN_PASSWORD");
  if (!password || !adminPw || !timingSafeEqual(password, adminPw)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  try {
    const { table, id, user_id } = await req.json();

    // User deletion: delete all related data + auth account
    if (user_id) {
      const { error: e1 } = await supabase.from("comments").delete().eq("user_id", user_id);
      const { error: e2 } = await supabase.from("anonymous_ratings").delete().eq("user_id", user_id);

      // Get user's track IDs to delete their ratings too
      const { data: userTracks } = await supabase.from("tracks").select("id").eq("user_id", user_id);
      if (userTracks && userTracks.length > 0) {
        const trackIds = userTracks.map((t: { id: string }) => t.id);
        await supabase.from("anonymous_ratings").delete().in("track_id", trackIds);
        await supabase.from("comments").delete().in("track_id", trackIds);
      }

      const { error: e3 } = await supabase.from("tracks").delete().eq("user_id", user_id);

      // Delete auth account
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

    // Single row deletion
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

    // When deleting a track, also delete its ratings and comments
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
