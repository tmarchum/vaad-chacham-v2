import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { useUnitDirectory } from '@/hooks/useUnitDirectory'
import { Button } from '@/components/ui/button'
import { TabGroup } from '@/components/ui/tabs'
import { Select } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatCard } from '@/components/common/StatCard'
import { SectionCard } from '@/components/common/SectionCard'
import { SearchBar } from '@/components/common/SearchBar'
import { EmptyState } from '@/components/common/EmptyState'
import { toast, toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { waLink } from '@/lib/phone'
import { sendWhatsappTemplate, logManualSend, resetWhatsappEnabledCache } from '@/lib/whatsapp'
import {
  MessageCircle, Send, FileText, ScrollText, PlugZap, CheckCircle2, XCircle, Clock,
  Copy, RefreshCw, ShieldCheck, Mail, Bell, Phone, ArrowDownLeft, Users, Store, Bot, AlertTriangle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const META_STATUS = {
  draft:    { label: 'טיוטה — טרם נשלחה לאישור', cls: 'bg-[var(--surface-container)] text-[var(--text-secondary)]' },
  PENDING:  { label: 'ממתינה לאישור Meta', cls: 'bg-[var(--warning-light)] text-[var(--warning)]' },
  APPROVED: { label: 'מאושרת', cls: 'bg-[var(--success-light)] text-[var(--success)]' },
  REJECTED: { label: 'נדחתה', cls: 'bg-[var(--danger-light)] text-[var(--danger)]' },
  PAUSED:   { label: 'מושהית', cls: 'bg-[var(--warning-light)] text-[var(--warning)]' },
  DISABLED: { label: 'מושבתת', cls: 'bg-[var(--danger-light)] text-[var(--danger)]' },
}

const CHANNEL = {
  whatsapp:    { label: 'וואטסאפ', icon: MessageCircle },
  whatsapp_in: { label: 'וואטסאפ נכנס', icon: ArrowDownLeft },
  email:       { label: 'מייל', icon: Mail },
  push:        { label: 'פוש', icon: Bell },
  phone:       { label: 'שיחה', icon: Phone },
}

const PROVIDER_LABEL = {
  whatsapp_cloud: 'וואטסאפ רשמי', greenapi: 'GreenAPI', gmail: 'Gmail', fcm: 'אפליקציה', manual: 'ידני',
}

const STATUS = {
  sent:     { label: 'נשלח', cls: 'bg-[var(--success-light)] text-[var(--success)]' },
  received: { label: 'התקבל', cls: 'bg-[var(--surface-container)] text-[var(--primary-dark)]' },
  opened:   { label: 'נפתח ידנית', cls: 'bg-[var(--surface-container)] text-[var(--text-secondary)]' },
  failed:   { label: 'נכשל', cls: 'bg-[var(--danger-light)] text-[var(--danger)]' },
  blocked:  { label: 'נחסם', cls: 'bg-[var(--warning-light)] text-[var(--warning)]' },
  skipped:  { label: 'דולג', cls: 'bg-[var(--surface-container)] text-[var(--text-muted)]' },
}

const DELIVERY = { delivered: 'נמסר', read: 'נקרא', sent: 'נשלח', failed: 'נכשל במסירה' }

const ERRORS = {
  integration_disabled: 'הערוץ הרשמי כבוי — הפעילו אותו בלשונית "חיבור"',
  not_configured: 'הערוץ הרשמי עדיין לא הוגדר',
  template_not_approved: 'התבנית עוד לא אושרה על ידי Meta',
  not_a_vendor: 'המספר אינו של ספק במאגר',
  not_your_resident: 'המספר אינו של דייר פעיל בבניין שבניהולך',
  bad_number: 'מספר טלפון לא תקין',
  missing_variables: 'יש למלא את כל השדות',
  waba_id_missing: 'חסר מזהה חשבון WhatsApp Business (WABA ID) בלשונית "חיבור"',
  forbidden: 'הפעולה פתוחה למנהל בלבד',
}

const render = (body, vars) => String(body || '').replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1] || `[${n}]`)
const fmtTime = (d) => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const Chip = ({ cls, children }) => <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap', cls)}>{children}</span>

async function invokeWa(body) {
  const { data, error } = await supabase.functions.invoke('whatsapp', { body })
  if (error) return { ok: false, error: error.message }
  return data || { ok: false }
}

function grokBrief(webhookUrl, verifyToken) {
  return `אני מחבר את מערכת "ועדלי" (ניהול ועדי בתים) ל-WhatsApp Business הרשמי של Meta (Cloud API). אני צריך שתעזור לי, צעד אחר צעד:

1. ליצור או לבחור WhatsApp Business Account תחת ה-Business Manager שלי, ולרשום ולאמת מספר טלפון עסקי שישמש לשליחה.
2. ליצור System User קבוע עם הרשאות whatsapp_business_messaging ו-whatsapp_business_management, לשייך אליו את האפליקציה ואת חשבון הוואטסאפ, ולהפיק טוקן גישה קבוע (ללא תפוגה).
3. למסור לי ארבעה ערכים: Phone Number ID, WhatsApp Business Account ID, הטוקן הקבוע, ו-App Secret של האפליקציה.
4. להגדיר Webhook באפליקציה:
   Callback URL: ${webhookUrl || '(יופיע במערכת אחרי שמירה ראשונה)'}
   Verify Token: ${verifyToken || '(יופיע במערכת אחרי שמירה ראשונה)'}
   ולהירשם לשדות: messages, message_template_status_update.
5. להגדיר שם תצוגה לעסק ("ועדלי") ושיטת תשלום בחשבון הוואטסאפ.

את תבניות ההודעות (לדיירים ולספקים) המערכת מגישה לאישור Meta בעצמה — אין צורך ליצור אותן ידנית.`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Messaging() {
  const { selectedBuilding } = useBuildingContext()
  const { isAdmin } = useAuth()
  const dir = useUnitDirectory(selectedBuilding?.id)

  const [tab, setTab] = useState('send')
  const [cfg, setCfg] = useState(null)       // whatsapp function config response
  const [templates, setTemplates] = useState([])
  const [vendors, setVendors] = useState([])
  const [stats, setStats] = useState({ today: 0, wa30: 0, bad30: 0 })

  const loadConfig = useCallback(async () => setCfg(await invokeWa({ action: 'config' })), [])
  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('message_templates').select('*').order('audience').order('key')
    setTemplates(data || [])
  }, [])
  const loadStats = useCallback(async () => {
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const head = { count: 'exact', head: true }
    const [a, b, c] = await Promise.all([
      supabase.from('notification_log').select('id', head).gte('created_at', today.toISOString()),
      supabase.from('notification_log').select('id', head).eq('channel', 'whatsapp').gte('created_at', since30),
      supabase.from('notification_log').select('id', head).in('status', ['failed', 'blocked']).gte('created_at', since30),
    ])
    setStats({ today: a.count || 0, wa30: b.count || 0, bad30: c.count || 0 })
  }, [])

  useEffect(() => {
    loadConfig(); loadTemplates(); loadStats()
    supabase.from('vendors').select('id, name, phone, category, membership_status, is_blacklisted')
      .order('name').then(({ data }) => setVendors((data || []).filter((v) => v.phone && !v.is_blacklisted)))
  }, [loadConfig, loadTemplates, loadStats])

  const official = cfg?.config
  const officialOn = !!official?.enabled && !!cfg?.has_token
  const approved = templates.filter((t) => t.meta_status === 'APPROVED').length

  const tabs = [
    { key: 'send', label: 'שליחת הודעה', icon: Send },
    { key: 'templates', label: 'תבניות', icon: FileText, count: templates.length },
    ...(isAdmin ? [
      { key: 'log', label: 'יומן הודעות', icon: ScrollText },
      { key: 'connection', label: 'חיבור וואטסאפ רשמי', icon: PlugZap },
    ] : []),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">וואטסאפ והודעות</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            שליחה לדיירים ולספקים דרך הוואטסאפ הרשמי, תבניות מאושרות ויומן מלא של כל הודעה שיצאה מהמערכת{selectedBuilding ? ` • ${selectedBuilding.name}` : ''}
          </p>
        </div>
        <Chip cls={officialOn ? 'bg-[var(--success-light)] text-[var(--success)]' : 'bg-[var(--warning-light)] text-[var(--warning)]'}>
          {officialOn ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {officialOn ? `וואטסאפ רשמי מחובר${official?.display_number ? ` • ${official.display_number}` : ''}` : 'וואטסאפ רשמי לא מחובר — שליחה ידנית בלבד'}
        </Chip>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="הודעות היום" icon={Send} color="blue" value={String(stats.today)} sub="כל הערוצים: וואטסאפ, מייל ופוש" />
        <StatCard label="וואטסאפ ב-30 יום" icon={MessageCircle} color="emerald" value={String(stats.wa30)} sub="כולל שליחות ידניות שתועדו" />
        <StatCard label="נכשלו / נחסמו ב-30 יום" icon={XCircle} color={stats.bad30 ? 'red' : 'slate'} value={String(stats.bad30)}
          footer={isAdmin ? <button onClick={() => setTab('log')} className="text-[var(--primary)] font-semibold hover:underline">לפירוט ביומן ←</button> : null} />
        <StatCard label="תבניות מאושרות ב-Meta" icon={ShieldCheck} color="purple" value={`${approved}/${templates.length}`}
          progress={templates.length ? Math.round((approved / templates.length) * 100) : 0} />
      </div>

      <TabGroup tabs={tabs} activeTab={tab} onChange={setTab} />

      {tab === 'send' && (
        <SendPanel templates={templates} officialOn={officialOn} dir={dir} vendors={vendors}
          building={selectedBuilding} onSent={loadStats} />
      )}
      {tab === 'templates' && (
        <TemplatesPanel templates={templates} isAdmin={isAdmin} officialOn={!!official?.waba_id && cfg?.has_token}
          reload={loadTemplates} />
      )}
      {tab === 'log' && isAdmin && <LogPanel />}
      {tab === 'connection' && isAdmin && <ConnectionPanel cfg={cfg} reload={loadConfig} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

function SendPanel({ templates, officialOn, dir, vendors, building, onSent }) {
  const [audience, setAudience] = useState('resident')
  const [recipientId, setRecipientId] = useState('')
  const [templateKey, setTemplateKey] = useState('')
  const [vars, setVars] = useState([])
  const [sending, setSending] = useState(false)

  const residentOptions = useMemo(() => dir.units.filter((u) => u.phone), [dir.units])
  const recipients = audience === 'resident'
    ? residentOptions.map((u) => ({ id: u.id, label: `${u.label}${u.phone ? ` • ${u.phone}` : ''}`, name: u.name, phone: u.phone, unitId: u.id }))
    : vendors.map((v) => ({ id: v.id, label: `${v.name}${v.category ? ` — ${v.category}` : ''} • ${v.phone}`, name: v.name, phone: v.phone }))
  const recipient = recipients.find((r) => r.id === recipientId) || null
  const tplList = templates.filter((t) => t.audience === audience && t.active)
  const tpl = tplList.find((t) => t.key === templateKey) || null

  // Prefill sensible defaults when the template or recipient changes.
  useEffect(() => {
    if (!tpl) { setVars([]); return }
    const labels = tpl.variables || []
    setVars(labels.map((label, i) => {
      if (i === 0) return recipient?.name || ''
      if (/כתובת|בניין|מקום/.test(label) && building) return [building.name, building.address].filter(Boolean).join(', ')
      return ''
    }))
  }, [tpl, recipient, building])

  const preview = tpl ? render(tpl.body, vars) : ''
  const ready = recipient && tpl && vars.every((v) => String(v).trim())
  const canSystem = officialOn && tpl?.meta_status === 'APPROVED'

  const send = async () => {
    if (!ready) return
    if (tpl.key === 'resident_payment_reminder' &&
      !window.confirm(`לשלוח תזכורת תשלום ל${recipient.name || 'דייר'}? זו שליחה ידנית חד-פעמית.`)) return
    setSending(true)
    try {
      if (canSystem) {
        const res = await sendWhatsappTemplate({
          audience, to: recipient.phone, templateKey: tpl.key, variables: vars,
          buildingId: building?.id, unitId: recipient.unitId, confirmManual: true,
        })
        if (res.sent) { toast('ההודעה נשלחה בוואטסאפ הרשמי ✓'); onSent?.() }
        else toastError(ERRORS[res.reason] || `השליחה נכשלה: ${res.reason}`)
      } else {
        const link = waLink(recipient.phone, preview)
        if (!link) { toastError('למספר זה אין וואטסאפ'); return }
        window.open(link, '_blank')
        await logManualSend({ phone: recipient.phone, message: preview, link, audience, buildingId: building?.id, unitId: recipient.unitId, template: { key: tpl.key } })
        toast('נפתח וואטסאפ לשליחה ידנית — נרשם ביומן')
        onSent?.()
      }
    } finally { setSending(false) }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <SectionCard icon={Send} title="הודעה חדשה" subtitle="בחרו נמען, תבנית ומלאו את הפרטים" className="xl:col-span-7">
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">למי שולחים?</label>
            <TabGroup
              tabs={[{ key: 'resident', label: 'דייר', icon: Users }, { key: 'vendor', label: 'ספק', icon: Store }]}
              activeTab={audience}
              onChange={(k) => { setAudience(k); setRecipientId(''); setTemplateKey('') }}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">
              {audience === 'resident' ? `דייר${building ? ` ב${building.name}` : ''}` : 'ספק מהמאגר'}
            </label>
            <Select value={recipientId} onChange={(e) => setRecipientId(e.target.value)} placeholder={recipients.length ? 'בחרו נמען...' : 'אין נמענים עם טלפון'}
              options={recipients.map((r) => ({ value: r.id, label: r.label }))} />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">תבנית</label>
            <Select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} placeholder="בחרו תבנית..."
              options={tplList.map((t) => ({ value: t.key, label: `${t.title}${t.meta_status === 'APPROVED' ? '' : ' (טרם אושרה)'}` }))} />
          </div>
          {tpl && (tpl.variables || []).map((label, i) => (
            <div key={i}>
              <label className="block text-[12px] font-semibold text-[var(--text-secondary)] mb-1.5">{label}</label>
              <input value={vars[i] || ''} onChange={(e) => setVars((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-[38px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]" />
            </div>
          ))}
          {tpl?.key === 'resident_payment_reminder' && (
            <p className="flex items-start gap-1.5 p-2.5 rounded-[var(--radius)] bg-[var(--warning-light)] text-[12px] text-[var(--warning)]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />תזכורת תשלום נשלחת רק ידנית, לדייר אחד בכל פעם, ותמיד אחרי אישור. אין ולא תהיה שליחה אוטומטית.
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button onClick={send} disabled={!ready || sending} className="flex-1">
              <Send className="h-4 w-4" />
              {sending ? 'שולח...' : canSystem ? 'שלח בוואטסאפ הרשמי' : 'פתח בוואטסאפ לשליחה ידנית'}
            </Button>
          </div>
          {!canSystem && tpl && (
            <p className="text-[11px] text-[var(--text-muted)]">
              {officialOn ? 'התבנית עדיין לא אושרה על ידי Meta — בינתיים השליחה ידנית ונרשמת ביומן.' : 'הוואטסאפ הרשמי עוד לא מחובר — השליחה ידנית ונרשמת ביומן.'}
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard icon={MessageCircle} title="תצוגה מקדימה" subtitle="כך ההודעה תיראה אצל הנמען" className="xl:col-span-5 xl:sticky xl:top-20">
        <div className="p-4">
          <div className="rounded-[var(--radius-lg)] bg-[var(--surface-secondary)] p-4 min-h-[180px]">
            {preview ? (
              <div className="max-w-[90%] ms-auto rounded-[var(--radius-lg)] rounded-tr-sm bg-[var(--surface)] border border-[var(--border)] p-3 shadow-[var(--shadow)]">
                <p className="text-[13px] leading-6 whitespace-pre-wrap text-[var(--text-primary)]">{preview}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1 text-left">{new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            ) : (
              <p className="text-[12px] text-[var(--text-muted)] text-center pt-12">בחרו נמען ותבנית כדי לראות את ההודעה</p>
            )}
          </div>
          {recipient && <p className="text-[12px] text-[var(--text-secondary)] mt-3 num-tabular">אל: <b>{recipient.name || '—'}</b> • {recipient.phone}</p>}
        </div>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function TemplatesPanel({ templates, isAdmin, officialOn, reload }) {
  const [busy, setBusy] = useState('')
  const [edit, setEdit] = useState(null)
  const [check, setCheck] = useState(null)

  // Readiness check — works before the Meta keys exist, so a rejectable
  // template is found here and not by Meta.
  const runCheck = async () => {
    setBusy('check-templates')
    const res = await invokeWa({ action: 'check-templates' })
    setBusy('')
    if (!res.ok) { toastError(ERRORS[res.error] || res.error || 'הבדיקה נכשלה'); return }
    setCheck(res)
    toast(res.blocked?.length
      ? `${res.ready} מתוך ${res.total} תבניות תקינות • ${res.blocked.length} ייפסלו אצל Meta`
      : `כל ${res.total} התבניות עומדות בכללים של Meta ומוכנות להגשה`)
  }

  const run = async (action) => {
    setBusy(action)
    const res = await invokeWa({ action })
    setBusy('')
    if (res.ok) {
      const bad = (res.submitted || []).filter((s) => !s.ok)
      toast(action === 'sync-templates'
        ? `נשלחו ${(res.submitted || []).filter((s) => s.ok).length} תבניות לאישור Meta${bad.length ? ` • ${bad.length} נכשלו` : ''}`
        : 'הסטטוסים עודכנו מ-Meta')
      if (bad.length) toastError(bad.map((b) => `${b.key}: ${b.error}`).join(' | '))
    } else toastError(ERRORS[res.error] || res.error || 'הפעולה נכשלה')
    reload()
  }

  const saveEdit = async () => {
    const { error } = await supabase.from('message_templates').update({
      title: edit.title, body: edit.body, updated_at: new Date().toISOString(),
      // Editing an approved template means re-approval under a new body.
      ...(edit.meta_status === 'APPROVED' ? {} : { meta_status: 'draft' }),
    }).eq('key', edit.key)
    if (error) toastError('השמירה נכשלה'); else { toast('התבנית נשמרה'); setEdit(null); reload() }
  }

  const groups = [
    { key: 'resident', label: 'תבניות לדיירים', icon: Users },
    { key: 'vendor', label: 'תבניות לספקים', icon: Store },
  ]

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <p className="text-[12px] text-[var(--text-secondary)]">
            הודעה יזומה בוואטסאפ הרשמי חייבת לצאת מתבנית ש-Meta אישרה. המערכת מגישה את התבניות לאישור ומעדכנת סטטוס אוטומטית.
          </p>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={runCheck} disabled={!!busy}>
              <ShieldCheck className={cn('h-4 w-4', busy === 'check-templates' && 'animate-pulse')} />בדיקת תקינות
            </Button>
            <Button variant="outline" onClick={() => run('refresh-templates')} disabled={!officialOn || !!busy}>
              <RefreshCw className={cn('h-4 w-4', busy === 'refresh-templates' && 'animate-spin')} />רענון סטטוס
            </Button>
            <Button onClick={() => run('sync-templates')} disabled={!officialOn || !!busy}>
              <ShieldCheck className="h-4 w-4" />{busy === 'sync-templates' ? 'שולח...' : 'הגש לאישור Meta'}
            </Button>
          </div>
        </div>
      )}
      {check && (
        <div className={cn('p-3 sm:p-4 rounded-[var(--radius)] border text-[12px]',
          check.blocked?.length
            ? 'border-rose-500/40 bg-rose-500/5 text-rose-700'
            : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700')}>
          {check.blocked?.length ? (
            <>
              <p className="font-semibold mb-1.5">{check.blocked.length} תבניות ייפסלו אצל Meta — יש לתקן את הנוסח לפני הגשה:</p>
              <ul className="space-y-1">
                {check.blocked.map((b) => (
                  <li key={b.key}><span className="font-semibold">{b.title}</span> — {b.problems.join(' • ')}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="font-semibold">כל {check.total} התבניות עומדות בכללי הנוסח של Meta ומוכנות להגשה.</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {groups.map((g) => (
          <SectionCard key={g.key} icon={g.icon} title={g.label} subtitle={`${templates.filter((t) => t.audience === g.key).length} תבניות`}>
            <div className="divide-y divide-[var(--border-light)]">
              {templates.filter((t) => t.audience === g.key).map((t) => {
                const st = META_STATUS[t.meta_status] || META_STATUS.draft
                return (
                  <div key={t.key} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold">{t.title}</p>
                        <p className="text-[11px] text-[var(--text-muted)] font-mono" dir="ltr">{t.key} • {t.category === 'MARKETING' ? 'שיווקי' : 'שירות'}</p>
                      </div>
                      <Chip cls={st.cls}>{st.label}</Chip>
                    </div>
                    <p className="text-[12px] leading-5 text-[var(--text-secondary)] whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-secondary)] p-2.5">{t.body}</p>
                    <div className="flex flex-wrap gap-1">
                      {(t.variables || []).map((v, i) => <Chip key={i} cls="bg-[var(--surface-container)] text-[var(--primary-dark)]">{`{{${i + 1}}}`} {v}</Chip>)}
                    </div>
                    {t.rejection_reason && <p className="text-[11px] text-[var(--danger)]">סיבת דחייה: {t.rejection_reason}</p>}
                    {isAdmin && t.meta_status !== 'APPROVED' && t.meta_status !== 'PENDING' && (
                      <button onClick={() => setEdit({ ...t })} className="text-[12px] font-semibold text-[var(--primary)] hover:underline">עריכת נוסח</button>
                    )}
                  </div>
                )
              })}
            </div>
          </SectionCard>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="w-full max-w-lg">
          <DialogHeader><DialogTitle>עריכת תבנית</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                className="h-[38px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px]" />
              <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={7}
                className="w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 py-2 text-[13px] leading-6" />
              <p className="text-[11px] text-[var(--text-muted)]">השאירו את המשתנים {'{{1}}'}, {'{{2}}'}… במקומם. אחרי שמירה יש להגיש שוב לאישור.</p>
              <div className="flex gap-2">
                <Button onClick={saveEdit} className="flex-1">שמירה</Button>
                <Button variant="outline" onClick={() => setEdit(null)}>ביטול</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Log (admin)
// ---------------------------------------------------------------------------

const PAGE = 200

function LogPanel() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [channel, setChannel] = useState('all')
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)
  const [people, setPeople] = useState({})
  const [buildings, setBuildings] = useState({})

  const load = useCallback(async (offset = 0) => {
    setLoading(true)
    let q = supabase.from('notification_log').select('*').order('created_at', { ascending: false }).range(offset, offset + PAGE - 1)
    if (channel !== 'all') q = q.eq('channel', channel)
    if (status !== 'all') q = q.eq('status', status)
    const { data } = await q
    setRows((prev) => (offset ? [...prev, ...(data || [])] : data || []))
    setHasMore((data || []).length === PAGE)
    setLoading(false)
  }, [channel, status])

  useEffect(() => { load(0) }, [load])
  useEffect(() => {
    supabase.from('profiles').select('id, first_name, last_name, email').then(({ data }) =>
      setPeople(Object.fromEntries((data || []).map((p) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email]))))
    supabase.from('buildings').select('id, name').then(({ data }) =>
      setBuildings(Object.fromEntries((data || []).map((b) => [b.id, b.name]))))
  }, [])

  const visible = useMemo(() => {
    const q = search.trim()
    if (!q) return rows
    return rows.filter((r) => `${r.recipient || ''} ${r.subject || ''} ${r.body || ''}`.includes(q))
  }, [rows, search])

  return (
    <div className="space-y-4">
      <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
        <SearchBar value={search} onChange={setSearch} placeholder="חיפוש לפי נמען, נושא או תוכן..." />
        <div className="flex flex-wrap gap-2">
          <TabGroup tabs={[
            { key: 'all', label: 'כל הערוצים' }, { key: 'whatsapp', label: 'וואטסאפ' }, { key: 'whatsapp_in', label: 'נכנסות' },
            { key: 'email', label: 'מייל' }, { key: 'push', label: 'פוש' },
          ]} activeTab={channel} onChange={setChannel} />
          <TabGroup tabs={[
            { key: 'all', label: 'כל הסטטוסים' }, { key: 'sent', label: 'נשלח' }, { key: 'failed', label: 'נכשל' },
            { key: 'blocked', label: 'נחסם' }, { key: 'opened', label: 'ידני' },
          ]} activeTab={status} onChange={setStatus} />
        </div>
      </div>

      {!loading && visible.length === 0 ? (
        <EmptyState icon={ScrollText} title="אין הודעות ביומן" description="כל הודעה שתישלח מהמערכת תופיע כאן" />
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="ds-table">
              <thead>
                <tr><th>זמן</th><th>ערוץ</th><th>נמען</th><th>נושא</th><th>בניין</th><th>נשלח ע״י</th><th>סטטוס</th></tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const ch = CHANNEL[r.channel] || { label: r.channel, icon: MessageCircle }
                  const st = STATUS[r.status] || { label: r.status, cls: 'bg-[var(--surface-container)]' }
                  return (
                    <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer">
                      <td className="num-tabular whitespace-nowrap">{fmtTime(r.created_at)}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5"><ch.icon className="h-4 w-4 text-[var(--primary)]" />{ch.label}</span>
                        {r.provider && <span className="block text-[10px] text-[var(--text-muted)]">{PROVIDER_LABEL[r.provider] || r.provider}</span>}
                      </td>
                      <td className="num-tabular" dir="ltr" style={{ textAlign: 'right' }}>{r.recipient}</td>
                      <td className="max-w-[280px] truncate">{r.subject}</td>
                      <td>{buildings[r.building_id] || '—'}</td>
                      <td>{r.sent_by ? people[r.sent_by] || '—' : <span className="inline-flex items-center gap-1 text-[var(--text-muted)]"><Bot className="h-3.5 w-3.5" />מערכת</span>}</td>
                      <td>
                        <Chip cls={st.cls}>{st.label}</Chip>
                        {r.delivery_status && r.delivery_status !== 'sent' && <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">{DELIVERY[r.delivery_status] || r.delivery_status}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-[var(--border-light)]">
            {visible.map((r) => {
              const ch = CHANNEL[r.channel] || { label: r.channel, icon: MessageCircle }
              const st = STATUS[r.status] || { label: r.status, cls: '' }
              return (
                <button key={r.id} onClick={() => setOpen(r)} className="w-full text-right p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold"><ch.icon className="h-4 w-4 text-[var(--primary)]" />{ch.label}</span>
                    <Chip cls={st.cls}>{st.label}</Chip>
                  </div>
                  <p className="text-[13px] font-semibold truncate">{r.subject}</p>
                  <p className="text-[11px] text-[var(--text-muted)] num-tabular">{fmtTime(r.created_at)} • {r.recipient}</p>
                </button>
              )
            })}
          </div>
          {(hasMore || loading) && (
            <div className="p-3 border-t border-[var(--border-light)] text-center">
              <Button variant="outline" size="sm" onClick={() => load(rows.length)} disabled={loading}>{loading ? 'טוען...' : 'טען עוד'}</Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{open?.subject || 'הודעה'}</DialogTitle></DialogHeader>
          {open && (
            <div className="space-y-3 text-[13px]">
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <p><span className="text-[var(--text-muted)]">זמן: </span>{fmtTime(open.created_at)}</p>
                <p><span className="text-[var(--text-muted)]">ערוץ: </span>{CHANNEL[open.channel]?.label || open.channel} {open.provider ? `(${PROVIDER_LABEL[open.provider] || open.provider})` : ''}</p>
                <p><span className="text-[var(--text-muted)]">נמען: </span><span dir="ltr">{open.recipient}</span></p>
                <p><span className="text-[var(--text-muted)]">סטטוס: </span>{STATUS[open.status]?.label || open.status}{open.delivery_status ? ` • ${DELIVERY[open.delivery_status] || open.delivery_status}` : ''}</p>
                {open.template_key && <p><span className="text-[var(--text-muted)]">תבנית: </span>{open.template_key}</p>}
                <p><span className="text-[var(--text-muted)]">נשלח ע״י: </span>{open.sent_by ? people[open.sent_by] || '—' : 'מערכת'}</p>
              </div>
              {open.error_message && <p className="p-2 rounded-[var(--radius)] bg-[var(--danger-light)] text-[var(--danger)] text-[12px] break-words">{open.error_message}</p>}
              {/<[a-z][\s\S]*>/i.test(open.body || '')
                ? <iframe title="תוכן" sandbox="" srcDoc={open.body} className="w-full h-72 rounded-[var(--radius)] border border-[var(--border)] bg-white" />
                : <p className="whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-secondary)] p-3 leading-6">{open.body || '—'}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Connection (admin)
// ---------------------------------------------------------------------------

function ConnectionPanel({ cfg, reload }) {
  const c = cfg?.config || {}
  const [form, setForm] = useState({
    phone_number_id: c.phone_number_id || '', waba_id: c.waba_id || '',
    graph_version: c.graph_version || 'v21.0', sender_label: c.sender_label || 'ועדלי', enabled: !!c.enabled,
  })
  const [token, setToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [busy, setBusy] = useState('')
  const [info, setInfo] = useState(null)

  useEffect(() => {
    const k = cfg?.config || {}
    setForm({
      phone_number_id: k.phone_number_id || '', waba_id: k.waba_id || '',
      graph_version: k.graph_version || 'v21.0', sender_label: k.sender_label || 'ועדלי', enabled: !!k.enabled,
      forward_webhook_url: k.forward_webhook_url || '',
    })
  }, [cfg])

  const save = async () => {
    setBusy('save')
    const res = await invokeWa({ action: 'save', config: form, access_token: token || undefined, app_secret: appSecret || undefined })
    setBusy('')
    if (res.ok) { toast('ההגדרות נשמרו'); setToken(''); setAppSecret(''); resetWhatsappEnabledCache(); reload() }
    else toastError(res.error || 'השמירה נכשלה')
  }
  const test = async () => {
    setBusy('test')
    const res = await invokeWa({ action: 'status' })
    setBusy('')
    setInfo(res)
    if (res.ok) toast('החיבור תקין ✓'); else toastError(ERRORS[res.error] || res.error || 'החיבור נכשל')
    reload()
  }
  const copy = (text) => { navigator.clipboard?.writeText(text); toast('הועתק') }
  const field = 'h-[38px] w-full rounded-[var(--radius)] border border-[var(--outline-variant)] bg-[var(--surface)] px-3 text-[13px] focus:border-[var(--primary)] focus:outline-none'
  const brief = grokBrief(cfg?.webhook_url, cfg?.verify_token)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <SectionCard icon={PlugZap} title="WhatsApp Business — Cloud API" subtitle="הערוץ הרשמי של Meta. כשהוא פעיל, כל הודעות הוואטסאפ של המערכת יוצאות דרכו" className="xl:col-span-7">
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>Phone Number ID</span>
              <input dir="ltr" className={field} value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} /></label>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>WhatsApp Business Account ID</span>
              <input dir="ltr" className={field} value={form.waba_id} onChange={(e) => setForm({ ...form, waba_id: e.target.value })} /></label>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>טוקן גישה קבוע {cfg?.has_token && <span className="text-[var(--success)]">(שמור ✓)</span>}</span>
              <input dir="ltr" type="password" className={field} value={token} placeholder={cfg?.has_token ? 'השאירו ריק כדי לא לשנות' : 'EAAG...'} onChange={(e) => setToken(e.target.value)} /></label>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>App Secret {cfg?.has_app_secret && <span className="text-[var(--success)]">(שמור ✓)</span>}</span>
              <input dir="ltr" type="password" className={field} value={appSecret} placeholder={cfg?.has_app_secret ? 'השאירו ריק כדי לא לשנות' : ''} onChange={(e) => setAppSecret(e.target.value)} /></label>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>גרסת Graph API</span>
              <input dir="ltr" className={field} value={form.graph_version} onChange={(e) => setForm({ ...form, graph_version: e.target.value })} /></label>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5"><span>שם השולח (לתצוגה)</span>
              <input className={field} value={form.sender_label} onChange={(e) => setForm({ ...form, sender_label: e.target.value })} /></label>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
            <span className="text-[13px] font-semibold">חיבור פעיל — שליחת הודעות המערכת דרך הוואטסאפ הרשמי</span>
          </label>
          <div className="flex gap-2">
            <Button onClick={save} disabled={!!busy}>{busy === 'save' ? 'שומר...' : 'שמירה'}</Button>
            <Button variant="outline" onClick={test} disabled={!!busy}><RefreshCw className={cn('h-4 w-4', busy === 'test' && 'animate-spin')} />בדיקת חיבור</Button>
          </div>
          {info?.token && (
            <div className={cn('p-3 rounded-[var(--radius)] text-[12px] border',
              info.token.permanent
                ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700'
                : 'border-amber-500/50 bg-amber-500/5 text-amber-800')}>
              {info.token.permanent ? (
                <p><b>טוקן קבוע ✓</b> — לא יפוג. אפליקציית Meta: {info.token.appName || '—'}</p>
              ) : (
                <>
                  <p><b>זהו טוקן זמני</b> — הוא יפוג ב-{fmtTime(info.token.expiresAt)} והשליחה תפסיק לעבוד.</p>
                  <p className="mt-1">זה הטוקן שמסך API Setup נותן לבדיקות. לטוקן קבוע: Business Settings → System Users → הוספת משתמש מערכת → Generate New Token עם ההרשאות whatsapp_business_messaging ו-whatsapp_business_management.</p>
                </>
              )}
            </div>
          )}
          {(info?.info || c.display_number) && (
            <div className="p-3 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[12px] space-y-0.5 num-tabular">
              <p>מספר: <b dir="ltr">{info?.info?.display_phone_number || c.display_number}</b></p>
              <p>שם מאומת: <b>{info?.info?.verified_name || c.verified_name || '—'}</b></p>
              {(info?.info?.quality_rating || c.status) && <p>דירוג איכות: <b>{info?.info?.quality_rating || c.status}</b></p>}
            </div>
          )}
          <div className="space-y-2 pt-2 border-t border-[var(--border-light)]">
            <p className="text-[12px] font-semibold text-[var(--text-secondary)]">Webhook (להגדרה באפליקציית Meta)</p>
            {[['Callback URL', cfg?.webhook_url], ['Verify Token', cfg?.verify_token]].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)] w-24 shrink-0">{k}</span>
                <code dir="ltr" className="flex-1 truncate text-[12px] px-2 py-1.5 rounded bg-[var(--surface-secondary)]">{v || 'יופיע אחרי שמירה ראשונה'}</code>
                {v && <Button variant="ghost" size="icon" onClick={() => copy(v)} aria-label="העתקה"><Copy className="h-4 w-4" /></Button>}
              </div>
            ))}
            <p className="text-[11px] text-[var(--text-muted)]">שדות להרשמה: messages, message_template_status_update. אימות האירועים נעשה עם ה-App Secret — בלעדיו המערכת דוחה כל אירוע.</p>
            <label className="text-[12px] font-semibold text-[var(--text-secondary)] space-y-1.5 block pt-1">
              <span>העברת אירועים הלאה (Apps Script של "אות")</span>
              <input dir="ltr" className={field} placeholder="https://script.google.com/macros/s/..."
                value={form.forward_webhook_url || ''}
                onChange={(e) => setForm({ ...form, forward_webhook_url: e.target.value })} />
            </label>
            <p className="text-[11px] text-[var(--text-muted)]">
              ל-Meta יש כתובת webhook אחת בלבד לכל אפליקציה. המספר משותף עם "אות", והגיליון שלה מתעדכן מ-Apps Script.
              אם תמלאו כאן את הכתובת שלה, ועדלי יקבל את האירועים ויעביר כל אחד מהם הלאה כמו שהוא — ושניהם ימשיכו לעבוד.
              ריק = אין העברה, והגיליון יפסיק להתעדכן ברגע שה-webhook יוחלף.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Bot} title="הוראות לבוט הוואטסאפ בגרוק" subtitle="העתיקו לבוט — הוא יכין את הצד של Meta ויחזיר את ארבעת הערכים" className="xl:col-span-5 xl:sticky xl:top-20"
        actions={<Button variant="outline" size="sm" onClick={() => copy(brief)}><Copy className="h-4 w-4" />העתקה</Button>}>
        <div className="p-4 space-y-3">
          <p className="text-[12px] leading-6 whitespace-pre-wrap text-[var(--text-secondary)] rounded-[var(--radius)] bg-[var(--surface-secondary)] p-3 max-h-[420px] overflow-y-auto">{brief}</p>
          <ul className="text-[12px] text-[var(--text-secondary)] space-y-1">
            <li className="flex gap-1.5"><Clock className="h-4 w-4 shrink-0 text-[var(--primary)]" />אחרי שהערכים מוזנים כאן: "הגש לאישור Meta" בלשונית התבניות.</li>
            <li className="flex gap-1.5"><ShieldCheck className="h-4 w-4 shrink-0 text-[var(--primary)]" />עד לאישור, השליחה פתוחה ידנית ונרשמת ביומן.</li>
          </ul>
        </div>
      </SectionCard>
    </div>
  )
}
