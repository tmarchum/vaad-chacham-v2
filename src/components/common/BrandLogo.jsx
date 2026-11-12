import { useId } from 'react'

// The ועד1 brand mark, inlined — an <img src="/favicon.svg"> can fail to load
// (stale APK bundle, offline first paint); inline SVG cannot.
//
// The digit 1 is a residential tower: windows down the shaft, a door at the
// foot, the base of the numeral as the street. The green check is the same
// "everything is fine" the dashboard opens with.
export function BrandLogo({ className = 'w-10 h-10' }) {
  // Each copy needs its own gradient id: when two logos share one and the
  // first sits in a display:none panel, the browser paints the second with
  // no fill at all.
  const gid = 'vaad1-g-' + useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="ועד1">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e40af" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gid})`} />
      <path d="M27 12h11v37h-11V22.5l-6.2 3.6v-6.9z" fill="#ffffff" />
      <rect x="18" y="49" width="27" height="4.5" rx="2" fill="#ffffff" />
      <g fill="#2563eb">
        <rect x="29.5" y="17" width="2.6" height="3.2" rx=".6" /><rect x="33.4" y="17" width="2.6" height="3.2" rx=".6" />
        <rect x="29.5" y="23" width="2.6" height="3.2" rx=".6" /><rect x="33.4" y="23" width="2.6" height="3.2" rx=".6" />
        <rect x="29.5" y="29" width="2.6" height="3.2" rx=".6" /><rect x="33.4" y="29" width="2.6" height="3.2" rx=".6" />
        <rect x="29.5" y="35" width="2.6" height="3.2" rx=".6" /><rect x="33.4" y="35" width="2.6" height="3.2" rx=".6" />
        <rect x="30.6" y="42" width="4.3" height="7" rx="1" />
      </g>
      <circle cx="47" cy="19" r="9" fill="#10b981" stroke="#ffffff" strokeWidth="2.6" />
      <path d="M43 19.2l2.8 2.8 5.3-5.6" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
