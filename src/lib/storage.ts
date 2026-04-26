import type {
  MalyStorageExport,
  MemoryMode,
  MemoryRecord,
  MemoryRule,
  MemoryType,
  ModelSettings,
  ProjectProfile,
  SearchMode,
  SubagentMode,
  ToolPermissions,
  UserSettings,
} from '../types'

export const MALY_STORAGE_VERSION = 1

export const MALY_STORAGE_KEYS = {
  settings: `maly-ai:v${MALY_STORAGE_VERSION}:settings`,
  memories: `maly-ai:v${MALY_STORAGE_VERSION}:memories`,
  projectProfiles: `maly-ai:v${MALY_STORAGE_VERSION}:project-profiles`,
  modelSettings: `maly-ai:v${MALY_STORAGE_VERSION}:model-settings`,
  memoryRules: `maly-ai:v${MALY_STORAGE_VERSION}:memory-rules`,
  toolPermissions: `maly-ai:v${MALY_STORAGE_VERSION}:tool-permissions`,
} as const

const responseStyles = ['concise', 'balanced', 'thorough', 'code-first'] as const
const responseTones = ['direct', 'warm', 'technical', 'executive', 'creative'] as const
const expertiseLevels = ['beginner', 'intermediate', 'advanced', 'expert'] as const
const searchModes = ['off', 'auto', 'deep'] as const
const subagentModes = ['off', 'ask', 'auto'] as const
const memoryModes = ['off', 'suggest', 'auto'] as const
const memoryTypes = ['preference', 'project', 'fact', 'workflow', 'instruction'] as const
const modelModePresets = ['balanced', 'fast', 'deep', 'code'] as const
const memoryRuleActions = ['always', 'never', 'ask'] as const

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  model: 'qwen3.5:0.8b',
  contextSize: 65536,
  thinking: true,
  modePreset: 'balanced',
  fallbackModel: 'qwen3.5:0.8b',
  visionModel: 'qwen2.5vl:3b',
}

export const DEFAULT_TOOL_PERMISSIONS: ToolPermissions = {
  webSearch: true,
  subagents: false,
  memoryWrite: true,
  fileSystem: false,
  desktopControl: false,
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  userName: '',
  responseStyle: 'balanced',
  tone: 'direct',
  expertiseLevel: 'advanced',
  defaultSearchMode: 'auto',
  subagentMode: 'ask',
  memoryMode: 'suggest',
  temperature: 0.4,
  maxTokens: 8192,
  customInstructions: '',
  modelSettings: DEFAULT_MODEL_SETTINGS,
  projectProfiles: [],
  activeProjectProfileId: undefined,
  toolPermissions: DEFAULT_TOOL_PERMISSIONS,
  updatedAt: new Date(0).toISOString(),
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readStorageValue(key: string) {
  if (!canUseLocalStorage()) {
    return null
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageValue(key: string, value: string) {
  if (!canUseLocalStorage()) {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private browsing and locked-down WebViews can reject writes.
  }
}

function parseJson(value: string | null): unknown {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function readOption<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  return typeof value === 'string' && options.includes(value) ? (value as T[number]) : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function createStorageId(prefix: string) {
  const cryptoId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  return `${prefix}_${cryptoId}`
}

export function normalizeModelSettings(value: unknown): ModelSettings {
  const source = readObject(value)
  const get = (key: keyof ModelSettings) => (hasOwn(source, key) ? source[key] : undefined)
  const rawContextSize = readNumber(get('contextSize'), DEFAULT_MODEL_SETTINGS.contextSize)
  const migratedContextSize = rawContextSize === 8192 ? DEFAULT_MODEL_SETTINGS.contextSize : rawContextSize

  return {
    model: readString(get('model'), DEFAULT_MODEL_SETTINGS.model).trim() || DEFAULT_MODEL_SETTINGS.model,
    contextSize: Math.round(clamp(migratedContextSize, 1024, 1048576)),
    thinking: readBoolean(get('thinking'), DEFAULT_MODEL_SETTINGS.thinking),
    modePreset: readOption(get('modePreset'), modelModePresets, DEFAULT_MODEL_SETTINGS.modePreset),
    fallbackModel: readString(get('fallbackModel'), DEFAULT_MODEL_SETTINGS.fallbackModel).trim() || DEFAULT_MODEL_SETTINGS.fallbackModel,
    visionModel: readString(get('visionModel'), DEFAULT_MODEL_SETTINGS.visionModel).trim() || DEFAULT_MODEL_SETTINGS.visionModel,
  }
}

export function normalizeToolPermissions(value: unknown): ToolPermissions {
  const source = readObject(value)
  const get = (key: keyof ToolPermissions) => (hasOwn(source, key) ? source[key] : undefined)

  return {
    webSearch: readBoolean(get('webSearch'), DEFAULT_TOOL_PERMISSIONS.webSearch),
    subagents: readBoolean(get('subagents'), DEFAULT_TOOL_PERMISSIONS.subagents),
    memoryWrite: readBoolean(get('memoryWrite'), DEFAULT_TOOL_PERMISSIONS.memoryWrite),
    fileSystem: readBoolean(get('fileSystem'), DEFAULT_TOOL_PERMISSIONS.fileSystem),
    desktopControl: readBoolean(get('desktopControl'), DEFAULT_TOOL_PERMISSIONS.desktopControl),
  }
}

export function normalizeProjectProfile(value: unknown): ProjectProfile | null {
  const source = readObject(value)
  const get = (key: keyof ProjectProfile) => (hasOwn(source, key) ? source[key] : undefined)
  const rootPath = readString(get('rootPath')).trim()
  const pathName = rootPath.split(/[\\/]/).filter(Boolean).pop()
  const name = readString(get('name'), pathName || 'Project profile').trim()
  const now = new Date().toISOString()

  if (!name) {
    return null
  }

  return {
    id: readString(get('id'), createStorageId('project')),
    name,
    rootPath,
    framework: readString(get('framework'), 'auto').trim() || 'auto',
    systemPrompt: readString(get('systemPrompt')).trim(),
    defaultModel: readString(get('defaultModel'), DEFAULT_MODEL_SETTINGS.model).trim() || DEFAULT_MODEL_SETTINGS.model,
    createdAt: readString(get('createdAt'), now),
    updatedAt: readString(get('updatedAt'), now),
  }
}

export function normalizeProjectProfiles(value: unknown): ProjectProfile[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const profile = normalizeProjectProfile(item)
    return profile ? [profile] : []
  })
}

export function normalizeMemoryRule(value: unknown): MemoryRule | null {
  const source = readObject(value)
  const get = (key: keyof MemoryRule) => (hasOwn(source, key) ? source[key] : undefined)
  const label = readString(get('label')).trim()
  const pattern = readString(get('pattern')).trim()

  if (!label || !pattern) {
    return null
  }

  return {
    id: readString(get('id'), createStorageId('rule')),
    label,
    pattern,
    action: readOption(get('action'), memoryRuleActions, 'ask'),
  }
}

export function normalizeMemoryRules(value: unknown): MemoryRule[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const rule = normalizeMemoryRule(item)
    return rule ? [rule] : []
  })
}

export function normalizeSettings(value: unknown): UserSettings {
  const source = readObject(value)
  const get = (key: keyof UserSettings) => (hasOwn(source, key) ? source[key] : undefined)
  const projectProfiles = normalizeProjectProfiles(get('projectProfiles'))
  const activeProjectProfileId = readString(get('activeProjectProfileId')) || undefined
  const rawMaxTokens = readNumber(get('maxTokens'), DEFAULT_USER_SETTINGS.maxTokens)
  const migratedMaxTokens = rawMaxTokens === 2200 ? DEFAULT_USER_SETTINGS.maxTokens : rawMaxTokens

  return {
    userName: readString(get('userName')).trim(),
    responseStyle: readOption(get('responseStyle'), responseStyles, DEFAULT_USER_SETTINGS.responseStyle),
    tone: readOption(get('tone'), responseTones, DEFAULT_USER_SETTINGS.tone),
    expertiseLevel: readOption(get('expertiseLevel'), expertiseLevels, DEFAULT_USER_SETTINGS.expertiseLevel),
    defaultSearchMode: readOption(get('defaultSearchMode'), searchModes, DEFAULT_USER_SETTINGS.defaultSearchMode),
    subagentMode: readOption(get('subagentMode'), subagentModes, DEFAULT_USER_SETTINGS.subagentMode),
    memoryMode: readOption(get('memoryMode'), memoryModes, DEFAULT_USER_SETTINGS.memoryMode),
    temperature: clamp(readNumber(get('temperature'), DEFAULT_USER_SETTINGS.temperature), 0, 2),
    maxTokens: Math.round(clamp(migratedMaxTokens, 256, 65536)),
    customInstructions: readString(get('customInstructions')).trim(),
    modelSettings: normalizeModelSettings(get('modelSettings')),
    projectProfiles,
    activeProjectProfileId: projectProfiles.some((profile) => profile.id === activeProjectProfileId)
      ? activeProjectProfileId
      : projectProfiles[0]?.id,
    toolPermissions: normalizeToolPermissions(get('toolPermissions')),
    updatedAt: readString(get('updatedAt'), new Date().toISOString()),
  }
}

export function normalizeMemory(value: unknown): MemoryRecord | null {
  const source = readObject(value)
  const get = (key: keyof MemoryRecord) => (hasOwn(source, key) ? source[key] : undefined)
  const title = readString(get('title')).trim()
  const content = readString(get('content')).trim()

  if (!title || !content) {
    return null
  }

  const now = new Date().toISOString()

  return {
    id: readString(get('id'), createStorageId('mem')),
    title,
    content,
    type: readOption(get('type'), memoryTypes, 'preference'),
    confidence: clamp(readNumber(get('confidence'), 0.75), 0, 1),
    tags: readStringArray(get('tags')).map((tag) => tag.trim()).filter(Boolean),
    source: readString(get('source')) || undefined,
    createdAt: readString(get('createdAt'), now),
    updatedAt: readString(get('updatedAt'), now),
  }
}

export function loadUserSettings() {
  return normalizeSettings(parseJson(readStorageValue(MALY_STORAGE_KEYS.settings)))
}

export function saveUserSettings(settings: UserSettings) {
  const normalized = normalizeSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  })

  writeStorageValue(MALY_STORAGE_KEYS.settings, JSON.stringify(normalized))
  writeStorageValue(MALY_STORAGE_KEYS.modelSettings, JSON.stringify(normalized.modelSettings))
  writeStorageValue(MALY_STORAGE_KEYS.projectProfiles, JSON.stringify(normalized.projectProfiles))
  writeStorageValue(MALY_STORAGE_KEYS.toolPermissions, JSON.stringify(normalized.toolPermissions))
  return normalized
}

export function loadModelSettings() {
  return normalizeModelSettings(parseJson(readStorageValue(MALY_STORAGE_KEYS.modelSettings)))
}

export function saveModelSettings(settings: ModelSettings) {
  const normalized = normalizeModelSettings(settings)
  writeStorageValue(MALY_STORAGE_KEYS.modelSettings, JSON.stringify(normalized))
  return normalized
}

export function loadProjectProfiles() {
  return normalizeProjectProfiles(parseJson(readStorageValue(MALY_STORAGE_KEYS.projectProfiles)))
}

export function saveProjectProfiles(profiles: ProjectProfile[]) {
  const normalized = normalizeProjectProfiles(profiles)
  writeStorageValue(MALY_STORAGE_KEYS.projectProfiles, JSON.stringify(normalized))
  return normalized
}

export function loadToolPermissions() {
  return normalizeToolPermissions(parseJson(readStorageValue(MALY_STORAGE_KEYS.toolPermissions)))
}

export function saveToolPermissions(permissions: ToolPermissions) {
  const normalized = normalizeToolPermissions(permissions)
  writeStorageValue(MALY_STORAGE_KEYS.toolPermissions, JSON.stringify(normalized))
  return normalized
}

export function loadMemories() {
  const parsed = parseJson(readStorageValue(MALY_STORAGE_KEYS.memories))

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed.flatMap((item) => {
    const memory = normalizeMemory(item)
    return memory ? [memory] : []
  })
}

export function saveMemories(memories: MemoryRecord[]) {
  const normalized = memories.flatMap((item) => {
    const memory = normalizeMemory(item)
    return memory ? [memory] : []
  })

  writeStorageValue(MALY_STORAGE_KEYS.memories, JSON.stringify(normalized))
  return normalized
}

export function loadMemoryRules() {
  return normalizeMemoryRules(parseJson(readStorageValue(MALY_STORAGE_KEYS.memoryRules)))
}

export function saveMemoryRules(rules: MemoryRule[]) {
  const normalized = normalizeMemoryRules(rules)
  writeStorageValue(MALY_STORAGE_KEYS.memoryRules, JSON.stringify(normalized))
  return normalized
}

export function createProjectProfile(input: Partial<Omit<ProjectProfile, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
  const now = new Date().toISOString()
  const profile = normalizeProjectProfile({
    id: createStorageId('project'),
    name: input.name ?? 'New project',
    rootPath: input.rootPath ?? '',
    framework: input.framework ?? 'auto',
    systemPrompt: input.systemPrompt ?? '',
    defaultModel: input.defaultModel ?? DEFAULT_MODEL_SETTINGS.model,
    createdAt: now,
    updatedAt: now,
  })

  return profile as ProjectProfile
}

export function createMemoryRule(input: {
  label: string
  pattern: string
  action?: MemoryRule['action']
}) {
  return normalizeMemoryRule({
    id: createStorageId('rule'),
    label: input.label,
    pattern: input.pattern,
    action: input.action ?? 'ask',
  })
}

export function createMemory(input: {
  title: string
  content: string
  type?: MemoryType
  confidence?: number
  tags?: string[]
  source?: string
}) {
  const now = new Date().toISOString()

  return normalizeMemory({
    id: createStorageId('mem'),
    title: input.title,
    content: input.content,
    type: input.type ?? 'preference',
    confidence: input.confidence ?? 0.75,
    tags: input.tags ?? [],
    source: input.source,
    createdAt: now,
    updatedAt: now,
  })
}

function normalizeMemories(value: unknown): MemoryRecord[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const memory = normalizeMemory(item)
    return memory ? [memory] : []
  })
}

export function exportMalyDataJson(input: {
  settings?: UserSettings
  memories?: MemoryRecord[]
  projectProfiles?: ProjectProfile[]
  modelSettings?: ModelSettings
  memoryRules?: MemoryRule[]
  toolPermissions?: ToolPermissions
}) {
  const settings = input.settings ? normalizeSettings(input.settings) : undefined

  const payload: MalyStorageExport = {
    version: MALY_STORAGE_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    memories: input.memories ? normalizeMemories(input.memories) : undefined,
    projectProfiles: input.projectProfiles
      ? normalizeProjectProfiles(input.projectProfiles)
      : settings?.projectProfiles,
    modelSettings: input.modelSettings
      ? normalizeModelSettings(input.modelSettings)
      : settings?.modelSettings,
    memoryRules: input.memoryRules ? normalizeMemoryRules(input.memoryRules) : undefined,
    toolPermissions: input.toolPermissions
      ? normalizeToolPermissions(input.toolPermissions)
      : settings?.toolPermissions,
  }

  return JSON.stringify(payload, null, 2)
}

export function importMalyDataJson(json: string) {
  const parsed = parseJson(json)
  const source = readObject(parsed)
  const rawSettings = hasOwn(source, 'settings') ? source.settings : undefined
  const rawMemories = hasOwn(source, 'memories') ? source.memories : parsed
  const rawProjectProfiles = hasOwn(source, 'projectProfiles') ? source.projectProfiles : undefined
  const rawModelSettings = hasOwn(source, 'modelSettings') ? source.modelSettings : undefined
  const rawMemoryRules = hasOwn(source, 'memoryRules') ? source.memoryRules : undefined
  const rawToolPermissions = hasOwn(source, 'toolPermissions') ? source.toolPermissions : undefined

  const settings = rawSettings ? normalizeSettings(rawSettings) : undefined
  const memories = Array.isArray(rawMemories) ? normalizeMemories(rawMemories) : undefined
  const projectProfiles = Array.isArray(rawProjectProfiles)
    ? normalizeProjectProfiles(rawProjectProfiles)
    : settings?.projectProfiles
  const modelSettings = rawModelSettings ? normalizeModelSettings(rawModelSettings) : settings?.modelSettings
  const memoryRules = Array.isArray(rawMemoryRules) ? normalizeMemoryRules(rawMemoryRules) : undefined
  const toolPermissions = rawToolPermissions ? normalizeToolPermissions(rawToolPermissions) : settings?.toolPermissions

  return { settings, memories, projectProfiles, modelSettings, memoryRules, toolPermissions }
}

const searchModeCopy: Record<SearchMode, string> = {
  off: 'Do not browse unless explicitly instructed.',
  auto: 'Use live search when facts are time-sensitive, external, or uncertain.',
  deep: 'Prefer careful source-backed research for non-trivial factual claims.',
}

const subagentModeCopy: Record<SubagentMode, string> = {
  off: 'Do not delegate to subagents.',
  ask: 'Ask before delegating substantial work to subagents.',
  auto: 'Use subagents when parallel verification or specialist review materially helps.',
}

const memoryModeCopy: Record<MemoryMode, string> = {
  off: 'Do not use stored memory unless the user explicitly asks.',
  suggest: 'Suggest memory updates instead of silently saving personal facts.',
  auto: 'Use high-confidence memory when relevant and non-conflicting.',
}

export function createPersonalizationPrompt(
  settings: UserSettings,
  memories: MemoryRecord[] = [],
  options: {
    memoryRules?: MemoryRule[]
    modelSettings?: ModelSettings
    projectProfiles?: ProjectProfile[]
    activeProjectProfileId?: string
    toolPermissions?: ToolPermissions
  } = {},
) {
  const normalized = normalizeSettings(settings)
  const modelSettings = normalizeModelSettings(options.modelSettings ?? normalized.modelSettings)
  const projectProfiles = options.projectProfiles
    ? normalizeProjectProfiles(options.projectProfiles)
    : normalized.projectProfiles
  const activeProjectProfileId = options.activeProjectProfileId ?? normalized.activeProjectProfileId
  const activeProject = projectProfiles.find((profile) => profile.id === activeProjectProfileId)
  const toolPermissions = normalizeToolPermissions(options.toolPermissions ?? normalized.toolPermissions)
  const memoryRules = normalizeMemoryRules(options.memoryRules ?? [])
  const lines = [
    'Personalization addendum:',
    'Apply these preferences only when they do not conflict with higher-priority instructions or the current user request.',
  ]

  if (normalized.userName) {
    lines.push(`User name: ${normalized.userName}. Use it only when natural.`)
  }

  lines.push(`Response style: ${normalized.responseStyle}.`)
  lines.push(`Tone: ${normalized.tone}.`)
  lines.push(`Assume expertise level: ${normalized.expertiseLevel}.`)
  lines.push(`Search preference: ${searchModeCopy[normalized.defaultSearchMode]}`)
  lines.push(`Subagent preference: ${subagentModeCopy[normalized.subagentMode]}`)
  lines.push(`Memory preference: ${memoryModeCopy[normalized.memoryMode]}`)
  lines.push(`Model defaults: temperature ${normalized.temperature}, max tokens ${normalized.maxTokens}.`)
  lines.push(
    `Model selection: ${modelSettings.model}, context ${modelSettings.contextSize}, thinking ${modelSettings.thinking ? 'on' : 'off'}, preset ${modelSettings.modePreset}, fallback ${modelSettings.fallbackModel}.`,
    `Vision model slot: ${modelSettings.visionModel}. Use it for image prompts when available.`,
  )

  if (activeProject) {
    lines.push(`Active project: ${activeProject.name} (${activeProject.rootPath || 'path not set'}).`)
    lines.push(`Project framework: ${activeProject.framework}. Default model: ${activeProject.defaultModel}.`)

    if (activeProject.systemPrompt) {
      lines.push(`Project prompt: ${activeProject.systemPrompt}`)
    }
  }

  const disabledTools = Object.entries(toolPermissions)
    .filter(([, allowed]) => !allowed)
    .map(([name]) => name)

  if (disabledTools.length > 0) {
    lines.push(`Tool permissions disabled by preference: ${disabledTools.join(', ')}.`)
  }

  if (normalized.customInstructions) {
    lines.push(`Custom instructions: ${normalized.customInstructions}`)
  }

  if (memoryRules.length > 0) {
    lines.push('Memory rules:')
    lines.push(...memoryRules.map((rule) => `- ${rule.action}: ${rule.label} (${rule.pattern})`))
  }

  if (normalized.memoryMode !== 'off' && memories.length > 0) {
    const memoryLines = memories
      .slice()
      .sort((left, right) => right.confidence - left.confidence)
      .slice(0, 8)
      .map((memory) => `- [${memory.type}, ${Math.round(memory.confidence * 100)}%] ${memory.title}: ${memory.content}`)

    lines.push('Relevant stored memories:')
    lines.push(...memoryLines)
  }

  return lines.join('\n')
}
