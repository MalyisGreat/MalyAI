import { AlertTriangle, CheckCircle2, Clock3, Loader2, X } from 'lucide-react'
import type { AgentResult } from '../lib/api'

export type WorkbenchPanelProps = {
  agents: AgentResult[]
  summary?: string
  disagreement?: string
  title?: string
  onClose?: () => void
  className?: string
}

type ShardState = 'pending' | 'running' | 'complete' | 'error'

const shardIndexes = [1, 2, 3] as const

function formatDuration(durationMs?: number) {
  if (!durationMs) {
    return 'live'
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`
  }

  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`
}

function shardState(agent?: AgentResult): ShardState {
  if (!agent) {
    return 'pending'
  }

  if (agent.error) {
    return 'error'
  }

  if (agent.completedAt || agent.content) {
    return 'complete'
  }

  return 'running'
}

function stateIcon(state: ShardState) {
  if (state === 'error') {
    return <AlertTriangle size={16} />
  }

  if (state === 'complete') {
    return <CheckCircle2 size={16} />
  }

  if (state === 'running') {
    return <Loader2 size={16} />
  }

  return <Clock3 size={16} />
}

function stateLabel(state: ShardState) {
  return state === 'pending' ? 'queued' : state
}

function byShard(agents: AgentResult[], shard: number) {
  return agents.find((agent) => agent.shard === shard) ?? agents[shard - 1]
}

function agentBody(agent?: AgentResult) {
  if (!agent) {
    return 'Waiting for shard assignment.'
  }

  if (agent.error) {
    return agent.error
  }

  if (agent.candidate || agent.evidence || agent.checks || agent.risks) {
    return [
      agent.candidate ? `Candidate: ${agent.candidate}` : '',
      agent.evidence ? `Evidence: ${agent.evidence}` : '',
      agent.checks ? `Checks: ${agent.checks}` : '',
      agent.risks ? `Risks: ${agent.risks}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return agent.content || 'Waiting for shard assignment.'
}

export function WorkbenchPanel({
  agents,
  summary,
  disagreement,
  title = 'Qwen workbench',
  onClose,
  className = '',
}: WorkbenchPanelProps) {
  const batchId = agents.find((agent) => agent.batchId)?.batchId ?? 'batch pending'
  const model = agents.find((agent) => agent.model)?.model ?? 'qwen3.5:0.8b'
  const startedAt = agents.find((agent) => agent.parallelStartedAt || agent.startedAt)
  const completed = agents.filter((agent) => shardState(agent) === 'complete').length
  const running = agents.filter((agent) => shardState(agent) === 'running').length

  return (
    <section className={['drawer-panel', className].filter(Boolean).join(' ')} aria-label="Qwen workbench">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Workbench</p>
          <h2>{title}</h2>
        </div>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close workbench">
            <X size={18} />
          </button>
        ) : null}
      </header>

      <div className="settings-grid">
        <div className="switch-row">
          <span>
            <strong>3x Qwen split compute</strong>
            <small>
              {completed}/3 complete
              {running ? ` - ${running} live` : ''}
            </small>
          </span>
          <div className="memory-card__meta">
            <span className="pill">{model}</span>
            <span>{batchId}</span>
            {startedAt?.parallelStartedAt || startedAt?.startedAt ? (
              <span>{new Date(startedAt.parallelStartedAt ?? startedAt.startedAt ?? '').toLocaleTimeString()}</span>
            ) : null}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {shardIndexes.map((shard) => {
            const agent = byShard(agents, shard)
            const state = shardState(agent)
            const body = agentBody(agent)

            return (
              <article key={agent?.instanceId ?? `shard-${shard}`} className="memory-card">
                <div className="memory-card__meta">
                  <span className="pill">
                    {stateIcon(state)}
                    shard {agent?.shard ?? shard}
                  </span>
                  <span>{stateLabel(state)}</span>
                  <span>{formatDuration(agent?.durationMs)}</span>
                  {agent?.round ? <span>round {agent.round}</span> : null}
                  {agent?.confidence ? <span>{agent.confidence}</span> : null}
                </div>
                <h3>{agent?.name ?? `Qwen shard ${shard}`}</h3>
                <p>{body}</p>
                <div className="memory-card__meta">
                  <span>{agent?.instanceId ?? 'qwen-worker'}</span>
                  {agent?.instruction ? <span>{agent.instruction}</span> : null}
                </div>
              </article>
            )
          })}
        </div>

        <div className="switch-row">
          <span>
            <strong>Summary</strong>
            <small>{summary ? 'ready' : 'placeholder'}</small>
          </span>
          <p className="empty-copy">{summary || 'Consensus summary will appear here when the three shards finish.'}</p>
        </div>

        <div className="switch-row">
          <span>
            <strong>Disagreement</strong>
            <small>{disagreement ? 'ready' : 'placeholder'}</small>
          </span>
          <p className="empty-copy">{disagreement || 'Conflicts, gaps, and shard-specific caveats will appear here.'}</p>
        </div>
      </div>
    </section>
  )
}

export default WorkbenchPanel
