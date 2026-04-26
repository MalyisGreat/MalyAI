import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommandPaletteAction } from '../types'

type CommandPaletteProps = {
  open: boolean
  actions: CommandPaletteAction[]
  onClose: () => void
}

export function CommandPalette({ open, actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const timeout = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase()
    if (!clean) {
      return actions
    }

    return actions.filter((action) =>
      [action.label, action.description, action.shortcut, ...(action.keywords ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(clean),
    )
  }, [actions, query])

  if (!open) {
    return null
  }

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette__search">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search commands"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close commands">
            <X size={18} />
          </button>
        </div>

        <div className="command-palette__list">
          {filtered.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.destructive ? 'is-destructive' : ''}
              onClick={() => {
                action.run()
                onClose()
              }}
            >
              <span>
                <strong>{action.label}</strong>
                {action.description ? <small>{action.description}</small> : null}
              </span>
              {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default CommandPalette
