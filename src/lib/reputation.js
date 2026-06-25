// Vendor reputation — closes the learning loop. Aggregates a vendor's job
// ratings into a live reputation and a recommendation, so good vendors rise in
// matching and consistently-bad ones are flagged for the blacklist.
// (The DB also auto-recomputes vendors.rating via a trigger; this adds the
// job count + the actionable flag the UI surfaces.)

const ratedJobsFor = (vendor, workOrders) =>
  (workOrders || []).filter(
    (w) => (w.vendor_id === vendor.id || w.vendorId === vendor.id) && Number(w.rating) > 0,
  )

export function vendorReputation(vendor, workOrders) {
  const rated = ratedJobsFor(vendor, workOrders)
  const jobCount = rated.length
  const avg = jobCount
    ? rated.reduce((s, w) => s + Number(w.rating), 0) / jobCount
    : (Number(vendor.rating) || 0)

  // Actionable flag — needs enough jobs before judging.
  let flag = 'good'
  let label = ''
  if (jobCount >= 3 && avg < 2) { flag = 'blacklist'; label = 'מומלץ לרשימה שחורה' }
  else if (jobCount >= 2 && avg < 3) { flag = 'watch'; label = 'במעקב — ביצועים נמוכים' }
  else if (jobCount >= 3 && avg >= 4.5) { flag = 'top'; label = 'ספק מצטיין' }

  return { avg: Math.round(avg * 10) / 10, jobCount, flag, label }
}
