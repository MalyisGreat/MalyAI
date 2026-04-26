import { useMemo, useState } from 'react'
import { Check, GitBranch, Pencil, Plus, Trash2, X } from 'lucide-react'

export type ConversationBranch = {
  id: string
  name: string
  createdAt?: string
  updatedAt?: string
  messageCount?: number
}

export type BranchPanelProps = {
  branches: ConversationBranch[]
  currentBranchId?: string | null
  onSelectBranch: (id: string) => void
  onCreateBranch: (name: string) => void
  onRenameBranch: (id: string, name: string) => void
  onDeleteBranch: (id: string) => void
  onClose?: () => void
  className?: string
}

function branchTime(branch: ConversationBranch) {
  const stamp = branch.updatedAt ?? branch.createdAt
  return stamp ? new Date(stamp).toLocaleString() : 'local branch'
}

export function BranchPanel({
  branches,
  currentBranchId,
  onSelectBranch,
  onCreateBranch,
  onRenameBranch,
  onDeleteBranch,
  onClose,
  className = '',
}: BranchPanelProps) {
  const [createName, setCreateName] = useState('')
  const [renameName, setRenameName] = useState('')
  const currentBranch = useMemo(
    () => branches.find((branch) => branch.id === currentBranchId) ?? branches[0],
    [branches, currentBranchId],
  )

  const createBranch = () => {
    const cleanName = createName.trim()
    if (!cleanName) {
      return
    }

    onCreateBranch(cleanName)
    setCreateName('')
  }

  const renameBranch = () => {
    const cleanName = (renameName || currentBranch?.name || '').trim()
    if (!currentBranch || !cleanName || cleanName === currentBranch.name) {
      return
    }

    onRenameBranch(currentBranch.id, cleanName)
    setRenameName('')
  }

  return (
    <section className={['drawer-panel', className].filter(Boolean).join(' ')} aria-label="Conversation branches">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Branches</p>
          <h2>Current thread</h2>
        </div>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close branches">
            <X size={18} />
          </button>
        ) : null}
      </header>

      <div className="settings-grid">
        <div className="memory-composer" style={{ margin: 0 }}>
          <label className="field">
            <span>New branch</span>
            <input value={createName} placeholder="Branch name" onChange={(event) => setCreateName(event.target.value)} />
          </label>
          <button type="button" className="primary-button" onClick={createBranch} disabled={!createName.trim()}>
            <Plus size={16} />
            Create
          </button>
        </div>

        {currentBranch ? (
          <div className="switch-row">
            <span>
              <strong>{currentBranch.name}</strong>
              <small>{branchTime(currentBranch)}</small>
            </span>
            <label className="field">
              <span>Rename</span>
              <input
                value={renameName || currentBranch.name}
                onChange={(event) => setRenameName(event.target.value)}
              />
            </label>
            <div className="memory-card__actions">
              <button type="button" onClick={renameBranch} disabled={!renameName.trim()}>
                <Check size={15} />
                Save
              </button>
              <button type="button" onClick={() => onDeleteBranch(currentBranch.id)}>
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </div>
        ) : null}

        <div className="memory-list" style={{ padding: 0 }}>
          {branches.length === 0 ? (
            <div className="memory-card">
              <div className="memory-card__meta">
                <GitBranch size={16} />
                <span>No branches</span>
              </div>
              <p>Current-thread branches will appear here.</p>
            </div>
          ) : null}

          {branches.map((branch) => {
            const active = branch.id === currentBranch?.id

            return (
              <button
                type="button"
                key={branch.id}
                className="memory-card"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  setRenameName('')
                  onSelectBranch(branch.id)
                }}
                aria-pressed={active}
              >
                <div className="memory-card__meta">
                  <span className={active ? 'pill' : ''}>
                    <GitBranch size={16} />
                    {active ? 'Current' : 'Branch'}
                  </span>
                  <span>{branch.messageCount ?? 0} messages</span>
                </div>
                <h3>{branch.name}</h3>
                <p>{branchTime(branch)}</p>
              </button>
            )
          })}
        </div>
      </div>

      <footer className="drawer-panel__footer">
        <button type="button" className="secondary-button" onClick={renameBranch} disabled={!currentBranch || !renameName.trim()}>
          <Pencil size={16} />
          Rename
        </button>
      </footer>
    </section>
  )
}

export default BranchPanel
