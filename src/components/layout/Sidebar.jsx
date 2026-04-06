import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  Building2, LayoutDashboard, Home, CreditCard, Wallet,
  Wrench, Store, CalendarClock, ShieldCheck, Bot,
  Megaphone, FolderOpen, BarChart2, Cog, Zap, Search,
  Users, Settings, LogOut, Menu, X, ChevronDown, ClipboardList,
} from 'lucide-react'

const NAV_SECTIONS = [
  {
    label: 'ניהול',
    items: [
      { to: '/',              label: 'דשבורד',        icon: LayoutDashboard },
      { to: '/buildings',     label: 'בניינים',        icon: Building2 },
      { to: '/units',         label: 'דירות',          icon: Home },
      { to: '/residents',     label: 'דיירים',         icon: Users },
    ],
  },
  {
    label: 'כספים',
    items: [
      { to: '/payments',      label: 'גבייה',          icon: CreditCard },
      { to: '/expenses',      label: 'הוצאות',         icon: Wallet },
      { to: '/reports',       label: 'דוחות',          icon: BarChart2 },
    ],
  },
  {
    label: 'תחזוקה',
    items: [
      { to: '/issues',        label: 'תקלות',          icon: Wrench },
      { to: '/work-orders',   label: 'הזמנות עבודה',   icon: ClipboardList },
      { to: '/vendor-finder', label: 'מציאת ספקים',    icon: Search },
      { to: '/vendors',       label: 'ספקים',          icon: Store },
      { to: '/recurring-tasks', label: 'משימות חוזרות', icon: CalendarClock },
      { to: '/building-assets', label: 'ציוד ומערכות', icon: Cog },
    ],
  },
  {
    label: 'רגולציה ומסמכים',
    items: [
      { to: '/compliance',    label: 'רגולציה',        icon: ShieldCheck },
      { to: '/documents',     label: 'מסמכים',         icon: FolderOpen },
      { to: '/announcements', label: 'הודעות',         icon: Megaphone },
    ],
  },
  {
    label: 'AI',
    items: [
      { to: '/smart-agents',  label: 'סוכנים חכמים',  icon: Zap },
      { to: '/building-agent', label: 'סוכן בריאות',  icon: Bot },
    ],
  },
]

function Sidebar({ open, onClose }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { selectedBuilding, setSelectedBuilding, buildings } = useBuildingContext()
  const { profile, isAdmin, signOut } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const fullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
    : ''

  const roleLabel = profile?.role === 'admin' ? 'אדמין' : profile?.role === 'committee' ? 'ועד' : 'דייר'
  const roleColor = profile?.role === 'admin' ? 'text-red-400' : profile?.role === 'committee' ? 'text-blue-400' : 'text-slate-400'

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed top-0 right-0 z-50 flex h-full w-64 flex-col',
        'bg-[var(--sidebar-bg,#1e293b)] text-[var(--sidebar-text,#e2e8f0)]',
        'border-l border-[var(--border)]',
        'transition-transform duration-200',
        'lg:relative lg:translate-x-0',
        open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <Building2 className="h-7 w-7 text-[var(--primary)]" />
          <span className="text-xl font-bold tracking-tight">ועד חכם</span>
          <button className="mr-auto lg:hidden p-1 rounded hover:bg-white/10" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Building selector */}
        <div className="px-4 py-3 border-b border-white/10">
          <select
            value={selectedBuilding?.id || ''}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className={cn(
              'w-full h-9 rounded-lg bg-white/10 border border-white/15 px-3 text-sm',
              'text-[var(--sidebar-text,#e2e8f0)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40',
              'appearance-none cursor-pointer'
            )}
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id} className="text-[var(--text-primary)] bg-[var(--surface)]">
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-3 mb-1">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive(to)
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--sidebar-text,#e2e8f0)] hover:bg-white/10'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User section */}
        <div className="border-t border-white/10">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-right"
          >
            <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-bold shrink-0">
              {(profile?.first_name?.[0] || profile?.email?.[0] || '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-sm font-medium text-white truncate">{fullName}</p>
              <p className={`text-xs ${roleColor}`}>{roleLabel}</p>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-white/40 transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          {userMenuOpen && (
            <div className="px-3 pb-3 space-y-1">
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => { setUserMenuOpen(false); onClose() }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  הגדרות מערכת
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                יציאה
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}

export { Sidebar }
