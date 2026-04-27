import { useState, useMemo } from 'react';
import { useCollection, useBuildingContext } from '@/hooks/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { FilterPills } from '@/components/common/FilterPills';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader'
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

// ─── Work Order Card ─────────────────────────────────────────────────────────

function WorkOrderCard({ order, vendorsMap, issuesMap, onEdit, onDelete, onAdvanceStatus }) {
  const statusCfg   = STATUS_CONFIG[order.status]   || STATUS_CONFIG.pending;
  const priorityCfg = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.medium;
  const nextStatus  = getNextStatus(order.status);
  const vendorName  = vendorsMap[order.vendorId]?.name  || null;
  const issueTitle  = issuesMap[order.issueId]?.title   || null;

  // Status-based gradient for the circle
  const statusGradients = {
    pending:     'from-slate-400 to-slate-500',
    approved:    'from-blue-500 to-blue-600',
    scheduled:   'from-amber-400 to-amber-500',
    in_progress: 'from-purple-500 to-purple-600',
    completed:   'from-emerald-500 to-emerald-600',
    cancelled:   'from-red-400 to-red-500',
  };
  const circleGradient = statusGradients[order.status] || statusGradients.pending;

  // Status dot colors
  const statusDotColors = {
    pending:     'bg-slate-400',
    approved:    'bg-blue-500',
    scheduled:   'bg-amber-500',
    in_progress: 'bg-purple-500',
    completed:   'bg-emerald-500',
    cancelled:   'bg-red-500',
  };
  const dotColor = statusDotColors[order.status] || statusDotColors.pending;

  // Status text colors
  const statusTextColors = {
    pending:     'text-slate-600',
    approved:    'text-blue-700',
    scheduled:   'text-amber-700',
    in_progress: 'text-purple-700',
    completed:   'text-emerald-700',
    cancelled:   'text-red-700',
  };
  const statusTextColor = statusTextColors[order.status] || statusTextColors.pending;

  // Priority accent bar colors
  const priorityBarColors = {
    low:    'bg-slate-300',
    medium: 'bg-blue-400',
    high:   'bg-amber-500',
    urgent: 'bg-red-500',
  };
  const priorityBar = priorityBarColors[order.priority] || priorityBarColors.medium;

  // Progress: how far in the status progression
  const statusIdx = STATUS_PROGRESSION.indexOf(order.status);
  const progressPct = order.status === 'cancelled' ? 0 : statusIdx >= 0 ? Math.round(((statusIdx + 1) / STATUS_PROGRESSION.length) * 100) : 0;

  const titleInitial = (order.title || '?').charAt(0);

  return (
    <div className="group relative rounded-xl border border-[var(--border)] bg-white hover:shadow-md hover:border-blue-200 transition-all cursor-pointer overflow-hidden"
      onClick={() => onEdit(order)}
    >
      {/* Priority accent bar at top */}
      <div className={`h-1 w-full ${priorityBar}`} />

      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Status gradient circle */}
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${circleGradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>
            {titleInitial}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                {order.title}
              </span>
              <Badge variant={priorityCfg.variant} className="text-[10px] px-1.5 py-0 shrink-0">{priorityCfg.label}</Badge>
            </div>
            {order.description && (
              <p className="text-xs text-[var(--text-muted)] line-clamp-1 mb-1">{order.description}</p>
            )}
            <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--text-secondary)]">
              {vendorName && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3 text-[var(--text-muted)]" />
                  <span>{vendorName}</span>
                </div>
              )}
              {issueTitle && (
                <div className="flex items-center gap-1">
                  <ClipboardList className="h-3 w-3 text-[var(--text-muted)]" />
                  <span className="truncate max-w-[120px]">{issueTitle}</span>
                </div>
              )}
              {order.scheduledDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                  <span>{formatDate(order.scheduledDate)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cost section */}
          {(order.estimatedCost || order.actualCost) && (
            <div className="text-left min-w-[90px] shrink-0">
              {order.actualCost ? (
                <>
                  <div className="text-[14px] font-bold text-[var(--text-primary)]">{formatCost(order.actualCost)}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">בפועל</div>
                </>
              ) : (
                <>
                  <div className="text-[14px] font-bold text-[var(--text-primary)]">{formatCost(order.estimatedCost)}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">הערכה</div>
                </>
              )}
            </div>
          )}

          {/* Status with dot */}
          <div className="flex items-center gap-2 min-w-[80px] shrink-0">
            <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
            <span className={`text-[12px] font-medium ${statusTextColor}`}>{statusCfg.label}</span>
          </div>
        </div>

        {/* Progress bar + rating row */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${dotColor}`} style={{ width: progressPct + '%' }} />
          </div>
          {order.rating && (
            <div className="flex items-center gap-1 shrink-0">
              <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
              <span className="text-[11px] text-[var(--text-secondary)]">{order.rating}/5</span>
            </div>
          )}
        </div>

        {/* Hover-reveal actions */}
        <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {nextStatus && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => onAdvanceStatus(order, nextStatus)}>
              <ArrowRight className="h-3 w-3" />
              קדם סטטוס
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onEdit(order)} className="gap-1 text-xs h-7">
            <Pencil className="h-3 w-3" />
            עריכה
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(order)} className="gap-1 text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-3 w-3" />
            מחיקה
          </Button>
        </div>
      </div>
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
  const { data: workOrders = [], create, update, remove, isLoading, isSaving } =
    useCollection('workOrders');
  const { data: issues  = [] } = useCollection('issues');
  const { data: vendors = [] } = useCollection('vendors');
  const { selectedBuilding } = useBuildingContext();

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

  // Stats
  const stats = useMemo(() => {
    const base = selectedBuilding
      ? workOrders.filter((o) => o.buildingId === selectedBuilding.id)
      : workOrders;
    return {
      total:       base.length,
      open:        base.filter((o) => o.status === 'pending' || o.status === 'approved').length,
      in_progress: base.filter((o) => o.status === 'in_progress').length,
      completed:   base.filter((o) => o.status === 'completed').length,
    };
  }, [workOrders, selectedBuilding]);

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

  return (
    <div className="space-y-6 p-4 sm:p-6" dir="rtl">
      {/* Header */}
      <PageHeader
        icon={ClipboardList}
        iconColor="purple"
        title="הזמנות עבודה"
        subtitle={`${stats.total} הזמנות עבודה`}
        actions={
          <Button onClick={openCreate} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            הזמנה חדשה
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={ClipboardList} label="סה״כ הזמנות"  value={stats.total}       color="blue"    />
        <StatCard icon={Clock}         label="פתוחות"        value={stats.open}        color="amber"   />
        <StatCard icon={Wrench}        label="בביצוע"        value={stats.in_progress} color="purple"  />
        <StatCard icon={CheckCircle2}  label="הושלמו"        value={stats.completed}   color="emerald" />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <FilterPills options={STATUS_FILTERS}   value={statusFilter}   onChange={setStatusFilter}   />
        <FilterPills options={PRIORITY_FILTERS} value={priorityFilter} onChange={setPriorityFilter} />
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="חיפוש לפי כותרת, תיאור או הערות..."
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-20 text-center text-gray-500">טוען הזמנות עבודה...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="לא נמצאו הזמנות עבודה"
          description={
            searchQuery || statusFilter !== 'all' || priorityFilter !== 'all'
              ? 'נסה לשנות את הסינון או החיפוש'
              : 'לחץ על "+ הזמנה חדשה" כדי להוסיף הזמנה ראשונה'
          }
          action={
            !searchQuery && statusFilter === 'all' && priorityFilter === 'all' ? (
              <Button onClick={openCreate} className="gap-2 mt-2">
                <Plus className="h-4 w-4" />
                הזמנה חדשה
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <WorkOrderCard
              key={order.id}
              order={order}
              vendorsMap={vendorsMap}
              issuesMap={issuesMap}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onAdvanceStatus={handleAdvanceStatus}
            />
          ))}
        </div>
      )}

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
