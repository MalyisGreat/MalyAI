import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.js';

const EXCLUDED_SEGMENTS = new Set(['node_modules', 'dist', '.git', 'logs']);
const DEFAULT_TREE_DEPTH = 5;
const DEFAULT_TREE_LIMIT = 1500;
const MAX_TREE_DEPTH = 12;
const MAX_READ_BYTES = 1024 * 1024;
const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_PATCH_LINES = 400;

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `${name} is required`);
  }

  return value;
}

function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function relativePath(root, target) {
  const relative = path.relative(root, target);
  return relative ? relative.split(path.sep).join('/') : '';
}

function assertNotExcluded(root, target) {
  const relative = path.relative(root, target);
  const parts = relative.split(path.sep).filter(Boolean);
  const excluded = parts.find((part) => EXCLUDED_SEGMENTS.has(part));
  if (excluded) {
    throw new HttpError(400, `Path is excluded by workspace policy: ${excluded}`);
  }
}

export async function resolveWorkspaceTarget({ root, filePath = '.', allowRoot = true }) {
  const rootInput = requireString(root, 'root');
  const resolvedRoot = path.resolve(rootInput);
  const rootStat = await statOrNull(resolvedRoot);

  if (!rootStat?.isDirectory()) {
    throw new HttpError(400, 'root must be an existing directory');
  }

  const pathInput = typeof filePath === 'string' && filePath.trim() ? filePath : '.';
  const target = path.resolve(resolvedRoot, pathInput);

  if (!isInsideRoot(resolvedRoot, target)) {
    throw new HttpError(400, 'path must stay inside root');
  }

  if (!allowRoot && target === resolvedRoot) {
    throw new HttpError(400, 'path must point to a file under root');
  }

  assertNotExcluded(resolvedRoot, target);

  return {
    root: resolvedRoot,
    target,
    path: relativePath(resolvedRoot, target),
  };
}

async function statOrNull(target) {
  try {
    return await fs.stat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function parseLimit(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.trunc(parsed), max);
}

async function fileMetadata(root, target, stat = null) {
  const fileStat = stat || (await fs.stat(target));
  return {
    path: relativePath(root, target),
    name: path.basename(target),
    type: fileStat.isDirectory() ? 'directory' : 'file',
    size: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
  };
}

async function buildTreeEntry({ root, target, depthRemaining, state }) {
  if (state.count >= state.maxEntries) {
    state.truncated = true;
    return null;
  }

  const stat = await fs.stat(target);
  state.count += 1;

  const entry = await fileMetadata(root, target, stat);
  if (!stat.isDirectory() || depthRemaining <= 0) {
    return entry;
  }

  let children;
  try {
    children = await fs.readdir(target, { withFileTypes: true });
  } catch (error) {
    entry.error = error?.message || 'Unable to read directory';
    return entry;
  }

  entry.children = [];
  const visibleChildren = children
    .filter((child) => !EXCLUDED_SEGMENTS.has(child.name))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

  for (const child of visibleChildren) {
    const childTarget = path.join(target, child.name);
    const childEntry = await buildTreeEntry({
      root,
      target: childTarget,
      depthRemaining: depthRemaining - 1,
      state,
    });

    if (childEntry) {
      entry.children.push(childEntry);
    }

    if (state.truncated) {
      break;
    }
  }

  return entry;
}

export async function getWorkspaceTree(body = {}) {
  const { root, target, path: requestPath } = await resolveWorkspaceTarget({
    root: body.root,
    filePath: body.path,
  });
  const targetStat = await statOrNull(target);

  if (!targetStat) {
    throw new HttpError(404, 'Workspace path was not found');
  }

  const state = {
    count: 0,
    maxEntries: parseLimit(body.maxEntries, DEFAULT_TREE_LIMIT, DEFAULT_TREE_LIMIT),
    truncated: false,
  };
  const maxDepth = parseLimit(body.maxDepth, DEFAULT_TREE_DEPTH, MAX_TREE_DEPTH);
  const tree = await buildTreeEntry({
    root,
    target,
    depthRemaining: maxDepth,
    state,
  });

  return {
    root,
    path: requestPath,
    maxDepth,
    maxEntries: state.maxEntries,
    count: state.count,
    truncated: state.truncated,
    tree,
    excluded: [...EXCLUDED_SEGMENTS],
  };
}

function assertReadableText(content) {
  if (content.includes('\0')) {
    throw new HttpError(415, 'Only text files can be read');
  }
}

export async function readWorkspaceFile(body = {}) {
  const { root, target, path: requestPath } = await resolveWorkspaceTarget({
    root: body.root,
    filePath: body.path,
    allowRoot: false,
  });
  const stat = await statOrNull(target);

  if (!stat) {
    throw new HttpError(404, 'File was not found');
  }

  if (!stat.isFile()) {
    throw new HttpError(400, 'path must point to a file');
  }

  if (stat.size > MAX_READ_BYTES) {
    throw new HttpError(413, `File is larger than ${MAX_READ_BYTES} bytes`);
  }

  const content = await fs.readFile(target, 'utf8');
  assertReadableText(content);

  return {
    root,
    path: requestPath,
    file: await fileMetadata(root, target, stat),
    content,
    encoding: 'utf8',
    maxBytes: MAX_READ_BYTES,
  };
}

export async function writeWorkspaceFile(body = {}) {
  if (typeof body.content !== 'string') {
    throw new HttpError(400, 'content must be a string');
  }

  const bytes = Buffer.byteLength(body.content, 'utf8');
  if (bytes > MAX_WRITE_BYTES) {
    throw new HttpError(413, `content is larger than ${MAX_WRITE_BYTES} bytes`);
  }

  const { root, target, path: requestPath } = await resolveWorkspaceTarget({
    root: body.root,
    filePath: body.path,
    allowRoot: false,
  });
  const existing = await statOrNull(target);

  if (existing?.isDirectory()) {
    throw new HttpError(400, 'path must point to a file');
  }

  const parent = path.dirname(target);
  if (!isInsideRoot(root, parent)) {
    throw new HttpError(400, 'File parent must stay inside root');
  }

  if (body.createDirs !== false) {
    await fs.mkdir(parent, { recursive: true });
  }

  await fs.writeFile(target, body.content, 'utf8');
  const stat = await fs.stat(target);

  return {
    root,
    path: requestPath,
    file: await fileMetadata(root, target, stat),
    bytesWritten: bytes,
    encoding: 'utf8',
  };
}

function splitLines(content) {
  return String(content).split(/\r?\n/);
}

function countChangedLines(oldLines, newLines) {
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  return {
    added: newLines.filter((line) => !oldSet.has(line)).length,
    removed: oldLines.filter((line) => !newSet.has(line)).length,
  };
}

function buildUnifiedDiff({ filePath, oldContent, newContent }) {
  if (oldContent === newContent) {
    return '';
  }

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(newContent);
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const contextBefore = oldLines.slice(Math.max(0, prefix - 3), prefix);
  const contextAfter = oldLines.slice(oldLines.length - suffix, oldLines.length - Math.max(0, suffix - 3));
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const oldStart = Math.max(1, prefix - contextBefore.length + 1);
  const newStart = Math.max(1, prefix - contextBefore.length + 1);
  const oldCount = contextBefore.length + removed.length + contextAfter.length;
  const newCount = contextBefore.length + added.length + contextAfter.length;

  const lines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...contextBefore.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...contextAfter.map((line) => ` ${line}`),
  ];

  if (lines.length > MAX_PATCH_LINES) {
    return [...lines.slice(0, MAX_PATCH_LINES), '... diff truncated ...'].join('\n');
  }

  return lines.join('\n');
}

export async function diffWorkspaceFile(body = {}) {
  if (typeof body.content !== 'string') {
    throw new HttpError(400, 'content must be a string to diff against the current file');
  }

  const newBytes = Buffer.byteLength(body.content, 'utf8');
  if (newBytes > MAX_WRITE_BYTES) {
    throw new HttpError(413, `content is larger than ${MAX_WRITE_BYTES} bytes`);
  }

  const { root, target, path: requestPath } = await resolveWorkspaceTarget({
    root: body.root,
    filePath: body.path,
    allowRoot: false,
  });
  const stat = await statOrNull(target);
  let oldContent = '';

  if (stat) {
    if (!stat.isFile()) {
      throw new HttpError(400, 'path must point to a file');
    }

    if (stat.size > MAX_READ_BYTES) {
      throw new HttpError(413, `File is larger than ${MAX_READ_BYTES} bytes`);
    }

    oldContent = await fs.readFile(target, 'utf8');
    assertReadableText(oldContent);
  }

  const oldLines = splitLines(oldContent);
  const newLines = splitLines(body.content);
  const lineCounts = countChangedLines(oldLines, newLines);

  return {
    root,
    path: requestPath,
    exists: Boolean(stat),
    changed: oldContent !== body.content,
    oldBytes: Buffer.byteLength(oldContent, 'utf8'),
    newBytes,
    addedLines: lineCounts.added,
    removedLines: lineCounts.removed,
    patch: buildUnifiedDiff({
      filePath: requestPath || path.basename(target),
      oldContent,
      newContent: body.content,
    }),
  };
}
