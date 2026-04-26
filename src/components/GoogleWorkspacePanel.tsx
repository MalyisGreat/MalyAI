import { CalendarDays, FileText, LogIn, LogOut, Mail, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getGoogleCalendarEvents,
  getGoogleDriveFiles,
  getGoogleGmailMessages,
  getGoogleWorkspaceOverview,
  getGoogleWorkspaceSession,
  logoutGoogleWorkspace,
  type GoogleCalendarEvent,
  type GoogleDriveFile,
  type GoogleGmailMessage,
  type GoogleWorkspaceConfig,
  type GoogleWorkspaceSession,
} from '../lib/api'

type GoogleWorkspacePanelProps = {
  onClose?: () => void
}

type WorkspaceTab = 'overview' | 'drive' | 'calendar' | 'gmail'

function formatDate(value?: string) {
  if (!value) {
    return 'No date'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function eventStart(event: GoogleCalendarEvent) {
  return event.start?.dateTime ?? event.start?.date
}

function scopeLabel(scope: string) {
  if (scope.includes('/drive.')) {
    return 'Drive metadata'
  }

  if (scope.includes('/calendar.')) {
    return 'Calendar read'
  }

  if (scope.includes('/gmail.')) {
    return 'Gmail read'
  }

  if (scope === 'openid') {
    return 'OpenID'
  }

  return scope.replace(/^https:\/\/www.googleapis.com\/auth\//, '')
}

function DriveList({ files }: { files: GoogleDriveFile[] }) {
  if (files.length === 0) {
    return <p className="empty-copy">No Drive files loaded.</p>
  }

  return (
    <div className="memory-list" style={{ padding: 0 }}>
      {files.map((file) => (
        <article key={file.id} className="memory-card">
          <div className="memory-card__meta">
            <span className="pill">
              <FileText size={14} />
              Drive
            </span>
            <span>{formatDate(file.modifiedTime)}</span>
          </div>
          <h3>{file.webViewLink ? <a href={file.webViewLink} target="_blank" rel="noreferrer">{file.name}</a> : file.name}</h3>
          <p>{file.owner?.displayName || file.owner?.emailAddress || file.mimeType || 'Google Drive item'}</p>
        </article>
      ))}
    </div>
  )
}

function CalendarList({ events }: { events: GoogleCalendarEvent[] }) {
  if (events.length === 0) {
    return <p className="empty-copy">No upcoming calendar events loaded.</p>
  }

  return (
    <div className="memory-list" style={{ padding: 0 }}>
      {events.map((event) => (
        <article key={event.id} className="memory-card">
          <div className="memory-card__meta">
            <span className="pill">
              <CalendarDays size={14} />
              Calendar
            </span>
            <span>{formatDate(eventStart(event))}</span>
          </div>
          <h3>{event.htmlLink ? <a href={event.htmlLink} target="_blank" rel="noreferrer">{event.summary}</a> : event.summary}</h3>
          <p>{event.location || 'Primary calendar'}</p>
        </article>
      ))}
    </div>
  )
}

function GmailList({ messages }: { messages: GoogleGmailMessage[] }) {
  if (messages.length === 0) {
    return <p className="empty-copy">No Gmail messages loaded.</p>
  }

  return (
    <div className="memory-list" style={{ padding: 0 }}>
      {messages.map((message) => (
        <article key={message.id} className="memory-card">
          <div className="memory-card__meta">
            <span className="pill">
              <Mail size={14} />
              Gmail
            </span>
            <span>{message.date ? formatDate(message.date) : 'No date'}</span>
          </div>
          <h3>{message.subject}</h3>
          <p>{message.from}</p>
          {message.snippet ? <p>{message.snippet}</p> : null}
        </article>
      ))}
    </div>
  )
}

export function GoogleWorkspacePanel({ onClose }: GoogleWorkspacePanelProps) {
  const [config, setConfig] = useState<GoogleWorkspaceConfig | null>(null)
  const [session, setSession] = useState<GoogleWorkspaceSession | null>(null)
  const [tab, setTab] = useState<WorkspaceTab>('overview')
  const [drive, setDrive] = useState<GoogleDriveFile[]>([])
  const [calendar, setCalendar] = useState<GoogleCalendarEvent[]>([])
  const [gmail, setGmail] = useState<GoogleGmailMessage[]>([])
  const [driveQuery, setDriveQuery] = useState('')
  const [gmailQuery, setGmailQuery] = useState('')
  const [status, setStatus] = useState('Checking Google Workspace status...')
  const [busy, setBusy] = useState(false)

  const connected = Boolean(session?.connected)

  const refreshSession = async () => {
    setBusy(true)
    setStatus('Checking Google Workspace status...')
    try {
      const response = await getGoogleWorkspaceSession()
      setConfig({
        configured: response.configured,
        redirectUri: response.redirectUri,
        scopes: response.scopes,
      })
      setSession(response.session)
      setStatus(response.session ? `Connected as ${response.session.profile?.email ?? 'Google user'}` : 'Google Workspace not connected')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Google Workspace status failed')
    } finally {
      setBusy(false)
    }
  }

  const refreshOverview = async () => {
    setBusy(true)
    setStatus('Loading Workspace overview...')
    try {
      const response = await getGoogleWorkspaceOverview()
      setDrive(response.drive)
      setCalendar(response.calendar)
      setGmail(response.gmail)
      const errors = response.errors?.map((error) => `${error.area}: ${error.message}`).join('; ')
      setStatus(errors || 'Workspace overview loaded')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Workspace overview failed')
    } finally {
      setBusy(false)
    }
  }

  const signIn = () => {
    const popup = window.open(
      `/api/google/start?returnTo=${encodeURIComponent(window.location.href)}`,
      'maly-google-workspace',
      'width=520,height=720,menubar=no,toolbar=no,location=no,status=no',
    )

    if (!popup) {
      setStatus('Popup blocked. Allow popups for this local app, then try again.')
    }
  }

  const signOut = async () => {
    setBusy(true)
    try {
      await logoutGoogleWorkspace()
      setSession(null)
      setDrive([])
      setCalendar([])
      setGmail([])
      setStatus('Google Workspace disconnected')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Google sign out failed')
    } finally {
      setBusy(false)
    }
  }

  const searchDrive = async () => {
    setBusy(true)
    setStatus('Searching Drive...')
    try {
      const response = await getGoogleDriveFiles(driveQuery)
      setDrive(response.files)
      setTab('drive')
      setStatus('Drive files loaded')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Drive search failed')
    } finally {
      setBusy(false)
    }
  }

  const refreshCalendar = async () => {
    setBusy(true)
    setStatus('Loading Calendar...')
    try {
      const response = await getGoogleCalendarEvents()
      setCalendar(response.events)
      setTab('calendar')
      setStatus('Calendar events loaded')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Calendar load failed')
    } finally {
      setBusy(false)
    }
  }

  const searchGmail = async () => {
    setBusy(true)
    setStatus('Searching Gmail...')
    try {
      const response = await getGoogleGmailMessages(gmailQuery)
      setGmail(response.messages)
      setTab('gmail')
      setStatus('Gmail messages loaded')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Gmail search failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void refreshSession()
    }, 0)

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'maly-google-connected') {
        void refreshSession().then(() => refreshOverview())
      }
    }

    window.addEventListener('message', onMessage)
    return () => {
      window.clearTimeout(loadTimer)
      window.removeEventListener('message', onMessage)
    }
  }, [])

  return (
    <section className="drawer-panel" aria-label="Google Workspace">
      <header className="drawer-panel__header">
        <div>
          <p className="eyebrow">Google Workspace</p>
          <h2>Sign in and sync</h2>
        </div>
        {onClose ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close Google Workspace">
            <X size={18} />
          </button>
        ) : null}
      </header>

      <div className="settings-grid">
        <div className="switch-row">
          <span>
            <strong>{connected ? session?.profile?.name || session?.profile?.email : 'Google sign-in'}</strong>
            <small>{config?.configured ? 'OAuth configured' : 'OAuth not configured'}</small>
          </span>
          <p className="empty-copy">{status}</p>
          <div className="memory-card__actions">
            {connected ? (
              <>
                <button type="button" onClick={refreshOverview} disabled={busy}>
                  <RefreshCw size={15} />
                  Refresh
                </button>
                <button type="button" onClick={signOut} disabled={busy}>
                  <LogOut size={15} />
                  Sign out
                </button>
              </>
            ) : (
              <button type="button" onClick={signIn} disabled={busy || !config?.configured}>
                <LogIn size={15} />
                Sign in with Google
              </button>
            )}
          </div>
        </div>

        {!config?.configured ? (
          <div className="prompt-preview">
            <div className="prompt-preview__title">
              <ShieldCheck size={16} />
              Setup
            </div>
            <pre>{`Set these before starting the server:
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=${config?.redirectUri ?? 'http://127.0.0.1:8791/api/google/callback'}

Add the same redirect URI in Google Cloud Console for your OAuth web client.`}</pre>
          </div>
        ) : null}

        <div className="switch-row">
          <span>
            <strong>Scopes</strong>
            <small>read-only</small>
          </span>
          <div className="memory-card__meta">
            {(config?.scopes ?? []).map((scope) => (
              <span key={scope} className="pill">{scopeLabel(scope)}</span>
            ))}
          </div>
        </div>

        {connected ? (
          <>
            <div className="segmented">
              {(['overview', 'drive', 'calendar', 'gmail'] as const).map((item) => (
                <button type="button" key={item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <div className="settings-grid" style={{ padding: 0 }}>
                <DriveList files={drive.slice(0, 4)} />
                <CalendarList events={calendar.slice(0, 4)} />
                <GmailList messages={gmail.slice(0, 4)} />
              </div>
            ) : null}

            {tab === 'drive' ? (
              <div className="settings-grid" style={{ padding: 0 }}>
                <div className="memory-composer__row">
                  <input
                    value={driveQuery}
                    placeholder="Drive query, e.g. name contains 'proposal'"
                    onChange={(event) => setDriveQuery(event.target.value)}
                  />
                  <button type="button" className="secondary-button" onClick={searchDrive} disabled={busy}>
                    <Search size={15} />
                    Search
                  </button>
                </div>
                <DriveList files={drive} />
              </div>
            ) : null}

            {tab === 'calendar' ? (
              <div className="settings-grid" style={{ padding: 0 }}>
                <button type="button" className="secondary-button" onClick={refreshCalendar} disabled={busy}>
                  <RefreshCw size={15} />
                  Load upcoming
                </button>
                <CalendarList events={calendar} />
              </div>
            ) : null}

            {tab === 'gmail' ? (
              <div className="settings-grid" style={{ padding: 0 }}>
                <div className="memory-composer__row">
                  <input
                    value={gmailQuery}
                    placeholder="Gmail query, e.g. newer:7d from:example.com"
                    onChange={(event) => setGmailQuery(event.target.value)}
                  />
                  <button type="button" className="secondary-button" onClick={searchGmail} disabled={busy}>
                    <Search size={15} />
                    Search
                  </button>
                </div>
                <GmailList messages={gmail} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}

export default GoogleWorkspacePanel
