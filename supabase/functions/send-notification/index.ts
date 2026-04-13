import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, html, buildingId, unitId, caseId, channel } = await req.json();

    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: "Missing to, subject, or html" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let sendResult = { success: false, error: "" };

    if (RESEND_API_KEY) {
      // Send via Resend
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "ועד חכם <vaad@resend.dev>",
          to: [to],
          subject,
          html,
        }),
      });

      if (res.ok) {
        sendResult.success = true;
      } else {
        const err = await res.text();
        sendResult.error = err;
      }
    } else {
      // No email provider configured - just log
      sendResult.success = true;
      sendResult.error = "no_provider_logged_only";
    }

    // Log to notification_log
    await supabase.from("notification_log").insert({
      building_id: buildingId,
      unit_id: unitId || null,
      case_id: caseId || null,
      channel: channel || "email",
      recipient: to,
      subject,
      body: html,
      status: sendResult.success ? "sent" : "failed",
      error_message: sendResult.error || null,
    });

    return new Response(JSON.stringify({ success: sendResult.success }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
