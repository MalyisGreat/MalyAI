import { Download, Plus, Trash2, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MemoryRecord, MemoryType } from '../types'
import { createMemory, exportMalyDataJson, importMalyDataJson } from '../lib/storage'

type MemoryPanelProps = {
  memories: MemoryRecord[]
  suggested: MemoryRecord[]
  onChange: (memories: MemoryRecord[]) => void
  onAcceptSuggestion: (memory: MemoryRecord) => void
  onAcceptAllSuggestions: () => void
  onDismissSuggestion: (id: string) => void
  onDismissAllSuggestions: () => void
  onClose: () => void
}

const types: MemoryType[] = ['preference', 'project', 'fact', 'workflow', 'instruction']

function readableDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Now'
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function makeTitle(content: string) {
  return content.trim().split(/[.!?\n]/)[0]?.slice(0, 64) || 'Memory'
}

export function MemoryPanel({
  memories,
  suggested,
  onChange,
  onAcceptSuggestion,
  onAcceptAllSuggestions,
  onDismissSuggestion,
  onDismissAllSuggestions,
  onClose,
}: MemoryPanelProps) {
  const [content, setContent] = useState('')
  const [type, setType] = useState<MemoryType>('preference')
  const [filter, setFilter] = useState('')
  const [importText, setImportText] = useState('')
  const [suggestionDrafts, setSuggestionDrafts] = useState<Record<string, { content: string; type: MemoryType }>>({})

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (!query) {
      return memories
    }

    return memories.filter((memory) =>
      `${memory.title} ${memory.content} ${memory.type} ${memory.tags.join(' ')}`
        .toLowerCase()
        .includes(query),
    )
  }, [filter, memories])

  const addMemory = () => {
    const memory = createMemory({
      title: makeTitle(content),
      content,
      type,
      confidence: 0.86,
      source: 'manual-ui',
    })

    if (!memory) {
      return
    }

    onChange([memory, ...memories])
    setContent('')
  }

  const removeMemory = (id: string) => {
    onChange(memories.filter((memory) => memory.id !== id))
  }

  const exportData = () => {
    const blob = new Blob([exportMalyDataJson({ memories })], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `maly-memories-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importData = () => {
    const imported = importMalyDataJson(importText).memories
    if (!imported) {
      return
    }

    const existingIds = new Set(memories.map((memory) => memory.id))
    onChange([...imported.filter((memory) => !existingIds.has(memory.id)), ...memories])
    setImportText('')
  }

  return (
    <section className="drawer-panel" aria-label="Memories">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Personal context</p>
          <h2>Memory</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close memory">
          <X size={18} />
        </button>
      </header>

      <div className="memory-composer">
        <label className="field">
          <span>Add memory</span>
          <textarea
            value={content}
            rows={3}
            placeholder="User prefers direct, implementation-first answers."
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <div className="memory-composer__row">
          <select value={type} onChange={(event) => setType(event.target.value as MemoryType)}>
            {types.map((memoryType) => (
              <option key={memoryType} value={memoryType}>
                {memoryType}
              </option>
            ))}
          </select>
          <button type="button" className="primary-button" onClick={addMemory} disabled={!content.trim()}>
            <Plus size={16} />
            Add
          </button>
        </div>
      </div>

      {suggested.length > 0 ? (
        <div className="suggestion-stack">
          <div className="memory-card__meta">
            <p className="eyebrow">Review inbox</p>
            <span>{suggested.length} suggestions</span>
          </div>
          <div className="memory-card__actions">
            <button type="button" onClick={onAcceptAllSuggestions}>
              Keep all
            </button>
            <button type="button" onClick={onDismissAllSuggestions}>
              Dismiss all
            </button>
          </div>
          {suggested.map((memory) => (
            <article key={memory.id} className="memory-card memory-card--suggested">
              <div>
                <span className="pill">{suggestionDrafts[memory.id]?.type ?? memory.type}</span>
                <h3>{makeTitle(suggestionDrafts[memory.id]?.content ?? memory.content)}</h3>
              </div>
              <label className="field">
                <span>Edit before keeping</span>
                <textarea
                  rows={3}
                  value={suggestionDrafts[memory.id]?.content ?? memory.content}
                  onChange={(event) =>
                    setSuggestionDrafts((current) => ({
                      ...current,
                      [memory.id]: {
                        content: event.target.value,
                        type: current[memory.id]?.type ?? memory.type,
                      },
                    }))
                  }
                />
              </label>
              <select
                value={suggestionDrafts[memory.id]?.type ?? memory.type}
                onChange={(event) =>
                  setSuggestionDrafts((current) => ({
                    ...current,
                    [memory.id]: {
                      content: current[memory.id]?.content ?? memory.content,
                      type: event.target.value as MemoryType,
                    },
                  }))
                }
              >
                {types.map((memoryType) => (
                  <option key={memoryType} value={memoryType}>
                    {memoryType}
                  </option>
                ))}
              </select>
              <div className="memory-card__actions">
                <button
                  type="button"
                  onClick={() => {
                    const draft = suggestionDrafts[memory.id]
                    const nextContent = draft?.content.trim() || memory.content
                    onAcceptSuggestion({
                      ...memory,
                      type: draft?.type ?? memory.type,
                      title: makeTitle(nextContent),
                      content: nextContent,
                      updatedAt: new Date().toISOString(),
                    })
                    setSuggestionDrafts((current) => {
                      const rest = { ...current }
                      delete rest[memory.id]
                      return rest
                    })
                  }}
                >
                  Keep
                </button>
                <button type="button" onClick={() => onDismissSuggestion(memory.id)}>
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="memory-tools">
        <input
          value={filter}
          placeholder="Filter memories"
          onChange={(event) => setFilter(event.target.value)}
        />
        <button type="button" className="secondary-button" onClick={exportData}>
          <Download size={15} />
          Export
        </button>
      </div>

      <div className="memory-list">
        {filtered.length === 0 ? (
          <p className="empty-copy">No saved memories.</p>
        ) : (
          filtered.map((memory) => (
            <article key={memory.id} className="memory-card">
              <div className="memory-card__meta">
                <span className="pill">{memory.type}</span>
                <span>{Math.round(memory.confidence * 100)}%</span>
                <span>{readableDate(memory.updatedAt)}</span>
              </div>
              <h3>{memory.title}</h3>
              <p>{memory.content}</p>
              <button type="button" className="icon-button" onClick={() => removeMemory(memory.id)} aria-label="Delete memory">
                <Trash2 size={16} />
              </button>
            </article>
          ))
        )}
      </div>

      <details className="import-box">
        <summary>
          <Upload size={15} />
          Import JSON
        </summary>
        <textarea
          value={importText}
          rows={5}
          placeholder='{"memories":[...]}'
          onChange={(event) => setImportText(event.target.value)}
        />
        <button type="button" className="secondary-button" onClick={importData} disabled={!importText.trim()}>
          Import
        </button>
      </details>
    </section>
  )
}

export default MemoryPanel
