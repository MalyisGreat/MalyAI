import {
  Bot,
  BriefcaseBusiness,
  Brain,
  ClipboardCheck,
  Code2,
  Download,
  FileText,
  FolderOpen,
  GitBranch,
  Globe2,
  Image as ImageIcon,
  Menu,
  MessageSquarePlus,
  PanelRightClose,
  Paperclip,
  Pause,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArtifactPanel } from './components/ArtifactPanel'
import { BranchPanel, type ConversationBranch } from './components/BranchPanel'
import { CommandPalette } from './components/CommandPalette'
import { GoogleWorkspacePanel } from './components/GoogleWorkspacePanel'
import { MemoryPanel } from './components/MemoryPanel'
import { MessageContent } from './components/MessageContent'
import { SettingsPanel } from './components/SettingsPanel'
import { TaskPanel, type TaskPanelTask } from './components/TaskPanel'
import { TemplatePanel } from './components/TemplatePanel'
import { ToolsPanel } from './components/ToolsPanel'
import { WorkbenchPanel } from './components/WorkbenchPanel'
import { WorkspacePanel } from './components/WorkspacePanel'
import type { CodeArtifact } from './lib/artifacts'
import {
  getHealth,
  postMemory,
  streamChat,
  type AgentResult,
  type ApiChatMessage,
  type ChatContextEvent,
  type StoredBackendMemory,
} from './lib/api'
import {
  DEFAULT_USER_SETTINGS,
  createPersonalizationPrompt,
  loadMemories,
  loadUserSettings,
  saveMemories,
  saveUserSettings,
} from './lib/storage'
import type { CommandPaletteAction, MemoryRecord, MemoryType, UserSettings } from './types'
import './App.css'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  attachments?: ChatAttachment[]
  pending?: boolean
  error?: string
  context?: ChatContextEvent
}

type ChatAttachment = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: 'image' | 'text' | 'file'
  text?: string
  dataUrl?: string
  base64?: string
}

type Drawer =
  | 'settings'
  | 'memory'
  | 'workbench'
  | 'tasks'
  | 'branches'
  | 'templates'
  | 'workspace'
  | 'tools'
  | 'google'
  | null

type ChatBranch = ConversationBranch & {
  messages: ChatMessage[]
}

const promptChips = [
  'Search the web and summarize the best sources on...',
  'Spawn the 3 Qwen shards at the same time and compare:',
  'Write a clean HTML/CSS demo for a pricing card.',
  'Create a task checklist and split the work into branches.',
  'Connect Google Workspace and summarize my day.',
  'Remember that I prefer direct engineering answers.',
  'Write JavaScript I can run in the guarded code runner.',
]

const memoryTypes = new Set<MemoryType>(['preference', 'project', 'fact', 'workflow', 'instruction'])
const chatModelPresets = [
  { label: 'Auto', model: 'auto', fallbackModel: 'qwen3.5:0.8b', modePreset: 'balanced' },
  { label: 'Fast', model: 'qwen3.5:0.8b', fallbackModel: 'qwen3.5:0.8b', modePreset: 'fast' },
  { label: 'Smarter', model: 'qwen3.5:2b', fallbackModel: 'qwen3.5:0.8b', modePreset: 'balanced' },
  { label: 'Deep', model: 'qwen3.5:4b', fallbackModel: 'qwen3.5:2b', modePreset: 'deep' },
] as const

function makeId(prefix: string) {
  const random =
    typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  return `${prefix}-${random}`
}

function titleFromText(text: string) {
  return text.trim().split(/[.!?\n]/)[0]?.slice(0, 70) || 'Memory'
}

function backendMemoryToRecord(memory: StoredBackendMemory): MemoryRecord | null {
  const content = memory.text?.trim()
  if (!content) {
    return null
  }

  const type = memoryTypes.has(memory.type as MemoryType) ? (memory.type as MemoryType) : 'fact'
  const now = new Date().toISOString()

  return {
    id: memory.id || makeId('mem'),
    title: titleFromText(content),
    content,
    type,
    confidence: Math.min(1, Math.max(0, Number(memory.confidence) || 0.78)),
    tags: memory.source ? [memory.source] : [],
    source: memory.source,
    createdAt: memory.createdAt || now,
    updatedAt: now,
  }
}

function transcript(messages: ChatMessage[]) {
  return messages
    .map((message) => {
      const attachmentList = message.attachments?.length
        ? `\n\nAttachments:\n${message.attachments.map((attachment) => `- ${attachment.name} (${attachment.mimeType || attachment.kind}, ${formatAttachmentSize(attachment.size)})`).join('\n')}`
        : ''
      return `## ${message.role === 'user' ? 'You' : 'Maly AI'}\n\n${message.content.trim()}${attachmentList}`
    })
    .join('\n\n')
}

function exportTextFile(filename: string, content: string, type = 'text/markdown') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function formatAttachmentSize(size: number) {
  if (size > 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  if (size > 1024) {
    return `${Math.round(size / 1024)} KB`
  }

  return `${size} B`
}

function isTextAttachment(file: File) {
  if (file.type.startsWith('text/')) {
    return true
  }

  return /\.(c|cpp|cs|css|csv|go|h|html|java|js|json|jsx|log|md|mdx|py|rb|rs|sql|svg|ts|tsx|txt|xml|yaml|yml)$/i.test(file.name)
}

function base64FromDataUrl(dataUrl: string) {
  return dataUrl.split(',')[1] ?? ''
}

function formatAttachmentsForPrompt(attachments: ChatAttachment[]) {
  if (attachments.length === 0) {
    return ''
  }

  const sections = attachments.map((attachment, index) => {
    const header = `Attachment ${index + 1}: ${attachment.name} (${attachment.mimeType || attachment.kind}, ${formatAttachmentSize(attachment.size)})`
    if (attachment.kind === 'text' && attachment.text) {
      if (attachment.text.length > 60000) {
        const head = attachment.text.slice(0, 22000)
        const middleStart = Math.max(0, Math.floor(attachment.text.length / 2) - 8000)
        const middle = attachment.text.slice(middleStart, middleStart + 16000)
        const tail = attachment.text.slice(-22000)
        return [
          header,
          'Huge file/context attached. Summarize the file first, then answer from the summary plus these representative excerpts.',
          `Original characters: ${attachment.text.length.toLocaleString()}`,
          `\nHead excerpt:\n\`\`\`\n${head}\n\`\`\``,
          `\nMiddle excerpt:\n\`\`\`\n${middle}\n\`\`\``,
          `\nTail excerpt:\n\`\`\`\n${tail}\n\`\`\``,
        ].join('\n\n')
      }

      return `${header}\n\n\`\`\`\n${attachment.text}\n\`\`\``
    }

    if (attachment.kind === 'image') {
      return `${header}\nImage attached. If the active local model supports vision, inspect the image directly. If it is a text-only model, say that image pixels cannot be inspected and work from the filename/context.`
    }

    return `${header}\nBinary or unsupported text extraction. Ask for a text export if exact contents are needed.`
  })

  return `Attached files:\n\n${sections.join('\n\n')}`
}

function compactMessages(messages: ChatMessage[]): ApiChatMessage[] {
  return messages
    .filter((message) => message.content.trim() || (message.attachments?.length ?? 0) > 0)
    .slice(-80)
    .map((message) => {
      const attachmentContext = message.role === 'user' ? formatAttachmentsForPrompt(message.attachments ?? []) : ''
      const images =
        message.role === 'user'
          ? (message.attachments ?? [])
              .filter((attachment) => attachment.kind === 'image' && attachment.base64)
              .map((attachment) => attachment.base64 as string)
          : []

      return {
        role: message.role,
        content: [message.content, attachmentContext].filter(Boolean).join('\n\n'),
        ...(images.length > 0 ? { images } : {}),
      }
    })
}

function SearchResults({ context }: { context?: ChatContextEvent }) {
  const results = context?.search?.results ?? []
  if (results.length === 0 && !context?.search?.error) {
    return null
  }

  return (
    <div className="message-context">
      <div className="message-context__label">
        <Search size={14} />
        Web search
      </div>
      {context?.search?.error ? <p>{context.search.error}</p> : null}
      {results.slice(0, 6).map((result) => {
        let host: string
        try {
          host = new URL(result.url).hostname
        } catch {
          host = result.url
        }

        return (
          <a href={result.url} target="_blank" rel="noreferrer" key={result.url}>
            <span>{result.title}</span>
            <small>{host}</small>
            {result.snippet ? <p>{result.snippet}</p> : null}
          </a>
        )
      })}
    </div>
  )
}

function AgentOutputs({ agents }: { agents?: AgentResult[] }) {
  if (!agents || agents.length === 0) {
    return null
  }

  const batchId = agents.find((agent) => agent.batchId)?.batchId
  const model = agents.find((agent) => agent.model)?.model ?? 'qwen3.5:0.8b'
  const startedAt = agents.find((agent) => agent.parallelStartedAt)?.parallelStartedAt
  const summaryText = (agent: AgentResult) => {
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

    return agent.content || ''
  }

  return (
    <div className="agent-strip">
      <div className="agent-strip__header">
        <span>
          <Bot size={14} />
          3x Qwen split compute
        </span>
        <small>
          {model}
          {batchId ? ` - ${batchId}` : ''}
        </small>
      </div>
      {agents.map((agent) => (
        <details key={agent.instanceId ?? agent.name}>
          <summary>
            <span>
              <Bot size={14} />
              {agent.name}
            </span>
            <small>
              shard {agent.shard ?? '?'} of {agent.totalShards ?? agents.length}
              {agent.round ? ` - round ${agent.round}` : ''}
              {agent.durationMs ? ` - ${(agent.durationMs / 1000).toFixed(1)}s` : ''}
              {agent.confidence ? ` - ${agent.confidence}` : ''}
            </small>
          </summary>
          <div className="agent-strip__meta">
            <span>{agent.instanceId ?? 'qwen-worker'}</span>
            {startedAt ? <span>launched together {new Date(startedAt).toLocaleTimeString()}</span> : null}
          </div>
          <p>{summaryText(agent)}</p>
        </details>
      ))}
    </div>
  )
}

function AttachmentStack({ attachments }: { attachments?: ChatAttachment[] }) {
  if (!attachments || attachments.length === 0) {
    return null
  }

  return (
    <div className="attachment-stack">
      {attachments.map((attachment) => {
        const Icon = attachment.kind === 'image' ? ImageIcon : FileText
        return (
          <div key={attachment.id} className="attachment-card">
            {attachment.kind === 'image' && attachment.dataUrl ? (
              <img src={attachment.dataUrl} alt={attachment.name} />
            ) : (
              <div className="attachment-card__icon">
                <Icon size={18} />
              </div>
            )}
            <span>
              <strong>{attachment.name}</strong>
              <small>{attachment.kind} - {formatAttachmentSize(attachment.size)}</small>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings())
  const [memories, setMemories] = useState<MemoryRecord[]>(() => loadMemories())
  const [suggestedMemories, setSuggestedMemories] = useState<MemoryRecord[]>([])
  const [selectedArtifact, setSelectedArtifact] = useState<CodeArtifact | null>(null)
  const [artifacts, setArtifacts] = useState<CodeArtifact[]>([])
  const [artifactOpen, setArtifactOpen] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [searchEnabled, setSearchEnabled] = useState(() => settings.defaultSearchMode !== 'off')
  const [agentsEnabled, setAgentsEnabled] = useState(() => settings.subagentMode === 'auto')
  const [memoryEnabled, setMemoryEnabled] = useState(() => settings.memoryMode !== 'off')
  const [lastAgents, setLastAgents] = useState<AgentResult[]>([])
  const [tasks, setTasks] = useState<TaskPanelTask[]>([])
  const [branches, setBranches] = useState<ChatBranch[]>(() => [
    {
      id: 'branch-main',
      name: 'Main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      messages: [],
    },
  ])
  const [currentBranchId, setCurrentBranchId] = useState('branch-main')
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState(settings.modelSettings.model || 'qwen3.5:0.8b')
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getHealth()
      .then((health) => {
        setStatus(
          health.ollama?.ok
            ? `${settings.modelSettings.model || 'qwen3.5:0.8b'} - Ollama ${health.ollama.version ?? 'ready'}`
            : 'Ollama unavailable',
        )
      })
      .catch(() => setStatus('API offline'))
  }, [settings.modelSettings.model])

  useEffect(() => {
    const updatedAt = new Date().toISOString()
    setBranches((current) =>
      current.map((branch) =>
        branch.id === currentBranchId
          ? { ...branch, messages, messageCount: messages.length, updatedAt }
          : branch,
      ),
    )
  }, [currentBranchId, messages])

  useEffect(() => {
    saveUserSettings(settings)
  }, [settings])

  useEffect(() => {
    saveMemories(memories)
  }, [memories])

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const personalization = useMemo(
    () => createPersonalizationPrompt(settings, memoryEnabled ? memories : []),
    [memories, memoryEnabled, settings],
  )

  const updateMessage = (id: string, updater: (message: ChatMessage) => ChatMessage) => {
    setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)))
  }

  const addAttachments = async (files: FileList | File[]) => {
    const incoming = Array.from(files).slice(0, 12)
    if (incoming.length === 0) {
      return
    }

    const loaded = await Promise.all(
      incoming.map(async (file): Promise<ChatAttachment> => {
        const id = makeId('attachment')
        if (file.type.startsWith('image/')) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => reject(reader.error ?? new Error('Image read failed'))
            reader.readAsDataURL(file)
          })

          return {
            id,
            name: file.name,
            mimeType: file.type || 'image/*',
            size: file.size,
            kind: 'image',
            dataUrl,
            base64: base64FromDataUrl(dataUrl),
          }
        }

        if (isTextAttachment(file) && file.size <= 1024 * 1024) {
          return {
            id,
            name: file.name,
            mimeType: file.type || 'text/plain',
            size: file.size,
            kind: 'text',
            text: await file.text(),
          }
        }

        return {
          id,
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          kind: 'file',
        }
      }),
    )

    setPendingAttachments((current) => [...current, ...loaded].slice(0, 16))
  }

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((current) => current.filter((attachment) => attachment.id !== id))
  }

  const openArtifact = (artifact: CodeArtifact) => {
    setArtifacts((current) => [artifact, ...current.filter((item) => item.id !== artifact.id)].slice(0, 12))
    setSelectedArtifact(artifact)
    setArtifactOpen(true)
  }

  const closeArtifact = (artifact: CodeArtifact) => {
    const nextArtifacts = artifacts.filter((item) => item.id !== artifact.id)
    setArtifacts(nextArtifacts)

    if (selectedArtifact?.id === artifact.id) {
      const nextSelected = nextArtifacts[0] ?? null
      setSelectedArtifact(nextSelected)
      setArtifactOpen(nextSelected !== null)
    }
  }

  const addTask = (task: { title: string; status: TaskPanelTask['status']; evidence?: string }) => {
    setTasks((current) => [{ id: makeId('task'), ...task }, ...current])
  }

  const updateTask = (id: string, patch: Partial<Omit<TaskPanelTask, 'id'>>) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)))
  }

  const selectBranch = (id: string) => {
    const target = branches.find((branch) => branch.id === id)
    if (!target) {
      return
    }

    const updatedAt = new Date().toISOString()
    setBranches((current) =>
      current.map((branch) =>
        branch.id === currentBranchId
          ? { ...branch, messages, messageCount: messages.length, updatedAt }
          : branch,
      ),
    )
    setCurrentBranchId(id)
    setMessages(target.messages)
    setSelectedArtifact(null)
    setArtifactOpen(false)
  }

  const createBranch = (name: string) => {
    const now = new Date().toISOString()
    const branch: ChatBranch = {
      id: makeId('branch'),
      name,
      createdAt: now,
      updatedAt: now,
      messageCount: messages.length,
      messages,
    }

    setBranches((current) => [branch, ...current])
    setCurrentBranchId(branch.id)
  }

  const renameBranch = (id: string, name: string) => {
    setBranches((current) =>
      current.map((branch) =>
        branch.id === id ? { ...branch, name, updatedAt: new Date().toISOString() } : branch,
      ),
    )
  }

  const deleteBranch = (id: string) => {
    if (branches.length <= 1) {
      return
    }

    const nextBranches = branches.filter((branch) => branch.id !== id)
    const nextCurrent = currentBranchId === id ? nextBranches[0] : branches.find((branch) => branch.id === currentBranchId)
    setBranches(nextBranches)

    if (nextCurrent && currentBranchId === id) {
      setCurrentBranchId(nextCurrent.id)
      setMessages(nextCurrent.messages)
    }
  }

  const rememberBackendSuggestions = (storedMemories: StoredBackendMemory[] = []) => {
    const converted = storedMemories.flatMap((memory) => {
      const record = backendMemoryToRecord(memory)
      return record ? [record] : []
    })

    if (converted.length === 0 || settings.memoryMode === 'off') {
      return
    }

    if (settings.memoryMode === 'auto') {
      setMemories((current) => {
        const seen = new Set(current.map((memory) => memory.content.toLowerCase()))
        return [...converted.filter((memory) => !seen.has(memory.content.toLowerCase())), ...current]
      })
      return
    }

    setSuggestedMemories((current) => {
      const seen = new Set(current.map((memory) => memory.content.toLowerCase()))
      return [...converted.filter((memory) => !seen.has(memory.content.toLowerCase())), ...current].slice(0, 8)
    })
  }

  const sendPrompt = async (text: string, baseMessages = messages, attachments = pendingAttachments) => {
    const cleanText = text.trim()
    if ((!cleanText && attachments.length === 0) || running) {
      return
    }

    const userMessage: ChatMessage = {
      id: makeId('user'),
      role: 'user',
      content: cleanText || 'Attached files',
      createdAt: new Date().toISOString(),
      attachments,
    }
    const assistantId = makeId('assistant')
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      pending: true,
    }
    const nextMessages = [...baseMessages, userMessage, assistantMessage]
    const controller = new AbortController()
    abortRef.current = controller

    setMessages(nextMessages)
    setDraft('')
    setPendingAttachments([])
    setRunning(true)

    try {
      await streamChat(
        {
          messages: compactMessages(nextMessages.filter((message) => message.id !== assistantId)),
          settings,
          personalization,
          memories,
          searchEnabled,
          agentsEnabled,
          memoryEnabled,
        },
        {
          signal: controller.signal,
          onContext: (context) => {
            updateMessage(assistantId, (message) => ({ ...message, context }))
            if (context.subagents?.length) {
              setLastAgents(context.subagents)
            }
          },
          onToken: (token) => {
            updateMessage(assistantId, (message) => ({
              ...message,
              content: message.content + token,
              pending: false,
            }))
          },
          onDone: (payload) => {
            updateMessage(assistantId, (message) => ({ ...message, pending: false }))
            rememberBackendSuggestions(payload.storedMemories)
          },
          onError: (message) => {
            updateMessage(assistantId, (current) => ({
              ...current,
              content: current.content || message,
              error: message,
              pending: false,
            }))
          },
        },
      )
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      updateMessage(assistantId, (message) => ({
        ...message,
        content: message.content || (aborted ? 'Stopped.' : error instanceof Error ? error.message : 'Request failed.'),
        error: aborted ? undefined : error instanceof Error ? error.message : 'Request failed.',
        pending: false,
      }))
    } finally {
      abortRef.current = null
      setRunning(false)
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
  }

  const regenerate = () => {
    const lastUserIndex = messages.findLastIndex((message) => message.role === 'user')
    if (lastUserIndex < 0) {
      return
    }

    const lastUser = messages[lastUserIndex]
    void sendPrompt(lastUser.content, messages.slice(0, lastUserIndex), lastUser.attachments ?? [])
  }

  const clearChat = () => {
    stop()
    setMessages([])
    setSelectedArtifact(null)
    setArtifacts([])
    setArtifactOpen(false)
    setLastAgents([])
    setPendingAttachments([])
  }

  const exportConversation = () => {
    exportTextFile(`maly-chat-${new Date().toISOString().slice(0, 10)}.md`, transcript(messages))
  }

  const acceptSuggestion = (memory: MemoryRecord) => {
    setMemories((current) => [memory, ...current])
    setSuggestedMemories((current) => current.filter((item) => item.id !== memory.id))
    void postMemory({
      type: memory.type,
      text: memory.content,
      confidence: memory.confidence,
      source: 'accepted-ui',
    }).catch(() => undefined)
  }

  const acceptAllSuggestions = () => {
    const unique = suggestedMemories.filter(
      (suggestion) =>
        !memories.some((memory) => memory.content.toLowerCase() === suggestion.content.toLowerCase()),
    )

    if (unique.length === 0) {
      setSuggestedMemories([])
      return
    }

    setMemories((current) => [...unique, ...current])
    setSuggestedMemories([])
    for (const memory of unique) {
      void postMemory({
        type: memory.type,
        text: memory.content,
        confidence: memory.confidence,
        source: 'accepted-bulk-ui',
      }).catch(() => undefined)
    }
  }

  const setChatModelPreset = (preset: (typeof chatModelPresets)[number]) => {
    setSettings((current) => ({
      ...current,
      modelSettings: {
        ...current.modelSettings,
        model: preset.model,
        fallbackModel: preset.fallbackModel,
        modePreset: preset.modePreset,
      },
      updatedAt: new Date().toISOString(),
    }))
  }

  const actions: CommandPaletteAction[] = [
    { id: 'new', label: 'New chat', shortcut: 'Ctrl N', run: clearChat },
    {
      id: 'search',
      label: searchEnabled ? 'Disable search' : 'Enable search',
      keywords: ['web', 'browse'],
      run: () => setSearchEnabled((value) => !value),
    },
    {
      id: 'agents',
      label: agentsEnabled ? 'Disable 3x Qwen' : 'Enable 3x Qwen',
      keywords: ['parallel', 'delegate', 'split compute', 'qwen shards'],
      run: () => setAgentsEnabled((value) => !value),
    },
    {
      id: 'memory',
      label: 'Open memory',
      keywords: ['personalization', 'context'],
      run: () => setDrawer('memory'),
    },
    {
      id: 'workbench',
      label: 'Open 3x Qwen workbench',
      keywords: ['agents', 'subagents', 'split compute'],
      run: () => setDrawer('workbench'),
    },
    { id: 'tasks', label: 'Open task checklist', keywords: ['plan', 'todo'], run: () => setDrawer('tasks') },
    { id: 'branches', label: 'Open branches', keywords: ['thread', 'fork'], run: () => setDrawer('branches') },
    { id: 'templates', label: 'Open templates', keywords: ['starter', 'prompt'], run: () => setDrawer('templates') },
    { id: 'workspace', label: 'Open workspace', keywords: ['files', 'repo'], run: () => setDrawer('workspace') },
    { id: 'tools', label: 'Open tools and runner', keywords: ['models', 'run', 'code'], run: () => setDrawer('tools') },
    {
      id: 'google',
      label: 'Open Google Workspace',
      keywords: ['google', 'gmail', 'drive', 'calendar', 'sign in'],
      run: () => setDrawer('google'),
    },
    { id: 'settings', label: 'Open settings', run: () => setDrawer('settings') },
    { id: 'export', label: 'Export transcript', run: exportConversation },
    { id: 'clear', label: 'Clear current chat', destructive: true, run: clearChat },
  ]

  const activeProjectRoot =
    settings.projectProfiles.find((profile) => profile.id === settings.activeProjectProfileId)?.rootPath ||
    'C:\\Users\\joshj\\maly-ai'
  const showArtifactSplit = artifactOpen && selectedArtifact !== null

  const renderDrawer = () => {
    if (drawer === 'settings') {
      return (
        <SettingsPanel
          settings={settings}
          memoryCount={memories.length}
          onChange={setSettings}
          onClose={() => setDrawer(null)}
          onReset={() => setSettings(DEFAULT_USER_SETTINGS)}
        />
      )
    }

    if (drawer === 'memory') {
      return (
        <MemoryPanel
          memories={memories}
          suggested={suggestedMemories}
          onChange={setMemories}
          onAcceptSuggestion={acceptSuggestion}
          onAcceptAllSuggestions={acceptAllSuggestions}
          onDismissAllSuggestions={() => setSuggestedMemories([])}
          onDismissSuggestion={(id) => setSuggestedMemories((current) => current.filter((memory) => memory.id !== id))}
          onClose={() => setDrawer(null)}
        />
      )
    }

    if (drawer === 'workbench') {
      return <WorkbenchPanel agents={lastAgents} onClose={() => setDrawer(null)} />
    }

    if (drawer === 'tasks') {
      return <TaskPanel tasks={tasks} onAddTask={addTask} onUpdateTask={updateTask} onClose={() => setDrawer(null)} />
    }

    if (drawer === 'branches') {
      return (
        <BranchPanel
          branches={branches}
          currentBranchId={currentBranchId}
          onSelectBranch={selectBranch}
          onCreateBranch={createBranch}
          onRenameBranch={renameBranch}
          onDeleteBranch={deleteBranch}
          onClose={() => setDrawer(null)}
        />
      )
    }

    if (drawer === 'templates') {
      return (
        <TemplatePanel
          onUseTemplate={(text) => {
            setDraft(text)
            setDrawer(null)
          }}
          onClose={() => setDrawer(null)}
        />
      )
    }

    if (drawer === 'workspace') {
      return (
        <WorkspacePanel
          rootPath={activeProjectRoot}
          fileSystemAllowed={settings.toolPermissions.fileSystem}
          onAttachPrompt={(prompt) => {
            setDraft(prompt)
            setDrawer(null)
          }}
          onClose={() => setDrawer(null)}
        />
      )
    }

    if (drawer === 'tools') {
      return (
        <ToolsPanel
          activeModel={settings.modelSettings.model || 'qwen3.5:0.8b'}
          onRenderArtifact={openArtifact}
          onClose={() => setDrawer(null)}
        />
      )
    }

    if (drawer === 'google') {
      return <GoogleWorkspacePanel onClose={() => setDrawer(null)} />
    }

    return null
  }

  return (
    <div className={`maly-app ${showArtifactSplit ? 'maly-app--artifact-open' : ''}`}>
      <aside className="rail" aria-label="Maly AI navigation">
        <button className="rail__brand" type="button" onClick={clearChat} aria-label="New Maly AI chat">
          <Sparkles size={20} />
        </button>
        <div className="rail__actions">
          <button type="button" className="icon-button" onClick={clearChat} aria-label="New chat">
            <MessageSquarePlus size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${searchEnabled ? 'is-active' : ''}`}
            onClick={() => setSearchEnabled((value) => !value)}
            aria-label="Toggle web search"
          >
            <Globe2 size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${agentsEnabled ? 'is-active' : ''}`}
            onClick={() => setAgentsEnabled((value) => !value)}
            aria-label="Toggle 3x Qwen split compute"
          >
            <Bot size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${memoryEnabled ? 'is-active' : ''}`}
            onClick={() => setMemoryEnabled((value) => !value)}
            aria-label="Toggle memory"
          >
            <Brain size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${drawer === 'workbench' ? 'is-active' : ''}`}
            onClick={() => setDrawer('workbench')}
            aria-label="Open 3x Qwen workbench"
          >
            <Bot size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${drawer === 'tasks' ? 'is-active' : ''}`}
            onClick={() => setDrawer('tasks')}
            aria-label="Open task checklist"
          >
            <ClipboardCheck size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${drawer === 'branches' ? 'is-active' : ''}`}
            onClick={() => setDrawer('branches')}
            aria-label="Open branches"
          >
            <GitBranch size={20} />
          </button>
        </div>
        <div className="rail__actions rail__actions--bottom">
          <button
            type="button"
            className={`icon-button ${drawer === 'templates' ? 'is-active' : ''}`}
            onClick={() => setDrawer('templates')}
            aria-label="Open prompt templates"
          >
            <Sparkles size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${drawer === 'workspace' ? 'is-active' : ''}`}
            onClick={() => setDrawer('workspace')}
            aria-label="Open workspace"
          >
            <FolderOpen size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${drawer === 'tools' ? 'is-active' : ''}`}
            onClick={() => setDrawer('tools')}
            aria-label="Open tools"
          >
            <Wrench size={20} />
          </button>
          <button
            type="button"
            className={`icon-button ${drawer === 'google' ? 'is-active' : ''}`}
            onClick={() => setDrawer('google')}
            aria-label="Open Google Workspace"
          >
            <BriefcaseBusiness size={20} />
          </button>
          <button type="button" className="icon-button" onClick={() => setPaletteOpen(true)} aria-label="Open commands">
            <Menu size={20} />
          </button>
          <button type="button" className="icon-button" onClick={() => setDrawer('settings')} aria-label="Open settings">
            <Settings size={20} />
          </button>
        </div>
      </aside>

      <main className="chat-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Maly AI</p>
            <h1>Fresh local chat</h1>
          </div>
          <div className="topbar__status">
            <div className="model-switcher" aria-label="Model preset">
              {chatModelPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.model}
                  className={settings.modelSettings.model === preset.model ? 'is-active' : ''}
                  onClick={() => setChatModelPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <span>{status}</span>
            <button type="button" className="secondary-button" onClick={exportConversation} disabled={messages.length === 0}>
              <Download size={16} />
              Export
            </button>
          </div>
        </header>

        <div ref={listRef} className="message-list">
          {messages.length === 0 ? (
            <section className="empty-state">
              <div className="empty-state__mark">
                <Sparkles size={26} />
              </div>
              <h2>Maly AI</h2>
              <p>Local Qwen, clean chat, web search, 3-way split compute, memory, and live code artifacts.</p>
              <div className="prompt-grid">
                {promptChips.map((chip) => (
                  <button type="button" key={chip} onClick={() => setDraft(chip)}>
                    {chip}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <motion.article
                  key={message.id}
                  className={`message-row message-row--${message.role}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                >
                  <div className="message-row__meta">
                    <span>{message.role === 'user' ? 'You' : 'Maly'}</span>
                    {message.pending ? <small>thinking</small> : null}
                    {message.error ? <small className="is-error">error</small> : null}
                  </div>
                  <div className="message-row__body">
                    <AttachmentStack attachments={message.attachments} />
                    {message.content ? (
                      <MessageContent
                        message={message}
                        selectedArtifactId={selectedArtifact?.id}
                        onArtifactSelect={openArtifact}
                      />
                    ) : (
                      <div className="typing-indicator">
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                    <SearchResults context={message.context} />
                    <AgentOutputs agents={message.context?.subagents} />
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          )}
        </div>

        <section className="composer-wrap" aria-label="Message composer">
          <div className="mode-strip">
            <button type="button" className={searchEnabled ? 'is-active' : ''} onClick={() => setSearchEnabled((value) => !value)}>
              <Globe2 size={15} />
              Search
            </button>
            <button type="button" className={agentsEnabled ? 'is-active' : ''} onClick={() => setAgentsEnabled((value) => !value)}>
              <Bot size={15} />
              3x Qwen
            </button>
            <button type="button" className={memoryEnabled ? 'is-active' : ''} onClick={() => setMemoryEnabled((value) => !value)}>
              <Brain size={15} />
              Memory
            </button>
            <button
              type="button"
              className={showArtifactSplit ? 'is-active' : ''}
              onClick={() => selectedArtifact && setArtifactOpen((value) => !value)}
              disabled={!selectedArtifact}
            >
              <Code2 size={15} />
              Preview
            </button>
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              void sendPrompt(draft)
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.txt,.md,.mdx,.json,.csv,.ts,.tsx,.js,.jsx,.css,.html,.py,.go,.rs,.java,.cs,.cpp,.c,.h,.sql,.yaml,.yml,.xml,.svg,.log"
              className="composer__file-input"
              onChange={(event) => {
                if (event.target.files) {
                  void addAttachments(event.target.files)
                }
                event.currentTarget.value = ''
              }}
            />
            <textarea
              value={draft}
              rows={1}
              placeholder="Message Maly AI"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void sendPrompt(draft)
                }
              }}
            />
            <div className="composer__actions">
              <button type="button" className="icon-button" onClick={() => fileInputRef.current?.click()} aria-label="Attach files">
                <Paperclip size={18} />
              </button>
              <button type="button" className="icon-button" onClick={regenerate} disabled={running || messages.length === 0} aria-label="Regenerate">
                <RefreshCw size={18} />
              </button>
              <button type="button" className="icon-button" onClick={clearChat} disabled={running && messages.length === 0} aria-label="Clear chat">
                <Trash2 size={18} />
              </button>
              {running ? (
                <button type="button" className="send-button" onClick={stop} aria-label="Stop">
                  <Pause size={18} />
                </button>
              ) : (
                <button type="submit" className="send-button" disabled={!draft.trim() && pendingAttachments.length === 0} aria-label="Send">
                  <Send size={18} />
                </button>
              )}
            </div>
          </form>
          {pendingAttachments.length > 0 ? (
            <div className="composer-attachments">
              {pendingAttachments.map((attachment) => {
                const Icon = attachment.kind === 'image' ? ImageIcon : FileText
                return (
                  <div key={attachment.id} className="composer-attachment">
                    {attachment.kind === 'image' && attachment.dataUrl ? (
                      <img src={attachment.dataUrl} alt={attachment.name} />
                    ) : (
                      <Icon size={16} />
                    )}
                    <span>
                      <strong>{attachment.name}</strong>
                      <small>{attachment.kind} - {formatAttachmentSize(attachment.size)}</small>
                    </span>
                    <button type="button" onClick={() => removePendingAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`}>
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
          {pendingAttachments.some((attachment) => attachment.kind === 'image') ? (
            <p className="composer-note">
              Images are sent to Ollama for vision-capable models. The current Qwen text models can still use filenames and extracted text, but may not inspect pixels.
            </p>
          ) : null}
        </section>
      </main>

      {showArtifactSplit ? (
        <section className="artifact-dock is-open">
          <button
            type="button"
            className="artifact-dock__toggle"
            onClick={() => setArtifactOpen(false)}
            aria-label="Close artifact preview"
          >
            <PanelRightClose size={18} />
          </button>
          <ArtifactPanel
            artifact={selectedArtifact}
            artifacts={artifacts}
            activeArtifactId={selectedArtifact?.id}
            onSelectArtifact={(artifact) => setSelectedArtifact(artifact)}
            onCloseArtifact={closeArtifact}
            onSendToChat={(artifact) => {
              setDraft(`Use this artifact in the next step:\n\n\`\`\`${artifact.language}\n${artifact.source}\n\`\`\``)
              setArtifactOpen(false)
            }}
            onClosePanel={() => setArtifactOpen(false)}
          />
        </section>
      ) : null}

      <AnimatePresence>
        {drawer ? (
          <motion.div
            className="drawer-backdrop"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setDrawer(null)}
          >
            <motion.div
              className={`drawer ${drawer === 'workspace' ? 'drawer--workspace' : ''}`}
              initial={{ x: 420 }}
              animate={{ x: 0 }}
              exit={{ x: 420 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {renderDrawer()}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CommandPalette open={paletteOpen} actions={actions} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

export default App
