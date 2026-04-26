import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MEMORY_FILE } from '../config.js';

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0.75;
  }

  return Math.min(1, Math.max(0, number));
}

async function ensureMemoryFile() {
  await mkdir(dirname(MEMORY_FILE), { recursive: true });

  try {
    await readFile(MEMORY_FILE, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    await writeFile(MEMORY_FILE, '[]\n', 'utf8');
  }
}

export async function readMemories() {
  await ensureMemoryFile();
  const content = await readFile(MEMORY_FILE, 'utf8');

  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeMemories(memories) {
  await ensureMemoryFile();
  const tmpFile = `${MEMORY_FILE}.${process.pid}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(memories, null, 2)}\n`, 'utf8');
  await rename(tmpFile, MEMORY_FILE);
}

export async function listMemories({ q = '', type = '', limit = 50 } = {}) {
  const memories = await readMemories();
  const query = normalizeText(q).toLowerCase();
  const cleanType = normalizeText(type).toLowerCase();

  return memories
    .filter((memory) => {
      const typeMatches = !cleanType || String(memory.type || '').toLowerCase() === cleanType;
      const queryMatches =
        !query ||
        String(memory.text || '').toLowerCase().includes(query) ||
        String(memory.source || '').toLowerCase().includes(query);
      return typeMatches && queryMatches;
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));
}

export async function createMemory({
  type = 'preference',
  text,
  confidence = 0.75,
  source = 'manual',
}) {
  const cleanText = normalizeText(text);
  if (!cleanText) {
    throw new Error('Memory text is required');
  }

  const memories = await readMemories();
  const existing = memories.find(
    (memory) => normalizeText(memory.text).toLowerCase() === cleanText.toLowerCase(),
  );

  if (existing) {
    existing.confidence = Math.max(existing.confidence || 0, normalizeConfidence(confidence));
    existing.source = existing.source || source;
    await writeMemories(memories);
    return existing;
  }

  const memory = {
    id: randomUUID(),
    type: normalizeText(type) || 'preference',
    text: cleanText,
    confidence: normalizeConfidence(confidence),
    createdAt: new Date().toISOString(),
    source: normalizeText(source) || 'manual',
  };

  memories.unshift(memory);
  await writeMemories(memories);
  return memory;
}

export async function deleteMemory(id) {
  const cleanId = normalizeText(id);
  if (!cleanId) {
    throw new Error('Memory id is required');
  }

  const memories = await readMemories();
  const next = memories.filter((memory) => memory.id !== cleanId);
  await writeMemories(next);

  return { deleted: memories.length - next.length };
}

function tokenize(text) {
  return new Set(
    normalizeText(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length > 2),
  );
}

export async function selectMemories({ text, ids = [], limit = 6 } = {}) {
  const memories = await readMemories();
  const requestedIds = Array.isArray(ids) ? new Set(ids.map(String)) : new Set();

  if (requestedIds.size > 0) {
    return memories.filter((memory) => requestedIds.has(memory.id)).slice(0, limit);
  }

  const inputTokens = tokenize(text);
  if (inputTokens.size === 0) {
    return memories.slice(0, limit);
  }

  return memories
    .map((memory) => {
      const memoryTokens = tokenize(memory.text);
      let overlap = 0;
      for (const token of memoryTokens) {
        if (inputTokens.has(token)) {
          overlap += 1;
        }
      }

      return {
        memory,
        score: overlap + Number(memory.confidence || 0) * 0.25,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}
