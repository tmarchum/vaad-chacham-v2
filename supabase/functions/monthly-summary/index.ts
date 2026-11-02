// Monthly summary: composes ONE digest email per admin with every building's
// financial snapshot for the month (previously one email per building per
// admin — N×M sends). Triggered by a GitHub Action cron (1st of the month) or
// manually. Numbers are computed deterministically from the DB — no
// AI-invented figures.
import { corsHeaders, json, serviceClient, timingSafeEqual } from "../_shared/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only the scheduler (or an authorized caller) may trigger this.
  // Fail CLOSED: a missing CRON_SECRET must deny everything, not allow everything.
  const CRON_SECRET = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret") || "";
  if (!CRON_SECRET || !timingSafeEqual(provided, CRON_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const month: string = body.month || prevMonthKey(new Date());
    const onlyBuilding: string | undefined = body.buildingId;

    const sb = serviceClient();

    // Recipients: all admins.
    const { data: admins, error: adminsErr } = await sb.from("profiles").select("email").eq("role", "admin");
    if (adminsErr) throw new Error(`profiles query failed: ${adminsErr.message}`);
    const recipients = (admins || []).map((a) => a.email).filter(Boolean) as string[];
    if (recipients.length === 0) return json({ error: "no admin recipients" }, 200);

    let buildingsQ = sb.from("buildings").select("id, name");
    if (onlyBuilding) buildingsQ = buildingsQ.eq("id", onlyBuilding);
    const { data: buildings, error: buildingsErr } = await buildingsQ;
    if (buildingsErr) throw new Error(`buildings query failed: ${buildingsErr.message}`);

    // First day of the month AFTER `month` — a half-open range [month-01, next-01)
    // is correct for every month length ("-31" sent 2026-02-31 to Postgres, which
    // errored and silently zeroed expenses in short months).
    const [yy, mm] = month.split("-").map(Number);
    const nextMonth = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;

    // ── Compute every building's snapshot first ──
    const sections: string[] = [];
    const results: Array<Record<string, unknown>> = [];
    for (const b of buildings || []) {
      const [unitsRes, paymentsRes, expensesRes] = await Promise.all([
        sb.from("units").select("id").eq("building_id", b.id),
        sb.from("payments").select("amount, status").eq("building_id", b.id).eq("month", month),
        sb.from("expenses").select("amount").eq("building_id", b.id).gte("date", `${month}-01`).lt("date", nextMonth),
      ]);
      for (const [label, res] of [["units", unitsRes], ["payments", paymentsRes], ["expenses", expensesRes]] as const) {
        if (res.error) throw new Error(`${label} query failed for ${b.name}: ${res.error.message}`);
      }
      const unitCount = (unitsRes.data || []).length;
      const paid = (paymentsRes.data || []).filter((p) => p.status === "paid");
      // "Collected" counts only payments actually marked paid — pending rows
      // must not inflate the figure.
      const collected = paid.reduce((s: number, p) => s + (Number(p.amount) || 0), 0);
      const spent = (expensesRes.data || []).reduce((s: number, e) => s + (Number(e.amount) || 0), 0);
      const rate = unitCount ? Math.round((paid.length / unitCount) * 100) : 0;

      sections.push(`
        <h3 style="color:#1e40af;margin:22px 0 4px">${b.name}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:15px">
          <tr><td style="padding:8px;border-bottom:1px solid #eee">אחוז גבייה</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${rate}% (${paid.length}/${unitCount} דירות)</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">סך נגבה</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${ils(collected)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">הוצאות החודש</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">${ils(spent)}</td></tr>
          <tr><td style="padding:8px">מאזן החודש</td><td style="padding:8px;font-weight:bold;color:${collected - spent >= 0 ? "#059669" : "#dc2626"}">${ils(collected - spent)}</td></tr>
        </table>`);
      results.push({ building: b.name, month, rate, collected, spent });
    }

    if (sections.length === 0) return json({ ok: true, month, results: [], sent: 0 });

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
        <h2 style="color:#1e40af">סיכום חודשי — ${month}</h2>
        ${sections.join("\n")}
        <p style="color:#94a3b8;font-size:12px;margin-top:16px">הופק אוטומטית ע"י ועדלי</p>
      </div>`;

    // ── ONE digest per admin ──
    const sends = await Promise.allSettled(recipients.map(async (to: string) => {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject: `סיכום חודשי ${month} — כל הבניינים`, html }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success !== true) throw new Error(j?.error || `http_${r.status}`);
      return to;
    }));
    const sent = sends.filter((s) => s.status === "fulfilled").length;
    const failures = sends
      .map((s, i) => (s.status === "rejected" ? { to: recipients[i], error: String((s as PromiseRejectedResult).reason?.message || (s as PromiseRejectedResult).reason) } : null))
      .filter(Boolean);
    if (failures.length) console.error("monthly-summary send failures:", failures);

    return json({ ok: true, month, results, sentTo: sent, failed: failures });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
