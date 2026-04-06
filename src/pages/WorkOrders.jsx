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
import { formatDate } from '@/lib/utils';
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
  { value: 'all',         label: 'הכל'      },
  { value: 'pending',     label: 'ממתין'    },
  { value: 'approved',    label: 'מאושר'    },
  { value: 'scheduled',   label: 'מתוכנן'   },
  { value: 'in_progress', label: 'בביצוע'   },
  { value: 'completed',   label: 'הושלם'    },
  { value: 'cancelled',   label: 'בוטל'     },
];

const PRIORITY_FILTERS = [
  { value: 'all',    label: 'הכל'   },
  { value: 'low',    label: 'נמוך'  },
  { value: 'medium', label: 'בינוני' },
  { value: 'high',   label: 'גבוה'  },
  { value: 'urgent', label: 'דחוף'  },
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

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-full p-3 ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Filter Pills ───────────────────────────────────────────────────────────

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Work Order Card ─────────────────────────────────────────────────────────

function WorkOrderCard({ order, vendorsMap, issuesMap, onEdit, onDelete, onAdvanceStatus }) {
  const statusCfg   = STATUS_CONFIG[order.status]   || STATUS_CONFIG.pending;
  const priorityCfg = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.medium;
  const nextStatus  = getNextStatus(order.status);
  const vendorName  = vendorsMap[order.vendorId]?.name  || null;
  const issueTitle  = issuesMap[order.issueId]?.title   || null;

  return (
    <Card className="flex flex-col gap-0">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{order.title}</CardTitle>
          <div className="flex shrink-0 flex-col gap-1 items-end">
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            <Badge variant={priorityCfg.variant}>{priorityCfg.label}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        {order.description && (
          <p className="text-sm text-gray-600 line-clamp-2">{order.description}</p>
        )}

        <div className="space-y-1.5 text-sm text-gray-600">
          {issueTitle && (
            <div className="flex items-center gap-1.5">
              <ClipboardList className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">{issueTitle}</span>
            </div>
          )}
          {vendorName && (
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">{vendorName}</span>
            </div>
          )}
          {order.scheduledDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
              <span>{formatDate(order.scheduledDate)}</span>
            </div>
          )}
          {(order.estimatedCost || order.actualCost) && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {order.estimatedCost && (
                <span className="text-gray-500">
                  הערכה: <span className="font-medium text-gray-700">{formatCost(order.estimatedCost)}</span>
                </span>
              )}
              {order.actualCost && (
                <span className="text-gray-500">
                  בפועל: <span className="font-medium text-gray-700">{formatCost(order.actualCost)}</span>
                </span>
              )}
            </div>
          )}
          {order.rating && (
            <div className="flex items-center gap-1.5">
              <Star className="h-4 w-4 shrink-0 text-yellow-400 fill-yellow-400" />
              <span>{order.rating}/5</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
          {nextStatus && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => onAdvanceStatus(order, nextStatus)}
            >
              <ArrowRight className="h-3 w-3" />
              קדם סטטוס
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(order)}
            className="gap-1 text-xs"
          >
            <Pencil className="h-3 w-3" />
            עריכה
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(order)}
            className="gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" />
            מחיקה
          </Button>
        </div>
      </CardContent>
    </Card>
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">הזמנות עבודה</h1>
          <p className="mt-1 text-sm text-gray-500">ניהול הזמנות עבודה לספקים ואנשי מקצוע</p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          הזמנה חדשה
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={ClipboardList} label="סה״כ הזמנות"  value={stats.total}       color="bg-blue-500"   />
        <StatCard icon={Clock}         label="פתוחות"        value={stats.open}        color="bg-amber-500"  />
        <StatCard icon={Wrench}        label="בביצוע"        value={stats.in_progress} color="bg-orange-500" />
        <StatCard icon={CheckCircle2}  label="הושלמו"        value={stats.completed}   color="bg-green-500"  />
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
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
