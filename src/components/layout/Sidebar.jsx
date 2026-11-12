import { useState } from 'react'
import { canSee, ROUTE_FEATURE } from '@/lib/access'
import { TextSizeControl } from '@/components/common/TextSizeControl'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useBuildingContext } from '@/hooks/useStore'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  Building2, LayoutDashboard, Home, CreditCard, Wallet,
  Wrench, Store, CalendarClock, ShieldCheck, Bot,
  Megaphone, FolderOpen, BarChart2, Cog, Zap, Search,
  Users, Settings, LogOut, X, ChevronDown, ChevronsUpDown, ClipboardList,
  Landmark, ArrowLeftRight, ArrowDownLeft, Scale, Brain, UserCheck, DoorOpen,
  Coins, Tags, GitBranch, Eye, Plus, Palette, MessageCircle, BadgeDollarSign, Vote,
} from 'lucide-react'
import { BrandLogo } from '@/components/common/BrandLogo'
import { THEMES, getTheme, setTheme } from '@/lib/theme'
import { enterResidentPreview } from '@/lib/residentPreview'

// Daily flow is flat and always visible. Everything else lives in four named
// groups, all collapsed until opened, so the rail shows six things by default
// instead of thirty.
//
// `staff: true` marks the management side's tools — vendors, routing, plans,
// agents. A committee member does not see them: the committee runs its money
// and its residents; vendors and dispatch are the management side's work.
const PRIMARY_NAV = [
  { to: '/',              label: 'דשבורד',     icon: LayoutDashboard },
  { to: '/issues',        label: 'תקלות',       icon: Wrench,     badge: 'issues' },
  { to: '/payments',      label: 'גבייה',        icon: CreditCard, badge: 'collection' },
  { to: '/announcements', label: 'הודעות',      icon: Megaphone },
  { to: '/polls',         label: 'הצבעות',      icon: Vote },
  { to: '/room-booking',  label: 'שריון חדרים', icon: DoorOpen },
]

const NAV_GROUPS = [
  {
    id: 'money',
    label: 'כספים',
    collapsedByDefault: true,
    items: [
      { to: '/expenses',          label: 'הוצאות',          icon: Wallet },
      { to: '/bank-transactions', label: 'תנועות בנק',     icon: ArrowLeftRight },
      { to: '/income',            label: 'הכנסות',          icon: ArrowDownLeft },
      { to: '/collection-cases',  label: 'מעקב גבייה',      icon: UserCheck },
      { to: '/balance',           label: 'מאזן',            icon: Scale },
      { to: '/expense-analysis',  label: 'ניתוח הוצאות',    icon: Brain },
      { to: '/reports',           label: 'דוחות',           icon: BarChart2 },
    ],
  },
  {
    id: 'building',
    label: 'הבניין',
    collapsedByDefault: true,
    items: [
      { to: '/units',            label: 'דירות',           icon: Home },
      { to: '/residents',        label: 'דיירים',          icon: Users },
      { to: '/documents',        label: 'מסמכים',          icon: FolderOpen },
      { to: '/compliance',       label: 'רגולציה',          icon: ShieldCheck },
      { to: '/building-assets',  label: 'ציוד ומערכות',    icon: Cog },
      { to: '/recurring-tasks',  label: 'משימות חוזרות',   icon: CalendarClock },
    ],
  },
  {
    id: 'operations',
    label: 'ספקים ותפעול',
    collapsedByDefault: true,
    staff: true,
    items: [
      { to: '/vendors',        label: 'ספקים',         icon: Store },
      { to: '/vendor-finder',  label: 'מציאת ספקים',   icon: Search },
      { to: '/vendor-rules',   label: 'כללי ספקים',    icon: Tags },
      { to: '/issue-routing',  label: 'ניתוב פניות',   icon: GitBranch },
      { to: '/work-orders',    label: 'הזמנות עבודה',  icon: ClipboardList },
      { to: '/supervisors',    label: 'מפקחים',        icon: ShieldCheck },
    ],
  },
  {
    id: 'settings',
    label: 'הגדרות',
    collapsedByDefault: true,
    items: [
      { to: '/buildings',      label: 'בניינים',          icon: Building2 },
      { to: '/bank-settings',  label: 'חשבונות בנק',      icon: Landmark },
      { to: '/messaging',      label: 'וואטסאפ והודעות',  icon: MessageCircle },
      { to: '/service-plans',  label: 'מסלולים ותמחור',   icon: BadgeDollarSign, staff: true },
      { to: '/smart-agents',   label: 'סוכנים חכמים',     icon: Zap,             staff: true },
      { to: '/building-agent', label: 'סוכן בריאות',      icon: Bot,             staff: true },
    ],
  },
]

/**
 * The groups a viewer sees. Management-side tools drop out for the committee,
 * and so do pages the building's plan does not include (lib/access.js). The
 * page itself is also guarded, so hiding here is about a clean rail, not
 * security.
 */
function visibleGroups(isAdmin, building) {
  const ok = (to) => canSee(ROUTE_FEATURE[to], { isAdmin, building })
  return NAV_GROUPS
    .filter((g) => isAdmin || !g.staff)
    .map((g) => ({ ...g, items: g.items.filter((i) => (isAdmin || !i.staff) && ok(i.to)) }))
    .filter((g) => g.items.length > 0)
}

function NavLink({ item, active, badge, onClick }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className={cn(
        'group flex items-center justify-between px-3 py-2.5 rounded-[var(--radius)] transition-colors duration-150',
        active
          ? 'bg-[var(--surface-container)] text-[var(--sidebar-text-active)] font-semibold'
          : 'text-[var(--sidebar-text)] font-medium hover:bg-[var(--sidebar-bg-hover)] hover:text-[var(--text-primary)]'
      )}
    >
      <span className="flex items-center gap-3 min-w-0">
        <Icon
          className={cn('h-5 w-5 shrink-0 transition-colors', active ? 'text-[var(--primary)]' : 'text-[var(--sidebar-text-muted)] group-hover:text-[var(--primary)]')}
          strokeWidth={1.75}
        />
        <span className="text-[13px] truncate">{item.label}</span>
      </span>
      {badge ?? (active && <span className="h-2 w-2 rounded-full bg-[var(--primary)] shrink-0" />)}
    </Link>
  )
}

function Sidebar({ open, onClose, pulse = {} }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { selectedBuilding, setSelectedBuilding, buildings } = useBuildingContext()
  const { profile, isAdmin, signOut } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [theme, setThemeState] = useState(getTheme())
  const pickTheme = (id) => { setTheme(id); setThemeState(id) }
  const [collapsed, setCollapsed] = useState(() =>
    Object.fromEntries(NAV_GROUPS.filter((s) => s.collapsedByDefault).map((s) => [s.id, true])),
  )

  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path))

  const badgeFor = (kind) => {
    if (kind === 'issues' && pulse.openIssues > 0) {
      return (
        <span className={cn(
          'px-2 py-0.5 rounded-full text-[11px] font-semibold num-tabular',
          pulse.urgentIssues > 0 ? 'bg-[var(--danger-light)] text-[var(--danger)]' : 'bg-[var(--surface-variant)] text-[var(--primary-dark)]'
        )}>{pulse.openIssues}</span>
      )
    }
    if (kind === 'collection' && pulse.collectionPct != null && pulse.paid > 0) {
      return <span className="px-2 py-0.5 rounded-full bg-[var(--surface-variant)] text-[var(--primary-dark)] text-[11px] font-semibold num-tabular">{pulse.collectionPct}%</span>
    }
    return undefined
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const fullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email
    : ''
  const initials = [profile?.first_name?.[0], profile?.last_name?.[0]].filter(Boolean).join('') || (profile?.email?.[0] || '?').toUpperCase()
  const roleLabel = profile?.role === 'admin' ? 'מנהל מערכת' : profile?.role === 'committee' ? 'חבר ועד' : 'דייר'
  const buildingSub = selectedBuilding
    ? [selectedBuilding.total_units ? `${selectedBuilding.total_units} דירות` : null, selectedBuilding.city].filter(Boolean).join(' • ')
    : ''

  const menuItemCls = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--sidebar-bg-hover)] transition-colors'

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-[#0b1c30]/40 lg:hidden" onClick={onClose} />}

      <aside className={cn(
        'fixed top-0 right-0 z-50 flex h-full w-64 flex-col justify-between p-4 select-none',
        'bg-[var(--sidebar-bg)] border-l border-[var(--sidebar-border)]',
        'transition-transform duration-300 ease-out lg:relative lg:translate-x-0',
        open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
      )}>
        <div className="flex flex-col gap-4 min-h-0 flex-1">
          {/* Brand */}
          <div className="flex items-center justify-between px-1 pt-1">
            <Link to="/" onClick={onClose} className="flex items-center gap-3">
              <BrandLogo className="h-10 w-10 rounded-[var(--radius-lg)] shadow-[var(--shadow)]" />
              <span>
                <span className="block text-[22px] leading-none font-bold tracking-tight text-[var(--primary)]">ועדלי</span>
                <span className="block text-[11px] leading-[14px] text-[var(--text-muted)] mt-1">ניהול ועד בית חכם</span>
              </span>
            </Link>
            <button className="lg:hidden p-1.5 rounded-[var(--radius)] hover:bg-[var(--sidebar-bg-hover)]" onClick={onClose} aria-label="סגירה">
              <X className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Building picker — a card with a transparent native select on top */}
          <div className="relative bg-[var(--surface-secondary)] border border-[var(--border)] rounded-[var(--radius-lg)] p-2.5 hover:bg-[var(--surface-container)] transition-colors flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-5 w-5 text-[var(--primary)] shrink-0" strokeWidth={1.75} />
              <div className="min-w-0 text-right">
                <p className="text-[12px] leading-4 font-semibold text-[var(--text-primary)] truncate">{selectedBuilding?.name || 'בחר בניין'}</p>
                {buildingSub && <p className="text-[11px] leading-[14px] text-[var(--text-muted)] truncate">{buildingSub}</p>}
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            <select
              aria-label="בחירת בניין"
              value={selectedBuilding?.id || ''}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Primary action */}
          <button
            onClick={() => { navigate('/issues?new=1'); onClose() }}
            className="w-full h-10 px-4 rounded-[var(--radius-lg)] bg-[var(--primary)] text-white text-[14px] font-semibold flex items-center justify-center gap-2 hover:bg-[var(--primary-hover)] active:scale-[0.98] transition-all shadow-[var(--shadow)]"
          >
            <Plus className="h-[18px] w-[18px]" />
            קריאה חדשה
          </button>

          {/* Navigation */}
          <nav aria-label="תפריט ניווט ראשי" className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1 min-h-0">
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.to} item={item} active={isActive(item.to)} badge={item.badge ? badgeFor(item.badge) : undefined} onClick={onClose} />
            ))}

            {visibleGroups(isAdmin, selectedBuilding).map((group) => {
              const groupActive = group.items.some((i) => isActive(i.to))
              const isCollapsed = collapsed[group.id] && !groupActive
              return (
                <div key={group.id} className="pt-3">
                  <button
                    onClick={() => setCollapsed((p) => ({ ...p, [group.id]: !p[group.id] }))}
                    className="w-full flex items-center justify-between px-3 pb-1 group"
                  >
                    <span className="text-[11px] font-semibold text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">{group.label}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--text-muted)] transition-transform', isCollapsed && '-rotate-90')} />
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavLink key={item.to} item={item} active={isActive(item.to)} onClick={onClose} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </div>

        {/* Profile footer (menu opens upward) */}
        <div className="relative pt-3 mt-3 border-t border-[var(--border)]">
          {userMenuOpen && (
            <div className="absolute bottom-full right-0 left-0 mb-2 p-2 space-y-0.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] animate-fade-in-up">
              <div className="px-3 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-muted)] mb-1.5"><Palette className="h-3.5 w-3.5" />ערכת נושא</p>
                <div className="flex gap-1">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickTheme(t.id)}
                      title={t.description}
                      className={cn(
                        'flex-1 rounded-[var(--radius)] px-1.5 py-1.5 text-[11px] font-semibold border transition-colors',
                        theme === t.id
                          ? 'border-[var(--primary)] bg-[var(--surface-container)] text-[var(--primary)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--sidebar-bg-hover)]'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={enterResidentPreview} className={menuItemCls}>
                <Eye className="h-4 w-4 text-[var(--text-muted)]" />תצוגת דייר
              </button>
              {isAdmin && (
                <Link to="/admin" onClick={() => { setUserMenuOpen(false); onClose() }} className={menuItemCls}>
                  <Settings className="h-4 w-4 text-[var(--text-muted)]" />הגדרות מערכת
                </Link>
              )}
              {isAdmin && (
                <Link to="/billing" onClick={() => { setUserMenuOpen(false); onClose() }} className={menuItemCls}>
                  <Coins className="h-4 w-4 text-[var(--text-muted)]" />הכנסות פלטפורמה
                </Link>
              )}
              <button onClick={handleSignOut} className={cn(menuItemCls, 'text-[var(--danger)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]')}>
                <LogOut className="h-4 w-4" />יציאה
              </button>
            </div>
          )}
          <TextSizeControl className="mb-2 px-1" />
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            className="w-full flex items-center justify-between p-2 rounded-[var(--radius-lg)] hover:bg-[var(--sidebar-bg-hover)] transition-colors"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="h-9 w-9 rounded-full bg-[var(--surface-container)] text-[var(--primary-dark)] flex items-center justify-center font-bold text-[13px] border border-[var(--outline-variant)]/60 shrink-0">
                {initials}
              </span>
              <span className="text-right min-w-0">
                <span className="block text-[12px] leading-tight font-semibold text-[var(--text-primary)] truncate">{fullName}</span>
                <span className="block text-[11px] leading-tight text-[var(--text-muted)] truncate">{roleLabel}</span>
              </span>
            </span>
            <ChevronDown className={cn('h-4 w-4 text-[var(--text-muted)] transition-transform', userMenuOpen && 'rotate-180')} />
          </button>
        </div>
      </aside>
    </>
  )
}

export { Sidebar }
