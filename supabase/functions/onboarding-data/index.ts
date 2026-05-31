import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // ── 1. Verify caller is authenticated using service-role client ────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized - no token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Service-role client can verify any user JWT
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: `Invalid token: ${authError?.message}` }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    let buildingId = url.searchParams.get("building_id");

    // Also accept building_id from POST body
    if (!buildingId && req.method === "POST") {
      try {
        const body = await req.json();
        buildingId = body?.building_id || null;
      } catch { /* empty body is fine */ }
    }

    if (buildingId) {
      // Return units for this building
      const { data: units, error } = await admin
        .from("units")
        .select("id, unit_number, number, floor, owner_name")
        .eq("building_id", buildingId)
        .order("unit_number");

      if (error) throw error;
      return new Response(JSON.stringify({ units: units || [] }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    } else {
      // Return all buildings
      const { data: buildings, error } = await admin
        .from("buildings")
        .select("id, name, address, city, total_units")
        .order("name");

      if (error) throw error;
      return new Response(JSON.stringify({ buildings: buildings || [] }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("onboarding-data error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
