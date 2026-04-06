import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function FieldWrapper({ label, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      {children}
    </div>
  )
}

function FormField({ label, className, ...props }) {
  return (
    <FieldWrapper label={label} className={className}>
      <Input {...props} />
    </FieldWrapper>
  )
}

function FormSelect({ label, className, ...props }) {
  return (
    <FieldWrapper label={label} className={className}>
      <Select {...props} />
    </FieldWrapper>
  )
}

function FormBool({ label, value, onChange, className, ...props }) {
  const boolOptions = [
    { value: 'true', label: 'כן' },
    { value: 'false', label: 'לא' },
  ]

  return (
    <FieldWrapper label={label} className={className}>
      <Select
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

function FormTextarea({ label, className, ...props }) {
  return (
    <FieldWrapper label={label} className={className}>
      <Textarea {...props} />
    </FieldWrapper>
  )
}

export { FormField, FormSelect, FormBool, FormTextarea }
