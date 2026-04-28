import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── SMTP helpers ──────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

async function smtpRead(conn: Deno.Conn): Promise<string> {
  const buf = new Uint8Array(8192);
  let result = "";
  while (true) {
    const n = await conn.read(buf);
    if (!n) break;
    result += dec.decode(buf.subarray(0, n));
    const last = result.trimEnd().split("\n").pop() || "";
    if (/^\d{3} /.test(last)) break;
  }
  return result;
}

async function smtpCmd(conn: Deno.Conn, cmd: string): Promise<string> {
  await conn.write(enc.encode(cmd + "\r\n"));
  return smtpRead(conn);
}

// ── Send via Gmail SMTP (port 465, implicit TLS) ─────────────────

async function sendGmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const conn = await Deno.connect({ hostname: "smtp.gmail.com", port: 465 });
  const tls = await Deno.startTls(conn, { hostname: "smtp.gmail.com" });
  const cmd = (c: string) => smtpCmd(tls, c);

  try {
    await smtpRead(tls); // greeting
    await cmd("EHLO localhost");

    // AUTH LOGIN
    const a1 = await cmd("AUTH LOGIN");
    if (!a1.startsWith("334")) throw new Error("AUTH rejected: " + a1);
    const a2 = await cmd(btoa(GMAIL_USER));
    if (!a2.startsWith("334")) throw new Error("User rejected: " + a2);
    const a3 = await cmd(btoa(GMAIL_APP_PASSWORD));
    if (!a3.startsWith("235")) throw new Error("Auth failed: " + a3);

    const mf = await cmd(`MAIL FROM:<${GMAIL_USER}> BODY=8BITMIME`);
    if (!mf.startsWith("250")) throw new Error("MAIL FROM: " + mf);
    const rt = await cmd(`RCPT TO:<${to}>`);
    if (!rt.startsWith("250")) throw new Error("RCPT TO: " + rt);
    const dr = await cmd("DATA");
    if (!dr.startsWith("354")) throw new Error("DATA: " + dr);

    // Build simple text/html email — NO multipart, just direct HTML
    const rawEmail = [
      `From: VaadPlus <${GMAIL_USER}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      html,
    ].join("\r\n");

    // Send as raw UTF-8 bytes
    await tls.write(enc.encode(rawEmail + "\r\n.\r\n"));
    const sent = await smtpRead(tls);
    if (!sent.startsWith("250")) throw new Error("Send: " + sent);

    await cmd("QUIT");
  } finally {
    try { tls.close(); } catch { /* */ }
  }
}

// ── Edge Function ────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Read raw body as UTF-8 text, then parse JSON
    const rawBody = await req.text();
    const { to, subject, html, buildingId, unitId, caseId, channel } =
      JSON.parse(rawBody);

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing to, subject, or html" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Gate: block collection notifications when toggle is off ──────────────
    // caseId is only present for collection-case emails.
    // Check buildings.collection_notifications_enabled before sending.
    if (caseId && buildingId) {
      const { data: building } = await supabase
        .from("buildings")
        .select("collection_notifications_enabled")
        .eq("id", buildingId)
        .single();

      if (building && building.collection_notifications_enabled === false) {
        // Log as blocked (not failed) so we have an audit trail
        try {
          await supabase.from("notification_log").insert({
            building_id: buildingId,
            unit_id: unitId || null,
            case_id: caseId,
            channel: channel || "email",
            recipient: to,
            subject,
            body: html,
            status: "blocked",
            error_message: "collection_notifications_disabled",
          });
        } catch { /* */ }

        return new Response(
          JSON.stringify({ success: false, blocked: true, reason: "collection_notifications_disabled" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    let sendResult = { success: false, error: "", provider: "" };

    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
      try {
        await sendGmail(to, subject, html);
        sendResult.success = true;
        sendResult.provider = "gmail";
      } catch (err: any) {
        sendResult.error = `gmail_error: ${err.message}`;
        sendResult.provider = "gmail_failed";
      }
    } else {
      sendResult.error = "no_gmail_credentials";
      sendResult.provider = "none";
    }

    // Log
    try {
      await supabase.from("notification_log").insert({
        building_id: buildingId || null,
        unit_id: unitId || null,
        case_id: caseId || null,
        channel: channel || "email",
        recipient: to,
        subject,
        body: html,
        status: sendResult.success ? "sent" : "failed",
        error_message: sendResult.error || null,
      });
    } catch { /* */ }

    return new Response(
      JSON.stringify({
        success: sendResult.success,
        provider: sendResult.provider,
        error: sendResult.error || undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
