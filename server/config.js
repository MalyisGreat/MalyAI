import { fileURLToPath } from 'node:url';

export const API_PORT = Number(process.env.MALY_API_PORT || 8791);
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';

export const MEMORY_FILE = fileURLToPath(new URL('./data/memories.json', import.meta.url));
export const GOOGLE_SESSION_FILE = fileURLToPath(new URL('./data/google-session.json', import.meta.url));
export const AUTOMATION_FILE = fileURLToPath(new URL('./data/automations.json', import.meta.url));

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || `http://127.0.0.1:${API_PORT}/api/google/callback`;

export const REQUEST_TIMEOUT_MS = Number(process.env.MALY_REQUEST_TIMEOUT_MS || 300000);
export const SEARCH_TIMEOUT_MS = Number(process.env.MALY_SEARCH_TIMEOUT_MS || 12000);
export const MEMORY_EXTRACTION_TIMEOUT_MS = Number(
  process.env.MALY_MEMORY_EXTRACTION_TIMEOUT_MS || 8000,
);
export const AUTOMATION_POLL_MS = Number(process.env.MALY_AUTOMATION_POLL_MS || 5000);
export const AUTOMATION_IDLE_MS = Number(process.env.MALY_AUTOMATION_IDLE_MS || 12000);
