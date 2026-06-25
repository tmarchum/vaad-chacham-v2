// Spending governance — replaces a management company's spending authority with
// the committee's, via explicit thresholds. Small jobs run from the maintenance
// budget; bigger ones need a committee approval; large ones need a board vote.
//
// requiredApproval(cost, thresholds) → { level, label, needsApproval }

export const DEFAULT_THRESHOLDS = { autoMax: 500, singleMax: 2000 }

export function approvalThresholds(building) {
  return {
    autoMax: Number(building?.approval_auto_max ?? building?.approvalAutoMax ?? DEFAULT_THRESHOLDS.autoMax),
    singleMax: Number(building?.approval_single_max ?? building?.approvalSingleMax ?? DEFAULT_THRESHOLDS.singleMax),
  }
}

export function requiredApproval(cost, thresholds = DEFAULT_THRESHOLDS) {
  const amount = Number(cost) || 0
  const { autoMax, singleMax } = { ...DEFAULT_THRESHOLDS, ...thresholds }
  if (amount <= autoMax) {
    return { level: 'auto', label: 'אוטומטי (תקציב תחזוקה)', needsApproval: false }
  }
  if (amount <= singleMax) {
    return { level: 'single', label: 'אישור חבר ועד', needsApproval: true }
  }
  return { level: 'board', label: 'הצבעת ועד', needsApproval: true }
}
