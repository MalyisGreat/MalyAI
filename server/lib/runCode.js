import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http.js';

const RUNS_DIR = fileURLToPath(new URL('../data/runs/', import.meta.url));
const MAX_CODE_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 15000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const JAVASCRIPT_BLOCKLIST = [
  /\bchild_process\b/i,
  /\bexec(File|Sync)?\b/i,
  /\bspawn(Sync)?\b/i,
  /\bfork\b/i,
  /\bworker_threads\b/i,
  /\bcluster\b/i,
  /\brequire\s*\(/i,
  /\bimport\s*\(/i,
  /^\s*import\s+/im,
  /\bprocess\b/i,
  /\bfs\b/i,
  /\bnet\b/i,
  /\bhttp2?\b/i,
  /\bdgram\b/i,
  /\btls\b/i,
];

function normalizeLanguage(input) {
  const language = String(input || 'javascript').toLowerCase().trim();
  if (['js', 'javascript', 'node'].includes(language)) {
    return 'javascript';
  }

  if (['html', 'text/html'].includes(language)) {
    return 'html';
  }

  if (['txt', 'text', 'plain'].includes(language)) {
    return 'text';
  }

  throw new HttpError(400, 'language must be javascript, html, or text');
}

function requireCode(value, maxBytes = MAX_CODE_BYTES) {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'code must be a string');
  }

  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > maxBytes) {
    throw new HttpError(413, `code is larger than ${maxBytes} bytes`);
  }

  return bytes;
}

function parseTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(Math.trunc(parsed), MAX_TIMEOUT_MS);
}

function assertAllowedJavascript(code) {
  const match = JAVASCRIPT_BLOCKLIST.find((pattern) => pattern.test(code));
  if (match) {
    throw new HttpError(400, 'JavaScript snippets cannot use filesystem, process, network, import, require, or child-process APIs');
  }
}

function appendOutput(existing, chunk) {
  const combined = Buffer.concat([existing, Buffer.from(chunk)]);
  if (combined.length <= MAX_OUTPUT_BYTES) {
    return { buffer: combined, truncated: false };
  }

  return {
    buffer: combined.subarray(0, MAX_OUTPUT_BYTES),
    truncated: true,
  };
}

function runNodeSnippet({ file, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [file], {
      cwd: RUNS_DIR,
      env: { PATH: process.env.PATH },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const next = appendOutput(stdout, chunk);
      stdout = next.buffer;
      stdoutTruncated = stdoutTruncated || next.truncated;
    });

    child.stderr.on('data', (chunk) => {
      const next = appendOutput(stderr, chunk);
      stderr = next.buffer;
      stderrTruncated = stderrTruncated || next.truncated;
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        stdout: '',
        stderr: error?.message || 'Node execution failed',
        exitCode: 1,
        signal: null,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdoutTruncated,
        stderrTruncated,
      });
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        exitCode,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

export async function runCode(body = {}) {
  const language = normalizeLanguage(body.language || body.type);
  const code = body.code ?? body.content ?? '';

  if (language === 'html') {
    const bytes = requireCode(code, MAX_ARTIFACT_BYTES);
    return {
      language,
      kind: 'artifact',
      renderable: true,
      document: code,
      bytes,
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }

  if (language === 'text') {
    const bytes = requireCode(code, MAX_ARTIFACT_BYTES);
    return {
      language,
      kind: 'artifact',
      renderable: false,
      content: code,
      bytes,
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }

  const bytes = requireCode(code);
  assertAllowedJavascript(code);
  await fs.mkdir(RUNS_DIR, { recursive: true });

  const runId = `run-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
  const file = path.join(RUNS_DIR, `${runId}.mjs`);
  const timeoutMs = parseTimeout(body.timeoutMs);

  await fs.writeFile(file, code, 'utf8');

  try {
    const result = await runNodeSnippet({ file, timeoutMs });
    return {
      runId,
      language,
      kind: 'execution',
      bytes,
      timeoutMs,
      ...result,
    };
  } finally {
    await fs.rm(file, { force: true });
  }
}
