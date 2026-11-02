import { TabGroup } from '@/components/ui/tabs'

/**
 * Segmented filter control — same visual as TabGroup (Civic Blue).
 *   <FilterPills options={[{ key: 'all', label: 'הכל', count: 12 }]} value="all" onChange={setFilter} />
 */
function FilterPills({ options, value, onChange, className }) {
  return <TabGroup tabs={options} activeTab={value} onChange={onChange} className={className} />
}

export { FilterPills }
