// The ועדלי brand mark, inlined — an <img src="/favicon.svg"> can fail to
// load (stale APK bundle, offline first paint); inline SVG cannot.
export function BrandLogo({ className = 'w-10 h-10' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="ועדלי">
      <defs>
        <linearGradient id="vaadly-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#115e59" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#vaadly-g)" />
      <rect x="17" y="15" width="24" height="35" rx="3" fill="#ffffff" />
      <g fill="#0f766e">
        <rect x="21.5" y="20" width="5" height="5" rx="1" />
        <rect x="31.5" y="20" width="5" height="5" rx="1" />
        <rect x="21.5" y="29" width="5" height="5" rx="1" />
        <rect x="31.5" y="29" width="5" height="5" rx="1" />
        <rect x="25.5" y="39" width="7" height="11" rx="1.5" />
      </g>
      <circle cx="45" cy="42" r="10.5" fill="#10b981" stroke="#ffffff" strokeWidth="3" />
      <path d="M40.3 42.2l3.3 3.3 6.2-6.6" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
