import { Component } from 'react'
import * as Sentry from '@sentry/react'
import { isChunkError, reloadForNewBuild } from '@/lib/appVersion'
import { logError } from '@/lib/errorLog'

// Two uses:
//  - <ErrorBoundary full>  around the whole app: last resort, full screen.
//  - <ErrorBoundary resetKey={pathname}> around the page canvas: a crash in
//    one screen shows a card in that screen only — the menu and header keep
//    working, and moving to another screen clears it.
// A missing chunk (a deploy happened while the tab was open) reloads quietly
// instead of showing an error.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, updating: false }
  }

  static getDerivedStateFromError(error) {
    return { error, updating: isChunkError(error) }
  }

  componentDidCatch(error, info) {
    if (isChunkError(error)) {
      if (reloadForNewBuild()) return
      this.setState({ updating: false })
    }
    console.error('Screen crash:', error, info)
    logError(error, this.props.full ? 'crash-app' : 'crash-screen')
    Sentry.captureException(error)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, updating: false })
    }
  }

  render() {
    const { error, updating } = this.state
    if (!error) return this.props.children

    if (updating) {
      return (
        <div dir="rtl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: this.props.full ? '100vh' : 300, color: '#475569', fontSize: 14 }}>
          מעדכן לגרסה חדשה...
        </div>
      )
    }

    const chunk = isChunkError(error)
    const title = chunk ? 'לא הצלחנו לטעון את המסך' : 'משהו השתבש במסך הזה'
    const hint = chunk
      ? 'ייתכן שהחיבור לאינטרנט נקטע. נסו לרענן.'
      : 'התקלה נרשמה אצלנו ונטפל בה. אפשר לנסות שוב או לעבור למסך אחר.'

    const card = (
      <div dir="rtl" style={{ maxWidth: 420, margin: '64px auto', textAlign: 'center', padding: 24, borderRadius: 16, background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', color: 'var(--text-primary, #0f172a)' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
        <h1 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>{title}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary, #475569)', marginBottom: 18 }}>{hint}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => (chunk || this.props.full ? window.location.reload() : this.setState({ error: null }))}
            style={{ padding: '9px 20px', background: 'var(--primary, #2563eb)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
          >
            {chunk || this.props.full ? 'רענון' : 'נסו שוב'}
          </button>
          <button
            onClick={() => window.location.assign('/')}
            style={{ padding: '9px 20px', background: 'transparent', color: 'var(--text-primary, #0f172a)', border: '1px solid var(--border, #cbd5e1)', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}
          >
            למסך הראשי
          </button>
        </div>
        <details style={{ marginTop: 18, textAlign: 'left', direction: 'ltr', fontSize: 11, color: '#94a3b8' }}>
          <summary style={{ cursor: 'pointer', textAlign: 'center' }}>פרטים טכניים</summary>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{String(error?.message || error)}</pre>
        </details>
      </div>
    )

    return this.props.full
      ? <div style={{ minHeight: '100vh', background: 'var(--bg, #f8fafc)', padding: 16 }}>{card}</div>
      : card
  }
}

export default ErrorBoundary
