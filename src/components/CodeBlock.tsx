import { Check, Copy, Play } from 'lucide-react'
import { useState } from 'react'
import type { CodeArtifact } from '../lib/artifacts'
import { getLanguageLabel } from '../lib/artifacts'

export type CodeBlockProps = {
  code: string
  language?: string
  artifact?: CodeArtifact | null
  selected?: boolean
  onRender?: (artifact: CodeArtifact) => void
  className?: string
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

export function CodeBlock({
  code,
  language,
  artifact,
  selected = false,
  onRender,
  className = '',
}: CodeBlockProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const label = artifact?.label ?? getLanguageLabel(language)
  const canRender = artifact !== null && artifact !== undefined && onRender !== undefined
  const renderActionLabel = selected ? 'Open' : 'Render'

  const handleCopy = async () => {
    try {
      await copyToClipboard(code)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1600)
    } catch {
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 2000)
    }
  }

  const handleRender = () => {
    if (artifact) {
      onRender?.(artifact)
    }
  }

  return (
    <figure
      className={[
        'maly-code-block',
        selected ? 'maly-code-block--selected' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <figcaption className="maly-code-block__header">
        <span className="maly-code-block__language">{label}</span>
        <div className="maly-code-block__actions">
          {canRender ? (
            <button
              type="button"
              className="maly-code-block__action maly-code-block__render"
              aria-label={`${renderActionLabel} ${label} artifact preview`}
              aria-pressed={selected}
              onClick={handleRender}
            >
              <Play aria-hidden="true" size={16} />
              <span>{renderActionLabel}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="maly-code-block__action maly-code-block__copy"
            aria-label={copyState === 'copied' ? 'Copied code' : 'Copy code'}
            onClick={handleCopy}
          >
            {copyState === 'copied' ? (
              <Check aria-hidden="true" size={16} />
            ) : (
              <Copy aria-hidden="true" size={16} />
            )}
            <span>{copyState === 'failed' ? 'Failed' : copyState === 'copied' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </figcaption>
      <pre className="maly-code-block__pre">
        <code className={`language-${language ?? 'plain'}`}>{code}</code>
      </pre>
    </figure>
  )
}

export default CodeBlock
