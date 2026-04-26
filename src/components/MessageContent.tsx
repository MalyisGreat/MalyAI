import { CodeBlock } from './CodeBlock'
import type {
  AssistantMessageLike,
  CodeArtifact,
  MessageSegment,
  MessageTextSegment,
} from '../lib/artifacts'
import { parseAssistantMarkdown } from '../lib/artifacts'

export type MessageContentProps = {
  content?: string
  message?: AssistantMessageLike
  segments?: MessageSegment[]
  selectedArtifactId?: string | null
  onArtifactSelect?: (artifact: CodeArtifact) => void
  className?: string
}

type InlineToken = {
  kind: 'text' | 'code' | 'strong' | 'link'
  content: string
  href?: string
}

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g
const MESSAGE_HEADING_TAGS = ['h3', 'h4', 'h5', 'h6'] as const

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let lastIndex = 0

  for (const match of text.matchAll(INLINE_RE)) {
    if (match.index === undefined) {
      continue
    }

    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', content: text.slice(lastIndex, match.index) })
    }

    const value = match[0]
    if (value.startsWith('`')) {
      tokens.push({ kind: 'code', content: value.slice(1, -1) })
    } else if (value.startsWith('**')) {
      tokens.push({ kind: 'strong', content: value.slice(2, -2) })
    } else {
      const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (link) {
        tokens.push({ kind: 'link', content: link[1] ?? '', href: link[2] ?? '' })
      }
    }

    lastIndex = match.index + value.length
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: 'text', content: text.slice(lastIndex) })
  }

  return tokens
}

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token, index) => {
        const key = `${token.kind}-${index}`
        if (token.kind === 'code') {
          return <code key={key}>{token.content}</code>
        }

        if (token.kind === 'strong') {
          return <strong key={key}>{token.content}</strong>
        }

        if (token.kind === 'link' && token.href) {
          return (
            <a key={key} href={token.href} target="_blank" rel="noreferrer">
              {token.content}
            </a>
          )
        }

        return <span key={key}>{token.content}</span>
      })}
    </>
  )
}

function isUnorderedList(lines: string[]) {
  return lines.every((line) => /^[-*]\s+/.test(line.trim()))
}

function isOrderedList(lines: string[]) {
  return lines.every((line) => /^\d+[.)]\s+/.test(line.trim()))
}

function renderParagraphLines(lines: string[], key: string) {
  const text = lines.join('\n').trim()
  if (!text) {
    return null
  }

  const heading = text.match(/^(#{1,4})\s+(.+)$/)
  if (heading) {
    const level = Math.min(heading[1]?.length ?? 3, 4)
    const content = heading[2] ?? ''
    const HeadingTag = MESSAGE_HEADING_TAGS[level - 1] ?? 'h6'
    return (
      <HeadingTag key={key} className="maly-message-content__heading">
        <InlineText text={content} />
      </HeadingTag>
    )
  }

  if (lines.every((line) => line.trim().startsWith('>'))) {
    return (
      <blockquote key={key} className="maly-message-content__quote">
        {lines.map((line) => line.replace(/^>\s?/, '')).join('\n')}
      </blockquote>
    )
  }

  if (isUnorderedList(lines)) {
    return (
      <ul key={key} className="maly-message-content__list">
        {lines.map((line, index) => (
          <li key={`${key}-item-${index}`}>
            <InlineText text={line.trim().replace(/^[-*]\s+/, '')} />
          </li>
        ))}
      </ul>
    )
  }

  if (isOrderedList(lines)) {
    return (
      <ol key={key} className="maly-message-content__list">
        {lines.map((line, index) => (
          <li key={`${key}-item-${index}`}>
            <InlineText text={line.trim().replace(/^\d+[.)]\s+/, '')} />
          </li>
        ))}
      </ol>
    )
  }

  return (
    <p key={key} className="maly-message-content__paragraph">
      <InlineText text={text} />
    </p>
  )
}

function TextSegment({ segment }: { segment: MessageTextSegment }) {
  const blocks = segment.content.split(/\n{2,}/)

  return (
    <>
      {blocks.map((block, index) => {
        const lines = block.split('\n').filter((line) => line.trim().length > 0)
        return renderParagraphLines(lines, `${segment.id}-block-${index}`)
      })}
    </>
  )
}

export function MessageContent({
  content,
  message,
  segments,
  selectedArtifactId,
  onArtifactSelect,
  className = '',
}: MessageContentProps) {
  const messageId = String(message?.id ?? 'message')
  const resolvedContent = content ?? message?.content ?? ''
  const resolvedSegments = segments ?? parseAssistantMarkdown(resolvedContent, messageId)

  return (
    <div className={['maly-message-content', className].filter(Boolean).join(' ')}>
      {resolvedSegments.map((segment) => {
        if (segment.type === 'text') {
          return <TextSegment key={segment.id} segment={segment} />
        }

        return (
          <CodeBlock
            key={segment.id}
            code={segment.content}
            language={segment.language}
            artifact={segment.artifact}
            selected={segment.artifact?.id === selectedArtifactId}
            onRender={onArtifactSelect}
          />
        )
      })}
    </div>
  )
}

export default MessageContent
