import { DEFAULT_OLLAMA_MODEL, MEMORY_EXTRACTION_TIMEOUT_MS } from '../config.js';
import { createMemory } from './memoryStore.js';
import { ollamaChatText } from './ollama.js';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = clean(candidate.text).toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractHeuristicMemories(userText) {
  const text = clean(userText);
  const candidates = [];
  const patterns = [
    {
      regex: /\b(?:remember that|remember:|please remember)\s+(.{8,220})/i,
      type: 'instruction',
      confidence: 0.92,
    },
    {
      regex: /\bmy name is\s+([a-z][a-z\s'-]{1,80})/i,
      type: 'profile',
      confidence: 0.95,
      map: (match) => `User's name is ${clean(match[1])}.`,
    },
    {
      regex: /\bi prefer\s+(.{4,180})/i,
      type: 'preference',
      confidence: 0.86,
      map: (match) => `User prefers ${clean(match[1])}.`,
    },
    {
      regex: /\bi (?:usually|always)\s+(.{8,180})/i,
      type: 'preference',
      confidence: 0.78,
      map: (match) => `User usually ${clean(match[1])}.`,
    },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (!match) {
      continue;
    }

    const mappedText = pattern.map ? pattern.map(match) : clean(match[1]);
    candidates.push({
      type: pattern.type,
      text: mappedText.replace(/[.!?]*$/, '.'),
      confidence: pattern.confidence,
      source: 'chat-heuristic',
    });
  }

  return uniqueCandidates(candidates);
}

async function extractOllamaMemories({ userText, assistantText, model }) {
  if (process.env.MALY_DISABLE_LLM_MEMORY_EXTRACTION === '1') {
    return [];
  }

  try {
    const { content } = await ollamaChatText({
      model,
      timeoutMs: MEMORY_EXTRACTION_TIMEOUT_MS,
      messages: [
        {
          role: 'system',
          content:
            'Extract only explicit, stable user preferences, profile facts, or instructions the user clearly wants remembered. Return strict JSON: {"memories":[{"type":"preference|profile|instruction|context","text":"...","confidence":0.0}]} Return {"memories":[]} if unsure.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            user: userText,
            assistant: assistantText.slice(0, 2000),
          }),
        },
      ],
    });

    const jsonText = content.match(/\{[\s\S]*\}/)?.[0] || content;
    const parsed = JSON.parse(jsonText);
    const memories = Array.isArray(parsed?.memories) ? parsed.memories : [];

    return uniqueCandidates(
      memories
        .map((memory) => ({
          type: clean(memory.type) || 'context',
          text: clean(memory.text),
          confidence: Number(memory.confidence),
          source: 'chat-ollama',
        }))
        .filter((memory) => memory.text.length >= 8 && memory.confidence >= 0.7),
    );
  } catch {
    return [];
  }
}

export async function extractAndStoreMemories({
  userText,
  assistantText,
  model = DEFAULT_OLLAMA_MODEL,
}) {
  const heuristic = extractHeuristicMemories(userText);
  const ollama = await extractOllamaMemories({ userText, assistantText, model });
  const candidates = uniqueCandidates([...heuristic, ...ollama]).slice(0, 4);
  const stored = [];

  for (const candidate of candidates) {
    try {
      stored.push(await createMemory(candidate));
    } catch {
      // Memory extraction should never fail the chat response.
    }
  }

  return stored;
}
