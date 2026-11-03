import { useState, useMemo } from 'react';
import { useCollection, useBuildingContext } from '@/hooks/useStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField, FormSelect, FormTextarea } from '@/components/common/FormField';
import { DeleteConfirm } from '@/components/common/DeleteConfirm';
import { EmptyState } from '@/components/common/EmptyState';
import { SearchBar } from '@/components/common/SearchBar';
import { StatCard } from '@/components/common/StatCard';
import { SectionCard } from '@/components/common/SectionCard';
import { TabGroup } from '@/components/ui/tabs';
import { formatDate } from '@/lib/utils';
import { requiredApproval } from '@/lib/approval';
import {
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
  Clock,
  Wrench,
  CheckCircle2,
  ArrowRight,
  Calendar,
  User,
  Star,
  Wallet,
} from 'lucide-react';

// ─── Config ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:     { label: 'ממתין לאישור', variant: 'default' },
  approved:    { label: 'מאושר',        variant: 'info'    },
  scheduled:   { label: 'מתוכנן',       variant: 'warning' },
  in_progress: { label: 'בביצוע',       variant: 'warning' },
  completed:   { label: 'הושלם',        variant: 'success' },
  cancelled:   { label: 'בוטל',         variant: 'danger'  },
};

const PRIORITY_CONFIG = {
  low:    { label: 'נמוך',  variant: 'default' },
  medium: { label: 'בינוני', variant: 'info'   },
  high:   { label: 'גבוה',  variant: 'warning' },
  urgent: { label: 'דחוף',  variant: 'danger'  },
};

const STATUS_PROGRESSION = ['pending', 'approved', 'scheduled', 'in_progress', 'completed'];

const STATUS_FILTERS = [
  { key: 'all',         label: 'הכל'      },
  { key: 'pending',     label: 'ממתין'    },
  { key: 'approved',    label: 'מאושר'    },
  { key: 'scheduled',   label: 'מתוכנן'   },
  { key: 'in_progress', label: 'בביצוע'   },
  { key: 'completed',   label: 'הושלם'    },
  { key: 'cancelled',   label: 'בוטל'     },
];

const PRIORITY_FILTERS = [
  { key: 'all',    label: 'הכל'   },
  { key: 'low',    label: 'נמוך'  },
  { key: 'medium', label: 'בינוני' },
  { key: 'high',   label: 'גבוה'  },
  { key: 'urgent', label: 'דחוף'  },
];

const EMPTY_FORM = {
  buildingId:       '',
  issueId:          '',
  vendorId:         '',
  title:            '',
  description:      '',
  status:           'pending',
  priority:         'medium',
  scheduledDate:    '',
  completedDate:    '',
  estimatedCost:    '',
  actualCost:       '',
  approvedBy:       '',
  notes:            '',
  rating:           '',
  residentFeedback: '',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNextStatus(currentStatus) {
  const idx = STATUS_PROGRESSION.indexOf(currentStatus);
  if (idx === -1 || idx === STATUS_PROGRESSION.length - 1) return null;
  return STATUS_PROGRESSION[idx + 1];
}

function formatCost(val) {
  const n = Number(val);
  if (!n) return null;
  return `₪${n.toLocaleString()}`;
}

// ─── Status / cost chips (Civic Blue tokens) ────────────────────────────────

const STATUS_TONES = {
  pending:     'bg-[var(--surface-secondary)] text-[var(--text-secondary)]',
  approved:    'bg-[var(--surface-container)] text-[var(--primary-dark)]',
  scheduled:   'bg-[var(--warning-light)] text-[var(--warning)]',
  in_progress: 'bg-[var(--surface-variant)] text-[var(--primary)]',
  completed:   'bg-[var(--success-light)] text-[var(--success)]',
  cancelled:   'bg-[var(--danger-light)] text-[var(--danger)]',
};

function statusProgress(status) {
  if (status === 'cancelled') return 0;
  const idx = STATUS_PROGRESSION.indexOf(status);
  return idx >= 0 ? Math.round(((idx + 1) / STATUS_PROGRESSION.length) * 100) : 0;
}

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STATUS_TONES[status] || STATUS_TONES.pending}`}>
      {cfg.label}
    </span>
  );
}

function CostCell({ order }) {
  if (!order.estimatedCost && !order.actualCost) return <span className="text-[var(--text-muted)]">—</span>;
  const approval = requiredApproval(order.actualCost || order.estimatedCost);
  const approved = !!(order.approvedAt || order.approved_at);
  return (
    <div>
      <span className="text-[13px] font-bold num-tabular text-[var(--text-primary)]">{formatCost(order.actualCost || order.estimatedCost)}</span>
      <span className="text-[11px] text-[var(--text-muted)] mr-1">{order.actualCost ? 'בפועל' : 'הערכה'}</span>
      {approval.needsApproval && (
        <span className={`block w-fit mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${approved ? 'bg-[var(--success-light)] text-[var(--success)]' : approval.level === 'board' ? 'bg-[var(--danger-light)] text-[var(--danger)]' : 'bg-[var(--warning-light)] text-[var(--warning)]'}`}>
          {approved ? '✓ אושר' : `דורש: ${approval.label}`}
        </span>
      )}
    </div>
  );
}

function RowActions({ order, onEdit, onDelete, onAdvanceStatus }) {
  const nextStatus = getNextStatus(order.status);
  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {nextStatus && (
        <button onClick={() => onAdvanceStatus(order, nextStatus)} title={`קדם ל: ${STATUS_CONFIG[nextStatus].label}`}
          className="h-7 px-2 rounded-[var(--radius)] border border-[var(--outline-variant)] text-[11px] font-semibold text-[var(--primary)] hover:bg-[var(--surface-secondary)] inline-flex items-center gap-1 whitespace-nowrap">
          <ArrowRight className="h-3 w-3" />קדם סטטוס
        </button>
      )}
      <button onClick={() => onEdit(order)} title="עריכה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"><Pencil className="h-3.5 w-3.5" /></button>
      <button onClick={() => onDelete(order)} title="מחיקה" className="p-1.5 rounded-[var(--radius)] text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)]"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}


// ─── Work Order Form ─────────────────────────────────────────────────────────

function WorkOrderForm({ form, onChange, issuesOptions, vendorsOptions }) {
  const statusOptions = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  }));
  const priorityOptions = Object.entries(PRIORITY_CONFIG).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  }));
  const ratingOptions = [
    { value: '', label: 'ללא דירוג' },
    { value: '1', label: '1 - גרוע' },
    { value: '2', label: '2 - לא טוב' },
    { value: '3', label: '3 - בסדר' },
    { value: '4', label: '4 - טוב' },
    { value: '5', label: '5 - מצוין' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Title – full width */}
      <div className="sm:col-span-2">
        <FormField
          label="כותרת *"
          value={form.title}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="תיאור קצר של הזמנת העבודה"
        />
      </div>

      <FormSelect
        label="סטטוס"
        value={form.status}
        onChange={(e) => onChange('status', e.target.value)}
        options={statusOptions}
      />

      <FormSelect
        label="עדיפות"
        value={form.priority}
        onChange={(e) => onChange('priority', e.target.value)}
        options={priorityOptions}
      />

      <FormSelect
        label="קריאה מקושרת"
        value={form.issueId}
        onChange={(e) => onChange('issueId', e.target.value)}
        options={[{ value: '', label: 'ללא קריאה' }, ...issuesOptions]}
      />

      <FormSelect
        label="ספק"
        value={form.vendorId}
        onChange={(e) => onChange('vendorId', e.target.value)}
        options={[{ value: '', label: 'ללא ספק' }, ...vendorsOptions]}
      />

      <FormField
        label="תאריך מתוכנן"
        type="date"
        value={form.scheduledDate}
        onChange={(e) => onChange('scheduledDate', e.target.value)}
      />

      <FormField
        label="תאריך סיום"
        type="date"
        value={form.completedDate}
        onChange={(e) => onChange('completedDate', e.target.value)}
      />

      <FormField
        label="עלות משוערת (₪)"
        type="number"
        value={form.estimatedCost}
        onChange={(e) => onChange('estimatedCost', e.target.value)}
        placeholder="0"
      />

      <FormField
        label="עלות בפועל (₪)"
        type="number"
        value={form.actualCost}
        onChange={(e) => onChange('actualCost', e.target.value)}
        placeholder="0"
      />

      <FormField
        label="אושר על ידי"
        value={form.approvedBy}
        onChange={(e) => onChange('approvedBy', e.target.value)}
        placeholder="שם המאשר"
      />

      <FormSelect
        label="דירוג"
        value={form.rating}
        onChange={(e) => onChange('rating', e.target.value)}
        options={ratingOptions}
      />

      {/* Description – full width */}
      <div className="sm:col-span-2">
        <FormTextarea
          label="תיאור"
          value={form.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="פירוט העבודה הנדרשת..."
          rows={3}
        />
      </div>

      {/* Notes – full width */}
      <div className="sm:col-span-2">
        <FormTextarea
          label="הערות"
          value={form.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          placeholder="הערות פנימיות..."
          rows={2}
        />
      </div>

      {/* Resident Feedback – full width */}
      <div className="sm:col-span-2">
        <FormTextarea
          label="משוב דייר"
          value={form.residentFeedback}
          onChange={(e) => onChange('residentFeedback', e.target.value)}
          placeholder="משוב מהדייר..."
          rows={2}
        />
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function WorkOrders() {
  const { selectedBuilding } = useBuildingContext();
  // Building-scoped SERVER-SIDE (vendors stays global); unselected building yields [].
  const scope = { building_id: selectedBuilding?.id };
  const { data: workOrders = [], create, update, remove, isLoading, isSaving } =
    useCollection('workOrders', scope);
  const { data: issues  = [] } = useCollection('issues', scope);
  const { data: vendors = [] } = useCollection('vendors');

  // UI state
  const [searchQuery,    setSearchQuery]    = useState('');
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dialogOpen,     setDialogOpen]     = useState(false);
  const [editingOrder,   setEditingOrder]   = useState(null);
  const [form,           setForm]           = useState(EMPTY_FORM);
  const [deleteTarget,   setDeleteTarget]   = useState(null);

  // Lookup maps
  const vendorsMap = useMemo(
    () => Object.fromEntries(vendors.map((v) => [v.id, v])),
    [vendors],
  );
  const issuesMap = useMemo(
    () => Object.fromEntries(issues.map((i) => [i.id, i])),
    [issues],
  );

  // Dropdown options
  const issuesOptions  = issues.map((i)  => ({ value: i.id,  label: i.title || i.id }));
  const vendorsOptions = vendors.map((v) => ({ value: v.id,  label: v.name  || v.id }));

  // Filtered list
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workOrders.filter((o) => {
      if (!selectedBuilding || o.buildingId === selectedBuilding.id) {
        // building filter OK
      } else {
        return false;
      }
      if (statusFilter   !== 'all' && o.status   !== statusFilter)   return false;
      if (priorityFilter !== 'all' && o.priority !== priorityFilter) return false;
      if (q) {
        const haystack = `${o.title} ${o.description || ''} ${o.notes || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [workOrders, selectedBuilding, statusFilter, priorityFilter, searchQuery]);

  // Orders of the selected building (basis for stats / tab counts)
  const baseOrders = useMemo(
    () => (selectedBuilding ? workOrders.filter((o) => o.buildingId === selectedBuilding.id) : workOrders),
    [workOrders, selectedBuilding],
  );
  const statusCounts = useMemo(
    () => baseOrders.reduce((m, o) => { m[o.status] = (m[o.status] || 0) + 1; return m; }, {}),
    [baseOrders],
  );

  // Stats
  const stats = useMemo(() => {
    const base = baseOrders;
    const active = base.filter((o) => !['completed', 'cancelled'].includes(o.status));
    const completed = base.filter((o) => o.status === 'completed').length;
    return {
      total:       base.length,
      open:        base.filter((o) => o.status === 'pending' || o.status === 'approved').length,
      in_progress: base.filter((o) => o.status === 'in_progress').length,
      scheduled:   base.filter((o) => o.status === 'scheduled').length,
      completed,
      completionPct: base.length ? Math.round((completed / base.length) * 100) : 0,
      openCost:    active.reduce((a, o) => a + (Number(o.actualCost || o.estimatedCost) || 0), 0),
      spent:       base.filter((o) => o.status === 'completed').reduce((a, o) => a + (Number(o.actualCost) || 0), 0),
      awaitingApproval: active.filter((o) => requiredApproval(o.actualCost || o.estimatedCost).needsApproval && !(o.approvedAt || o.approved_at)).length,
    };
  }, [baseOrders]);

  // ── Handlers ──

  function openCreate() {
    setEditingOrder(null);
    setForm({
      ...EMPTY_FORM,
      buildingId: selectedBuilding?.id || '',
    });
    setDialogOpen(true);
  }

  function openEdit(order) {
    setEditingOrder(order);
    setForm({
      buildingId:       order.buildingId       || '',
      issueId:          order.issueId          || '',
      vendorId:         order.vendorId         || '',
      title:            order.title            || '',
      description:      order.description      || '',
      status:           order.status           || 'pending',
      priority:         order.priority         || 'medium',
      scheduledDate:    order.scheduledDate    || '',
      completedDate:    order.completedDate    || '',
      estimatedCost:    order.estimatedCost != null ? String(order.estimatedCost) : '',
      actualCost:       order.actualCost    != null ? String(order.actualCost)    : '',
      approvedBy:       order.approvedBy       || '',
      notes:            order.notes            || '',
      rating:           order.rating     != null ? String(order.rating)     : '',
      residentFeedback: order.residentFeedback || '',
    });
    setDialogOpen(true);
  }

  function handleFormChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    const payload = {
      ...form,
      estimatedCost: Number(form.estimatedCost) || 0,
      actualCost:    Number(form.actualCost)    || 0,
      rating:        form.rating ? Number(form.rating) : null,
      buildingId:    form.buildingId || selectedBuilding?.id || null,
    };
    if (editingOrder) {
      await update(editingOrder.id, payload);
    } else {
      await create(payload);
    }
    setDialogOpen(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await remove(deleteTarget.id);
    setDeleteTarget(null);
  }

  async function handleAdvanceStatus(order, nextStatus) {
    await update(order.id, { status: nextStatus });
  }

  // ── Render ──

  const hasFilters = !!searchQuery || statusFilter !== 'all' || priorityFilter !== 'all';
  const upcomingScheduled = baseOrders
    .filter((o) => o.scheduledDate && !['completed', 'cancelled'].includes(o.status))
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-[-0.015em] text-[var(--text-primary)]">הזמנות עבודה</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            {stats.total} הזמנות — ספקים, תזמון, עלויות ואישורי תקציב{selectedBuilding?.name ? ` • ${selectedBuilding.name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openCreate}><Plus className="h-4 w-4" />הזמנה חדשה</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Clock} label="פתוחות (ממתין / מאושר)" color={stats.open ? 'amber' : 'slate'}
          value={String(stats.open)}
          sub={stats.awaitingApproval ? `${stats.awaitingApproval} דורשות אישור תקציב` : 'אין הזמנות הממתינות לאישור תקציב'}
          footer={stats.open ? <button onClick={() => setStatusFilter('pending')} className="text-[var(--primary)] font-semibold hover:underline">לממתינות לאישור ←</button> : null} />
        <StatCard icon={Wrench} label="בביצוע ומתוכננות" color="purple"
          value={String(stats.in_progress + stats.scheduled)}
          sub={`${stats.in_progress} בביצוע • ${stats.scheduled} מתוכננות`} />
        <StatCard icon={CheckCircle2} label="הושלמו" color="emerald"
          value={String(stats.completed)} note={`מתוך ${stats.total}`}
          sub={stats.total ? `${stats.completionPct}% שיעור השלמה` : 'אין עדיין הזמנות'}
          progress={stats.total ? stats.completionPct : undefined} />
        <StatCard icon={Wallet} label="עלות הזמנות פתוחות" color="blue"
          value={formatCost(stats.openCost) || '₪0'}
          sub={stats.spent ? `שולם/בוצע בפועל: ${formatCost(stats.spent)}` : 'לפי הערכות ועלויות בפועל'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Ledger */}
        <div className="xl:col-span-8 space-y-4">
          <div className="p-3 sm:p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] space-y-3">
            <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="חיפוש לפי כותרת, תיאור או הערות..." />
            <TabGroup
              tabs={STATUS_FILTERS.map((f) => ({ ...f, count: f.key === 'all' ? baseOrders.length : (statusCounts[f.key] || 0) }))}
              activeTab={statusFilter}
              onChange={setStatusFilter}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-[var(--text-secondary)]">עדיפות:</span>
              <TabGroup tabs={PRIORITY_FILTERS} activeTab={priorityFilter} onChange={setPriorityFilter} />
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-[13px] text-[var(--text-muted)]">טוען הזמנות עבודה...</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
              <EmptyState
                icon={ClipboardList}
                title="לא נמצאו הזמנות עבודה"
                description={hasFilters ? 'נסה לשנות את הסינון או החיפוש' : 'לחץ על "הזמנה חדשה" כדי להוסיף הזמנה ראשונה'}
                actionLabel={!hasFilters ? 'הזמנה חדשה' : undefined}
                onAction={!hasFilters ? openCreate : undefined}
              />
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {filtered.map((order) => {
                  const priorityCfg = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.medium;
                  return (
                    <div key={order.id} onClick={() => openEdit(order)}
                      className="p-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] cursor-pointer">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{order.title}</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                            {[vendorsMap[order.vendorId]?.name, order.scheduledDate ? formatDate(order.scheduledDate) : null].filter(Boolean).join(' • ') || 'ללא ספק'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusChip status={order.status} />
                          <Badge variant={priorityCfg.variant}>{priorityCfg.label}</Badge>
                        </div>
                      </div>
                      <div className="mt-3 h-1 rounded-full bg-[var(--surface-container)] overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${statusProgress(order.status)}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border-light)]">
                        <CostCell order={order} />
                        <RowActions order={order} onEdit={openEdit} onDelete={setDeleteTarget} onAdvanceStatus={handleAdvanceStatus} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="ds-table">
                    <thead>
                      <tr><th>הזמנה</th><th>ספק</th><th>עדיפות</th><th>מתוכנן</th><th>עלות</th><th>סטטוס</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filtered.map((order) => {
                        const priorityCfg = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.medium;
                        const issueTitle = issuesMap[order.issueId]?.title || null;
                        return (
                          <tr key={order.id} onClick={() => openEdit(order)} className={`cursor-pointer ${order.priority === 'urgent' && !['completed', 'cancelled'].includes(order.status) ? '!bg-[var(--danger-light)]/40' : ''}`}>
                            <td className="min-w-[200px]">
                              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                                {order.title}
                                {order.rating && (
                                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--text-secondary)] num-tabular">
                                    <Star className="h-3 w-3 text-[var(--warning)] fill-current" />{order.rating}/5
                                  </span>
                                )}
                              </span>
                              {issueTitle ? (
                                <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><ClipboardList className="h-3 w-3" /><span className="truncate max-w-[220px]">{issueTitle}</span></span>
                              ) : order.description ? (
                                <span className="block text-[11px] text-[var(--text-muted)] line-clamp-1">{order.description}</span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap text-[12px]">
                              {vendorsMap[order.vendorId]?.name
                                ? <span className="inline-flex items-center gap-1"><User className="h-3 w-3 text-[var(--text-muted)]" />{vendorsMap[order.vendorId].name}</span>
                                : <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="whitespace-nowrap"><Badge variant={priorityCfg.variant}>{priorityCfg.label}</Badge></td>
                            <td className="whitespace-nowrap text-[12px] num-tabular">
                              {order.scheduledDate
                                ? <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3 text-[var(--text-muted)]" />{formatDate(order.scheduledDate)}</span>
                                : <span className="text-[var(--text-muted)]">—</span>}
                            </td>
                            <td className="whitespace-nowrap"><CostCell order={order} /></td>
                            <td className="whitespace-nowrap">
                              <StatusChip status={order.status} />
                              <div className="mt-1.5 h-1 w-20 rounded-full bg-[var(--surface-container)] overflow-hidden">
                                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${statusProgress(order.status)}%` }} />
                              </div>
                            </td>
                            <td className="whitespace-nowrap">
                              <RowActions order={order} onEdit={openEdit} onDelete={setDeleteTarget} onAdvanceStatus={handleAdvanceStatus} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-[var(--bg)] border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>מציג {filtered.length} מתוך {baseOrders.length} הזמנות</span>
                  <span>עלות מוצגת: <strong className="text-[var(--primary)] num-tabular">{formatCost(filtered.reduce((a, o) => a + (Number(o.actualCost || o.estimatedCost) || 0), 0)) || '₪0'}</strong></span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        <aside className="xl:col-span-4 space-y-4 xl:sticky xl:top-20">
          <SectionCard icon={ClipboardList} title="צנרת הזמנות" subtitle="לפי שלב בתהליך" bodyClassName="p-4 space-y-3">
            {STATUS_FILTERS.filter((f) => f.key !== 'all').map((f) => {
              const n = statusCounts[f.key] || 0;
              const pct = baseOrders.length ? Math.round((n / baseOrders.length) * 100) : 0;
              return (
                <button key={f.key} onClick={() => setStatusFilter(f.key)} className="block w-full text-right">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="font-medium text-[var(--text-primary)]">{STATUS_CONFIG[f.key].label}</span>
                    <span className="num-tabular"><strong>{n}</strong> <span className="text-[var(--text-muted)]">({pct}%)</span></span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--surface-container)] overflow-hidden">
                    <div className={`h-full rounded-full ${f.key === 'completed' ? 'bg-[var(--success)]' : f.key === 'cancelled' ? 'bg-[var(--danger)]' : 'bg-[var(--primary)]'}`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </SectionCard>

          <SectionCard icon={Calendar} title="עבודות מתוכננות" subtitle="הזמנות פתוחות לפי תאריך" bodyClassName="p-2">
            {upcomingScheduled.length === 0 ? (
              <p className="text-center text-[12px] text-[var(--text-muted)] py-6">אין עבודות מתוכננות</p>
            ) : (
              <ul className="divide-y divide-[var(--border-light)]">
                {upcomingScheduled.map((order) => (
                  <li key={order.id}>
                    <button onClick={() => openEdit(order)} className="w-full flex items-center justify-between gap-3 px-2 py-2.5 rounded-[var(--radius)] hover:bg-[var(--surface-secondary)] text-right">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-[var(--radius)] bg-[var(--surface-secondary)] text-[var(--primary)] shrink-0"><Wrench className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{order.title}</p>
                          <p className="text-[11px] text-[var(--text-muted)] num-tabular truncate">
                            {formatDate(order.scheduledDate)}{vendorsMap[order.vendorId]?.name ? ` • ${vendorsMap[order.vendorId].name}` : ''}
                          </p>
                        </div>
                      </div>
                      <StatusChip status={order.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </aside>
      </div>


      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingOrder ? 'עריכת הזמנת עבודה' : 'הזמנת עבודה חדשה'}</DialogTitle>
          </DialogHeader>

          <WorkOrderForm
            form={form}
            onChange={handleFormChange}
            issuesOptions={issuesOptions}
            vendorsOptions={vendorsOptions}
          />

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.title.trim()}
            >
              {isSaving ? 'שומר...' : editingOrder ? 'שמור שינויים' : 'צור הזמנה'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <DeleteConfirm
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="מחיקת הזמנת עבודה"
        description={`האם אתה בטוח שברצונך למחוק את הזמנת העבודה "${deleteTarget?.title}"? פעולה זו אינה הפיכה.`}
        onConfirm={handleDelete}
      />
    </div>
  );
}
