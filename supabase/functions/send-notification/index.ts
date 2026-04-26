import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Encode a UTF-8 string as MIME Base64 (for subject / from name) */
function mimeEncode(text: string): string {
  const encoded = base64Encode(new TextEncoder().encode(text));
  return `=?UTF-8?B?${encoded}?=`;
}

/** Build a raw RFC-2822 email with proper UTF-8 / Base64 encoding */
function buildRawEmail(from: string, fromName: string, to: string, subject: string, html: string): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const htmlBase64 = base64Encode(new TextEncoder().encode(html));
  // Split base64 into 76-char lines per RFC 2045
  const htmlB64Lines = htmlBase64.match(/.{1,76}/g)?.join("\r\n") || htmlBase64;

  const raw = [
    `From: ${mimeEncode(fromName)} <${from}>`,
    `To: ${to}`,
    `Subject: ${mimeEncode(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlB64Lines,
  ].join("\r\n");

  return raw;
}

/** Send email via Gmail SMTP using raw socket (STARTTLS on port 587) */
async function sendViaGmailSmtp(from: string, to: string, rawEmail: string): Promise<void> {
  const conn = await Deno.connect({ hostname: "smtp.gmail.com", port: 465 });
  const tlsConn = await Deno.startTls(conn, { hostname: "smtp.gmail.com" });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function read(): Promise<string> {
    const buf = new Uint8Array(4096);
    const n = await tlsConn.read(buf);
    return n ? decoder.decode(buf.subarray(0, n)) : "";
  }

  async function write(cmd: string): Promise<string> {
    await tlsConn.write(encoder.encode(cmd + "\r\n"));
    return await read();
  }

  // SMTP handshake
  await read(); // greeting
  await write(`EHLO localhost`);
  await write(`AUTH LOGIN`);
  await write(base64Encode(new TextEncoder().encode(GMAIL_USER)));
  const authRes = await write(base64Encode(new TextEncoder().encode(GMAIL_APP_PASSWORD)));
  if (!authRes.startsWith("235")) {
    tlsConn.close();
    throw new Error(`SMTP auth failed: ${authRes}`);
  }

  await write(`MAIL FROM:<${from}>`);
  await write(`RCPT TO:<${to}>`);
  await write(`DATA`);
  // Send raw email body + terminator
  await tlsConn.write(encoder.encode(rawEmail + "\r\n.\r\n"));
  const dataRes = await read();
  if (!dataRes.startsWith("250")) {
    tlsConn.close();
    throw new Error(`SMTP data failed: ${dataRes}`);
  }

  await write(`QUIT`);
  tlsConn.close();
}

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

    // Priority 1: Gmail SMTP (raw socket — proper UTF-8 Base64 encoding)
    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
      try {
        const rawEmail = buildRawEmail(GMAIL_USER, "וועד+", to, subject, html);
        await sendViaGmailSmtp(GMAIL_USER, to, rawEmail);
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
