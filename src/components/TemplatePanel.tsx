import { Bot, CalendarClock, FileCode2, FileText, Gamepad2, Globe2, LayoutDashboard, Monitor, Wrench, X } from 'lucide-react'

export type TemplatePanelProps = {
  onUseTemplate: (text: string) => void
  onClose?: () => void
  className?: string
}

const templates = [
  {
    id: 'web-game',
    title: 'Web game',
    icon: Gamepad2,
    text: 'Build a polished browser game with responsive controls, visible score state, sound-safe defaults, and a Playwright smoke test.',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    text: 'Build a clean operational dashboard with compact cards, filters, charts, empty states, and responsive desktop/mobile layouts.',
  },
  {
    id: 'python-script',
    title: 'Python script',
    icon: FileCode2,
    text: 'Write a Python script with argparse, clear input/output paths, useful logging, error handling, and a short verification command.',
  },
  {
    id: 'electron-app',
    title: 'Electron app',
    icon: Monitor,
    text: 'Build an Electron app with a Vite renderer, local persistence, native-feeling window controls, and a verified launch path.',
  },
  {
    id: 'research-brief',
    title: 'Research brief',
    icon: FileText,
    text: 'Create an evidence-calibrated research brief with sources, claims, counterpoints, uncertainty, and next-step recommendations.',
  },
  {
    id: 'source-search',
    title: 'Sourced web search',
    icon: Globe2,
    text: 'Search the live web for the current state of this topic. Return a concise answer with source links, dates, uncertainty, and what changed recently:',
  },
  {
    id: 'split-compute',
    title: '3x Qwen review',
    icon: Bot,
    text: 'Spawn the 3 Qwen shards at the same time. Have one propose the solution, one stress-test risks and edge cases, and one synthesize the final answer:',
  },
  {
    id: 'automation',
    title: 'Automation plan',
    icon: CalendarClock,
    text: 'Create a long-running backend automation for this goal. Define cadence, idle-window behavior, evidence to collect, success criteria, and what the result should summarize:',
  },
  {
    id: 'refactor-plan',
    title: 'Refactor plan',
    icon: Wrench,
    text: 'Create a scoped refactor plan with risks, file ownership, atomic steps, test strategy, rollback path, and acceptance criteria.',
  },
] as const

export function TemplatePanel({ onUseTemplate, onClose, className = '' }: TemplatePanelProps) {
  return (
    <section className={['drawer-panel', className].filter(Boolean).join(' ')} aria-label="App templates">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Templates</p>
          <h2>Start from template</h2>
        </div>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close templates">
            <X size={18} />
          </button>
        ) : null}
      </header>

      <div className="settings-grid">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {templates.map((template) => {
            const Icon = template.icon

            return (
              <button
                type="button"
                key={template.id}
                className="prompt-grid"
                style={{
                  width: '100%',
                  minHeight: 74,
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr)',
                  alignItems: 'center',
                  gap: 10,
                  margin: 0,
                  padding: 12,
                  color: 'var(--ink)',
                  textAlign: 'left',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={() => onUseTemplate(template.text)}
              >
                <Icon size={18} />
                <span>{template.title}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default TemplatePanel
