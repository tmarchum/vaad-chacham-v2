import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  Building2, LayoutDashboard, Home, CreditCard, Wallet,
  Wrench, Store, CalendarClock, ShieldCheck, Bot,
  Megaphone, FolderOpen, BarChart2, Cog, Zap, Search,
  Users, Settings, LogOut, Menu, X, ChevronDown, ChevronLeft, ClipboardList,
  Landmark, ArrowLeftRight, ArrowDownLeft, Scale, Brain, UserCheck,
} from 'lucide-react'

const NAV_SECTIONS = [
  {
    id: 'management',
    label: 'ניהול',
    items: [
      { to: '/',              label: 'דשבורד',        icon: LayoutDashboard },
      { to: '/buildings',     label: 'בניינים',        icon: Building2 },
      { to: '/units',         label: 'דירות',          icon: Home },
      { to: '/residents',     label: 'דיירים',         icon: Users },
    ],
  },
  {
    id: 'finance',
    label: 'כספים',
    items: [
      { to: '/payments',          label: 'גבייה',           icon: CreditCard },
      { to: '/collection-cases', label: 'מעקב גבייה',     icon: UserCheck },
      { to: '/bank-transactions', label: 'תנועות בנק',     icon: ArrowLeftRight },
      { to: '/bank-settings',     label: 'חשבונות בנק',    icon: Landmark },
      { to: '/income',             label: 'הכנסות',          icon: ArrowDownLeft },
      { to: '/expenses',          label: 'הוצאות',          icon: Wallet },
      { to: '/balance',           label: 'מאזן',            icon: Scale },
      { to: '/expense-analysis', label: 'ניתוח הוצאות AI', icon: Brain },
      { to: '/reports',           label: 'דוחות',           icon: BarChart2 },
    ],
  },
  {
    id: 'maintenance',
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
    id: 'regulation',
    label: 'רגולציה ומסמכים',
    items: [
      { to: '/compliance',    label: 'רגולציה',        icon: ShieldCheck },
      { to: '/documents',     label: 'מסמכים',         icon: FolderOpen },
      { to: '/announcements', label: 'הודעות',         icon: Megaphone },
    ],
  },
  {
    id: 'ai',
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
  const [collapsed, setCollapsed] = useState({})

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const toggleSection = (id) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const fullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
    : ''

  const roleLabel = profile?.role === 'admin' ? 'אדמין' : profile?.role === 'committee' ? 'ועד' : 'דייר'

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />
      )}

      <aside className={cn(
        'fixed top-0 right-0 z-50 flex h-full w-[260px] flex-col',
        'bg-[#0f172a] text-slate-400',
        'border-l border-white/[0.06]',
        'transition-transform duration-300 ease-out',
        'lg:relative lg:translate-x-0',
        open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
      )}>
        {/* ── Logo area ── */}
        <div className="relative px-5 pt-6 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <span className="text-white text-sm font-black">+ו</span>
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-white tracking-tight leading-none">
                  וועד<span className="text-blue-400">+</span>
                </h1>
                <span className="text-[10px] text-slate-500 font-medium">VAADPLUS</span>
              </div>
            </div>
            <button className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors" onClick={onClose}>
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>
          {/* Gradient divider */}
          <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-l from-transparent via-slate-700 to-transparent" />
        </div>

        {/* ── Building selector ── */}
        <div className="px-4 py-3">
          <div className="relative">
            <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            <select
              value={selectedBuilding?.id || ''}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className={cn(
                'w-full h-9 rounded-lg bg-white/[0.06] border border-white/[0.08]',
                'pr-8 pl-3 text-[13px] text-slate-300',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/30',
                'appearance-none cursor-pointer transition-all'
              )}
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id} className="text-slate-900 bg-white">
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {NAV_SECTIONS.map((section) => {
            const isSectionActive = section.items.some(item => isActive(item.to))
            const isCollapsed = collapsed[section.id] && !isSectionActive

            return (
              <div key={section.id} className="mb-1">
                {/* Section header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-3 py-1.5 group cursor-pointer"
                >
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600 group-hover:text-slate-400 transition-colors">
                    {section.label}
                  </span>
                  <ChevronDown className={cn(
                    'h-3 w-3 text-slate-600 transition-transform duration-200',
                    isCollapsed && '-rotate-90'
                  )} />
                </button>

                {/* Section items */}
                <div className={cn(
                  'space-y-0.5 overflow-hidden transition-all duration-200',
                  isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
                )}>
                  {section.items.map(({ to, label, icon: Icon }) => {
                    const active = isActive(to)
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={onClose}
                        className={cn(
                          'sidebar-link flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                          active
                            ? 'active bg-blue-500/15 text-white'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                        )}
                      >
                        <Icon className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-colors',
                          active ? 'text-blue-400' : 'text-slate-500'
                        )} />
                        <span>{label}</span>
                        {active && (
                          <ChevronLeft className="h-3 w-3 mr-auto text-blue-400/60" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* ── User section ── */}
        <div className="relative">
          <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-l from-transparent via-slate-700 to-transparent" />

          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/[0.03] transition-colors text-right"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-lg shadow-blue-500/10">
              {(profile?.first_name?.[0] || profile?.email?.[0] || '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-[13px] font-semibold text-slate-200 truncate">{fullName}</p>
              <p className="text-[11px] text-slate-500">{roleLabel}</p>
            </div>
            <ChevronDown className={cn(
              'h-3.5 w-3.5 text-slate-600 transition-transform duration-200',
              userMenuOpen && 'rotate-180'
            )} />
          </button>

          {userMenuOpen && (
            <div className="px-3 pb-3 space-y-0.5 animate-fade-in-up">
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => { setUserMenuOpen(false); onClose() }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-all"
                >
                  <Settings className="h-4 w-4 text-slate-500" />
                  הגדרות מערכת
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all"
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
