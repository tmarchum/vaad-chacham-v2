import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { Button } from './button'
import { cn } from '@/lib/utils'

function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmText = 'אישור',
  cancelText = 'ביטול',
  className,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-w-md', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {description && (
          <p className="text-[13px] text-[var(--text-muted)] mb-6 leading-relaxed">{description}</p>
        )}

        <div className="flex gap-2 justify-start">
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm?.()
              onOpenChange?.(false)
            }}
          >
            {confirmText}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            {cancelText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { AlertDialog }
