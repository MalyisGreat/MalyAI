import type { MemoryRecord, UserSettings } from '../types'

export type ApiChatRole = 'system' | 'user' | 'assistant'

export type ApiChatMessage = {
  role: ApiChatRole
  content: string
  images?: string[]
}

export type ChatContextEvent = {
  model: string
  memories?: unknown[]
  search?: {
    query: string
    results?: SearchResult[]
    error?: string
  } | null
  subagents?: AgentResult[]
}

export type SearchResult = {
  title: string
  url: string
  snippet?: string
}

export type AgentResult = {
  name: string
  instanceId?: string
  batchId?: string
  shard?: number
  totalShards?: number
  model?: string
  parallelStartedAt?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  round?: number
  round1DurationMs?: number
  round2DurationMs?: number
  instruction?: string
  candidate?: string
  evidence?: string
  checks?: string
  risks?: string
  confidence?: string
  rounds?: {
    independent?: string
    review?: string
  }
  content?: string
  error?: string
}

export type OllamaModelInfo = {
  name: string
  model?: string
  label?: string
  tier?: string
  recommended?: boolean
  modifiedAt?: string
  size?: number
  digest?: string
  default?: boolean
  available?: boolean
  installed?: boolean
}

export type RunningOllamaModel = {
  name?: string
  model?: string
  size?: number
  size_vram?: number
  processor?: string
  context?: number
  until?: string
  expires_at?: string
}

export type SystemResources = {
  ok: boolean
  cpu: {
    cores: number
    loadAverage: number[]
  }
  memory: {
    totalBytes: number
    freeBytes: number
    usedBytes: number
    usedPercent: number
  }
  gpu: null | {
    name: string
    utilizationPercent: number
    memoryUsedMb: number
    memoryTotalMb: number
    memoryPercent: number
  }
  models: RunningOllamaModel[]
  sampledAt: string
}

export type WorkspaceTreeEntry = {
  name: string
  path: string
  relativePath?: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: string
  error?: string
  children?: WorkspaceTreeEntry[]
}

export type WorkspaceTreeResponse = {
  root: string
  path?: string
  count?: number
  truncated?: boolean
  tree: WorkspaceTreeEntry
}

export type WorkspaceReadResponse = {
  root: string
  path: string
  file?: WorkspaceTreeEntry
  content: string
  encoding?: string
}

export type WorkspaceWriteResponse = {
  root: string
  path: string
  file?: WorkspaceTreeEntry
  bytesWritten: number
  encoding?: string
}

export type WorkspaceDiffResponse = {
  root: string
  path: string
  exists: boolean
  changed: boolean
  patch: string
  oldBytes?: number
  newBytes?: number
  addedLines?: number
  removedLines?: number
}

export type RunCodeResponse = {
  runId?: string
  language: string
  kind: 'execution' | 'artifact'
  bytes?: number
  timeoutMs?: number
  stdout?: string
  stderr?: string
  exitCode?: number | null
  signal?: string | null
  timedOut?: boolean
  durationMs?: number
  renderable?: boolean
  document?: string
  content?: string
}

export type ToolPlanStep = {
  id: string | number
  title?: string
  tool: string
  reason: string
  status: string
}

export type ToolPlanResponse = {
  prompt: string
  steps: ToolPlanStep[]
  createdAt?: string
  mode?: string
  warning?: string
}

export type AutomationStatus = {
  activePromptCount: number
  runningTaskId?: string | null
  idleForMs: number
  defaultIdleWindowMs: number
  pollMs: number
  lastWorkerCheckAt?: string | null
  lastWorkerMessage?: string
}

export type AutomationTask = {
  id: string
  title: string
  prompt: string
  cadence: 'once' | 'hourly' | 'daily' | 'weekly'
  status: 'queued' | 'waiting_idle' | 'running' | 'complete' | 'failed' | 'paused'
  model: string
  useSearch: boolean
  useSubagents: boolean
  idleWindowMs: number
  createdAt: string
  updatedAt: string
  nextRunAt: string | null
  startedAt: string | null
  completedAt: string | null
  runCount: number
  lastResult: string
  lastError: string
  plan: ToolPlanStep[]
  isRunning?: boolean
}

export type AutomationListResponse = {
  tasks: AutomationTask[]
  status: AutomationStatus
}

export type GoogleWorkspaceProfile = {
  id?: string
  email?: string
  name?: string
  emailVerified?: boolean
}

export type GoogleWorkspaceSession = {
  connected: boolean
  profile?: GoogleWorkspaceProfile | null
  scopes?: string[]
  createdAt?: string
  updatedAt?: string
  expiresAt?: number
}

export type GoogleWorkspaceConfig = {
  configured: boolean
  clientId?: string
  redirectUri: string
  scopes: string[]
}

export type GoogleDriveFile = {
  id: string
  name: string
  mimeType?: string
  webViewLink?: string
  modifiedTime?: string
  owner?: { displayName?: string; emailAddress?: string } | null
}

export type GoogleCalendarEvent = {
  id: string
  summary: string
  htmlLink?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  location?: string
}

export type GoogleGmailMessage = {
  id: string
  threadId?: string
  snippet?: string
  from?: string
  subject: string
  date?: string
}

export type GoogleWorkspaceOverview = {
  drive: GoogleDriveFile[]
  calendar: GoogleCalendarEvent[]
  gmail: GoogleGmailMessage[]
  errors?: Array<{ area: string; message: string }>
}

export type StoredBackendMemory = {
  id: string
  type?: string
  text?: string
  confidence?: number
  createdAt?: string
  source?: string
}

export type StreamHandlers = {
  signal?: AbortSignal
  onContext?: (context: ChatContextEvent) => void
  onToken?: (token: string) => void
  onDone?: (payload: { storedMemories?: StoredBackendMemory[] }) => void
  onError?: (message: string) => void
}

type StreamEvent = {
  event: string
  data: string
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `${fallbackMessage}: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function getHealth() {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`)
  }

  return response.json() as Promise<{
    ok: boolean
    ollama?: { ok: boolean; version?: string; error?: string }
  }>
}

export async function getModels() {
  const response = await fetch('/api/models')
  return parseJsonResponse<{
    defaultModel: string
    models: OllamaModelInfo[]
    error?: string
  }>(response, 'Model list failed')
}

export async function getRunningModels() {
  const response = await fetch('/api/models/running')
  return parseJsonResponse<{ ok: boolean; models: RunningOllamaModel[]; error?: string }>(
    response,
    'Running model list failed',
  )
}

export async function unloadModel(model: string) {
  const response = await fetch('/api/models/unload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })

  return parseJsonResponse<{ ok: boolean; model: string; error?: string }>(response, 'Model unload failed')
}

export async function getSystemResources() {
  const response = await fetch('/api/system/resources')
  return parseJsonResponse<SystemResources>(response, 'System resources failed')
}

export async function searchWeb(query: string) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 6 }),
  })

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`)
  }

  return response.json() as Promise<{ query: string; results: SearchResult[]; error?: string }>
}

export async function getWorkspaceTree(input: {
  root?: string
  maxDepth?: number
  maxEntries?: number
}) {
  const response = await fetch('/api/workspace/tree', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<WorkspaceTreeResponse>(response, 'Workspace tree failed')
}

export async function readWorkspaceFile(input: {
  root?: string
  path: string
}) {
  const response = await fetch('/api/workspace/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<WorkspaceReadResponse>(response, 'Workspace read failed')
}

export async function writeWorkspaceFile(input: {
  root?: string
  path: string
  content: string
}) {
  const response = await fetch('/api/workspace/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<WorkspaceWriteResponse>(response, 'Workspace write failed')
}

export async function diffWorkspaceFile(input: {
  root?: string
  path: string
  content: string
}) {
  const response = await fetch('/api/workspace/diff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<WorkspaceDiffResponse>(response, 'Workspace diff failed')
}

export async function runCodeSnippet(input: {
  language: string
  code: string
  timeoutMs?: number
}) {
  const response = await fetch('/api/run-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<RunCodeResponse>(response, 'Run code failed')
}

export async function planTools(input: {
  prompt: string
  context?: string
}) {
  const response = await fetch('/api/tools/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<ToolPlanResponse>(response, 'Tool plan failed')
}

export async function getAutomations() {
  const response = await fetch('/api/automations')
  return parseJsonResponse<AutomationListResponse>(response, 'Automation queue failed')
}

export async function createAutomation(input: {
  title?: string
  prompt: string
  cadence?: AutomationTask['cadence']
  delayMinutes?: number
  idleWindowMs?: number
  model?: string
  useSearch?: boolean
  useSubagents?: boolean
}) {
  const response = await fetch('/api/automations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<{ task: AutomationTask; status: AutomationStatus }>(response, 'Automation create failed')
}

export async function updateAutomation(
  id: string,
  patch: Partial<Pick<AutomationTask, 'title' | 'prompt' | 'cadence' | 'status' | 'nextRunAt' | 'model' | 'useSearch' | 'useSubagents' | 'idleWindowMs'>>,
) {
  const response = await fetch(`/api/automations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

  return parseJsonResponse<{ task: AutomationTask; status: AutomationStatus }>(response, 'Automation update failed')
}

export async function runAutomationNow(id: string) {
  const response = await fetch(`/api/automations/${encodeURIComponent(id)}/run`, { method: 'POST' })
  return parseJsonResponse<{ task: AutomationTask; status: AutomationStatus }>(response, 'Automation run failed')
}

export async function deleteAutomation(id: string) {
  const response = await fetch(`/api/automations/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return parseJsonResponse<{ ok: boolean }>(response, 'Automation delete failed')
}

export async function getGoogleWorkspaceSession() {
  const response = await fetch('/api/google/session')
  return parseJsonResponse<GoogleWorkspaceConfig & { session: GoogleWorkspaceSession | null }>(
    response,
    'Google session failed',
  )
}

export async function getGoogleWorkspaceConfig() {
  const response = await fetch('/api/google/config')
  return parseJsonResponse<GoogleWorkspaceConfig>(response, 'Google config failed')
}

export async function logoutGoogleWorkspace() {
  const response = await fetch('/api/google/logout', { method: 'POST' })
  return parseJsonResponse<{ ok: boolean }>(response, 'Google logout failed')
}

export async function getGoogleWorkspaceOverview() {
  const response = await fetch('/api/google/workspace/overview')
  return parseJsonResponse<GoogleWorkspaceOverview>(response, 'Google Workspace overview failed')
}

export async function getGoogleDriveFiles(query = '') {
  const params = new URLSearchParams({ limit: '10' })
  if (query.trim()) {
    params.set('query', query.trim())
  }

  const response = await fetch(`/api/google/drive/files?${params.toString()}`)
  return parseJsonResponse<{ files: GoogleDriveFile[] }>(response, 'Google Drive files failed')
}

export async function getGoogleCalendarEvents() {
  const response = await fetch('/api/google/calendar/events?limit=10')
  return parseJsonResponse<{ events: GoogleCalendarEvent[] }>(response, 'Google Calendar events failed')
}

export async function getGoogleGmailMessages(query = '') {
  const params = new URLSearchParams({ limit: '10' })
  if (query.trim()) {
    params.set('query', query.trim())
  }

  const response = await fetch(`/api/google/gmail/messages?${params.toString()}`)
  return parseJsonResponse<{ messages: GoogleGmailMessage[] }>(response, 'Gmail messages failed')
}

export async function postMemory(memory: {
  type: string
  text: string
  confidence?: number
  source?: string
}) {
  const response = await fetch('/api/memories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(memory),
  })

  if (!response.ok) {
    throw new Error(`Memory save failed: ${response.status}`)
  }

  return response.json() as Promise<{ memory: StoredBackendMemory }>
}

export async function deleteBackendMemory(id: string) {
  await fetch(`/api/memories?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

function parseSseEvents(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = []
  const chunks = buffer.split(/\n\n/)
  const rest = chunks.pop() ?? ''

  for (const chunk of chunks) {
    const lines = chunk.split(/\n/)
    let event = 'message'
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    events.push({ event, data: dataLines.join('\n') })
  }

  return { events, rest }
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function routeModel(input: {
  messages: ApiChatMessage[]
  settings: UserSettings
  searchEnabled: boolean
  agentsEnabled: boolean
}) {
  const configured = input.settings.modelSettings.model || 'qwen3.5:0.8b'
  const latestUserMessage = [...input.messages].reverse().find((message) => message.role === 'user')
  const hasImages = input.messages.some((message) => (message.images?.length ?? 0) > 0)
  const totalChars = input.messages.reduce((sum, message) => sum + message.content.length, 0)
  const latestUser = latestUserMessage?.content.toLowerCase() ?? ''

  if (hasImages) {
    return input.settings.modelSettings.visionModel || 'qwen2.5vl:3b'
  }

  if (configured !== 'auto') {
    return configured
  }

  const wantsDeep =
    /\b(architecture|debug|refactor|security|thorough|deep|analyze|investigate|plan|multi-step|complex)\b/.test(latestUser)
  const wantsCode = /\b(code|test|typescript|react|server|bug|diff|workspace|file)\b/.test(latestUser)
  const hugeContext = totalChars > 120000

  if (wantsDeep && !hugeContext && (input.agentsEnabled || latestUser.length > 900)) {
    return 'qwen3.5:4b'
  }

  if (hugeContext || wantsDeep || wantsCode || input.searchEnabled || input.agentsEnabled) {
    return 'qwen3.5:2b'
  }

  return 'qwen3.5:0.8b'
}

export async function streamChat(
  input: {
    messages: ApiChatMessage[]
    settings: UserSettings
    personalization: string
    memories: MemoryRecord[]
    searchEnabled: boolean
    agentsEnabled: boolean
    memoryEnabled: boolean
  },
  handlers: StreamHandlers,
) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: handlers.signal,
    body: JSON.stringify({
      model: routeModel(input),
      stream: true,
      messages: input.messages,
      search: input.searchEnabled && input.settings.defaultSearchMode === 'deep',
      useSubagents: input.agentsEnabled,
      memoryLimit: input.memoryEnabled ? 8 : 0,
      searchLimit: 8,
      settings: {
        personalization: input.personalization,
        searchMode: input.searchEnabled ? input.settings.defaultSearchMode : 'off',
      },
      options: {
        temperature: input.settings.temperature,
        num_predict: Math.min(Math.max(input.settings.maxTokens, 8192), 65536),
        num_ctx: Math.min(Math.max(input.settings.modelSettings.contextSize, 65536), 1048576),
      },
    }),
  })

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `Chat failed: ${response.status}`)
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSseEvents(buffer)
    buffer = parsed.rest

    for (const event of parsed.events) {
      if (event.event === 'context') {
        const context = parseJson<ChatContextEvent>(event.data)
        if (context) {
          handlers.onContext?.(context)
        }
      } else if (event.event === 'chunk') {
        const chunk = parseJson<{ message?: { content?: string } }>(event.data)
        const token = chunk?.message?.content ?? ''
        if (token) {
          handlers.onToken?.(token)
        }
      } else if (event.event === 'done') {
        handlers.onDone?.(parseJson(event.data) ?? {})
      } else if (event.event === 'error') {
        const error = parseJson<{ error?: string }>(event.data)
        handlers.onError?.(error?.error ?? 'Chat stream failed')
      }
    }
  }
}
