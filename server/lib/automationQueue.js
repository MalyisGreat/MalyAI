import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AUTOMATION_FILE,
  AUTOMATION_IDLE_MS,
  AUTOMATION_POLL_MS,
  DEFAULT_OLLAMA_MODEL,
} from '../config.js';
import { buildChatContext } from './context.js';
import { HttpError } from './http.js';
import { ollamaChatText } from './ollama.js';
import { createToolPlan } from './toolPlan.js';

const MAX_RESULT_CHARS = 12000;
const MAX_ERROR_CHARS = 2400;
const validCadences = new Set(['once', 'hourly', 'daily', 'weekly']);
const validStatuses = new Set(['queued', 'waiting_idle', 'running', 'complete', 'failed', 'paused']);

let state = {
  version: 1,
  tasks: [],
};
let loaded = false;
let saveChain = Promise.resolve();
let workerTimer = null;
let runningTaskId = null;
let activePromptCount = 0;
let lastPromptActivityAt = 0;
let lastWorkerCheckAt = null;
let lastWorkerMessage = 'Automation worker has not started.';

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = 'auto') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

function truncate(value, maxChars) {
  const text = String(value || '');
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[truncated]` : text;
}

function nextRunFromCadence(cadence, from = new Date()) {
  const next = new Date(from);
  if (cadence === 'hourly') {
    next.setHours(next.getHours() + 1);
  } else if (cadence === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (cadence === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else {
    return null;
  }

  return next.toISOString();
}

function readDateOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeTask(input = {}) {
  const prompt = clean(input.prompt || input.message || input.title);
  if (!prompt) {
    throw new HttpError(400, 'Automation prompt is required');
  }

  const cadence = validCadences.has(input.cadence) ? input.cadence : 'once';
  const createdAt = input.createdAt || nowIso();
  const status = validStatuses.has(input.status) ? input.status : 'queued';
  const nextRunAt =
    readDateOrNull(input.nextRunAt) ||
    (Number(input.delayMinutes) > 0
      ? new Date(Date.now() + clampNumber(input.delayMinutes, 0, 0, 525600) * 60000).toISOString()
      : createdAt);

  return {
    id: input.id || makeId(),
    title: clean(input.title) || prompt.slice(0, 72),
    prompt,
    cadence,
    status,
    model: clean(input.model) || DEFAULT_OLLAMA_MODEL,
    useSearch: input.useSearch !== false,
    useSubagents: input.useSubagents === true,
    idleWindowMs: clampNumber(input.idleWindowMs, AUTOMATION_IDLE_MS, 1000, 30 * 60 * 1000),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    nextRunAt,
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    runCount: clampNumber(input.runCount, 0, 0, 1000000),
    lastResult: input.lastResult || '',
    lastError: input.lastError || '',
    plan: Array.isArray(input.plan) ? input.plan : createToolPlan({ prompt }).steps,
  };
}

function publicTask(task) {
  return {
    ...task,
    isRunning: runningTaskId === task.id,
  };
}

async function ensureLoaded() {
  if (loaded) {
    return;
  }

  try {
    const raw = await fs.readFile(AUTOMATION_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    state = {
      version: 1,
      tasks: Array.isArray(parsed?.tasks)
        ? parsed.tasks
            .map((task) => {
              try {
                return normalizeTask(task);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : [],
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      lastWorkerMessage = `Automation store read failed: ${error.message}`;
    }
    state = { version: 1, tasks: [] };
  }

  loaded = true;
}

async function saveState() {
  await fs.mkdir(path.dirname(AUTOMATION_FILE), { recursive: true });
  const payload = JSON.stringify(state, null, 2);
  saveChain = saveChain.then(() => fs.writeFile(AUTOMATION_FILE, payload, 'utf8'));
  await saveChain;
}

function isIdleFor(task) {
  if (activePromptCount > 0 || runningTaskId) {
    return false;
  }

  const idleWindowMs = task?.idleWindowMs || AUTOMATION_IDLE_MS;
  return Date.now() - lastPromptActivityAt >= idleWindowMs;
}

function findDueTask() {
  const now = Date.now();
  return state.tasks
    .filter((task) => task.status !== 'paused' && task.status !== 'running')
    .filter((task) => task.nextRunAt && new Date(task.nextRunAt).getTime() <= now)
    .sort((left, right) => new Date(left.nextRunAt).getTime() - new Date(right.nextRunAt).getTime())[0];
}

function scheduleAfterRun(task) {
  const finishedAt = nowIso();
  const nextRunAt = nextRunFromCadence(task.cadence, new Date(finishedAt));
  task.completedAt = finishedAt;
  task.updatedAt = finishedAt;
  task.nextRunAt = nextRunAt;
  task.status = nextRunAt ? 'queued' : 'complete';
}

async function runTask(task) {
  runningTaskId = task.id;
  const startedAt = nowIso();
  Object.assign(task, {
    status: 'running',
    startedAt,
    updatedAt: startedAt,
    lastError: '',
  });
  await saveState();

  try {
    const messages = [{ role: 'user', content: task.prompt }];
    const context = await buildChatContext({
      body: {
        model: task.model,
        search: task.useSearch,
        useSubagents: task.useSubagents,
        memoryLimit: 6,
      },
      messages,
      userText: task.prompt,
    });
    const { content } = await ollamaChatText({
      model: context.model,
      messages: context.messages,
      timeoutMs: 10 * 60 * 1000,
      options: {
        temperature: 0.4,
        num_predict: 8192,
        num_ctx: 65536,
      },
    });

    task.runCount += 1;
    task.lastResult = truncate(content, MAX_RESULT_CHARS);
    scheduleAfterRun(task);
    lastWorkerMessage = `Completed "${task.title}".`;
  } catch (error) {
    const failedAt = nowIso();
    task.status = 'failed';
    task.updatedAt = failedAt;
    task.completedAt = failedAt;
    task.lastError = truncate(error?.message || 'Automation failed', MAX_ERROR_CHARS);
    lastWorkerMessage = `Failed "${task.title}": ${task.lastError}`;
  } finally {
    runningTaskId = null;
    await saveState();
  }
}

async function workerTick() {
  await ensureLoaded();
  lastWorkerCheckAt = nowIso();

  const task = findDueTask();
  if (!task) {
    lastWorkerMessage = 'No automation tasks are due.';
    return;
  }

  if (!isIdleFor(task)) {
    if (task.status === 'queued') {
      task.status = 'waiting_idle';
      task.updatedAt = nowIso();
      await saveState();
    }
    lastWorkerMessage = activePromptCount > 0 ? 'Waiting for active chat prompt to finish.' : 'Waiting for GPU idle window.';
    return;
  }

  await runTask(task);
}

export async function startAutomationWorker() {
  await ensureLoaded();
  if (workerTimer) {
    return;
  }

  workerTimer = setInterval(() => {
    void workerTick().catch((error) => {
      lastWorkerMessage = error?.message || 'Automation worker failed.';
    });
  }, AUTOMATION_POLL_MS);
  workerTimer.unref?.();
  void workerTick();
}

export function noteInteractivePromptStart() {
  activePromptCount += 1;
  lastPromptActivityAt = Date.now();
}

export function noteInteractivePromptEnd() {
  activePromptCount = Math.max(0, activePromptCount - 1);
  lastPromptActivityAt = Date.now();
}

export async function listAutomations() {
  await ensureLoaded();
  return {
    tasks: state.tasks.map(publicTask),
    status: getAutomationStatus(),
  };
}

export function getAutomationStatus() {
  return {
    activePromptCount,
    runningTaskId,
    idleForMs: Date.now() - lastPromptActivityAt,
    defaultIdleWindowMs: AUTOMATION_IDLE_MS,
    pollMs: AUTOMATION_POLL_MS,
    lastWorkerCheckAt,
    lastWorkerMessage,
  };
}

export async function createAutomation(input = {}) {
  await ensureLoaded();
  const task = normalizeTask(input);
  state.tasks = [task, ...state.tasks].slice(0, 100);
  await saveState();
  return publicTask(task);
}

export async function updateAutomation(id, patch = {}) {
  await ensureLoaded();
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) {
    throw new HttpError(404, 'Automation not found');
  }

  if (patch.title !== undefined) {
    task.title = clean(patch.title) || task.title;
  }
  if (patch.prompt !== undefined) {
    task.prompt = clean(patch.prompt) || task.prompt;
    task.plan = createToolPlan({ prompt: task.prompt }).steps;
  }
  if (patch.cadence !== undefined && validCadences.has(patch.cadence)) {
    task.cadence = patch.cadence;
  }
  if (patch.status !== undefined && validStatuses.has(patch.status)) {
    task.status = patch.status;
  }
  if (patch.nextRunAt !== undefined) {
    task.nextRunAt = readDateOrNull(patch.nextRunAt);
  }
  if (patch.model !== undefined) {
    task.model = clean(patch.model) || task.model;
  }
  if (patch.useSearch !== undefined) {
    task.useSearch = patch.useSearch !== false;
  }
  if (patch.useSubagents !== undefined) {
    task.useSubagents = patch.useSubagents === true;
  }
  if (patch.idleWindowMs !== undefined) {
    task.idleWindowMs = clampNumber(patch.idleWindowMs, task.idleWindowMs, 1000, 30 * 60 * 1000);
  }

  task.updatedAt = nowIso();
  await saveState();
  return publicTask(task);
}

export async function deleteAutomation(id) {
  await ensureLoaded();
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((task) => task.id !== id);
  if (state.tasks.length === before) {
    throw new HttpError(404, 'Automation not found');
  }

  await saveState();
  return { ok: true };
}

export async function runAutomationNow(id) {
  await ensureLoaded();
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) {
    throw new HttpError(404, 'Automation not found');
  }
  if (task.status === 'running' || runningTaskId === id) {
    return publicTask(task);
  }

  task.status = 'queued';
  task.nextRunAt = nowIso();
  task.updatedAt = nowIso();
  await saveState();
  void workerTick();
  return publicTask(task);
}
