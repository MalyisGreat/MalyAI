import { DEFAULT_OLLAMA_MODEL, OLLAMA_BASE_URL } from '../config.js';
import { createTimeoutSignal, readResponseText } from './http.js';

const RECOMMENDED_MODELS = [
  { name: 'qwen3.5:0.8b', label: 'Fast 0.8B', tier: 'fast' },
  { name: 'qwen3.5:2b', label: 'Smarter 2B', tier: 'balanced' },
  { name: 'qwen3.5:4b', label: 'Deep 4B', tier: 'deep' },
];

function resolveOllamaUrl(path) {
  return new URL(path, OLLAMA_BASE_URL.endsWith('/') ? OLLAMA_BASE_URL : `${OLLAMA_BASE_URL}/`).toString();
}

function normalizeModel(model) {
  const name = model?.name || model?.model || '';

  return {
    name,
    model: model?.model || name,
    default: name === DEFAULT_OLLAMA_MODEL || model?.model === DEFAULT_OLLAMA_MODEL,
    installed: true,
    modifiedAt: model?.modified_at || model?.modifiedAt || null,
    size: model?.size || null,
    digest: model?.digest || null,
    details: model?.details || null,
  };
}

function ensureDefaultModel(models) {
  const byName = new Map(models.map((model) => [model.name, model]));
  const merged = [...models];

  for (const recommended of RECOMMENDED_MODELS) {
    if (byName.has(recommended.name)) {
      const model = byName.get(recommended.name);
      Object.assign(model, {
        recommended: true,
        label: recommended.label,
        tier: recommended.tier,
      });
    } else {
      merged.push({
        name: recommended.name,
        model: recommended.name,
        default: recommended.name === DEFAULT_OLLAMA_MODEL,
        installed: false,
        recommended: true,
        label: recommended.label,
        tier: recommended.tier,
        modifiedAt: null,
        size: null,
        digest: null,
        details: null,
      });
    }
  }

  if (!merged.some((model) => model.default)) {
    merged.unshift({
      name: DEFAULT_OLLAMA_MODEL,
      model: DEFAULT_OLLAMA_MODEL,
      default: true,
      installed: false,
      modifiedAt: null,
      size: null,
      digest: null,
      details: null,
    });
  }

  return merged.sort((left, right) => {
    const leftIndex = RECOMMENDED_MODELS.findIndex((model) => model.name === left.name);
    const rightIndex = RECOMMENDED_MODELS.findIndex((model) => model.name === right.name);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    }
    return left.name.localeCompare(right.name);
  });
}

export async function listOllamaModels() {
  const timeout = createTimeoutSignal(5000);

  try {
    const response = await fetch(resolveOllamaUrl('/api/tags'), {
      signal: timeout.signal,
    });

    if (!response.ok) {
      const detail = await readResponseText(response);
      throw new Error(`Ollama responded ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    const models = ensureDefaultModel((payload?.models || []).map(normalizeModel));

    return {
      ok: true,
      source: resolveOllamaUrl('/api/tags'),
      defaultModel: DEFAULT_OLLAMA_MODEL,
      recommendedModels: RECOMMENDED_MODELS,
      models,
    };
  } catch (error) {
    return {
      ok: false,
      source: resolveOllamaUrl('/api/tags'),
      defaultModel: DEFAULT_OLLAMA_MODEL,
      recommendedModels: RECOMMENDED_MODELS,
      models: ensureDefaultModel([]),
      error: error?.name === 'AbortError' ? 'Ollama model request timed out' : error?.message || 'Ollama model request failed',
    };
  } finally {
    timeout.clear();
  }
}

export async function listRunningOllamaModels() {
  const timeout = createTimeoutSignal(5000);

  try {
    const response = await fetch(resolveOllamaUrl('/api/ps'), {
      signal: timeout.signal,
    });

    if (!response.ok) {
      const detail = await readResponseText(response);
      throw new Error(`Ollama responded ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    const payload = await response.json();
    return {
      ok: true,
      models: payload?.models || [],
    };
  } catch (error) {
    return {
      ok: false,
      models: [],
      error: error?.name === 'AbortError' ? 'Ollama running-model request timed out' : error?.message || 'Ollama running-model request failed',
    };
  } finally {
    timeout.clear();
  }
}

export async function unloadOllamaModel(model = DEFAULT_OLLAMA_MODEL) {
  const timeout = createTimeoutSignal(10000);
  const target = String(model || DEFAULT_OLLAMA_MODEL);

  try {
    const response = await fetch(resolveOllamaUrl('/api/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: target,
        stream: false,
        keep_alive: 0,
      }),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const detail = await readResponseText(response);
      throw new Error(`Ollama responded ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    return {
      ok: true,
      model: target,
    };
  } catch (error) {
    return {
      ok: false,
      model: target,
      error: error?.name === 'AbortError' ? 'Ollama unload timed out' : error?.message || 'Ollama unload failed',
    };
  } finally {
    timeout.clear();
  }
}
