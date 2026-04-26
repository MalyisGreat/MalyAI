export type ResponseStyle = 'concise' | 'balanced' | 'thorough' | 'code-first'

export type ResponseTone =
  | 'direct'
  | 'warm'
  | 'technical'
  | 'executive'
  | 'creative'

export type ExpertiseLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'expert'

export type SearchMode = 'off' | 'auto' | 'deep'

export type SubagentMode = 'off' | 'ask' | 'auto'

export type MemoryMode = 'off' | 'suggest' | 'auto'

export type ModelModePreset = 'balanced' | 'fast' | 'deep' | 'code'

export type MemoryRuleAction = 'always' | 'never' | 'ask'

export interface ProjectProfile {
  id: string
  name: string
  rootPath: string
  framework: string
  systemPrompt: string
  defaultModel: string
  createdAt: string
  updatedAt: string
}

export interface ModelSettings {
  model: string
  contextSize: number
  thinking: boolean
  modePreset: ModelModePreset
  fallbackModel: string
  visionModel: string
}

export interface MemoryRule {
  id: string
  label: string
  pattern: string
  action: MemoryRuleAction
}

export interface ToolPermissions {
  webSearch: boolean
  subagents: boolean
  memoryWrite: boolean
  fileSystem: boolean
  desktopControl: boolean
}

export interface UserSettings {
  userName: string
  responseStyle: ResponseStyle
  tone: ResponseTone
  expertiseLevel: ExpertiseLevel
  defaultSearchMode: SearchMode
  subagentMode: SubagentMode
  memoryMode: MemoryMode
  temperature: number
  maxTokens: number
  customInstructions: string
  modelSettings: ModelSettings
  projectProfiles: ProjectProfile[]
  activeProjectProfileId?: string
  toolPermissions: ToolPermissions
  updatedAt: string
}

export type MemoryType =
  | 'preference'
  | 'project'
  | 'fact'
  | 'workflow'
  | 'instruction'

export interface MemoryRecord {
  id: string
  title: string
  content: string
  type: MemoryType
  confidence: number
  tags: string[]
  source?: string
  createdAt: string
  updatedAt: string
}

export interface SuggestedMemory {
  id: string
  title: string
  content: string
  type: MemoryType
  confidence: number
  reason?: string
  source?: string
  tags?: string[]
  createdAt?: string
}

export interface MalyStorageExport {
  version: number
  exportedAt: string
  settings?: UserSettings
  memories?: MemoryRecord[]
  projectProfiles?: ProjectProfile[]
  modelSettings?: ModelSettings
  memoryRules?: MemoryRule[]
  toolPermissions?: ToolPermissions
}

export interface CommandPaletteAction {
  id: string
  label: string
  description?: string
  keywords?: string[]
  shortcut?: string
  destructive?: boolean
  run: () => void
}
