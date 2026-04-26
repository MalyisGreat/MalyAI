import { DEFAULT_OLLAMA_MODEL, OLLAMA_BASE_URL, REQUEST_TIMEOUT_MS } from '../config.js';
import { readResponseText } from './http.js';

function resolveOllamaUrl(path, baseUrl = OLLAMA_BASE_URL) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

function formatOllamaError(error) {
  if (error?.name === 'AbortError') {
    return 'Ollama request stopped';
  }

  return error?.message || 'Ollama request failed';
}

function createRequestSignal(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abort, { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abort);
    },
  };
}

function modelPolicy(model) {
  const name = String(model || '').toLowerCase();
  if (name.includes('4b')) {
    return { keepAlive: '20s', maxContext: 16384, maxPredict: 8192 };
  }
  if (name.includes('2b') || name.includes('1.7b') || name.includes('3b')) {
    return { keepAlive: '1m', maxContext: 32768, maxPredict: 12288 };
  }

  return { keepAlive: '5m', maxContext: 65536, maxPredict: 65536 };
}

function clampOptionsForModel(options, model) {
  const policy = modelPolicy(model);
  const input = options || {};

  return {
    ...input,
    num_ctx: Math.min(Math.max(Number(input.num_ctx) || policy.maxContext, 1024), policy.maxContext),
    num_predict: Math.min(Math.max(Number(input.num_predict) || 2048, 256), policy.maxPredict),
  };
}

export function normalizeMessages(body) {
  const input = Array.isArray(body?.messages)
    ? body.messages
    : [{ role: 'user', content: body?.message ?? body?.prompt ?? '' }];

  return input
    .map((message) => {
      const images = Array.isArray(message?.images)
        ? message.images
            .map((image) => String(image || '').replace(/^data:image\/[^;]+;base64,/, ''))
            .filter((image) => image.length > 0)
        : [];

      return {
        role: ['system', 'assistant', 'user', 'tool'].includes(message?.role) ? message.role : 'user',
        content: String(message?.content ?? ''),
        ...(images.length > 0 ? { images } : {}),
      };
    })
    .filter((message) => message.content.trim().length > 0);
}

export function latestUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return messages[index].content;
    }
  }

  return '';
}

export async function ollamaChat({
  messages,
  model = DEFAULT_OLLAMA_MODEL,
  stream = false,
  options = undefined,
  keepAlive = undefined,
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal = undefined,
}) {
  const timeout = createRequestSignal(timeoutMs, signal);
  const policy = modelPolicy(model);

  try {
    const response = await fetch(resolveOllamaUrl('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream,
        think: false,
        keep_alive: keepAlive || policy.keepAlive,
        options: clampOptionsForModel(options, model),
      }),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const detail = await readResponseText(response);
      throw new Error(`Ollama responded ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    return response;
  } catch (error) {
    throw new Error(formatOllamaError(error));
  } finally {
    timeout.clear();
  }
}

export async function ollamaChatText({
  messages,
  model = DEFAULT_OLLAMA_MODEL,
  options = undefined,
  keepAlive = undefined,
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal = undefined,
}) {
  const response = await ollamaChat({
    messages,
    model,
    stream: false,
    options,
    keepAlive,
    timeoutMs,
    signal,
  });
  const payload = await response.json();

  return {
    content: payload?.message?.content || payload?.response || '',
    raw: payload,
  };
}

export async function ollamaAvailable() {
  const timeout = createRequestSignal(3000);

  try {
    const response = await fetch(resolveOllamaUrl('/api/version'), { signal: timeout.signal });
    if (!response.ok) {
      return { ok: false, error: `Ollama responded ${response.status}` };
    }

    return { ok: true, ...(await response.json()) };
  } catch (error) {
    return { ok: false, error: formatOllamaError(error) };
  } finally {
    timeout.clear();
  }
}
