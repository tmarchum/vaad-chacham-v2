import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function FieldWrapper({ label, className, error, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  )
}

function FormField({ label, className, error, ...props }) {
  return (
    <FieldWrapper label={label} className={className} error={error}>
      <Input className={cn(error && 'border-red-400')} {...props} />
    </FieldWrapper>
  )
}

function FormSelect({ label, className, error, ...props }) {
  return (
    <FieldWrapper label={label} className={className} error={error}>
      <Select className={cn(error && 'border-red-400')} {...props} />
    </FieldWrapper>
  )
}

function FormBool({ label, value, onChange, className, error, ...props }) {
  const boolOptions = [
    { value: 'true', label: 'כן' },
    { value: 'false', label: 'לא' },
  ]

  return (
    <FieldWrapper label={label} className={className} error={error}>
      <Select
        className={cn(error && 'border-red-400')}
        value={value === true || value === 'true' ? 'true' : 'false'}
        onChange={(e) => {
          const boolVal = e.target.value === 'true'
          onChange?.({ ...e, target: { ...e.target, value: boolVal } })
        }}
        options={boolOptions}
        {...props}
      />
    </FieldWrapper>
  )
}

function FormTextarea({ label, className, error, ...props }) {
  return (
    <FieldWrapper label={label} className={className} error={error}>
      <Textarea className={cn(error && 'border-red-400')} {...props} />
    </FieldWrapper>
  )
}

export { FormField, FormSelect, FormBool, FormTextarea }
