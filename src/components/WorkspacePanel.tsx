import {
  Bot,
  CheckCircle2,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  GitCompare,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  TestTube2,
  Wand2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  diffWorkspaceFile,
  getWorkspaceTree,
  readWorkspaceFile,
  writeWorkspaceFile,
  type WorkspaceTreeEntry,
} from '../lib/api'

type WorkspacePanelProps = {
  rootPath: string
  fileSystemAllowed?: boolean
  onAttachPrompt?: (prompt: string) => void
  onClose?: () => void
}

type WorkspaceAction = 'explain' | 'summarize' | 'refactor' | 'tests' | 'diff'

function entryLabel(entry: WorkspaceTreeEntry) {
  return entry.relativePath || entry.path || entry.name || '.'
}

function compactPath(value: string) {
  if (!value) {
    return 'No folder selected'
  }

  const parts = value.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 3) {
    return value
  }

  return `...\\${parts.slice(-3).join('\\')}`
}

function formatBytes(value?: number) {
  if (!value) {
    return '0 B'
  }

  if (value > 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`
  }

  if (value > 1024) {
    return `${Math.round(value / 1024)} KB`
  }

  return `${value} B`
}

function estimateTokens(text: string) {
  return Math.max(0, Math.ceil(text.length / 4))
}

function findFirstFile(entry: WorkspaceTreeEntry | null): WorkspaceTreeEntry | null {
  if (!entry) {
    return null
  }

  if (entry.type === 'file') {
    return entry
  }

  for (const child of entry.children ?? []) {
    const found = findFirstFile(child)
    if (found) {
      return found
    }
  }

  return null
}

function findFileByPath(entry: WorkspaceTreeEntry | null, targetPath: string): WorkspaceTreeEntry | null {
  if (!entry) {
    return null
  }

  if (entry.type === 'file' && entryLabel(entry) === targetPath) {
    return entry
  }

  for (const child of entry.children ?? []) {
    const found = findFileByPath(child, targetPath)
    if (found) {
      return found
    }
  }

  return null
}

function filterTree(entry: WorkspaceTreeEntry, query: string): WorkspaceTreeEntry | null {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) {
    return entry
  }

  const label = `${entry.name} ${entry.path} ${entry.relativePath ?? ''}`.toLowerCase()
  const children = (entry.children ?? [])
    .map((child) => filterTree(child, cleanQuery))
    .filter((child): child is WorkspaceTreeEntry => Boolean(child))

  if (label.includes(cleanQuery) || children.length > 0) {
    return { ...entry, children }
  }

  return null
}

function selectedSize(entry: WorkspaceTreeEntry | null, selected: string[]): number {
  if (!entry) {
    return 0
  }

  const label = entryLabel(entry)
  const ownSize = selected.includes(label) ? entry.size ?? 0 : 0
  return ownSize + (entry.children ?? []).reduce((total, child) => total + selectedSize(child, selected), 0)
}

function TreeEntry({
  entry,
  activePath,
  selectedPaths,
  onSelect,
  onToggleSelected,
}: {
  entry: WorkspaceTreeEntry
  activePath: string
  selectedPaths: string[]
  onSelect: (entry: WorkspaceTreeEntry) => void
  onToggleSelected: (entry: WorkspaceTreeEntry) => void
}) {
  const Icon = entry.type === 'directory' ? Folder : FileText
  const label = entryLabel(entry)
  const selected = selectedPaths.includes(label)
  const active = activePath === label

  return (
    <li>
      <div className={['workspace-tree__row', active ? 'is-active' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' ')}>
        <button type="button" className="workspace-tree__item" onClick={() => onSelect(entry)}>
          <Icon size={15} />
          <span>{entry.name || '.'}</span>
        </button>
        {entry.type === 'file' ? (
          <button
            type="button"
            className="workspace-tree__attach"
            onClick={() => onToggleSelected(entry)}
            aria-label={selected ? `Detach ${entry.name}` : `Attach ${entry.name}`}
          >
            {selected ? <CheckCircle2 size={14} /> : <Paperclip size={14} />}
          </button>
        ) : null}
      </div>
      {entry.children && entry.children.length > 0 ? (
        <ul>
          {entry.children.map((child) => (
            <TreeEntry
              key={child.path || child.name}
              entry={child}
              activePath={activePath}
              selectedPaths={selectedPaths}
              onSelect={onSelect}
              onToggleSelected={onToggleSelected}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

const workspaceActions: Array<{
  id: WorkspaceAction
  icon: typeof Sparkles
  title: string
  description: string
}> = [
  { id: 'explain', icon: Bot, title: 'Explain', description: 'Describe the selected file and its role.' },
  { id: 'summarize', icon: Sparkles, title: 'Summarize', description: 'Create a short project note from this file.' },
  { id: 'refactor', icon: Wand2, title: 'Refactor', description: 'Ask for safer cleanup with a reviewable plan.' },
  { id: 'tests', icon: TestTube2, title: 'Generate tests', description: 'Draft focused test coverage for this file.' },
  { id: 'diff', icon: GitCompare, title: 'Preview diff', description: 'Compare editor content with disk.' },
]

export function WorkspacePanel({
  rootPath,
  fileSystemAllowed = false,
  onAttachPrompt,
  onClose,
}: WorkspacePanelProps) {
  const [root, setRoot] = useState(rootPath)
  const [tree, setTree] = useState<WorkspaceTreeEntry | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [filePath, setFilePath] = useState('')
  const [content, setContent] = useState('')
  const [patch, setPatch] = useState('')
  const [status, setStatus] = useState('Workspace ready')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [busy, setBusy] = useState(false)

  const filteredTree = useMemo(() => (tree ? filterTree(tree, query) : null), [query, tree])
  const tokenEstimate = estimateTokens(content)
  const selectedBytes = selectedSize(tree, selectedPaths)
  const lineCount = content ? content.split(/\r?\n/).length : 0

  const loadTree = async () => {
    const cleanRoot = root.trim()
    if (!cleanRoot) {
      return
    }

    setBusy(true)
    setStatus('Indexing workspace...')
    try {
      const response = await getWorkspaceTree({ root: cleanRoot, maxDepth: 5, maxEntries: 1500 })
      setTree(response.tree)
      setRoot(response.root)
      setStatus(response.truncated ? `${response.count ?? 0} items indexed, some hidden` : `${response.count ?? 0} items indexed`)

      const firstFile = findFileByPath(response.tree, 'src/App.tsx') ?? findFirstFile(response.tree)
      if (!filePath && firstFile) {
        const firstPath = entryLabel(firstFile)
        setFilePath(firstPath)
        await readFile(firstPath, response.root)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Workspace index failed')
    } finally {
      setBusy(false)
    }
  }

  const readFile = async (pathOverride = filePath, rootOverride = root) => {
    const cleanPath = pathOverride.trim()
    const cleanRoot = rootOverride.trim()
    if (!cleanRoot || !cleanPath) {
      return
    }

    setBusy(true)
    setStatus('Opening file...')
    try {
      const response = await readWorkspaceFile({ root: cleanRoot, path: cleanPath })
      setFilePath(response.path)
      setContent(response.content)
      setPatch('')
      setViewMode('edit')
      setStatus(`Open: ${response.path}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Read failed')
    } finally {
      setBusy(false)
    }
  }

  const diffFile = async () => {
    const cleanRoot = root.trim()
    const cleanPath = filePath.trim()
    if (!cleanRoot || !cleanPath) {
      return
    }

    setBusy(true)
    setStatus('Checking edits...')
    try {
      const response = await diffWorkspaceFile({ root: cleanRoot, path: cleanPath, content })
      setPatch(response.patch || '(no changes)')
      setStatus(response.changed ? `${response.addedLines ?? 0} added, ${response.removedLines ?? 0} removed` : 'No changes')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Diff failed')
    } finally {
      setBusy(false)
    }
  }

  const writeFile = async () => {
    const cleanRoot = root.trim()
    const cleanPath = filePath.trim()
    if (!cleanRoot || !cleanPath) {
      return
    }

    setBusy(true)
    setStatus('Saving file...')
    try {
      const response = await writeWorkspaceFile({ root: cleanRoot, path: cleanPath, content })
      setStatus(`Wrote ${response.bytesWritten.toLocaleString()} bytes`)
      setPatch('')
      await loadTree()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Write failed')
    } finally {
      setBusy(false)
    }
  }

  const toggleSelected = (entry: WorkspaceTreeEntry) => {
    const label = entryLabel(entry)
    setSelectedPaths((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [label, ...current].slice(0, 12),
    )
  }

  const createNewFile = () => {
    setFilePath('untitled.md')
    setContent('# Untitled\n\n')
    setPatch('')
    setViewMode('edit')
    setStatus('New file staged in editor')
  }

  const attachWorkspaceToChat = () => {
    const paths = selectedPaths.length > 0 ? selectedPaths : filePath ? [filePath] : []
    const prompt = [
      'Use this workspace context.',
      `Root: ${root}`,
      paths.length ? `Selected files:\n${paths.map((path) => `- ${path}`).join('\n')}` : 'No selected files yet.',
      filePath && content ? `\nCurrent file: ${filePath}\n\n\`\`\`\n${content.slice(0, 12000)}\n\`\`\`` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    onAttachPrompt?.(prompt)
    setStatus('Workspace context attached to the composer')
  }

  const runWorkspaceAction = (action: WorkspaceAction) => {
    if (action === 'diff') {
      void diffFile()
      return
    }

    const pathText = selectedPaths.length > 0 ? selectedPaths.join(', ') : filePath || 'the selected workspace file'
    const prompts: Record<Exclude<WorkspaceAction, 'diff'>, string> = {
      explain: `Explain ${pathText} in this workspace. Focus on purpose, dependencies, and risks.`,
      summarize: `Summarize ${pathText} into concise project notes and identify the important implementation details.`,
      refactor: `Review ${pathText} and propose a safe refactor. Include exact changes and a diff-style plan before editing.`,
      tests: `Generate focused tests for ${pathText}. Cover the important behavior and likely regressions.`,
    }

    onAttachPrompt?.(
      [
        prompts[action],
        `Root: ${root}`,
        filePath && content ? `Current file content:\n\n\`\`\`\n${content.slice(0, 14000)}\n\`\`\`` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    )
    setStatus(`${workspaceActions.find((item) => item.id === action)?.title ?? 'Action'} drafted in chat`)
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadTree()
    }, 0)

    return () => window.clearTimeout(loadTimer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="drawer-panel workspace-panel" aria-label="Workspace">
      <header className="drawer-panel__header workspace-panel__header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>{compactPath(root)}</h2>
        </div>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close workspace">
            <X size={18} />
          </button>
        ) : null}
      </header>

      <div className="workspace-shell">
        <div className="workspace-toolbar">
          <label className="workspace-root-field">
            <FolderOpen size={16} />
            <input value={root} aria-label="Project folder" onChange={(event) => setRoot(event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={loadTree} disabled={busy || !root.trim()}>
            <RefreshCw size={15} />
            Open project folder
          </button>
          <label className="workspace-search">
            <Search size={15} />
            <input value={query} placeholder="Search files" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={createNewFile}>
            <Plus size={15} />
            New file
          </button>
          <button type="button" className="primary-button" onClick={attachWorkspaceToChat} disabled={!onAttachPrompt}>
            <Paperclip size={15} />
            Attach selected
          </button>
        </div>

        <div className="workspace-layout">
          <aside className="workspace-pane workspace-pane--tree">
            <div className="workspace-pane__head">
              <span>Files</span>
              <small>{selectedPaths.length} attached</small>
            </div>
            {filteredTree ? (
              <ul className="workspace-tree">
                <TreeEntry
                  entry={filteredTree}
                  activePath={filePath}
                  selectedPaths={selectedPaths}
                  onSelect={(entry) => {
                    if (entry.type === 'file') {
                      const label = entryLabel(entry)
                      setFilePath(label)
                      void readFile(label)
                    }
                  }}
                  onToggleSelected={toggleSelected}
                />
              </ul>
            ) : (
              <p className="empty-copy">Open a project folder to index files.</p>
            )}
          </aside>

          <main className="workspace-pane workspace-pane--editor">
            <div className="workspace-editorbar">
              <label className="workspace-file-field">
                <FileText size={15} />
                <input value={filePath} placeholder="src/App.tsx" onChange={(event) => setFilePath(event.target.value)} />
              </label>
              <div className="segmented segmented--compact">
                <button type="button" className={viewMode === 'edit' ? 'is-active' : ''} onClick={() => setViewMode('edit')}>
                  Edit
                </button>
                <button type="button" className={viewMode === 'preview' ? 'is-active' : ''} onClick={() => setViewMode('preview')}>
                  <Eye size={14} />
                  Preview
                </button>
              </div>
              <button type="button" onClick={() => void readFile()} disabled={busy || !filePath.trim()}>
                Read
              </button>
              <button type="button" onClick={writeFile} disabled={busy || !filePath.trim()}>
                <Save size={14} />
                Save
              </button>
            </div>

            {viewMode === 'edit' ? (
              <textarea
                className="workspace-editor__textarea"
                value={content}
                spellCheck={false}
                onChange={(event) => setContent(event.target.value)}
              />
            ) : (
              <div className="workspace-preview">
                <pre>{content || 'No file loaded.'}</pre>
              </div>
            )}
          </main>

          <aside className="workspace-pane workspace-pane--actions">
            <div className="workspace-pane__head">
              <span>AI actions</span>
              <small>{tokenEstimate.toLocaleString()} tokens</small>
            </div>
            <div className="workspace-action-grid">
              {workspaceActions.map((action) => {
                const Icon = action.icon
                return (
                  <button type="button" key={action.id} onClick={() => runWorkspaceAction(action.id)}>
                    <Icon size={16} />
                    <span>
                      <strong>{action.title}</strong>
                      <small>{action.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="workspace-context-card">
              <div className="workspace-pane__head">
                <span>Context packet</span>
                <small>{formatBytes(selectedBytes)}</small>
              </div>
              {selectedPaths.length > 0 ? (
                <ul>
                  {selectedPaths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">Attach files from the tree or use the current file.</p>
              )}
            </div>

            {patch ? (
              <div className="prompt-preview workspace-diff-preview">
                <div className="prompt-preview__title">
                  <GitCompare size={16} />
                  Diff
                </div>
                <pre>{patch}</pre>
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <footer className="drawer-panel__footer workspace-statusbar">
        <span>{status}</span>
        <span>{fileSystemAllowed ? 'File access enabled' : 'Manual path mode'}</span>
        <span>{lineCount.toLocaleString()} lines</span>
        <span>{content.length.toLocaleString()} chars</span>
        <span>{selectedPaths.length} selected</span>
      </footer>
    </section>
  )
}

export default WorkspacePanel
