import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-password, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Simple admin password check
  const adminPass = req.headers.get("x-admin-password");
  if (adminPass !== Deno.env.get("ADMIN_PASSWORD")) {
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
