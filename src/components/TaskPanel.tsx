import { useState } from 'react'
import { CheckCircle2, Circle, ClipboardCheck, Loader2, Plus, X } from 'lucide-react'

export type TaskStatus = 'pending' | 'waiting_idle' | 'running' | 'paused' | 'done' | 'failed'

export type TaskPanelTask = {
  id: string
  title: string
  status: TaskStatus
  evidence?: string
}

export type TaskPanelProps = {
  tasks: TaskPanelTask[]
  onAddTask: (task: { title: string; status: TaskStatus; evidence?: string }) => void
  onUpdateTask: (id: string, patch: Partial<Omit<TaskPanelTask, 'id'>>) => void
  onClose?: () => void
  className?: string
}

const statuses = ['pending', 'waiting_idle', 'running', 'paused', 'done', 'failed'] as const

function statusIcon(status: TaskStatus) {
  if (status === 'done') {
    return <CheckCircle2 size={16} />
  }

  if (status === 'running') {
    return <Loader2 size={16} />
  }

  if (status === 'failed') {
    return <X size={16} />
  }

  return <Circle size={16} />
}

function titleCase(value: string) {
  return value.replace('_', ' ').replace(/^\w/, (letter) => letter.toUpperCase())
}

export function TaskPanel({ tasks, onAddTask, onUpdateTask, onClose, className = '' }: TaskPanelProps) {
  const [title, setTitle] = useState('')
  const [evidence, setEvidence] = useState('')

  const submitTask = () => {
    const cleanTitle = title.trim()
    const cleanEvidence = evidence.trim()

    if (!cleanTitle) {
      return
    }

    onAddTask({ title: cleanTitle, status: 'pending', evidence: cleanEvidence || undefined })
    setTitle('')
    setEvidence('')
  }

  return (
    <section className={['drawer-panel', className].filter(Boolean).join(' ')} aria-label="Task checklist">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>Planner checklist</h2>
        </div>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close tasks">
            <X size={18} />
          </button>
        ) : null}
      </header>

      <div className="settings-grid">
        <div className="task-dashboard">
          {statuses.map((status) => (
            <article key={status} className="resource-card">
              <div className="memory-card__meta">
                <span className="pill">{titleCase(status)}</span>
              </div>
              <h3>{tasks.filter((task) => task.status === status).length}</h3>
              <p>{status === 'waiting_idle' ? 'Waiting for idle GPU/backend time' : 'Tracked plan work'}</p>
            </article>
          ))}
        </div>

        <div className="memory-composer" style={{ margin: 0 }}>
          <label className="field">
            <span>Task</span>
            <input value={title} placeholder="Add task" onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="field">
            <span>Evidence</span>
            <textarea
              value={evidence}
              rows={3}
              placeholder="Artifact, command, URL, or note"
              onChange={(event) => setEvidence(event.target.value)}
            />
          </label>
          <button type="button" className="primary-button" onClick={submitTask} disabled={!title.trim()}>
            <Plus size={16} />
            Add task
          </button>
        </div>

        <div className="memory-list" style={{ padding: 0 }}>
          {tasks.length === 0 ? (
            <div className="memory-card">
              <div className="memory-card__meta">
                <ClipboardCheck size={16} />
                <span>No tasks</span>
              </div>
              <p>Checklist rows will appear here.</p>
            </div>
          ) : null}

          {tasks.map((task) => (
            <article key={task.id} className="memory-card">
              <div className="memory-card__meta">
                <span className="pill">
                  {statusIcon(task.status)}
                  {titleCase(task.status)}
                </span>
              </div>

              <label className="field">
                <span>Title</span>
                <input
                  value={task.title}
                  onChange={(event) => onUpdateTask(task.id, { title: event.target.value })}
                />
              </label>

              <div className="field">
                <span>Status</span>
                <div className="segmented segmented--compact">
                  {statuses.map((status) => (
                    <button
                      type="button"
                      key={status}
                      className={task.status === status ? 'is-active' : ''}
                      onClick={() => onUpdateTask(task.id, { status })}
                    >
                      {titleCase(status)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="field">
                <span>Evidence</span>
                <textarea
                  value={task.evidence ?? ''}
                  rows={3}
                  onChange={(event) => onUpdateTask(task.id, { evidence: event.target.value })}
                />
              </label>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default TaskPanel
