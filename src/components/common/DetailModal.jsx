import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

function DetailRow({ label, value, className }) {
  if (value === null || value === undefined || value === '') return null

  return (
    <div className={cn('flex items-start gap-3 py-2.5 border-b border-[var(--border-light)] last:border-0', className)}>
      <span className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wide min-w-[100px] shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-[13px] text-[var(--text-primary)] font-medium">{value}</span>
    </div>
  )
}

function DetailModal({ open, onOpenChange, title, onEdit, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{title}</DialogTitle>
            {onEdit && (
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="space-y-0">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

export { DetailModal, DetailRow }
