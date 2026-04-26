import { Bot, CalendarClock, Pause, Play, RefreshCw, Route, Trash2, X, Zap } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  createAutomation,
  deleteAutomation,
  getAutomations,
  getModels,
  getRunningModels,
  getSystemResources,
  planTools,
  runAutomationNow,
  runCodeSnippet,
  updateAutomation,
  unloadModel,
  type AutomationStatus,
  type AutomationTask,
  type OllamaModelInfo,
  type RunningOllamaModel,
  type RunCodeResponse,
  type SystemResources,
  type ToolPlanStep,
} from '../lib/api'
import { createCodeArtifact, type CodeArtifact } from '../lib/artifacts'
import { RunOutputPanel } from './RunOutputPanel'

type ToolsPanelProps = {
  activeModel: string
  onRenderArtifact: (artifact: CodeArtifact) => void
  onClose?: () => void
}

type RunState = {
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number | null
  startedAt: string | null
  finishedAt: string | null
  command: string
}

const emptyRunState: RunState = {
  stdout: '',
  stderr: '',
  exitCode: null,
  durationMs: null,
  startedAt: null,
  finishedAt: null,
  command: '',
}

const defaultSnippet = `console.log("Maly runner ready")
console.log([1, 2, 3].map((value) => value * value).join(", "))`

const modelTiers = [
  { label: 'Auto router', model: 'auto' },
  { label: 'Fast 0.8B', model: 'qwen3.5:0.8b' },
  { label: 'Smarter 2B', model: 'qwen3.5:2b' },
  { label: 'Deep 4B', model: 'qwen3.5:4b' },
]

function formatSize(size?: number) {
  if (!size) {
    return 'size unknown'
  }

  if (size > 1024 ** 3) {
    return `${(size / 1024 ** 3).toFixed(1)} GB`
  }

  return `${Math.round(size / 1024 ** 2)} MB`
}

function formatMemoryPercent(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'unknown'
  }

  return `${Math.round(value)}%`
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'not scheduled'
  }

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMs(value?: number | null) {
  if (!value || value < 0) {
    return '0s'
  }

  if (value >= 60000) {
    return `${Math.floor(value / 60000)}m ${Math.floor((value % 60000) / 1000)}s`
  }

  return `${Math.floor(value / 1000)}s`
}

function runStateFromResponse(response: RunCodeResponse, language: string, startedAt: string): RunState {
  const output =
    response.kind === 'artifact' && response.content
      ? response.content
      : response.stdout ?? ''

  return {
    stdout: output,
    stderr: response.stderr ?? '',
    exitCode: response.exitCode ?? 0,
    durationMs: response.durationMs ?? null,
    startedAt,
    finishedAt: new Date().toISOString(),
    command: language === 'javascript' ? 'node snippet' : `${language} artifact`,
  }
}

export function ToolsPanel({ activeModel, onRenderArtifact, onClose }: ToolsPanelProps) {
  const [models, setModels] = useState<OllamaModelInfo[]>([])
  const [runningModels, setRunningModels] = useState<RunningOllamaModel[]>([])
  const [resources, setResources] = useState<SystemResources | null>(null)
  const [modelStatus, setModelStatus] = useState('Model list not loaded')
  const [planPrompt, setPlanPrompt] = useState('Search the web, inspect the workspace, run a small code check, then summarize.')
  const [steps, setSteps] = useState<ToolPlanStep[]>([])
  const [planStatus, setPlanStatus] = useState('Plan tools by intent.')
  const [automationPrompt, setAutomationPrompt] = useState('Create a weekly research brief with sources and action items.')
  const [automationCadence, setAutomationCadence] = useState<AutomationTask['cadence']>('once')
  const [automationDelay, setAutomationDelay] = useState(0)
  const [automationIdleSeconds, setAutomationIdleSeconds] = useState(20)
  const [automationModel, setAutomationModel] = useState(activeModel)
  const [automationSearch, setAutomationSearch] = useState(true)
  const [automationSubagents, setAutomationSubagents] = useState(false)
  const [automationTasks, setAutomationTasks] = useState<AutomationTask[]>([])
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null)
  const [automationMessage, setAutomationMessage] = useState('Loading automation queue...')
  const [language, setLanguage] = useState('javascript')
  const [code, setCode] = useState(defaultSnippet)
  const [runState, setRunState] = useState<RunState>(emptyRunState)
  const [running, setRunning] = useState(false)

  const loadRunningModels = useCallback(async () => {
    const running = await getRunningModels()
    setRunningModels(running.models)
    return running
  }, [])

  const loadResources = useCallback(async () => {
    const response = await getSystemResources()
    setResources(response)
    setRunningModels(response.models)
    return response
  }, [])

  const loadModels = useCallback(async () => {
    setModelStatus('Loading models...')
    try {
      const response = await getModels()
      setModels(response.models)
      const running = await loadRunningModels()
      setModelStatus(response.error ? response.error : `${response.models.length} models found, ${running.models.length} loaded`)
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : 'Model list failed')
    }
  }, [loadRunningModels])

  const unloadLoadedModel = useCallback(async (model: string) => {
    setModelStatus(`Unloading ${model}...`)
    try {
      const response = await unloadModel(model)
      setModelStatus(response.ok ? `Unloaded ${model}` : response.error ?? 'Unload failed')
      await loadRunningModels()
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : 'Unload failed')
    }
  }, [loadRunningModels])

  const loadAutomations = useCallback(async () => {
    try {
      const response = await getAutomations()
      setAutomationTasks(response.tasks)
      setAutomationStatus(response.status)
      setAutomationMessage(response.status.lastWorkerMessage ?? `${response.tasks.length} queued`)
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : 'Automation queue failed')
    }
  }, [])

  const createPlan = async () => {
    if (!planPrompt.trim()) {
      return
    }

    setPlanStatus('Planning...')
    try {
      const response = await planTools({ prompt: planPrompt })
      setSteps(response.steps)
      setPlanStatus(response.warning ?? response.mode ?? 'Plan ready')
    } catch (error) {
      setPlanStatus(error instanceof Error ? error.message : 'Plan failed')
    }
  }

  const createAutomationTask = async () => {
    if (!automationPrompt.trim()) {
      return
    }

    setAutomationMessage('Saving automation...')
    try {
      const response = await createAutomation({
        prompt: automationPrompt,
        cadence: automationCadence,
        delayMinutes: automationDelay,
        idleWindowMs: automationIdleSeconds * 1000,
        model: automationModel || activeModel,
        useSearch: automationSearch,
        useSubagents: automationSubagents,
      })
      setAutomationTasks((current) => [response.task, ...current.filter((task) => task.id !== response.task.id)])
      setAutomationStatus(response.status)
      setAutomationMessage('Automation queued')
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : 'Automation save failed')
    }
  }

  const patchAutomation = async (id: string, patch: Parameters<typeof updateAutomation>[1]) => {
    setAutomationMessage('Updating automation...')
    try {
      const response = await updateAutomation(id, patch)
      setAutomationTasks((current) => current.map((task) => (task.id === id ? response.task : task)))
      setAutomationStatus(response.status)
      setAutomationMessage(response.status.lastWorkerMessage ?? 'Automation updated')
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : 'Automation update failed')
    }
  }

  const triggerAutomation = async (id: string) => {
    setAutomationMessage('Queued for the next idle window...')
    try {
      const response = await runAutomationNow(id)
      setAutomationTasks((current) => current.map((task) => (task.id === id ? response.task : task)))
      setAutomationStatus(response.status)
      setAutomationMessage('Run requested')
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : 'Run request failed')
    }
  }

  const removeAutomation = async (id: string) => {
    setAutomationMessage('Deleting automation...')
    try {
      await deleteAutomation(id)
      setAutomationTasks((current) => current.filter((task) => task.id !== id))
      setAutomationMessage('Automation deleted')
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : 'Delete failed')
    }
  }

  const runSnippet = async () => {
    if (!code.trim()) {
      return
    }

    const startedAt = new Date().toISOString()
    setRunning(true)
    setRunState({ ...emptyRunState, startedAt, command: language === 'javascript' ? 'node snippet' : `${language} artifact` })
    try {
      const response = await runCodeSnippet({ language, code, timeoutMs: 15000 })
      if (response.kind === 'artifact' && response.renderable && response.document) {
        const artifact = createCodeArtifact(response.document, 'html', 0, `tool-${Date.now()}`)
        if (artifact) {
          onRenderArtifact(artifact)
        }
      }
      setRunState(runStateFromResponse(response, language, startedAt))
    } catch (error) {
      setRunState({
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Run failed',
        exitCode: 1,
        durationMs: null,
        startedAt,
        finishedAt: new Date().toISOString(),
        command: language === 'javascript' ? 'node snippet' : `${language} artifact`,
      })
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadModels()
      void loadResources().catch(() => undefined)
      void loadAutomations()
    }, 0)

    return () => window.clearTimeout(loadTimer)
  }, [loadAutomations, loadModels, loadResources])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadAutomations()
      void loadResources().catch(() => {
        void loadRunningModels().catch(() => undefined)
      })
    }, 5000)

    return () => window.clearInterval(interval)
  }, [loadAutomations, loadResources, loadRunningModels])

  return (
    <section className="drawer-panel" aria-label="Tools">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Tools</p>
          <h2>Models and runner</h2>
        </div>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close tools">
            <X size={18} />
          </button>
        ) : null}
      </header>

      <div className="settings-grid">
        <div className="switch-row">
          <span>
            <strong>Active model</strong>
            <small>{activeModel}</small>
          </span>
          <div className="memory-card__actions">
            <button type="button" onClick={loadModels}>
              <RefreshCw size={15} />
              Refresh
            </button>
            <button type="button" onClick={() => void unloadLoadedModel(activeModel)} disabled={activeModel === 'auto'}>
              <Pause size={15} />
              Unload active
            </button>
          </div>
          <p className="empty-copy">{modelStatus}</p>
        </div>

        <div className="resource-grid">
          <article className="resource-card">
            <div className="memory-card__meta">
              <span className="pill">Router</span>
              <span>automatic load control</span>
            </div>
            <h3>Model Router</h3>
            <p>Fast routes use 0.8B, reasoning uses 2B, and deep work uses 4B with short keep-alive and automatic unload after stopped requests.</p>
          </article>
          <article className="resource-card">
            <div className="memory-card__meta">
              <span className="pill">Memory</span>
              <span>{formatMemoryPercent(resources?.memory.usedPercent)} used</span>
            </div>
            <h3>System load</h3>
            <p>
              {resources
                ? `${formatSize(resources.memory.usedBytes)} of ${formatSize(resources.memory.totalBytes)} RAM, ${resources.cpu.cores} CPU threads`
                : 'Resource sample not loaded yet.'}
            </p>
          </article>
          <article className="resource-card">
            <div className="memory-card__meta">
              <span className="pill">GPU</span>
              <span>{resources?.gpu ? `${resources.gpu.utilizationPercent}% active` : 'not detected'}</span>
            </div>
            <h3>{resources?.gpu?.name ?? 'GPU monitor'}</h3>
            <p>
              {resources?.gpu
                ? `${resources.gpu.memoryUsedMb} MB of ${resources.gpu.memoryTotalMb} MB VRAM (${formatMemoryPercent(resources.gpu.memoryPercent)})`
                : 'nvidia-smi did not return a GPU sample.'}
            </p>
          </article>
        </div>

        {runningModels.length > 0 ? (
          <div className="memory-list" style={{ padding: 0 }}>
            {runningModels.map((model) => {
              const name = model.name || model.model || 'loaded model'
              return (
                <article key={name} className="memory-card">
                  <div className="memory-card__meta">
                    <span className="pill">Loaded</span>
                    {model.processor ? <span>{model.processor}</span> : null}
                    {model.context ? <span>{model.context} ctx</span> : null}
                    {model.size_vram ? <span>{formatSize(model.size_vram)} VRAM</span> : null}
                  </div>
                  <h3>{name}</h3>
                  <p>
                    {model.until || model.expires_at
                      ? `Auto unload ${formatDate(model.until || model.expires_at)}`
                      : 'Resident in Ollama right now'}
                  </p>
                  <div className="memory-card__actions">
                    <button type="button" onClick={() => void unloadLoadedModel(name)}>
                      <Pause size={15} />
                      Unload
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}

        <div className="memory-list" style={{ padding: 0 }}>
          {models.map((model) => (
            <article key={model.name} className="memory-card">
              <div className="memory-card__meta">
                <span className="pill">
                  <Bot size={14} />
                  {model.default ? 'Default' : model.installed === false ? 'Missing' : model.recommended ? 'Recommended' : 'Installed'}
                </span>
                {model.tier ? <span>{model.tier}</span> : null}
                <span>{formatSize(model.size)}</span>
              </div>
              <h3>{model.label ?? model.name}</h3>
              <p>{model.digest ? model.digest.slice(0, 32) : 'Ollama local model'}</p>
            </article>
          ))}
        </div>

        <div className="memory-composer" style={{ margin: 0 }}>
          <label className="field">
            <span>Tool plan prompt</span>
            <textarea value={planPrompt} rows={3} onChange={(event) => setPlanPrompt(event.target.value)} />
          </label>
          <button type="button" className="primary-button" onClick={createPlan} disabled={!planPrompt.trim()}>
            <Route size={16} />
            Plan tools
          </button>
          <p className="empty-copy">{planStatus}</p>
        </div>

        {steps.length > 0 ? (
          <div className="memory-list" style={{ padding: 0 }}>
            {steps.map((step) => (
              <article key={step.id} className="memory-card">
                <div className="memory-card__meta">
                  <span className="pill">{step.tool}</span>
                  <span>{step.status}</span>
                </div>
                <h3>{step.title ?? `Step ${step.id}`}</h3>
                <p>{step.reason}</p>
              </article>
            ))}
          </div>
        ) : null}

        <div className="memory-composer" style={{ margin: 0 }}>
          <div className="memory-card__meta">
            <span className="pill">
              <CalendarClock size={14} />
              Background plans
            </span>
            <span>{automationStatus?.activePromptCount ? 'chat active' : `idle ${formatMs(automationStatus?.idleForMs)}`}</span>
          </div>
          <label className="field">
            <span>Long-range plan</span>
            <textarea value={automationPrompt} rows={4} onChange={(event) => setAutomationPrompt(event.target.value)} />
          </label>
          <div className="memory-composer__row">
            <label className="field" style={{ flex: 1 }}>
              <span>Cadence</span>
              <select value={automationCadence} onChange={(event) => setAutomationCadence(event.target.value as AutomationTask['cadence'])}>
                <option value="once">Once</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Delay minutes</span>
              <input
                type="number"
                min="0"
                max="525600"
                value={automationDelay}
                onChange={(event) => setAutomationDelay(Number(event.target.value))}
              />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Idle seconds</span>
              <input
                type="number"
                min="1"
                max="1800"
                value={automationIdleSeconds}
                onChange={(event) => setAutomationIdleSeconds(Number(event.target.value))}
              />
            </label>
          </div>
          <label className="field">
            <span>Automation model</span>
            <select value={automationModel} onChange={(event) => setAutomationModel(event.target.value)}>
              {modelTiers.map((tier) => (
                <option key={tier.model} value={tier.model}>
                  {tier.label}
                </option>
              ))}
              <option value={activeModel}>Current: {activeModel}</option>
            </select>
          </label>
          <div className="segmented segmented--compact">
            <button type="button" className={automationSearch ? 'is-active' : ''} onClick={() => setAutomationSearch((value) => !value)}>
              Search
            </button>
            <button type="button" className={automationSubagents ? 'is-active' : ''} onClick={() => setAutomationSubagents((value) => !value)}>
              3x Qwen
            </button>
          </div>
          <button type="button" className="primary-button" onClick={createAutomationTask} disabled={!automationPrompt.trim()}>
            <CalendarClock size={16} />
            Queue automation
          </button>
          <p className="empty-copy">{automationMessage}</p>
        </div>

        <div className="memory-list" style={{ padding: 0 }}>
          {automationTasks.length === 0 ? (
            <article className="memory-card">
              <div className="memory-card__meta">
                <span className="pill">Idle queue</span>
                <span>empty</span>
              </div>
              <p>Saved plans will run from the backend after active chat prompts finish.</p>
            </article>
          ) : null}

          {automationTasks.map((task) => (
            <article key={task.id} className="memory-card">
              <div className="memory-card__meta">
                <span className="pill">{task.status.replace('_', ' ')}</span>
                <span>{task.cadence}</span>
                <span>next {formatDate(task.nextRunAt)}</span>
              </div>
              <h3>{task.title}</h3>
              <p>{task.prompt}</p>
              <div className="memory-card__meta">
                <span>{task.model}</span>
                <span>idle {formatMs(task.idleWindowMs)}</span>
                <span>{task.runCount} runs</span>
              </div>
              {task.lastError ? <p className="empty-copy">{task.lastError}</p> : null}
              {task.lastResult ? <textarea readOnly value={task.lastResult} rows={5} /> : null}
              <div className="memory-card__actions">
                <button type="button" onClick={() => void triggerAutomation(task.id)}>
                  <Zap size={15} />
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => void patchAutomation(task.id, { status: task.status === 'paused' ? 'queued' : 'paused' })}
                >
                  <Pause size={15} />
                  {task.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
                <button type="button" onClick={() => void removeAutomation(task.id)}>
                  <Trash2 size={15} />
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="memory-composer" style={{ margin: 0 }}>
          <div className="memory-composer__row">
            <label className="field" style={{ flex: 1 }}>
              <span>Runner type</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                <option value="javascript">JavaScript</option>
                <option value="html">HTML artifact</option>
                <option value="text">Text artifact</option>
              </select>
            </label>
            <button type="button" className="primary-button" onClick={runSnippet} disabled={running || !code.trim()}>
              <Play size={16} />
              Run
            </button>
          </div>
          <label className="field">
            <span>Snippet</span>
            <textarea
              value={code}
              rows={9}
              spellCheck={false}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        </div>

        <RunOutputPanel
          title="Code runner"
          stdout={runState.stdout}
          stderr={runState.stderr}
          exitCode={runState.exitCode}
          runtimeMs={runState.durationMs}
          running={running}
          command={runState.command}
          startedAt={runState.startedAt}
          finishedAt={runState.finishedAt}
          emptyMessage="Run JavaScript safely, or convert HTML/text into an artifact."
          onClear={() => setRunState(emptyRunState)}
        />

        <div className="switch-row">
          <span>
            <strong>Runner policy</strong>
            <small>guarded local snippets</small>
          </span>
          <p className="empty-copy">
            JavaScript snippets cannot use filesystem, process, network, import, require, or child-process APIs. HTML renders in the preview split only when you run it.
          </p>
        </div>
      </div>
    </section>
  )
}

export default ToolsPanel
