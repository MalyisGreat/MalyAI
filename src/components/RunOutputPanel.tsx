import type { CSSProperties } from 'react'
import { CheckCircle2, Circle, LoaderCircle, Terminal, X, XCircle } from 'lucide-react'

export type RunOutputPanelProps = {
  stdout?: string
  stderr?: string
  exitCode?: number | null
  runtimeMs?: number | null
  running?: boolean
  title?: string
  command?: string
  startedAt?: Date | number | string | null
  finishedAt?: Date | number | string | null
  emptyMessage?: string
  onClear?: () => void
  className?: string
}

const panelStyle: CSSProperties = {
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  minHeight: 0,
  overflow: 'hidden',
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 8,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minWidth: 0,
  padding: '10px 12px',
  borderBottom: '1px solid var(--line)',
}

const titleStyle: CSSProperties = {
  display: 'grid',
  gap: 2,
  minWidth: 0,
}

const statusStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  fontSize: 13,
  fontWeight: 700,
}

const metaStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  color: 'var(--muted)',
  fontSize: 12,
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 22,
  padding: '0 7px',
  background: 'var(--surface-2)',
  borderRadius: 6,
}

const clearButtonStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: 'inline-grid',
  flex: '0 0 auto',
  placeItems: 'center',
  color: 'var(--muted)',
  background: 'transparent',
  borderRadius: 8,
  cursor: 'pointer',
}

const bodyStyle: CSSProperties = {
  minHeight: 0,
  overflow: 'auto',
  padding: 12,
  display: 'grid',
  alignContent: 'start',
  gap: 10,
}

const streamStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  minWidth: 0,
}

const streamHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  color: 'var(--muted)',
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
}

const preStyle: CSSProperties = {
  maxHeight: 360,
  minHeight: 96,
  margin: 0,
  padding: 12,
  overflow: 'auto',
  color: '#edf5ee',
  background: '#171a19',
  borderRadius: 8,
  fontFamily: 'var(--mono)',
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
}

const emptyStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: 150,
  padding: 18,
  color: 'var(--muted)',
  textAlign: 'center',
  border: '1px dashed var(--line)',
  borderRadius: 8,
}

function toTimestamp(value: Date | number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatRuntime(
  runtimeMs: number | null | undefined,
  startedAt: Date | number | string | null | undefined,
  finishedAt: Date | number | string | null | undefined,
  running: boolean,
): string | null {
  let ms = typeof runtimeMs === 'number' && Number.isFinite(runtimeMs) ? runtimeMs : null

  if (ms === null) {
    const started = toTimestamp(startedAt)
    const finished = toTimestamp(finishedAt) ?? (running ? Date.now() : null)
    if (started !== null && finished !== null) {
      ms = Math.max(0, finished - started)
    }
  }

  if (ms === null) {
    return null
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }

  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`
  }

  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

function getStatus(running: boolean, exitCode: number | null | undefined, hasOutput: boolean) {
  if (running) {
    return { label: 'Running', color: 'var(--accent)', Icon: LoaderCircle }
  }

  if (exitCode === 0) {
    return { label: 'Succeeded', color: 'var(--accent)', Icon: CheckCircle2 }
  }

  if (typeof exitCode === 'number') {
    return { label: 'Failed', color: 'var(--danger)', Icon: XCircle }
  }

  if (hasOutput) {
    return { label: 'Output', color: 'var(--ink)', Icon: Terminal }
  }

  return { label: 'Idle', color: 'var(--muted)', Icon: Circle }
}

function OutputStream({ label, value, tone }: { label: string; value: string; tone: 'normal' | 'error' }) {
  return (
    <section className={`maly-run-output-panel__stream maly-run-output-panel__stream--${tone}`} style={streamStyle}>
      <div className="maly-run-output-panel__stream-header" style={streamHeaderStyle}>
        <span>{label}</span>
        <span>{value.length.toLocaleString()} chars</span>
      </div>
      <pre
        className="maly-run-output-panel__pre"
        style={{
          ...preStyle,
          border: tone === 'error' ? '1px solid rgba(184, 63, 56, 0.42)' : '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {value}
      </pre>
    </section>
  )
}

export function RunOutputPanel({
  stdout = '',
  stderr = '',
  exitCode,
  runtimeMs,
  running = false,
  title = 'Run output',
  command,
  startedAt,
  finishedAt,
  emptyMessage = 'Run output will appear here.',
  onClear,
  className = '',
}: RunOutputPanelProps) {
  const cleanStdout = stdout.trimEnd()
  const cleanStderr = stderr.trimEnd()
  const hasStdout = cleanStdout.length > 0
  const hasStderr = cleanStderr.length > 0
  const hasOutput = hasStdout || hasStderr
  const runtime = formatRuntime(runtimeMs, startedAt, finishedAt, running)
  const status = getStatus(running, exitCode, hasOutput)
  const StatusIcon = status.Icon

  return (
    <section
      className={['maly-run-output-panel', className].filter(Boolean).join(' ')}
      style={panelStyle}
      aria-label={title}
      aria-busy={running}
      aria-live={running ? 'polite' : 'off'}
    >
      <header className="maly-run-output-panel__header" style={headerStyle}>
        <div className="maly-run-output-panel__title-group" style={titleStyle}>
          <div className="maly-run-output-panel__status" style={{ ...statusStyle, color: status.color }}>
            <StatusIcon aria-hidden="true" size={16} />
            <span>{title}</span>
          </div>
          <div className="maly-run-output-panel__meta" style={metaStyle}>
            <span style={chipStyle}>{status.label}</span>
            <span style={chipStyle}>{typeof exitCode === 'number' ? `Exit ${exitCode}` : 'Exit pending'}</span>
            {runtime ? <span style={chipStyle}>{runtime}</span> : null}
            {command ? <span style={{ ...chipStyle, fontFamily: 'var(--mono)' }}>{command}</span> : null}
          </div>
        </div>
        {onClear ? (
          <button type="button" className="maly-run-output-panel__clear" style={clearButtonStyle} aria-label="Clear run output" onClick={onClear}>
            <X aria-hidden="true" size={17} />
          </button>
        ) : null}
      </header>

      <div className="maly-run-output-panel__body" style={bodyStyle}>
        {hasStdout ? <OutputStream label="stdout" value={cleanStdout} tone="normal" /> : null}
        {hasStderr ? <OutputStream label="stderr" value={cleanStderr} tone="error" /> : null}
        {!hasOutput ? (
          <div className="maly-run-output-panel__empty" style={emptyStyle}>
            <p>{running ? 'Waiting for process output...' : emptyMessage}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default RunOutputPanel
