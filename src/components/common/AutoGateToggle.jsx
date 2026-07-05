import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import {
  autoGateSupported, requestAutoGatePermissions, enableAutoGate,
  disableAutoGate, isAutoGateRunning, openBatterySettings,
  openOverlaySettings, autoGateStatus,
} from '@/lib/autoGate'

// GPS auto-open settings for the building gate. Shared between the resident
// portal and the admin Buildings screen — renders ONLY inside the native
// Android app (autoGateSupported), null everywhere else.
export function AutoGateToggle({ building }) {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [stat, setStat] = useState(null)

  useEffect(() => {
    let active = true
    isAutoGateRunning().then(v => { if (active) setOn(v) })
    // Poll the background service status so the user can see it working live.
    const tick = () => autoGateStatus().then(s => { if (active) setStat(s) })
    tick()
    const id = setInterval(tick, 5000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Only meaningful inside the native Android app.
  if (!autoGateSupported()) return null
  if (!building?.gate_phone || building?.geo_lat == null || building?.geo_lng == null) return null

  const radius = building.geo_radius || 100

  const toggle = async () => {
    setBusy(true); setMsg(null)
    try {
      if (!on) {
        const perms = await requestAutoGatePermissions()
        if (!perms.fine) { setMsg('צריך הרשאת מיקום כדי להפעיל פתיחה אוטומטית.'); setBusy(false); return }
        await enableAutoGate({
          lat: building.geo_lat, lng: building.geo_lng, radius, number: building.gate_phone,
        })
        setOn(true)
        if (!perms.background) {
          setMsg('הופעל. חשוב: אשר/י "אפשר תמיד" למיקום, אחרת לא יעבוד כשהאפליקציה סגורה.')
        } else {
          setMsg('הופעל! מומלץ לבטל אופטימיזציית סוללה לאפליקציה ליציבות.')
        }
      } else {
        await disableAutoGate()
        setOn(false)
        setMsg(null)
      }
    } catch (e) {
      console.error('auto-gate toggle error', e)
      setMsg('שגיאה. נסה שוב.')
    }
    setBusy(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${on ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-800 text-sm">פתיחה אוטומטית בהגעה</p>
            <p className="text-[11px] text-slate-400">השער ייפתח לבד כשתגיע ל-{radius} מ' מהבניין</p>
          </div>
        </div>
        <button
          onClick={toggle} disabled={busy}
          className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
          aria-pressed={on}
        >
          <span className={`absolute top-0.5 ${on ? 'right-0.5' : 'right-[22px]'} w-6 h-6 bg-white rounded-full shadow transition-all`} />
        </button>
      </div>
      {msg && <p className="text-[11px] text-slate-500">{msg}</p>}
      {on && (
        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <button onClick={openBatterySettings}
            className="block w-full text-[11px] text-blue-600 font-medium hover:underline text-right">
            1. בטל אופטימיזציית סוללה לאפליקציה ›
          </button>
          <button onClick={openOverlaySettings}
            className="block w-full text-[11px] text-blue-600 font-medium hover:underline text-right">
            2. אפשר "הצגה מעל אפליקציות אחרות" (נדרש לחיוג ברקע) ›
          </button>
          {stat && (
            <>
              <p dir="ltr" className="text-[10px] text-slate-400 font-mono break-all pt-1">
                dist:{stat.lastDist >= 0 ? Math.round(stat.lastDist) + 'm' : '—'} · acc:{stat.lastAcc >= 0 ? '±' + stat.lastAcc + 'm' : '—'} · upd:{stat.lastUpdate ? Math.round((Date.now() - stat.lastUpdate) / 1000) + 's ago' : 'never'} · inside:{String(stat.inside)} · primed:{String(stat.primed)}
              </p>
              {stat.log ? (
                <pre dir="ltr" className="text-[9px] text-slate-500 bg-slate-50 rounded-lg p-2 mt-1 whitespace-pre-wrap break-all max-h-32 overflow-auto">{stat.log}</pre>
              ) : (
                <p dir="ltr" className="text-[9px] text-slate-400 mt-1">log empty — no events yet</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
