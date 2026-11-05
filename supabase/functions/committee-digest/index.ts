// committee-digest — the thing a management company is actually paid for:
// noticing that nothing happened.
//
// The app records state well. What it never did was look back at that state
// and say "this has been sitting for 213 days". So faults aged out in
// silence, statutory inspections had no dates at all, and the committee was
// manually re-sending the same reminder to the lift company every week.
//
// Once a week this reads everything, finds only what is genuinely stuck, and
// sends ONE email to the committee. If nothing is stuck it sends nothing —
// a digest that arrives every week regardless is a digest nobody opens.
//
// GUARDRAIL: this never writes to anyone outside the committee. Debtors are
// listed so a human can decide; no resident and no vendor is contacted from
// here. Collection letters never leave automatically — that rule holds.
//
// Triggered by the weekly GitHub Action (x-cron-secret) or by an admin from
// the app (JWT). { dryRun: true } returns the digest without sending.

import { corsHeaders, json, serviceClient, timingSafeEqual, identifyCaller, isPrivileged } from '../_shared/mod.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ils = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n || 0)

const daysSince = (d: string | null) =>
  d ? Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000) : 0

// How long a category may sit before it is late. A blocked rubbish chute is
// not a lift trapping someone, and treating them the same makes the whole
// list easy to ignore.
const SLA_DAYS: Record<string, number> = {
  'מעלית': 2,
  'בטיחות וביטחון': 3,
  'אינסטלציה ומים': 5,
  'חשמל ותאורה': 7,
  'שערים, דלתות וחניה': 14,
  'ניקיון ותחזוקה': 14,
  'אחר': 14,
}
const DEFAULT_SLA = 14

const FREQ_DAYS: Record<string, number> = {
  weekly: 7, monthly: 30, quarterly: 91, yearly: 365,
}

const OPEN_STATUSES = ['reported', 'open', 'acknowledged', 'scheduled', 'in_progress']

// Words that carry no signal when deciding whether two faults are the same
// problem coming back.
const STOP = new Set([
  'של', 'עם', 'על', 'לא', 'יש', 'אין', 'זה', 'מה', 'או', 'גם', 'כל', 'את',
  'בבניין', 'בקומה', 'קומה', 'דירה', 'תקלה', 'בעיה', 'צריך', 'אנא', 'בבקשה',
])

const keywords = (s: string) =>
  String(s || '')
    .replace(/[^֐-׿\w\s]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[והבלכמש]/, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w))

type Section = { title: string; rows: string[]; tone: 'red' | 'amber' | 'blue' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const svc = serviceClient()

  // Either the scheduler or a signed-in admin. Fail closed on both.
  const CRON_SECRET = Deno.env.get('CRON_SECRET')
  const provided = req.headers.get('x-cron-secret') || ''
  const byCron = !!CRON_SECRET && timingSafeEqual(provided, CRON_SECRET)
  if (!byCron) {
    const caller = await identifyCaller(req, svc)
    if (!caller || !isPrivileged(caller)) return json({ error: 'unauthorized' }, 401)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const dryRun = body.dryRun === true

    const { data: buildings } = await svc.from('buildings').select('id, name')
    const out: Array<Record<string, unknown>> = []

    for (const b of buildings || []) {
      const sections: Section[] = []

      // ── 1. Faults past their SLA ─────────────────────────────────────────
      const { data: issues } = await svc
        .from('issues')
        .select('id, title, category, status, reported_at, assigned_to')
        .eq('building_id', b.id)
        .in('status', OPEN_STATUSES)

      const late = (issues || [])
        .map((i) => ({ ...i, age: daysSince(i.reported_at), sla: SLA_DAYS[i.category] ?? DEFAULT_SLA }))
        .filter((i) => i.age > i.sla)
        .sort((x, y) => y.age - x.age)

      if (late.length) {
        sections.push({
          tone: 'red',
          title: `${late.length} תקלות עברו את זמן הטיפול`,
          rows: late.slice(0, 12).map((i) =>
            `<b>${esc(i.title)}</b> — ${i.age} ימים פתוחה (${esc(i.category || 'ללא קטגוריה')}, יעד ${i.sla} ימים)`),
        })
      }

      // ── 2. The same problem coming back ──────────────────────────────────
      // Three separate "פיר אשפה" reports in seven months is not three
      // faults; it is one that was never actually fixed.
      // A year, not six months. The blocked rubbish chute was reported in
      // April and twice in October — a six-month window misses exactly the
      // pattern worth seeing, that this has been going on all year.
      const since = new Date(Date.now() - 365 * 86_400_000).toISOString()
      const { data: recent } = await svc
        .from('issues')
        .select('id, title, category, status, reported_at')
        .eq('building_id', b.id)
        .gte('reported_at', since)

      const groups = new Map<string, { titles: string[]; open: number; ids: Set<string> }>()
      for (const i of recent || []) {
        // Grouped by the word alone, not by category. The blocked chute was
        // filed under "אחר" twice and "ניקיון ותחזוקה" once; keying on the
        // category would split the very pattern we are looking for.
        for (const w of new Set(keywords(i.title))) {
          const key = w
          const g = groups.get(key) || { titles: [], open: 0, ids: new Set<string>() }
          g.titles.push(i.title)
          g.ids.add(i.id)
          if (OPEN_STATUSES.includes(i.status)) g.open++
          groups.set(key, g)
        }
      }
      // "פיר" and "אשפה" describe the same three reports. Listing both says
      // the same thing twice and makes a short list look like a long one, so
      // a group whose issues are already covered is dropped.
      const ranked = [...groups.entries()]
        .filter(([, g]) => g.titles.length >= 3)
        .sort((a, bb) => bb[1].titles.length - a[1].titles.length)
      const covered: Array<Set<string>> = []
      const repeats: typeof ranked = []
      for (const entry of ranked) {
        const ids = entry[1].ids
        if (covered.some((c) => [...ids].every((id) => c.has(id)))) continue
        covered.push(ids)
        repeats.push(entry)
        if (repeats.length >= 5) break
      }

      if (repeats.length) {
        sections.push({
          tone: 'amber',
          title: 'בעיות שחוזרות — שווה תיקון שורש',
          rows: repeats.map(([key, g]) => {
            const word = key
            return `<b>"${esc(word)}"</b> — דווח ${g.titles.length} פעמים בשנה האחרונה` +
              (g.open ? `, ${g.open} עדיין פתוחות` : ', כולן נסגרו')
          }),
        })
      }

      // ── 3. Statutory checks: overdue, or never dated ─────────────────────
      const { data: tasks } = await svc
        .from('recurring_tasks')
        .select('title, frequency, next_due_date, is_required_by_law')
        .eq('building_id', b.id)

      const today = new Date().toISOString().slice(0, 10)
      const overdue = (tasks || []).filter((t) => t.next_due_date && t.next_due_date < today)
      const undated = (tasks || []).filter((t) => !t.next_due_date && t.is_required_by_law)

      if (overdue.length) {
        sections.push({
          tone: 'red',
          title: `${overdue.length} בדיקות תקופתיות באיחור`,
          rows: overdue.slice(0, 10).map((t) =>
            `<b>${esc(t.title)}</b> — היה אמור ${t.next_due_date}${t.is_required_by_law ? ' <span style="color:#b91c1c">(חובה בחוק)</span>' : ''}`),
        })
      }
      if (undated.length) {
        sections.push({
          tone: 'amber',
          title: `${undated.length} בדיקות חובה ללא תאריך ביצוע`,
          rows: [`אף אחד לא יודע מתי נעשו לאחרונה, ולכן אי אפשר להתריע עליהן. יש למלא מועד אחרון ב"ניהול → משימות תקופתיות".`,
            ...undated.slice(0, 8).map((t) => `· ${esc(t.title)}`)],
        })
      }

      // ── 4. Debtors — listed for a human, never contacted from here ───────
      const { data: cases } = await svc
        .from('collection_cases')
        .select('unit_number, resident_name, total_debt, months_overdue')
        .eq('building_id', b.id).eq('status', 'open')
        .gte('months_overdue', 2)
        .order('total_debt', { ascending: false })

      if (cases?.length) {
        const total = cases.reduce((s, c) => s + Number(c.total_debt || 0), 0)
        sections.push({
          tone: 'amber',
          title: `${cases.length} דירות בחוב של חודשיים ומעלה — ${ils(total)}`,
          rows: [...cases.slice(0, 10).map((c) =>
            `דירה ${esc(String(c.unit_number ?? '—'))} ${esc(c.resident_name || '')} — ${ils(Number(c.total_debt))} (${c.months_overdue} חודשים)`),
            '<i>לידיעת הוועד בלבד. לא נשלחה שום פנייה לדיירים.</i>'],
        })
      }

      // ── 5. Money waiting to be attributed ────────────────────────────────
      const { data: sugg } = await svc
        .from('bank_transactions')
        .select('credit')
        .eq('building_id', b.id).eq('match_status', 'suggested')
      const { data: unm } = await svc
        .from('bank_transactions')
        .select('credit')
        .eq('building_id', b.id).eq('match_status', 'unmatched').gt('credit', 0)

      if (sugg?.length || unm?.length) {
        const sTotal = (sugg || []).reduce((s, t) => s + Number(t.credit || 0), 0)
        const uTotal = (unm || []).reduce((s, t) => s + Number(t.credit || 0), 0)
        const rows: string[] = []
        if (sugg?.length) rows.push(`${sugg.length} הצעות שיוך ממתינות לאישור — ${ils(sTotal)}`)
        if (unm?.length) rows.push(`${unm.length} זיכויים ללא שיוך כלל — ${ils(uTotal)}`)
        rows.push('<i>כסף שנכנס לחשבון אך לא נזקף לאף דירה — דייר ששילם עלול להיראות כחייב.</i>')
        sections.push({ tone: 'blue', title: 'כסף שממתין לשיוך', rows })
      }

      // ── 6. Budget vs actual, where a budget exists ───────────────────────
      const year = new Date().getFullYear()
      const { data: budgets } = await svc
        .from('budgets').select('category, annual_amount').eq('building_id', b.id).eq('year', year)

      if (budgets?.length) {
        const { data: exps } = await svc
          .from('expenses').select('category, amount, date')
          .eq('building_id', b.id).gte('date', `${year}-01-01`)
        const spent = new Map<string, number>()
        for (const e of exps || []) {
          spent.set(e.category || '', (spent.get(e.category || '') || 0) + Number(e.amount || 0))
        }
        // Compare against the year elapsed so far, not the whole year — in
        // March, 40% of an annual budget spent is the story, not 40% "left".
        const elapsed = (Date.now() - new Date(`${year}-01-01`).getTime()) / (365 * 86_400_000)
        const over = budgets
          .map((bu) => {
            const used = spent.get(bu.category) || 0
            const expected = Number(bu.annual_amount) * elapsed
            return { ...bu, used, expected, ratio: expected > 0 ? used / expected : 0 }
          })
          .filter((x) => x.ratio > 1.1)
          .sort((x, y) => y.ratio - x.ratio)

        if (over.length) {
          sections.push({
            tone: 'amber',
            title: 'קטגוריות שחורגות מהתקציב',
            rows: over.map((x) =>
              `<b>${esc(x.category)}</b> — ${ils(x.used)} מתוך ${ils(Number(x.annual_amount))} שנתי ` +
              `(${Math.round(x.ratio * 100)}% מהקצב הצפוי לתקופה)`),
          })
        }
      }

      if (!sections.length) { out.push({ building: b.name, sections: 0, sent: false }); continue }

      // ── Recipients: the committee of this building ───────────────────────
      const { data: members } = await svc
        .from('building_memberships').select('user_id').eq('building_id', b.id)
      const ids = (members || []).map((m) => m.user_id).filter(Boolean)
      const { data: profs } = ids.length
        ? await svc.from('profiles').select('email, role').in('id', ids)
        : { data: [] }
      let emails = (profs || []).map((p) => p.email).filter(Boolean) as string[]
      if (!emails.length) {
        const { data: admins } = await svc.from('profiles').select('email').eq('role', 'admin')
        emails = (admins || []).map((a) => a.email).filter(Boolean) as string[]
      }
      emails = [...new Set(emails)]

      const html = render(b.name as string, sections)
      const subject = `ועדלי — ${sections.reduce((s, x) => s + x.rows.length, 0)} דברים שדורשים טיפול ב${b.name}`

      if (dryRun) { out.push({ building: b.name, sections: sections.length, recipients: emails, html }); continue }

      let sent = 0
      for (const to of emails) {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, html }),
        })
        if (r.ok) sent++
      }
      out.push({ building: b.name, sections: sections.length, sentTo: sent })
    }

    return json({ ok: true, buildings: out })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500)
  }
})

function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

function render(building: string, sections: Section[]): string {
  const colour = { red: '#b91c1c', amber: '#b45309', blue: '#1d4ed8' }
  const blocks = sections.map((s) => `
    <div style="margin:0 0 18px;border-right:4px solid ${colour[s.tone]};padding:0 12px 0 0;">
      <h3 style="margin:0 0 8px;color:${colour[s.tone]};font-size:15px;">${esc(s.title)}</h3>
      ${s.rows.map((r) => `<p style="margin:0 0 5px;color:#334155;font-size:13px;">${r}</p>`).join('')}
    </div>`).join('')

  return `
    <div dir="rtl" style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
      <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;padding:18px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;">מה דורש טיפול השבוע</h2>
        <p style="margin:4px 0 0;opacity:.9;font-size:13px;">${esc(building)}</p>
      </div>
      <div style="background:#f8fafc;padding:18px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
        ${blocks}
        <p style="margin:16px 0 0;color:#94a3b8;font-size:11px;">
          נשלח רק כשיש משהו לדווח. אם אין — לא נשלח מייל כלל.<br>
          ההודעה הזו מיועדת לחברי הוועד בלבד ולא נשלחה לאף דייר או ספק.
        </p>
      </div>
    </div>`
}
