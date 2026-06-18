// Monthly summary: composes each building's financial snapshot for the month
// and emails it to the admins. Triggered by a GitHub Action cron (1st of the
// month) or manually. Numbers are computed deterministically from the DB —
// no AI-invented figures.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ils = (n: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n || 0);

function prevMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based; "previous month" relative to run date
  const pm = m === 0 ? 12 : m;
  const py = m === 0 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Only the scheduler (or an authorized caller) may trigger this.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const month: string = body.month || prevMonthKey(new Date());
    const onlyBuilding: string | undefined = body.buildingId;

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Recipients: all admins.
    const { data: admins } = await sb.from("profiles").select("email").eq("role", "admin");
    const recipients = (admins || []).map((a: any) => a.email).filter(Boolean);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "no admin recipients" }), { status: 200, headers: cors });
    }

    let buildingsQ = sb.from("buildings").select("id, name");
    if (onlyBuilding) buildingsQ = buildingsQ.eq("id", onlyBuilding);
    const { data: buildings } = await buildingsQ;

    const results: any[] = [];
    for (const b of buildings || []) {
      const [{ data: units }, { data: payments }, { data: expenses }] = await Promise.all([
        sb.from("units").select("id").eq("building_id", b.id),
        sb.from("payments").select("amount, status").eq("building_id", b.id).eq("month", month),
        sb.from("expenses").select("amount").eq("building_id", b.id).gte("date", `${month}-01`).lte("date", `${month}-31`),
      ]);

      const unitCount = (units || []).length;
      const paid = (payments || []).filter((p: any) => p.status === "paid");
      const collected = (payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
      const spent = (expenses || []).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
      const rate = unitCount ? Math.round((paid.length / unitCount) * 100) : 0;

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
          <h2 style="color:#1e40af">סיכום חודשי — ${b.name}</h2>
          <p style="color:#64748b">חודש ${month}</p>
          <table style="width:100%;border-collapse:collapse;font-size:15px">
            <tr><td style="padding:8px;border-bottom:1px solid #eee">אחוז גבייה</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${rate}% (${paid.length}/${unitCount} דירות)</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee">סך נגבה</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${ils(collected)}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee">הוצאות החודש</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${ils(spent)}</td></tr>
            <tr><td style="padding:8px">מאזן החודש</td><td style="padding:8px;font-weight:bold;color:${collected - spent >= 0 ? "#059669" : "#dc2626"}">${ils(collected - spent)}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:12px;margin-top:16px">הופק אוטומטית ע"י וועד+</p>
        </div>`;

      for (const to of recipients) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ to, subject: `סיכום חודשי ${month} — ${b.name}`, html, buildingId: b.id }),
        });
      }
      results.push({ building: b.name, month, rate, collected, spent, sentTo: recipients.length });
    }

    return new Response(JSON.stringify({ ok: true, month, results }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: cors });
  }
});
