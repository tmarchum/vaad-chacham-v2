import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "";
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

    // Priority 1: Gmail SMTP
    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
      try {
        const client = new SMTPClient({
          connection: {
            hostname: "smtp.gmail.com",
            port: 465,
            tls: true,
            auth: {
              username: GMAIL_USER,
              password: GMAIL_APP_PASSWORD,
            },
          },
        });

        await client.send({
          from: `וועד+ <${GMAIL_USER}>`,
          to: to,
          subject,
          content: "auto",
          html,
        });

        await client.close();
        sendResult.success = true;
      } catch (gmailErr) {
        sendResult.error = `gmail_error: ${gmailErr.message}`;
      }
    }
    // Priority 2: Resend API (fallback)
    else if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "וועד+ <vaad@resend.dev>",
          to: [to],
          subject,
          html,
        }),
      });

      if (res.ok) {
        sendResult.success = true;
      } else {
        const err = await res.text();
        sendResult.error = `resend_error: ${err}`;
      }
    }
    // No provider
    else {
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
