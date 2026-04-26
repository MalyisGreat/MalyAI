import express from 'express';
import cors from 'cors';
import {
  API_PORT,
  DEFAULT_OLLAMA_MODEL,
  MEMORY_FILE,
  OLLAMA_BASE_URL,
} from './config.js';
import { asyncRoute, HttpError } from './lib/http.js';
import { buildChatContext, runSubagents } from './lib/context.js';
import { extractAndStoreMemories } from './lib/memoryExtraction.js';
import { createMemory, deleteMemory, listMemories } from './lib/memoryStore.js';
import { listOllamaModels, listRunningOllamaModels, unloadOllamaModel } from './lib/models.js';
import { latestUserMessage, normalizeMessages, ollamaAvailable, ollamaChat, ollamaChatText } from './lib/ollama.js';
import { runCode } from './lib/runCode.js';
import { searchWeb } from './lib/search.js';
import { getSystemResources } from './lib/systemResources.js';
import { createToolPlan } from './lib/toolPlan.js';
import {
  createAutomation,
  deleteAutomation,
  getAutomationStatus,
  listAutomations,
  noteInteractivePromptEnd,
  noteInteractivePromptStart,
  runAutomationNow,
  startAutomationWorker,
  updateAutomation,
} from './lib/automationQueue.js';
import {
  createGoogleAuthUrl,
  getGoogleConfig,
  getGoogleSession,
  getWorkspaceOverview,
  handleGoogleCallback,
  listCalendarEvents,
  listDriveFiles,
  listGmailMessages,
  logoutGoogle,
} from './lib/googleWorkspace.js';
import {
  diffWorkspaceFile,
  getWorkspaceTree,
  readWorkspaceFile,
  writeWorkspaceFile,
} from './lib/workspace.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: process.env.MALY_JSON_LIMIT || '25mb' }));

app.get('/api/health', asyncRoute(async (_req, res) => {
  const ollama = await ollamaAvailable();
  res.json({
    ok: true,
    service: 'maly-api',
    time: new Date().toISOString(),
    ollama,
  });
}));

app.get('/api/config', (_req, res) => {
  res.json({
    port: API_PORT,
    ollamaBaseUrl: OLLAMA_BASE_URL,
    defaultModel: DEFAULT_OLLAMA_MODEL,
    memoryFile: MEMORY_FILE,
    endpoints: [
      'GET /api/health',
      'GET /api/config',
      'GET /api/models',
      'GET /api/models/running',
      'POST /api/models/unload',
      'GET /api/system/resources',
      'POST /api/chat',
      'POST /api/search',
      'GET /api/memories',
      'POST /api/memories',
      'DELETE /api/memories',
      'POST /api/agents/run',
      'POST /api/workspace/tree',
      'POST /api/workspace/read',
      'POST /api/workspace/write',
      'POST /api/workspace/diff',
      'POST /api/run-code',
      'POST /api/tools/plan',
      'GET /api/automations',
      'POST /api/automations',
      'GET /api/automations/status',
      'PATCH /api/automations/:id',
      'POST /api/automations/:id/run',
      'DELETE /api/automations/:id',
      'GET /api/google/config',
      'GET /api/google/session',
      'GET /api/google/start',
      'GET /api/google/callback',
      'POST /api/google/logout',
      'GET /api/google/workspace/overview',
      'GET /api/google/drive/files',
      'GET /api/google/calendar/events',
      'GET /api/google/gmail/messages',
    ],
  });
});

app.get('/api/models', asyncRoute(async (_req, res) => {
  res.json(await listOllamaModels());
}));

app.get('/api/models/running', asyncRoute(async (_req, res) => {
  res.json(await listRunningOllamaModels());
}));

app.post('/api/models/unload', asyncRoute(async (req, res) => {
  res.json(await unloadOllamaModel(req.body?.model || req.query?.model || DEFAULT_OLLAMA_MODEL));
}));

app.get('/api/system/resources', asyncRoute(async (_req, res) => {
  res.json(await getSystemResources());
}));

app.post('/api/search', asyncRoute(async (req, res) => {
  const query = req.body?.query || req.body?.q;
  if (!query) {
    throw new HttpError(400, 'Search query is required');
  }

  res.json(await searchWeb(query, { limit: req.body?.limit || 5 }));
}));

app.get('/api/memories', asyncRoute(async (req, res) => {
  const memories = await listMemories({
    q: req.query.q,
    type: req.query.type,
    limit: req.query.limit,
  });

  res.json({ memories });
}));

app.post('/api/memories', asyncRoute(async (req, res) => {
  const memory = await createMemory({
    type: req.body?.type,
    text: req.body?.text,
    confidence: req.body?.confidence,
    source: req.body?.source || 'manual-api',
  });

  res.status(201).json({ memory });
}));

app.delete('/api/memories', asyncRoute(async (req, res) => {
  const id = req.query.id || req.body?.id;
  const result = await deleteMemory(id);
  res.json(result);
}));

app.post('/api/workspace/tree', asyncRoute(async (req, res) => {
  res.json(await getWorkspaceTree(req.body));
}));

app.post('/api/workspace/read', asyncRoute(async (req, res) => {
  res.json(await readWorkspaceFile(req.body));
}));

app.post('/api/workspace/write', asyncRoute(async (req, res) => {
  res.json(await writeWorkspaceFile(req.body));
}));

app.post('/api/workspace/diff', asyncRoute(async (req, res) => {
  res.json(await diffWorkspaceFile(req.body));
}));

app.post('/api/run-code', asyncRoute(async (req, res) => {
  res.json(await runCode(req.body));
}));

app.post('/api/tools/plan', asyncRoute(async (req, res) => {
  res.json(createToolPlan(req.body));
}));

app.get('/api/automations', asyncRoute(async (_req, res) => {
  res.json(await listAutomations());
}));

app.post('/api/automations', asyncRoute(async (req, res) => {
  res.status(201).json({ task: await createAutomation(req.body || {}), status: getAutomationStatus() });
}));

app.get('/api/automations/status', (_req, res) => {
  res.json(getAutomationStatus());
});

app.patch('/api/automations/:id', asyncRoute(async (req, res) => {
  res.json({ task: await updateAutomation(req.params.id, req.body || {}), status: getAutomationStatus() });
}));

app.post('/api/automations/:id/run', asyncRoute(async (req, res) => {
  res.json({ task: await runAutomationNow(req.params.id), status: getAutomationStatus() });
}));

app.delete('/api/automations/:id', asyncRoute(async (req, res) => {
  res.json(await deleteAutomation(req.params.id));
}));

app.get('/api/google/config', (_req, res) => {
  res.json(getGoogleConfig());
});

app.get('/api/google/session', asyncRoute(async (_req, res) => {
  res.json(await getGoogleSession());
}));

app.get('/api/google/start', asyncRoute(async (req, res) => {
  const authUrl = createGoogleAuthUrl({ returnTo: req.query.returnTo || '' });
  res.redirect(authUrl);
}));

app.get('/api/google/callback', asyncRoute(async (req, res) => {
  const result = await handleGoogleCallback({
    code: req.query.code,
    state: req.query.state,
  });

  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Maly AI Google Sign-In</title>
  <style>
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; font-family: Segoe UI, Arial, sans-serif; color: #1e1d1a; background: #f7f5ef; }
    main { max-width: 420px; padding: 28px; border: 1px solid #ddd7c9; border-radius: 8px; background: #fffdf8; box-shadow: 0 20px 50px rgba(35, 30, 20, 0.12); }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0; color: #706d65; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Google Workspace connected</h1>
    <p>You can close this window and return to Maly AI.</p>
  </main>
  <script>
    const payload = ${JSON.stringify({ type: 'maly-google-connected', session: result.session, returnTo: result.returnTo })};
    if (window.opener) {
      let targetOrigin = '*';
      try {
        targetOrigin = payload.returnTo ? new URL(payload.returnTo).origin : '*';
      } catch {
        targetOrigin = '*';
      }
      window.opener.postMessage(payload, targetOrigin);
      window.close();
    }
  </script>
</body>
</html>`);
}));

app.post('/api/google/logout', asyncRoute(async (_req, res) => {
  res.json(await logoutGoogle());
}));

app.get('/api/google/workspace/overview', asyncRoute(async (_req, res) => {
  res.json(await getWorkspaceOverview());
}));

app.get('/api/google/drive/files', asyncRoute(async (req, res) => {
  res.json(await listDriveFiles(req.query));
}));

app.get('/api/google/calendar/events', asyncRoute(async (req, res) => {
  res.json(await listCalendarEvents(req.query));
}));

app.get('/api/google/gmail/messages', asyncRoute(async (req, res) => {
  res.json(await listGmailMessages(req.query));
}));

app.post('/api/agents/run', asyncRoute(async (req, res) => {
  const prompt = req.body?.prompt || req.body?.message;
  if (!prompt) {
    throw new HttpError(400, 'Agent prompt is required');
  }

  const model = req.body?.model || DEFAULT_OLLAMA_MODEL;
  const subagents = await runSubagents({
    prompt,
    agents: req.body?.agents,
    model,
    options: req.body?.options,
    context: req.body?.context,
  });

  let orchestration = null;
  if (req.body?.orchestrate !== false) {
    const { content } = await ollamaChatText({
      model,
      options: req.body?.options,
      messages: [
        {
          role: 'system',
          content:
            'You are Maly AI orchestrating one 3-lane split-compute run. Compare CANDIDATE, EVIDENCE, CHECKS, RISKS, and CONFIDENCE from each lane. Exact tool/search/file evidence beats majority. Verified high-confidence work beats unchecked agreement. Produce one concise final answer and mention disagreement only when it materially affects the answer.',
        },
        {
          role: 'user',
          content: JSON.stringify({ prompt, subagents }),
        },
      ],
    });
    orchestration = content;
  }

  res.json({ model, subagents, orchestration });
}));

function hasSearchResults(context) {
  return Array.isArray(context?.search?.results) && context.search.results.length > 0;
}

function isSearchRefusal(content) {
  return /cannot\s+(browse|search|access|provide).*?(live|real[-\s]?time|web|internet|current)|do\s+not\s+have\s+(live|real[-\s]?time|web|internet|current)\s+access|unable\s+to\s+(browse|search|access).*?(live|real[-\s]?time|web|internet|current)/i.test(
    content || '',
  );
}

function hasReturnedSourceLinks(content, search) {
  const text = content || '';
  const resultUrls = (search?.results || []).map((result) => result.url).filter(Boolean);
  return resultUrls.some((url) => text.includes(url)) && !/live-web-search\.google\.com/i.test(text);
}

function formatSearchResultsForPrompt(search) {
  return (search?.results || [])
    .slice(0, 8)
    .map(
      (result, index) =>
        `${index + 1}. ${result.title}\nURL: ${result.url}\nContext: ${result.snippet || 'No snippet provided.'}`,
    )
    .join('\n\n');
}

function fallbackSearchAnswer(search) {
  const results = (search?.results || []).slice(0, 6);
  if (results.length === 0) {
    return 'I tried to search the web for this turn, but the search provider did not return usable results.';
  }

  const lines = results.map((result, index) => {
    const snippet = result.snippet ? ` - ${result.snippet}` : '';
    return `${index + 1}. [${result.title}](${result.url})${snippet}`;
  });

  return [
    `I searched the live web for "${search.query || 'your query'}". Here are the strongest current results I found:`,
    '',
    ...lines,
  ].join('\n');
}

async function answerWithSearchContext({ context, options, userText, signal }) {
  if (context.search?.source === 'google-news-rss') {
    return {
      content: fallbackSearchAnswer(context.search),
      raw: { deterministicSearchAnswer: true },
    };
  }

  const first = await ollamaChatText({
    model: context.model,
    messages: context.messages,
    options,
    signal,
  });

  if (!isSearchRefusal(first.content) && hasReturnedSourceLinks(first.content, context.search)) {
    return first;
  }

  const repair = await ollamaChatText({
    model: context.model,
    options,
    signal,
    messages: [
      {
        role: 'system',
        content:
          'You are Maly AI. The backend already completed live web search for this request. Write the answer from the provided results with source links. Do not say you cannot browse, search, access live data, or recommend that the user checks news sites.',
      },
      {
        role: 'user',
        content: [
          `Original user request: ${userText}`,
          `Search query: ${context.search?.query || userText}`,
          'Live web results:',
          formatSearchResultsForPrompt(context.search),
          'Answer concisely with links to the sources.',
        ].join('\n\n'),
      },
    ],
  });

  if (!isSearchRefusal(repair.content) && hasReturnedSourceLinks(repair.content, context.search)) {
    return repair;
  }

  return {
    content: fallbackSearchAnswer(context.search),
    raw: {
      repairedFromRefusal: true,
      first,
      repair,
    },
  };
}

app.post('/api/chat', asyncRoute(async (req, res) => {
  noteInteractivePromptStart();
  const requestController = new AbortController();
  let activeModel = req.body?.model || DEFAULT_OLLAMA_MODEL;
  res.on('close', () => {
    if (!res.writableEnded) {
      requestController.abort();
    }
  });
  const sourceMessages = normalizeMessages(req.body || {});

  try {
    if (sourceMessages.length === 0) {
      throw new HttpError(400, 'At least one chat message is required');
    }

    const userText = latestUserMessage(sourceMessages);
    const context = await buildChatContext({
      body: req.body || {},
      messages: sourceMessages,
      userText,
    });
    activeModel = context.model;

    const stream = req.body?.stream === true;
    if (!stream) {
      const { content, raw } = hasSearchResults(context)
        ? await answerWithSearchContext({ context, options: req.body?.options, userText, signal: requestController.signal })
        : await ollamaChatText({
            model: context.model,
            messages: context.messages,
            options: req.body?.options,
            signal: requestController.signal,
          });
      const storedMemories = await extractAndStoreMemories({
        userText,
        assistantText: content,
        model: context.model,
      });

      res.json({
        model: context.model,
        message: { role: 'assistant', content },
        raw,
        context: {
          memories: context.selectedMemories,
          search: context.search,
          subagents: context.subagents,
          storedMemories,
        },
      });
      return;
    }

    await streamChatResponse({ req, res, context, userText, signal: requestController.signal });
  } finally {
    if (requestController.signal.aborted && activeModel) {
      await unloadOllamaModel(activeModel);
    }
    noteInteractivePromptEnd();
  }
}));

async function streamChatResponse({ req, res, context, userText, signal }) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(
    `event: context\ndata: ${JSON.stringify({
      model: context.model,
      memories: context.selectedMemories,
      search: context.search,
      subagents: context.subagents,
    })}\n\n`,
  );

  let assistantText = '';

  try {
    if (hasSearchResults(context)) {
      const { content } = await answerWithSearchContext({
        context,
        options: req.body?.options,
        userText,
        signal,
      });
      assistantText = content;

      res.write(
        `event: chunk\ndata: ${JSON.stringify({
          message: { role: 'assistant', content },
          done: true,
        })}\n\n`,
      );

      const storedMemories = await extractAndStoreMemories({
        userText,
        assistantText,
        model: context.model,
      });
      res.write(`event: done\ndata: ${JSON.stringify({ storedMemories })}\n\n`);
      return;
    }

    const ollamaResponse = await ollamaChat({
      model: context.model,
      messages: context.messages,
      stream: true,
      options: req.body?.options,
      signal,
    });
    const decoder = new TextDecoder();
    const reader = ollamaResponse.body.getReader();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const parsed = JSON.parse(trimmed);
        const token = parsed?.message?.content || '';
        if (token) {
          assistantText += token;
        }

        res.write(`event: chunk\ndata: ${JSON.stringify(parsed)}\n\n`);
      }
    }

    if (buffer.trim()) {
      const parsed = JSON.parse(buffer.trim());
      const token = parsed?.message?.content || '';
      if (token) {
        assistantText += token;
      }

      res.write(`event: chunk\ndata: ${JSON.stringify(parsed)}\n\n`);
    }

    const storedMemories = await extractAndStoreMemories({
      userText,
      assistantText,
      model: context.model,
    });
    res.write(`event: done\ndata: ${JSON.stringify({ storedMemories })}\n\n`);
  } catch (error) {
    if (!res.writableEnded) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: error?.message || 'Streaming chat failed',
        })}\n\n`,
      );
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}

app.use((error, _req, res, _next) => {
  const status = error instanceof HttpError ? error.status : 500;
  res.status(status).json({
    error: error?.message || 'Internal server error',
    ...(error?.details ? { details: error.details } : {}),
  });
});

app.listen(API_PORT, () => {
  console.log(`Maly API listening on http://127.0.0.1:${API_PORT}`);
  console.log(`Ollama base URL: ${OLLAMA_BASE_URL}`);
  console.log(`Default model: ${DEFAULT_OLLAMA_MODEL}`);
  void startAutomationWorker();
});
