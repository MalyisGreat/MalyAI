import type { CSSProperties } from 'react'
import { Check, Copy, Download, MessageSquarePlus, X } from 'lucide-react'
import { useState } from 'react'
import type { CodeArtifact } from '../lib/artifacts'
import { getArtifactDocument, parseAssistantMarkdown } from '../lib/artifacts'

export type ArtifactPanelProps = {
  artifact?: CodeArtifact | null
  artifacts?: CodeArtifact[]
  activeArtifactId?: string | null
  onSelectArtifact?: (artifact: CodeArtifact) => void
  onCloseArtifact?: (artifact: CodeArtifact) => void
  onClosePanel?: () => void
  onSendToChat?: (artifact: CodeArtifact) => void
  onClose?: () => void
  className?: string
}

const MARKDOWN_HEADING_TAGS = ['h2', 'h3', 'h4', 'h5'] as const

function artifactKindLabel(artifact: CodeArtifact) {
  if (artifact.previewKind === 'markdown') {
    return 'Markdown doc'
  }

  return `${artifact.language.toUpperCase()} preview`
}

function artifactStats(artifact: CodeArtifact) {
  return {
    lines: artifact.source.split(/\r?\n/).length,
    chars: artifact.source.length,
  }
}

function artifactExtension(artifact: CodeArtifact) {
  if (artifact.previewKind === 'markdown') return 'md'
  if (artifact.previewKind === 'javascript') return 'js'
  if (artifact.previewKind === 'react') return artifact.language === 'tsx' ? 'tsx' : 'jsx'
  if (artifact.previewKind === 'mermaid') return 'mmd'
  if (artifact.previewKind === 'chart' || artifact.previewKind === 'json') return 'json'
  return artifact.previewKind
}

function artifactFilename(artifact: CodeArtifact) {
  const name = artifact.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'maly-artifact'
  return `${name}.${artifactExtension(artifact)}`
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

function exportArtifact(artifact: CodeArtifact) {
  const blob = new Blob([artifact.source], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = artifactFilename(artifact)
  link.click()
  URL.revokeObjectURL(url)
}

const tabStripStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  minWidth: 0,
  padding: '8px 14px 8px 68px',
  overflowX: 'auto',
  background: 'var(--surface)',
  borderBottom: '1px solid var(--line)',
}

const tabItemStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flex: '0 0 auto',
  maxWidth: 220,
  minWidth: 0,
  overflow: 'hidden',
  border: '1px solid var(--line)',
  borderRadius: 7,
  background: 'var(--surface-2)',
}

const tabButtonBaseStyle: CSSProperties = {
  minWidth: 0,
  height: 30,
  padding: '0 9px',
  overflow: 'hidden',
  color: 'var(--ink)',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  background: 'transparent',
  cursor: 'pointer',
}

const tabCloseStyle: CSSProperties = {
  width: 28,
  height: 28,
  display: 'inline-grid',
  flex: '0 0 auto',
  placeItems: 'center',
  color: 'var(--muted)',
  background: 'transparent',
  cursor: 'pointer',
}

function uniqueArtifacts(artifacts: CodeArtifact[]): CodeArtifact[] {
  const seen = new Set<string>()

  return artifacts.filter((artifact) => {
    if (seen.has(artifact.id)) {
      return false
    }

    seen.add(artifact.id)
    return true
  })
}

function MarkdownPreview({ source }: { source: string }) {
  const segments = parseAssistantMarkdown(source, 'artifact-markdown-preview')

  return (
    <div className="maly-artifact-panel__markdown-body">
      {segments.map((segment) => {
        if (segment.type === 'code') {
          return (
            <pre key={segment.id} className="maly-artifact-panel__markdown-code">
              <code>{segment.content}</code>
            </pre>
          )
        }

        return segment.content
          .split(/\n{2,}/)
          .map((block, index) => {
            const trimmed = block.trim()
            const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
            if (heading) {
              const level = Math.min(heading[1]?.length ?? 3, 4)
              const HeadingTag = MARKDOWN_HEADING_TAGS[level - 1] ?? 'h5'
              return (
                <HeadingTag key={`${segment.id}-${index}`} className="maly-artifact-panel__markdown-heading">
                  {heading[2]}
                </HeadingTag>
              )
            }

            return (
              <p key={`${segment.id}-${index}`} className="maly-artifact-panel__markdown-paragraph">
                {trimmed}
              </p>
            )
          })
      })}
    </div>
  )
}

function ArtifactTabs({
  artifacts,
  activeArtifact,
  onSelectArtifact,
  onCloseArtifact,
}: {
  artifacts: CodeArtifact[]
  activeArtifact: CodeArtifact
  onSelectArtifact?: (artifact: CodeArtifact) => void
  onCloseArtifact?: (artifact: CodeArtifact) => void
}) {
  return (
    <div className="maly-artifact-panel__tabs" role="tablist" aria-label="Artifact previews" style={tabStripStyle}>
      {artifacts.map((tabArtifact) => {
        const active = tabArtifact.id === activeArtifact.id
        const tabId = `${tabArtifact.id}-tab`
        const panelId = `${tabArtifact.id}-panel`

        return (
          <div
            key={tabArtifact.id}
            className={[
              'maly-artifact-panel__tab-item',
              active ? 'maly-artifact-panel__tab-item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              ...tabItemStyle,
              background: active ? 'var(--accent-soft)' : tabItemStyle.background,
              borderColor: active ? 'rgba(20, 107, 95, 0.35)' : 'var(--line)',
            }}
          >
            <button
              type="button"
              id={tabId}
              className="maly-artifact-panel__tab"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              title={tabArtifact.title}
              style={{
                ...tabButtonBaseStyle,
                color: active ? 'var(--accent)' : 'var(--ink)',
                fontWeight: active ? 700 : 500,
              }}
              onClick={() => onSelectArtifact?.(tabArtifact)}
            >
              {tabArtifact.title}
            </button>
            {onCloseArtifact ? (
              <button
                type="button"
                className="maly-artifact-panel__tab-close"
                aria-label={`Close ${tabArtifact.title}`}
                style={tabCloseStyle}
                onClick={() => onCloseArtifact(tabArtifact)}
              >
                <X aria-hidden="true" size={13} />
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function ArtifactPanel({
  artifact,
  artifacts,
  activeArtifactId,
  onSelectArtifact,
  onCloseArtifact,
  onClosePanel,
  onSendToChat,
  onClose,
  className = '',
}: ArtifactPanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const resolvedArtifacts = uniqueArtifacts(artifacts && artifacts.length > 0 ? artifacts : artifact ? [artifact] : [])
  const activeArtifact =
    resolvedArtifacts.find((candidate) => candidate.id === activeArtifactId) ?? resolvedArtifacts[0] ?? null
  const showTabs = resolvedArtifacts.length > 1
  const panelClose = onClosePanel ?? onClose

  return (
    <aside
      className={[
        'maly-artifact-panel',
        activeArtifact ? 'maly-artifact-panel--active' : 'maly-artifact-panel--empty',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={showTabs ? { gridTemplateRows: 'auto auto minmax(0, 1fr)' } : undefined}
      aria-label="Artifact preview"
    >
      <header className="maly-artifact-panel__header">
        <div className="maly-artifact-panel__title-group">
          <p className="maly-artifact-panel__eyebrow">Artifact</p>
          <h2 className="maly-artifact-panel__title">
            {activeArtifact ? activeArtifact.title : 'No preview selected'}
          </h2>
        </div>
        {panelClose ? (
          <button
            type="button"
            className="maly-artifact-panel__close"
            aria-label="Close artifact panel"
            onClick={panelClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        ) : null}
      </header>

      {showTabs && activeArtifact ? (
        <ArtifactTabs
          artifacts={resolvedArtifacts}
          activeArtifact={activeArtifact}
          onSelectArtifact={onSelectArtifact}
          onCloseArtifact={onCloseArtifact}
        />
      ) : null}

      <div
        id={activeArtifact ? `${activeArtifact.id}-panel` : undefined}
        className="maly-artifact-panel__body"
        role={showTabs ? 'tabpanel' : undefined}
        aria-labelledby={showTabs && activeArtifact ? `${activeArtifact.id}-tab` : undefined}
      >
        {activeArtifact ? (
          <>
            <div className="maly-artifact-panel__studio">
              <span className="pill">Artifact Studio</span>
              <span>{artifactKindLabel(activeArtifact)}</span>
              <span>{artifactStats(activeArtifact).lines.toLocaleString()} lines</span>
              <span>{artifactStats(activeArtifact).chars.toLocaleString()} chars</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await copyText(activeArtifact.source)
                    setCopyState('copied')
                    window.setTimeout(() => setCopyState('idle'), 1600)
                  } catch {
                    setCopyState('failed')
                    window.setTimeout(() => setCopyState('idle'), 1600)
                  }
                }}
              >
                {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                {copyState === 'failed' ? 'Copy failed' : copyState === 'copied' ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={() => exportArtifact(activeArtifact)}>
                <Download size={14} />
                Export
              </button>
              {onSendToChat ? (
                <button type="button" onClick={() => onSendToChat(activeArtifact)}>
                  <MessageSquarePlus size={14} />
                  Send to chat
                </button>
              ) : null}
            </div>
            {activeArtifact.previewKind === 'markdown' ? (
              <MarkdownPreview source={activeArtifact.source} />
            ) : (
              <iframe
                key={activeArtifact.id}
                className="maly-artifact-panel__iframe"
                title={activeArtifact.title}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock allow-downloads"
                srcDoc={getArtifactDocument(activeArtifact)}
              />
            )}
          </>
        ) : (
          <div className="maly-artifact-panel__empty-state">
            <p>Render an HTML, SVG, or Markdown code block to preview it here.</p>
          </div>
        )}
      </div>
    </aside>
  )
}

export default ArtifactPanel
