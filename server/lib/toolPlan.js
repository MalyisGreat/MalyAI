import { HttpError } from './http.js';

const TOOL_DEFINITIONS = [
  {
    name: 'web_search',
    purpose: 'Find current external information when the prompt asks for recent facts, sources, docs, or news.',
    inputShape: { query: 'string', limit: 'number optional' },
  },
  {
    name: 'workspace_read',
    purpose: 'Read a text file from a user-approved workspace root.',
    inputShape: { root: 'string', path: 'string' },
  },
  {
    name: 'workspace_write',
    purpose: 'Write text content to a path under a user-approved workspace root.',
    inputShape: { root: 'string', path: 'string', content: 'string' },
  },
  {
    name: 'run_code',
    purpose: 'Run a small JavaScript snippet or return an HTML/text artifact.',
    inputShape: { language: 'javascript|html|text', code: 'string' },
  },
  {
    name: 'render_artifact',
    purpose: 'Display generated HTML or text output for inspection.',
    inputShape: { language: 'html|text', content: 'string' },
  },
  {
    name: 'memory_save',
    purpose: 'Save a durable user preference or project fact when explicitly useful.',
    inputShape: { type: 'string', text: 'string', confidence: 'number optional' },
  },
];

function cleanPrompt(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'prompt is required');
  }

  return value.trim();
}

function inferSteps(prompt) {
  const lower = prompt.toLowerCase();
  const steps = [];

  if (/\b(latest|current|today|news|search|source|docs?|look up)\b/.test(lower)) {
    steps.push({
      tool: 'web_search',
      reason: 'The prompt appears to need external or current information.',
      status: 'planned',
    });
  }

  if (/\b(file|repo|workspace|codebase|read|inspect|tree)\b/.test(lower)) {
    steps.push({
      tool: 'workspace_read',
      reason: 'The prompt may need local project context before answering.',
      status: 'planned',
    });
  }

  if (/\b(write|edit|patch|create|save|modify|implement|fix)\b/.test(lower)) {
    steps.push({
      tool: 'workspace_write',
      reason: 'The prompt may require a controlled workspace edit.',
      status: 'planned',
    });
  }

  if (/\b(run|execute|test|snippet|javascript|html|render|preview)\b/.test(lower)) {
    steps.push({
      tool: 'run_code',
      reason: 'The prompt may benefit from a small execution or generated artifact.',
      status: 'planned',
    });
  }

  if (/\b(remember|memory|preference|always|next time)\b/.test(lower)) {
    steps.push({
      tool: 'memory_save',
      reason: 'The prompt may contain durable user or project guidance.',
      status: 'planned',
    });
  }

  if (steps.length === 0) {
    steps.push({
      tool: 'workspace_read',
      reason: 'Default to gathering local context only if the user provides a workspace root.',
      status: 'optional',
    });
  }

  return steps.map((step, index) => ({ id: index + 1, ...step }));
}

export function createToolPlan(body = {}) {
  const prompt = cleanPrompt(body.prompt || body.message);
  const steps = inferSteps(prompt);

  if (steps.some((step) => step.tool === 'run_code')) {
    steps.push({
      id: steps.length + 1,
      tool: 'render_artifact',
      reason: 'Render any HTML/text artifact produced by code execution or generation.',
      status: 'optional',
    });
  }

  return {
    prompt,
    createdAt: new Date().toISOString(),
    mode: 'planning-only',
    warning: 'This endpoint returns a structured plan and does not execute tools.',
    availableTools: TOOL_DEFINITIONS,
    steps,
  };
}
