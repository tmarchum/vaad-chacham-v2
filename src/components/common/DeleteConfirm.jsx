import { AlertDialog } from '@/components/ui/alert-dialog'

function DeleteConfirm({ open, onOpenChange, onConfirm, itemName }) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`האם למחוק את ${itemName}?`}
      description="פעולה זו אינה ניתנת לביטול."
      onConfirm={onConfirm}
      confirmText="מחק"
      cancelText="ביטול"
    />
  )
}

export { DeleteConfirm }
