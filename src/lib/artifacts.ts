export type ArtifactPreviewKind =
  | 'html'
  | 'svg'
  | 'markdown'
  | 'javascript'
  | 'css'
  | 'json'
  | 'mermaid'
  | 'chart'
  | 'react'

export type MessageTextSegment = {
  id: string
  type: 'text'
  content: string
}

export type CodeArtifact = {
  id: string
  title: string
  language: string
  label: string
  source: string
  previewKind: ArtifactPreviewKind
}

export type MessageCodeSegment = {
  id: string
  type: 'code'
  content: string
  language: string
  label: string
  previewable: boolean
  artifact: CodeArtifact | null
}

export type MessageSegment = MessageTextSegment | MessageCodeSegment

export type AssistantMessageLike = {
  id?: string | number
  role?: string
  content: string
}

const FENCE_START_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const MAX_ARTIFACT_TITLE_LENGTH = 72

const HTML_ALIASES = new Set([
  'html',
  'htm',
  'web',
  'websnippet',
  'web-snippet',
  'website',
  'htmlcssjs',
  'html-css-js',
  'html+css+js',
  'html/css/js',
  'vanilla',
])

const MARKDOWN_ALIASES = new Set(['markdown', 'md', 'mdx'])
const SVG_ALIASES = new Set(['svg', 'image/svg+xml'])
const JAVASCRIPT_ALIASES = new Set(['js', 'javascript', 'mjs', 'cjs', 'browser-js'])
const CSS_ALIASES = new Set(['css', 'stylesheet', 'style'])
const JSON_ALIASES = new Set(['json', 'jsonc'])
const MERMAID_ALIASES = new Set(['mermaid', 'mmd'])
const CHART_ALIASES = new Set(['chart', 'chartjs', 'chart.js', 'vega-lite'])
const REACT_ALIASES = new Set(['react', 'jsx', 'tsx', 'react-jsx', 'react-tsx'])
const SNIFFABLE_MARKUP_LANGUAGES = new Set(['plain', 'text', 'txt', 'markup', 'xml'])

function sanitizeIdPart(value: string): string {
  return (
    value
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 80) || 'message'
  )
}

function normalizeTitleText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_#[\]()>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateTitle(value: string): string {
  if (value.length <= MAX_ARTIFACT_TITLE_LENGTH) {
    return value
  }

  return `${value.slice(0, MAX_ARTIFACT_TITLE_LENGTH - 1).trimEnd()}...`
}

function extractTagText(source: string, tagName: string): string | null {
  const match = source.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  const text = normalizeTitleText(match?.[1] ?? '')
  return text || null
}

function extractMarkdownTitle(source: string): string | null {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || FENCE_START_RE.test(trimmed)) {
      continue
    }

    const heading = trimmed.match(/^#{1,6}\s+(.+)$/)
    const text = normalizeTitleText(heading?.[1] ?? trimmed)
    if (text) {
      return text
    }
  }

  return null
}

export function normalizeCodeLanguage(language?: string): string {
  const trimmed = language?.trim().toLowerCase() ?? ''
  if (!trimmed) {
    return 'plain'
  }

  const firstToken = trimmed.split(/\s+/)[0] ?? ''
  return firstToken.replace(/[{}[\](),:;"']/g, '') || 'plain'
}

export function getLanguageLabel(language?: string): string {
  const normalized = normalizeCodeLanguage(language)
  if (normalized === 'plain' || normalized === 'text' || normalized === 'txt') {
    return 'Text'
  }

  if (HTML_ALIASES.has(normalized)) {
    return 'HTML'
  }

  if (SVG_ALIASES.has(normalized)) {
    return 'SVG'
  }

  if (MARKDOWN_ALIASES.has(normalized)) {
    return 'Markdown'
  }

  if (JAVASCRIPT_ALIASES.has(normalized)) {
    return 'JavaScript'
  }

  if (CSS_ALIASES.has(normalized)) {
    return 'CSS'
  }

  if (JSON_ALIASES.has(normalized)) {
    return 'JSON'
  }

  if (MERMAID_ALIASES.has(normalized)) {
    return 'Mermaid'
  }

  if (CHART_ALIASES.has(normalized)) {
    return 'Chart'
  }

  if (REACT_ALIASES.has(normalized)) {
    return 'React'
  }

  return normalized.toUpperCase()
}

export function deriveArtifactId(
  messageId: string | number | undefined,
  artifactIndex: number,
): string {
  const stableMessageId = sanitizeIdPart(String(messageId ?? 'message'))
  const stableIndex = Number.isFinite(artifactIndex) && artifactIndex >= 0 ? Math.floor(artifactIndex) : 0
  return `${stableMessageId}-artifact-${stableIndex}`
}

export function deriveArtifactTitle(
  source: string,
  language: string | undefined,
  artifactIndex: number,
): string {
  const normalized = normalizeCodeLanguage(language)
  const label = getLanguageLabel(normalized)
  const previewKind = detectPreviewKind(normalized, source)
  const extracted =
    previewKind === 'markdown'
      ? extractMarkdownTitle(source)
      : extractTagText(source, 'title') ?? extractTagText(source, 'h1') ?? extractTagText(source, 'h2')

  if (extracted) {
    return truncateTitle(extracted)
  }

  return `${label} artifact ${artifactIndex + 1}`
}

export function detectPreviewKind(
  language: string | undefined,
  source: string,
): ArtifactPreviewKind | null {
  const normalized = normalizeCodeLanguage(language)
  const compactSource = source.trimStart().toLowerCase()
  const canSniffMarkup = SNIFFABLE_MARKUP_LANGUAGES.has(normalized)

  if (SVG_ALIASES.has(normalized) || (canSniffMarkup && compactSource.startsWith('<svg'))) {
    return 'svg'
  }

  if (MARKDOWN_ALIASES.has(normalized)) {
    return 'markdown'
  }

  if (MERMAID_ALIASES.has(normalized)) {
    return 'mermaid'
  }

  if (CHART_ALIASES.has(normalized)) {
    return 'chart'
  }

  if (REACT_ALIASES.has(normalized)) {
    return 'react'
  }

  if (JSON_ALIASES.has(normalized) || (canSniffMarkup && (compactSource.startsWith('{') || compactSource.startsWith('[')))) {
    return 'json'
  }

  if (JAVASCRIPT_ALIASES.has(normalized)) {
    return 'javascript'
  }

  if (CSS_ALIASES.has(normalized)) {
    return 'css'
  }

  if (
    HTML_ALIASES.has(normalized) ||
    (canSniffMarkup &&
      (compactSource.startsWith('<!doctype html') ||
        compactSource.startsWith('<html') ||
        /<(body|main|section|article|style|script|div|canvas|svg)\b/i.test(source)))
  ) {
    return 'html'
  }

  return null
}

export function isPreviewableCode(language: string | undefined, source: string): boolean {
  return detectPreviewKind(language, source) !== null
}

export function createCodeArtifact(
  source: string,
  language: string | undefined,
  artifactIndex: number,
  messageId = 'message',
): CodeArtifact | null {
  const previewKind = detectPreviewKind(language, source)
  if (!previewKind) {
    return null
  }

  const normalized = normalizeCodeLanguage(language)
  const label = getLanguageLabel(normalized)

  return {
    id: deriveArtifactId(messageId, artifactIndex),
    title: deriveArtifactTitle(source, normalized, artifactIndex),
    language: normalized,
    label,
    source,
    previewKind,
  }
}

export function parseAssistantMarkdown(
  markdown: string,
  messageId = 'message',
): MessageSegment[] {
  const segments: MessageSegment[] = []
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let textBuffer: string[] = []
  let codeBuffer: string[] = []
  let fenceMarker = ''
  let fenceSize = 0
  let language = ''
  let inFence = false
  let codeIndex = 0

  const flushText = () => {
    if (textBuffer.length === 0) {
      return
    }

    const content = textBuffer.join('\n')
    if (content.length > 0) {
      segments.push({
        id: `${messageId}-text-${segments.length}`,
        type: 'text',
        content,
      })
    }
    textBuffer = []
  }

  const flushCode = () => {
    const content = codeBuffer.join('\n')
    const normalizedLanguage = normalizeCodeLanguage(language)
    const artifact = createCodeArtifact(content, normalizedLanguage, codeIndex, messageId)

    segments.push({
      id: `${messageId}-code-${codeIndex}`,
      type: 'code',
      content,
      language: normalizedLanguage,
      label: getLanguageLabel(normalizedLanguage),
      previewable: artifact !== null,
      artifact,
    })

    codeIndex += 1
    codeBuffer = []
    language = ''
    fenceMarker = ''
    fenceSize = 0
  }

  for (const line of lines) {
    if (!inFence) {
      const start = line.match(FENCE_START_RE)
      if (start) {
        flushText()
        fenceMarker = start[1]?.charAt(0) ?? '`'
        fenceSize = start[1]?.length ?? 3
        language = start[2]?.trim() ?? ''
        inFence = true
        continue
      }

      textBuffer.push(line)
      continue
    }

    const trimmed = line.trim()
    const closesFence =
      trimmed.startsWith(fenceMarker.repeat(fenceSize)) &&
      [...trimmed].every((char) => char === fenceMarker)

    if (closesFence) {
      flushCode()
      inFence = false
      continue
    }

    codeBuffer.push(line)
  }

  if (inFence) {
    flushCode()
  } else {
    flushText()
  }

  return segments
}

export function getArtifactsFromSegments(segments: MessageSegment[]): CodeArtifact[] {
  return segments.flatMap((segment) => {
    if (segment.type === 'code' && segment.artifact) {
      return [segment.artifact]
    }

    return []
  })
}

export function getArtifactsFromMarkdown(markdown: string, messageId = 'message'): CodeArtifact[] {
  return getArtifactsFromSegments(parseAssistantMarkdown(markdown, messageId))
}

export function getArtifactDocument(artifact: CodeArtifact): string {
  if (artifact.previewKind === 'json') {
    const escaped = artifact.source
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; padding: 18px; color: #1e1d1a; background: #fffdf8; }
    pre { margin: 0; white-space: pre-wrap; font: 13px/1.6 "Cascadia Code", Consolas, monospace; }
  </style>
</head>
<body><pre>${escaped}</pre></body>
</html>`
  }

  if (artifact.previewKind === 'mermaid') {
    const encoded = JSON.stringify(artifact.source)
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>body { margin: 0; padding: 24px; background: #fffdf8; }</style>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    const source = ${encoded};
    try {
      const { svg } = await mermaid.render('maly-mermaid', source);
      document.body.innerHTML = svg;
    } catch (error) {
      document.body.innerHTML = '<pre style="color:#b83f38;white-space:pre-wrap"></pre>';
      document.querySelector('pre').textContent = error?.message || 'Mermaid render failed';
    }
  </script>
</head>
<body></body>
</html>`
  }

  if (artifact.previewKind === 'chart') {
    const encoded = JSON.stringify(artifact.source)
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.min.js"></script>
  <style>html, body { height: 100%; margin: 0; background: #fffdf8; } body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; } canvas { max-width: 100%; max-height: 100%; }</style>
</head>
<body>
  <canvas id="chart"></canvas>
  <script>
    const source = ${encoded};
    try {
      const config = JSON.parse(source);
      new Chart(document.getElementById('chart'), config);
    } catch (error) {
      document.body.innerHTML = '<pre style="color:#b83f38;white-space:pre-wrap"></pre>';
      document.querySelector('pre').textContent = error?.message || 'Chart render failed. Use a Chart.js JSON config.';
    }
  </script>
</body>
</html>`
  }

  if (artifact.previewKind === 'react') {
    const safeSource = artifact.source.replace(/<\/script/gi, '<\\/script')
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>html, body, #root { min-height: 100%; margin: 0; } body { background: #fffdf8; font-family: Aptos, Segoe UI, sans-serif; }</style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.addEventListener('error', (event) => {
      document.body.innerHTML += '<pre style="position:fixed;inset:auto 12px 12px 12px;color:#fff;background:#b83f38;padding:10px;border-radius:8px;white-space:pre-wrap"></pre>';
      document.querySelector('pre:last-child').textContent = event.message || 'React preview failed';
    });
  </script>
  <script type="text/babel" data-presets="env,react,typescript">
${safeSource}
  </script>
</body>
</html>`
  }

  if (artifact.previewKind === 'javascript') {
    const safeSource = artifact.source.replace(/<\/script/gi, '<\\/script')
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { min-height: 100%; margin: 0; background: #ffffff; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #maly-preview-root:empty::before {
      content: "JavaScript preview running. Use document.body, canvas, or #maly-preview-root to render UI.";
      display: grid;
      min-height: 100vh;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
      color: #706d65;
      text-align: center;
    }
    #maly-preview-error {
      position: fixed;
      inset: auto 12px 12px 12px;
      padding: 10px 12px;
      color: #fff;
      background: #b83f38;
      border-radius: 8px;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
      white-space: pre-wrap;
      z-index: 9999;
    }
  </style>
</head>
<body>
  <div id="maly-preview-root"></div>
  <script>
    window.addEventListener('error', (event) => {
      const box = document.createElement('pre');
      box.id = 'maly-preview-error';
      box.textContent = event.message || 'Preview script failed';
      document.body.appendChild(box);
    });
  </script>
  <script type="module">
${safeSource}
  </script>
</body>
</html>`
  }

  if (artifact.previewKind === 'css') {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
${artifact.source}
  </style>
</head>
<body>
  <main class="preview-page">
    <section class="card">
      <p class="eyebrow">CSS Preview</p>
      <h1>Styles are loaded</h1>
      <p>This sample surface lets you inspect typography, spacing, color, buttons, forms, and cards from the CSS block.</p>
      <div class="actions">
        <button>Primary</button>
        <button class="secondary">Secondary</button>
      </div>
      <label>
        <span>Input</span>
        <input value="Preview text" />
      </label>
    </section>
  </main>
</body>
</html>`
  }

  if (artifact.previewKind === 'svg') {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { height: 100%; margin: 0; background: #ffffff; }
    body { display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    svg { max-width: 100%; max-height: 100%; }
  </style>
</head>
<body>
${artifact.source}
</body>
</html>`
  }

  const source = artifact.source.trimStart()
  if (/^<!doctype html/i.test(source) || /^<html[\s>]/i.test(source)) {
    return artifact.source
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { min-height: 100%; margin: 0; }
    body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
</head>
<body>
${artifact.source}
</body>
</html>`
}
