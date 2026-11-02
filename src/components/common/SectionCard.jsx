import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * The Civic Blue content section: bordered header row (icon + title +
 * subtitle, actions on the far side), body, optional footer strip with a
 * summary on one side and a "see all" link on the other.
 *
 *   <SectionCard icon={Receipt} title="מעקב גבייה" subtitle="נובמבר 2026"
 *     actions={<SegmentedTabs …/>}
 *     footer="מציג 3 מתוך 3" footerLink={{ to: '/payments', label: 'לכל הגבייה' }}>
 *     …
 *   </SectionCard>
 */
export function SectionCard({
  icon: Icon, title, subtitle, actions, footer, footerLink,
  children, className, bodyClassName, tone,
}) {
  return (
    <Card className={cn('flex flex-col', tone === 'primary' && 'border-[var(--primary)]/25', className)}>
      {(title || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && <Icon className="h-6 w-6 text-[var(--primary)] shrink-0" strokeWidth={1.75} />}
            <div className="min-w-0">
              <h2 className="text-[16px] leading-6 font-bold text-[var(--text-primary)] truncate">{title}</h2>
              {subtitle && <p className="text-[11px] leading-[14px] text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-1.5 flex-wrap shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn('flex-1', bodyClassName)}>{children}</div>
      {(footer || footerLink) && (
        <CardFooter>
          <span>{footer}</span>
          {footerLink && (
            <Link to={footerLink.to} className="text-[var(--primary)] hover:underline font-semibold flex items-center gap-1">
              {footerLink.label}
              <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
