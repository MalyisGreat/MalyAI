import { RotateCcw, Save, SlidersHorizontal, X } from 'lucide-react'
import type { ModelSettings, ProjectProfile, ToolPermissions, UserSettings } from '../types'
import { DEFAULT_USER_SETTINGS, createPersonalizationPrompt, createProjectProfile } from '../lib/storage'

type SettingsPanelProps = {
  settings: UserSettings
  memoryCount: number
  onChange: (settings: UserSettings) => void
  onClose: () => void
  onReset: () => void
}

const responseStyles = ['concise', 'balanced', 'thorough', 'code-first'] as const
const tones = ['direct', 'warm', 'technical', 'executive', 'creative'] as const
const expertiseLevels = ['beginner', 'intermediate', 'advanced', 'expert'] as const
const modePresets: ModelSettings['modePreset'][] = ['balanced', 'fast', 'deep', 'code']
const modelPresets = [
  {
    label: 'Fast',
    detail: '0.8B',
    model: 'qwen3.5:0.8b',
    fallbackModel: 'qwen3.5:0.8b',
    modePreset: 'fast',
  },
  {
    label: 'Smarter',
    detail: '2B',
    model: 'qwen3.5:2b',
    fallbackModel: 'qwen3.5:0.8b',
    modePreset: 'balanced',
  },
  {
    label: 'Deep',
    detail: '4B',
    model: 'qwen3.5:4b',
    fallbackModel: 'qwen3.5:2b',
    modePreset: 'deep',
  },
] satisfies Array<{
  label: string
  detail: string
  model: string
  fallbackModel: string
  modePreset: ModelSettings['modePreset']
}>
const toolPermissionLabels: Array<{
  key: keyof ToolPermissions
  label: string
  description: string
}> = [
  { key: 'webSearch', label: 'Web search', description: 'Allow live browsing defaults.' },
  { key: 'subagents', label: 'Subagents', description: 'Allow delegated worker runs.' },
  { key: 'memoryWrite', label: 'Memory write', description: 'Allow new memories to be saved.' },
  { key: 'fileSystem', label: 'Files', description: 'Allow local file context by default.' },
  { key: 'desktopControl', label: 'Desktop', description: 'Allow desktop-control workflows.' },
]

function title(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function SettingsPanel({
  settings,
  memoryCount,
  onChange,
  onClose,
  onReset,
}: SettingsPanelProps) {
  const patch = (partial: Partial<UserSettings>) => {
    onChange({ ...settings, ...partial, updatedAt: new Date().toISOString() })
  }

  const patchModelSettings = (partial: Partial<ModelSettings>) => {
    patch({ modelSettings: { ...settings.modelSettings, ...partial } })
  }

  const patchToolPermissions = (partial: Partial<ToolPermissions>) => {
    patch({ toolPermissions: { ...settings.toolPermissions, ...partial } })
  }

  const activeProject =
    settings.projectProfiles.find((profile) => profile.id === settings.activeProjectProfileId) ??
    settings.projectProfiles[0]

  const setProjectProfiles = (projectProfiles: ProjectProfile[], activeProjectProfileId = settings.activeProjectProfileId) => {
    patch({ projectProfiles, activeProjectProfileId })
  }

  const addProjectProfile = () => {
    const profile = createProjectProfile({ defaultModel: settings.modelSettings.model })
    setProjectProfiles([profile, ...settings.projectProfiles], profile.id)
  }

  const updateActiveProject = (partial: Partial<ProjectProfile>) => {
    if (!activeProject) {
      return
    }

    const updatedProfile = {
      ...activeProject,
      ...partial,
      updatedAt: new Date().toISOString(),
    }

    setProjectProfiles(
      settings.projectProfiles.map((profile) => (profile.id === activeProject.id ? updatedProfile : profile)),
      updatedProfile.id,
    )
  }

  const removeActiveProject = () => {
    if (!activeProject) {
      return
    }

    const nextProfiles = settings.projectProfiles.filter((profile) => profile.id !== activeProject.id)
    setProjectProfiles(nextProfiles, nextProfiles[0]?.id)
  }

  return (
    <section className="drawer-panel" aria-label="Settings">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Preferences</p>
          <h2>Settings</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
          <X size={18} />
        </button>
      </header>

      <div className="settings-grid">
        <label className="field">
          <span>Name</span>
          <input
            value={settings.userName}
            placeholder="Optional"
            onChange={(event) => patch({ userName: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Custom instructions</span>
          <textarea
            value={settings.customInstructions}
            rows={5}
            placeholder="Preferred formats, defaults, constraints, or things to avoid."
            onChange={(event) => patch({ customInstructions: event.target.value })}
          />
        </label>

        <div className="field">
          <span>Response style</span>
          <div className="segmented">
            {responseStyles.map((style) => (
              <button
                type="button"
                key={style}
                className={settings.responseStyle === style ? 'is-active' : ''}
                onClick={() => patch({ responseStyle: style })}
              >
                {title(style)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Tone</span>
          <div className="segmented">
            {tones.map((tone) => (
              <button
                type="button"
                key={tone}
                className={settings.tone === tone ? 'is-active' : ''}
                onClick={() => patch({ tone })}
              >
                {title(tone)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Expertise</span>
          <select
            value={settings.expertiseLevel}
            onChange={(event) => patch({ expertiseLevel: event.target.value as UserSettings['expertiseLevel'] })}
          >
            {expertiseLevels.map((level) => (
              <option key={level} value={level}>
                {title(level)}
              </option>
            ))}
          </select>
        </label>

        <div className="switch-row">
          <span>
            <strong>Search</strong>
            <small>{title(settings.defaultSearchMode)}</small>
          </span>
          <div className="segmented segmented--compact">
            {(['off', 'auto', 'deep'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={settings.defaultSearchMode === mode ? 'is-active' : ''}
                onClick={() => patch({ defaultSearchMode: mode })}
              >
                {title(mode)}
              </button>
            ))}
          </div>
        </div>

        <div className="switch-row">
          <span>
            <strong>Subagents</strong>
            <small>{title(settings.subagentMode)}</small>
          </span>
          <div className="segmented segmented--compact">
            {(['off', 'ask', 'auto'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={settings.subagentMode === mode ? 'is-active' : ''}
                onClick={() => patch({ subagentMode: mode })}
              >
                {title(mode)}
              </button>
            ))}
          </div>
        </div>

        <div className="switch-row">
          <span>
            <strong>Memory</strong>
            <small>
              {title(settings.memoryMode)} - {memoryCount}
            </small>
          </span>
          <div className="segmented segmented--compact">
            {(['off', 'suggest', 'auto'] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                className={settings.memoryMode === mode ? 'is-active' : ''}
                onClick={() => patch({ memoryMode: mode })}
              >
                {title(mode)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Temperature {settings.temperature.toFixed(1)}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.temperature}
            onChange={(event) => patch({ temperature: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Max tokens</span>
          <input
            type="number"
            min="256"
            max="65536"
            step="512"
            value={settings.maxTokens}
            onChange={(event) => patch({ maxTokens: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>Model</span>
          <input
            value={settings.modelSettings.model}
            placeholder="qwen3.5:0.8b"
            onChange={(event) => patchModelSettings({ model: event.target.value })}
          />
        </label>

        <div className="field">
          <span>Model preset</span>
          <div className="segmented">
            {modelPresets.map((preset) => (
              <button
                type="button"
                key={preset.model}
                className={settings.modelSettings.model === preset.model ? 'is-active' : ''}
                onClick={() =>
                  patchModelSettings({
                    model: preset.model,
                    fallbackModel: preset.fallbackModel,
                    modePreset: preset.modePreset,
                  })
                }
              >
                {preset.label} {preset.detail}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>Fallback model</span>
          <input
            value={settings.modelSettings.fallbackModel}
            placeholder="qwen3.5:0.8b"
            onChange={(event) => patchModelSettings({ fallbackModel: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Vision model</span>
          <input
            value={settings.modelSettings.visionModel}
            placeholder="qwen2.5vl:3b"
            onChange={(event) => patchModelSettings({ visionModel: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Context size</span>
          <input
            type="number"
            min="1024"
            max="1048576"
            step="1024"
            value={settings.modelSettings.contextSize}
            onChange={(event) => patchModelSettings({ contextSize: Number(event.target.value) })}
          />
        </label>

        <div className="switch-row">
          <span>
            <strong>Thinking</strong>
            <small>{settings.modelSettings.thinking ? 'On' : 'Off'}</small>
          </span>
          <div className="segmented segmented--compact">
            {[true, false].map((value) => (
              <button
                type="button"
                key={String(value)}
                className={settings.modelSettings.thinking === value ? 'is-active' : ''}
                onClick={() => patchModelSettings({ thinking: value })}
              >
                {value ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Mode preset</span>
          <div className="segmented">
            {modePresets.map((preset) => (
              <button
                type="button"
                key={preset}
                className={settings.modelSettings.modePreset === preset ? 'is-active' : ''}
                onClick={() => patchModelSettings({ modePreset: preset })}
              >
                {title(preset)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Tool permissions</span>
          {toolPermissionLabels.map((permission) => (
            <div className="switch-row" key={permission.key}>
              <span>
                <strong>{permission.label}</strong>
                <small>{permission.description}</small>
              </span>
              <div className="segmented segmented--compact">
                {[true, false].map((value) => (
                  <button
                    type="button"
                    key={String(value)}
                    className={settings.toolPermissions[permission.key] === value ? 'is-active' : ''}
                    onClick={() => patchToolPermissions({ [permission.key]: value })}
                  >
                    {value ? 'Allow' : 'Ask'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="field">
          <span>Project profile</span>
          <div className="memory-composer__row">
            <select
              value={activeProject?.id ?? ''}
              onChange={(event) => patch({ activeProjectProfileId: event.target.value || undefined })}
            >
              {settings.projectProfiles.length === 0 ? <option value="">No profile</option> : null}
              {settings.projectProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <button type="button" className="secondary-button" onClick={addProjectProfile}>
              Add
            </button>
            <button type="button" className="secondary-button" onClick={removeActiveProject} disabled={!activeProject}>
              Remove
            </button>
          </div>
        </div>

        {activeProject ? (
          <>
            <label className="field">
              <span>Project name</span>
              <input
                value={activeProject.name}
                placeholder="Project name"
                onChange={(event) => updateActiveProject({ name: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Root path</span>
              <input
                value={activeProject.rootPath}
                placeholder="C:\\Users\\joshj\\project"
                onChange={(event) => updateActiveProject({ rootPath: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Framework</span>
              <input
                value={activeProject.framework}
                placeholder="React, Electron, Python, auto"
                onChange={(event) => updateActiveProject({ framework: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Project default model</span>
              <input
                value={activeProject.defaultModel}
                placeholder={settings.modelSettings.model}
                onChange={(event) => updateActiveProject({ defaultModel: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Project system prompt</span>
              <textarea
                value={activeProject.systemPrompt}
                rows={4}
                placeholder="Project-specific defaults, constraints, and operating notes."
                onChange={(event) => updateActiveProject({ systemPrompt: event.target.value })}
              />
            </label>
          </>
        ) : null}

        <div className="prompt-preview">
          <div className="prompt-preview__title">
            <SlidersHorizontal size={16} />
            Prompt addendum
          </div>
          <pre>{createPersonalizationPrompt(settings, []).split('\n').slice(0, 10).join('\n')}</pre>
        </div>
      </div>

      <footer className="drawer-panel__footer">
        <button type="button" className="secondary-button" onClick={onReset}>
          <RotateCcw size={16} />
          Reset
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => onChange({ ...DEFAULT_USER_SETTINGS, ...settings, updatedAt: new Date().toISOString() })}
        >
          <Save size={16} />
          Save
        </button>
      </footer>
    </section>
  )
}

export default SettingsPanel
