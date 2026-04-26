import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SESSION_FILE,
} from '../config.js';
import { HttpError, readResponseText } from './http.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_CALENDAR_EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const STATE_TTL_MS = 10 * 60 * 1000;
const EXPIRY_BUFFER_MS = 60 * 1000;

export const GOOGLE_WORKSPACE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const pendingStates = new Map();

function isConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function requireConfigured() {
  if (!isConfigured()) {
    throw new HttpError(400, 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clampLimit(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(parsed), max);
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function createState(returnTo = '') {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, {
    returnTo,
    expiresAt: Date.now() + STATE_TTL_MS,
  });
  return state;
}

function consumeState(state) {
  const record = pendingStates.get(state);
  pendingStates.delete(state);

  if (!record || record.expiresAt < Date.now()) {
    throw new HttpError(400, 'Google sign-in state is missing or expired.');
  }

  return record;
}

async function ensureSessionDir() {
  await fs.mkdir(path.dirname(GOOGLE_SESSION_FILE), { recursive: true });
}

async function readSessionFile() {
  try {
    const raw = await fs.readFile(GOOGLE_SESSION_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeSessionFile(session) {
  await ensureSessionDir();
  await fs.writeFile(GOOGLE_SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
}

async function deleteSessionFile() {
  await fs.rm(GOOGLE_SESSION_FILE, { force: true });
}

function publicSession(session) {
  if (!session) {
    return null;
  }

  return {
    connected: true,
    profile: session.profile ?? null,
    scopes: session.scope ? String(session.scope).split(/\s+/).filter(Boolean) : [],
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await readResponseText(response);

  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.error_description || parsed?.error?.message || parsed?.error || text;
    } catch {
      // Keep the raw text.
    }

    throw new HttpError(response.status, detail || `Google request failed: ${response.status}`);
  }

  return text ? JSON.parse(text) : {};
}

function formBody(input) {
  const body = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      body.set(key, String(value));
    }
  });
  return body;
}

async function exchangeCode(code) {
  return fetchJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });
}

async function refreshToken(session) {
  if (!session?.refreshToken) {
    throw new HttpError(401, 'Google session expired and no refresh token is available. Sign in again.');
  }

  const payload = await fetchJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: session.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const refreshed = {
    ...session,
    accessToken: payload.access_token,
    tokenType: payload.token_type ?? session.tokenType,
    scope: payload.scope ?? session.scope,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
    updatedAt: nowIso(),
  };
  await writeSessionFile(refreshed);
  return refreshed;
}

async function getUserProfile(accessToken) {
  return fetchJson(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getGoogleConfig() {
  return {
    configured: isConfigured(),
    clientId: GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.slice(0, 10)}...` : '',
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: GOOGLE_WORKSPACE_SCOPES,
  };
}

export function createGoogleAuthUrl({ returnTo = '' } = {}) {
  requireConfigured();
  const state = createState(returnTo);
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_WORKSPACE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export async function handleGoogleCallback({ code, state }) {
  requireConfigured();
  if (!code || !state) {
    throw new HttpError(400, 'Google callback requires code and state.');
  }

  const stateRecord = consumeState(String(state));
  const payload = await exchangeCode(String(code));
  const profile = await getUserProfile(payload.access_token);
  const createdAt = nowIso();
  const session = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    idToken: payload.id_token,
    tokenType: payload.token_type,
    scope: payload.scope,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
    profile: {
      id: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      emailVerified: profile.email_verified,
    },
    createdAt,
    updatedAt: createdAt,
  };

  await writeSessionFile(session);
  return {
    returnTo: stateRecord.returnTo,
    session: publicSession(session),
  };
}

export async function getGoogleSession() {
  return {
    configured: isConfigured(),
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: GOOGLE_WORKSPACE_SCOPES,
    session: publicSession(await readSessionFile()),
  };
}

export async function requireGoogleAccessToken() {
  requireConfigured();
  const session = await readSessionFile();
  if (!session?.accessToken) {
    throw new HttpError(401, 'Google sign-in is required.');
  }

  if (Number(session.expiresAt || 0) - EXPIRY_BUFFER_MS <= Date.now()) {
    const refreshed = await refreshToken(session);
    return refreshed.accessToken;
  }

  return session.accessToken;
}

export async function logoutGoogle() {
  const session = await readSessionFile();
  const token = session?.refreshToken || session?.accessToken;

  if (token) {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
  }

  await deleteSessionFile();
  return { ok: true };
}

async function googleApi(url, options = {}) {
  const accessToken = await requireGoogleAccessToken();
  return fetchJson(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

function headerValue(headers = [], name) {
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export async function listDriveFiles(body = {}) {
  const limit = clampLimit(body.limit ?? body.pageSize, 10, 30);
  const query = cleanString(body.query);
  const url = new URL(GOOGLE_DRIVE_FILES_URL);
  url.searchParams.set('pageSize', String(limit));
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set(
    'fields',
    'files(id,name,mimeType,webViewLink,modifiedTime,owners(displayName,emailAddress),iconLink)',
  );
  url.searchParams.set('q', query || 'trashed=false');

  const payload = await googleApi(url);
  return {
    files: (payload.files || []).map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      webViewLink: file.webViewLink,
      modifiedTime: file.modifiedTime,
      owner: file.owners?.[0] ?? null,
      iconLink: file.iconLink,
    })),
  };
}

export async function listCalendarEvents(body = {}) {
  const limit = clampLimit(body.limit ?? body.maxResults, 10, 30);
  const url = new URL(GOOGLE_CALENDAR_EVENTS_URL);
  url.searchParams.set('maxResults', String(limit));
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeMin', cleanString(body.timeMin) || new Date().toISOString());
  url.searchParams.set('fields', 'items(id,summary,htmlLink,start,end,location,attendees(email,responseStatus))');

  const payload = await googleApi(url);
  return {
    events: (payload.items || []).map((event) => ({
      id: event.id,
      summary: event.summary || 'Untitled event',
      htmlLink: event.htmlLink,
      start: event.start,
      end: event.end,
      location: event.location,
      attendees: event.attendees ?? [],
    })),
  };
}

export async function listGmailMessages(body = {}) {
  const limit = clampLimit(body.limit ?? body.maxResults, 8, 20);
  const query = cleanString(body.query);
  const listUrl = new URL(GOOGLE_GMAIL_MESSAGES_URL);
  listUrl.searchParams.set('maxResults', String(limit));
  if (query) {
    listUrl.searchParams.set('q', query);
  }

  const listPayload = await googleApi(listUrl);
  const messages = await Promise.all(
    (listPayload.messages || []).slice(0, limit).map(async (message) => {
      const detailUrl = new URL(`${GOOGLE_GMAIL_MESSAGES_URL}/${message.id}`);
      detailUrl.searchParams.set('format', 'metadata');
      detailUrl.searchParams.append('metadataHeaders', 'From');
      detailUrl.searchParams.append('metadataHeaders', 'Subject');
      detailUrl.searchParams.append('metadataHeaders', 'Date');
      const detail = await googleApi(detailUrl);
      const headers = detail.payload?.headers ?? [];

      return {
        id: detail.id,
        threadId: detail.threadId,
        snippet: detail.snippet,
        from: headerValue(headers, 'From'),
        subject: headerValue(headers, 'Subject') || '(no subject)',
        date: headerValue(headers, 'Date'),
      };
    }),
  );

  return { messages };
}

export async function getWorkspaceOverview() {
  const [drive, calendar, gmail] = await Promise.allSettled([
    listDriveFiles({ limit: 6 }),
    listCalendarEvents({ limit: 6 }),
    listGmailMessages({ limit: 6 }),
  ]);

  return {
    drive: drive.status === 'fulfilled' ? drive.value.files : [],
    calendar: calendar.status === 'fulfilled' ? calendar.value.events : [],
    gmail: gmail.status === 'fulfilled' ? gmail.value.messages : [],
    errors: [
      drive.status === 'rejected' ? { area: 'drive', message: drive.reason?.message || 'Drive failed' } : null,
      calendar.status === 'rejected' ? { area: 'calendar', message: calendar.reason?.message || 'Calendar failed' } : null,
      gmail.status === 'rejected' ? { area: 'gmail', message: gmail.reason?.message || 'Gmail failed' } : null,
    ].filter(Boolean),
  };
}
