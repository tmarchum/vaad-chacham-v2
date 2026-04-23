// ═══════════════════════════════════════════════════════════════════
// קטגוריות הוצאות והכנסות — ועד בית
// ═══════════════════════════════════════════════════════════════════

// ── קטגוריות הוצאות ─────────────────────────────────────────────
export const EXPENSE_CATEGORIES = [
  // תחזוקה שוטפת
  { value: 'ניקיון', label: 'ניקיון', group: 'שוטף', color: 'emerald', icon: '🧹' },
  { value: 'חשמל', label: 'חשמל משותף', group: 'שוטף', color: 'amber', icon: '⚡' },
  { value: 'מים', label: 'מים משותפים', group: 'שוטף', color: 'cyan', icon: '💧' },
  { value: 'מעלית', label: 'אחזקת מעלית', group: 'שוטף', color: 'indigo', icon: '🛗' },
  { value: 'גינון', label: 'גינון', group: 'שוטף', color: 'green', icon: '🌿' },
  { value: 'הדברה', label: 'הדברה', group: 'שוטף', color: 'orange', icon: '🪲' },
  { value: 'הסקה', label: 'הסקה / חימום מים', group: 'שוטף', color: 'red', icon: '🔥' },
  { value: 'גז', label: 'גז מרכזי', group: 'שוטף', color: 'slate', icon: '🔵' },

  // ביטוח
  { value: 'ביטוח_מבנה', label: 'ביטוח מבנה', group: 'ביטוח', color: 'purple', icon: '🛡️' },
  { value: 'ביטוח_צדג', label: 'ביטוח צד ג׳', group: 'ביטוח', color: 'purple', icon: '🛡️' },
  { value: 'ביטוח_מעבידים', label: 'ביטוח חבות מעבידים', group: 'ביטוח', color: 'purple', icon: '🛡️' },

  // תיקונים
  { value: 'אינסטלציה', label: 'אינסטלציה וביוב', group: 'תיקונים', color: 'blue', icon: '🔧' },
  { value: 'תיקוני_חשמל', label: 'תיקוני חשמל', group: 'תיקונים', color: 'amber', icon: '🔌' },
  { value: 'מנעולנות', label: 'מנעולנות ושכפול', group: 'תיקונים', color: 'slate', icon: '🔑' },
  { value: 'תיקונים_כלליים', label: 'תיקונים כלליים', group: 'תיקונים', color: 'gray', icon: '🔨' },

  // אבטחה ובטיחות
  { value: 'שמירה', label: 'שמירה / אבטחה', group: 'אבטחה', color: 'red', icon: '🔒' },
  { value: 'מצלמות', label: 'מצלמות אבטחה', group: 'אבטחה', color: 'red', icon: '📹' },
  { value: 'כיבוי_אש', label: 'מערכת כיבוי אש', group: 'אבטחה', color: 'red', icon: '🧯' },
  { value: 'גנרטור', label: 'אחזקת גנרטור', group: 'אבטחה', color: 'slate', icon: '⚙️' },
  { value: 'אינטרקום', label: 'אינטרקום / שערים', group: 'אבטחה', color: 'blue', icon: '🚪' },

  // שיפוצים ופרויקטים
  { value: 'איטום', label: 'איטום גגות', group: 'שיפוצים', color: 'teal', icon: '🏠' },
  { value: 'צביעה', label: 'צביעה / חזיתות', group: 'שיפוצים', color: 'pink', icon: '🎨' },
  { value: 'שיפוץ_לובי', label: 'שיפוץ לובי / מדרגות', group: 'שיפוצים', color: 'violet', icon: '🏗️' },
  { value: 'ריצוף', label: 'ריצוף', group: 'שיפוצים', color: 'stone', icon: '🧱' },
  { value: 'שדרוג_מעלית', label: 'שדרוג / החלפת מעלית', group: 'שיפוצים', color: 'indigo', icon: '🛗' },
  { value: 'שיפוצים_כלליים', label: 'שיפוצים כלליים', group: 'שיפוצים', color: 'gray', icon: '🏗️' },

  // ניהול ואדמיניסטרציה
  { value: 'ניהול', label: 'דמי ניהול / חברת ניהול', group: 'ניהול', color: 'blue', icon: '🏢' },
  { value: 'הנהלת_חשבונות', label: 'הנהלת חשבונות', group: 'ניהול', color: 'slate', icon: '📊' },
  { value: 'עמלות_בנק', label: 'עמלות בנק', group: 'ניהול', color: 'gray', icon: '🏦' },
  { value: 'עורך_דין', label: 'ייעוץ משפטי / עו״ד', group: 'ניהול', color: 'red', icon: '⚖️' },
  { value: 'גבייה', label: 'הוצאות גבייה', group: 'ניהול', color: 'orange', icon: '📨' },

  // קרנות
  { value: 'קרן_שמורה', label: 'קרן שמורה / חירום', group: 'קרנות', color: 'emerald', icon: '🏦' },
  { value: 'קרן_שיפוצים', label: 'קרן שיפוצים', group: 'קרנות', color: 'teal', icon: '💰' },

  // אחר
  { value: 'אחר', label: 'אחר', group: 'אחר', color: 'slate', icon: '📋' },
]

// ── קטגוריות הכנסות ─────────────────────────────────────────────
export const INCOME_CATEGORIES = [
  // הכנסות שוטפות
  { value: 'ועד_בית', label: 'דמי ועד בית', group: 'שוטף', color: 'blue', icon: '🏠' },
  { value: 'גבייה_מיוחדת', label: 'גבייה מיוחדת / חד-פעמית', group: 'שוטף', color: 'indigo', icon: '💳' },
  { value: 'ריבית_פיגורים', label: 'ריבית והצמדה על חובות', group: 'שוטף', color: 'amber', icon: '📈' },
  { value: 'ריבית_בנקאית', label: 'ריבית בנקאית', group: 'שוטף', color: 'emerald', icon: '🏦' },

  // הכנסות מנכסים
  { value: 'השכרת_גג_סולארי', label: 'פנלים סולאריים / גג', group: 'נכסים', color: 'yellow', icon: '☀️' },
  { value: 'זיכוי_חשמל', label: 'זיכוי חשמל סולארי', group: 'נכסים', color: 'green', icon: '⚡' },
  { value: 'אנטנה_סלולרית', label: 'אנטנה סלולרית', group: 'נכסים', color: 'purple', icon: '📡' },
  { value: 'השכרת_שטח', label: 'השכרת שטח / שילוט', group: 'נכסים', color: 'cyan', icon: '📋' },
  { value: 'דמי_חניה', label: 'דמי חניה', group: 'נכסים', color: 'slate', icon: '🅿️' },
  { value: 'השכרת_מחסן', label: 'השכרת מחסן / חדר', group: 'נכסים', color: 'orange', icon: '📦' },

  // הכנסות חד-פעמיות
  { value: 'פיצויי_ביטוח', label: 'פיצויים מביטוח', group: 'חד-פעמי', color: 'red', icon: '🛡️' },
  { value: 'זכויות_בנייה', label: 'מכירת זכויות בנייה', group: 'חד-פעמי', color: 'violet', icon: '🏗️' },
  { value: 'תמא_38', label: 'תמ״א 38 / פינוי-בינוי', group: 'חד-פעמי', color: 'pink', icon: '🏢' },
  { value: 'החזרי_ספקים', label: 'החזרים / זיכויים מספקים', group: 'חד-פעמי', color: 'teal', icon: '↩️' },
  { value: 'מכירת_ציוד', label: 'מכירת ציוד', group: 'חד-פעמי', color: 'gray', icon: '🔧' },
  { value: 'תרומות', label: 'תרומות דיירים', group: 'חד-פעמי', color: 'emerald', icon: '🤝' },

  // אחר
  { value: 'אחר', label: 'אחר', group: 'אחר', color: 'slate', icon: '📋' },
]

// ── מיפוי צבעים לגרדיאנטים ──────────────────────────────────────
export const CATEGORY_GRADIENTS = {
  emerald: 'from-emerald-500 to-emerald-600',
  amber: 'from-amber-500 to-amber-600',
  cyan: 'from-cyan-500 to-cyan-600',
  indigo: 'from-indigo-500 to-indigo-600',
  green: 'from-green-500 to-green-600',
  orange: 'from-orange-500 to-orange-600',
  red: 'from-red-500 to-red-600',
  slate: 'from-slate-500 to-slate-600',
  purple: 'from-purple-500 to-purple-600',
  blue: 'from-blue-500 to-blue-600',
  teal: 'from-teal-500 to-teal-600',
  pink: 'from-pink-500 to-pink-600',
  violet: 'from-violet-500 to-violet-600',
  stone: 'from-stone-500 to-stone-600',
  gray: 'from-gray-500 to-gray-600',
  yellow: 'from-yellow-500 to-yellow-600',
}

export const CATEGORY_BG_COLORS = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  pink: 'bg-pink-50 text-pink-700 border-pink-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  stone: 'bg-stone-50 text-stone-700 border-stone-200',
  gray: 'bg-gray-50 text-gray-700 border-gray-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

// ── קבוצות לתצוגה ────────────────────────────────────────────────
export const EXPENSE_GROUPS = [
  { key: 'שוטף', label: 'תחזוקה שוטפת' },
  { key: 'ביטוח', label: 'ביטוח' },
  { key: 'תיקונים', label: 'תיקונים' },
  { key: 'אבטחה', label: 'אבטחה ובטיחות' },
  { key: 'שיפוצים', label: 'שיפוצים ופרויקטים' },
  { key: 'ניהול', label: 'ניהול ואדמיניסטרציה' },
  { key: 'קרנות', label: 'קרנות ורזרבות' },
  { key: 'אחר', label: 'אחר' },
]

export const INCOME_GROUPS = [
  { key: 'שוטף', label: 'הכנסות שוטפות' },
  { key: 'נכסים', label: 'הכנסות מנכסים' },
  { key: 'חד-פעמי', label: 'הכנסות חד-פעמיות' },
  { key: 'אחר', label: 'אחר' },
]

// ── עוזרים ───────────────────────────────────────────────────────

/** חפש קטגוריית הוצאה לפי ערך */
export function findExpenseCategory(value) {
  return EXPENSE_CATEGORIES.find(c => c.value === value)
}

/** חפש קטגוריית הכנסה לפי ערך */
export function findIncomeCategory(value) {
  return INCOME_CATEGORIES.find(c => c.value === value)
}

/** קטגוריות הוצאות כ-options לסלקט (מקובצות) */
export function getExpenseOptions() {
  return EXPENSE_CATEGORIES.map(c => ({ value: c.value, label: c.label }))
}

/** קטגוריות הכנסות כ-options לסלקט (מקובצות) */
export function getIncomeOptions() {
  return INCOME_CATEGORIES.map(c => ({ value: c.value, label: c.label }))
}

// Map old simple category values → new values (backward compat)
export const LEGACY_EXPENSE_MAP = {
  'תחזוקה': 'תיקונים_כלליים',
  'חשמל': 'חשמל',
  'מים': 'מים',
  'ניקיון': 'ניקיון',
  'ביטוח': 'ביטוח_מבנה',
  'משפטי': 'עורך_דין',
  'אחר': 'אחר',
}
