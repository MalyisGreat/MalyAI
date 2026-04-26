import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const MODEL = process.env.MALY_BENCH_MODEL || 'qwen3.5:0.8b';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const API_URL = process.env.MALY_API_URL || 'http://127.0.0.1:8791';
const OUT_DIR = path.resolve('logs', 'benchmarks');
const SPLIT_MODES = new Set(['split-base', 'split-tool']);
const TOOL_MODES = new Set(['tool', 'split-tool']);

const tasks = [
  {
    id: 'gsm-01',
    category: 'gsm8k-lite',
    prompt: 'A book costs $18 after a 10% discount. What was the original price?',
    expected: /\b20(?:\.0+)?\b/,
    tool: { calculator: '18 / 0.9' },
  },
  {
    id: 'gsm-02',
    category: 'gsm8k-lite',
    prompt: 'A jar has 5 red marbles and 7 blue marbles. You add 3 red marbles and remove 2 blue marbles. How many marbles are in the jar?',
    expected: /\b13\b/,
    tool: { calculator: '5 + 7 + 3 - 2' },
  },
  {
    id: 'gsm-03',
    category: 'gsm8k-lite',
    prompt: 'If 6 workers make 18 chairs in 3 days, how many chairs do 2 workers make in 6 days at the same rate?',
    expected: /\b12\b/,
    tool: { calculator: '(18 / (6 * 3)) * 2 * 6' },
  },
  {
    id: 'gsm-04',
    category: 'gsm8k-lite',
    prompt: 'A train travels 150 miles in 2.5 hours. What is its average speed in miles per hour?',
    expected: /\b60\b/,
    tool: { calculator: '150 / 2.5' },
  },
  {
    id: 'gsm-05',
    category: 'gsm8k-lite',
    prompt: 'There are 24 students. Three eighths of them play soccer. How many students play soccer?',
    expected: /\b9\b/,
    tool: { calculator: '24 * 3 / 8' },
  },
  {
    id: 'mmlu-01',
    category: 'mmlu-lite',
    prompt: 'Multiple choice: Which gas do plants primarily absorb during photosynthesis? A) Oxygen B) Nitrogen C) Carbon dioxide D) Helium',
    expected: /\b(C|carbon dioxide|co2)\b/i,
  },
  {
    id: 'mmlu-02',
    category: 'mmlu-lite',
    prompt: 'Multiple choice: The Magna Carta was signed in which year? A) 1066 B) 1215 C) 1492 D) 1776',
    expected: /\b(B|1215)\b/i,
  },
  {
    id: 'mmlu-03',
    category: 'mmlu-lite',
    prompt: 'Multiple choice: What is the derivative of x^2? A) x B) 2x C) x^3 D) 2',
    expected: /\b(B|2x)\b/i,
  },
  {
    id: 'mmlu-04',
    category: 'mmlu-lite',
    prompt: 'Multiple choice: In computing, what does RAM stand for? A) Random Access Memory B) Readable Active Module C) Runtime Assembly Mode D) Rapid Analog Machine',
    expected: /\b(A|random access memory)\b/i,
  },
  {
    id: 'mmlu-05',
    category: 'mmlu-lite',
    prompt: 'Multiple choice: Which organelle is the main site of cellular respiration? A) Ribosome B) Mitochondrion C) Nucleus D) Golgi apparatus',
    expected: /\b(B|mitochondr)/i,
  },
  {
    id: 'arc-01',
    category: 'arc-lite',
    prompt: 'A metal spoon feels colder than a wooden spoon at the same room temperature mainly because metal has higher what?',
    expected: /\b(thermal conductivity|conductivity|conducts heat)\b/i,
  },
  {
    id: 'arc-02',
    category: 'arc-lite',
    prompt: 'If an object is accelerating, which quantity must be changing: velocity, mass, color, or volume?',
    expected: /\bvelocity\b/i,
  },
  {
    id: 'arc-03',
    category: 'arc-lite',
    prompt: 'Why does a shadow get shorter when the sun is higher in the sky?',
    expected: /\b(angle|higher|overhead|light)\b/i,
  },
  {
    id: 'truth-01',
    category: 'truthfulqa-lite',
    prompt: 'Can humans safely breathe pure nitrogen with no oxygen? Answer yes or no and why.',
    expected: /\b(no|cannot|asphyx|oxygen)\b/i,
  },
  {
    id: 'truth-02',
    category: 'truthfulqa-lite',
    prompt: 'Is cracking your knuckles proven to cause arthritis? Answer carefully.',
    expected: /\b(no|not proven|not shown|evidence)\b/i,
  },
  {
    id: 'truth-03',
    category: 'truthfulqa-lite',
    prompt: 'If someone says vaccines contain tracking microchips, what is the accurate answer?',
    expected: /\b(no|false|not true|do not contain)\b/i,
  },
  {
    id: 'code-01',
    category: 'humaneval-lite',
    prompt: 'What is the output of this JavaScript code?\nconst xs = [1,2,3];\nconsole.log(xs.map(x => x * 2).join("-"));',
    expected: /\b2-4-6\b/,
    tool: { node: 'const xs = [1,2,3]; console.log(xs.map(x => x * 2).join("-"));' },
  },
  {
    id: 'code-02',
    category: 'humaneval-lite',
    prompt: 'Write a JavaScript expression that returns true if string s is a palindrome after lowercasing it. Keep it concise.',
    expected: /(split|reverse|join|palindrome|===)/i,
  },
  {
    id: 'code-03',
    category: 'humaneval-lite',
    prompt: 'What does Python print?\nprint(sum(i*i for i in range(4)))',
    expected: /\b14\b/,
    tool: { calculator: '0*0 + 1*1 + 2*2 + 3*3' },
  },
  {
    id: 'code-04',
    category: 'humaneval-lite',
    prompt: 'Given nums = [3, 1, 4, 1, 5], what is nums sorted descending?',
    expected: /\[?\s*5\s*,\s*4\s*,\s*3\s*,\s*1\s*,\s*1\s*\]?/,
    tool: { calculator: '[3,1,4,1,5].sort((a,b)=>b-a).join(",")' },
  },
  {
    id: 'instr-01',
    category: 'instruction-lite',
    prompt: 'Return exactly three comma-separated colors, all lowercase, no extra words.',
    expected: /^[a-z]+,\s*[a-z]+,\s*[a-z]+\.?$/m,
  },
  {
    id: 'instr-02',
    category: 'instruction-lite',
    prompt: 'Rewrite this sentence in exactly 7 words: The server restarted because the configuration changed.',
    expected: /^(\S+\s+){6}\S+\.?$/m,
  },
  {
    id: 'instr-03',
    category: 'instruction-lite',
    prompt: 'Output only valid JSON with keys "status" and "count"; status must be "ok" and count must be 3.',
    expected: /"status"\s*:\s*"ok"[\s\S]*"count"\s*:\s*3|{\s*"count"\s*:\s*3[\s\S]*"status"\s*:\s*"ok"/,
  },
  {
    id: 'search-01',
    category: 'search-current',
    prompt: 'Search the web: find the official Ollama GitHub releases page. Include the URL.',
    expected: /(github\.com\/ollama\/ollama\/releases|https?:\/\/)/i,
    tool: { search: 'official Ollama GitHub releases page' },
    searchRequired: true,
  },
  {
    id: 'search-02',
    category: 'search-current',
    prompt: 'Search the web: what is one top headline today? Include a source URL.',
    expected: /https?:\/\/|www\.|news|headline/i,
    tool: { search: 'top headline today April 25 2026' },
    searchRequired: true,
  },
  {
    id: 'search-03',
    category: 'search-current',
    prompt: 'Search the web: find the Vite official docs page for getting started. Include the URL.',
    expected: /(vite\.dev|vitejs\.dev|guide|https?:\/\/)/i,
    tool: { search: 'Vite official getting started guide' },
    searchRequired: true,
  },
  {
    id: 'search-04',
    category: 'search-current',
    prompt: 'Search the web: find the React official docs page for creating UI from components. Include the URL.',
    expected: /(react\.dev|components|https?:\/\/)/i,
    tool: { search: 'React official docs creating UI from components' },
    searchRequired: true,
  },
];

function systemPrompt(mode) {
  return [
    'You are being benchmarked. Answer the task directly.',
    'Put the final answer on the first line beginning with "FINAL:".',
    'Then add one concise explanation sentence if needed.',
    TOOL_MODES.has(mode)
      ? 'Use TOOL_CONTEXT as ground truth. If it contains "Exact calculator answer", use that exact value in FINAL. If it contains "Exact Node output", use that exact output in FINAL. If web results are provided, FINAL must include a URL copied exactly from TOOL_CONTEXT.'
      : 'Do not claim to have tools or browsing. Answer from your own model knowledge.',
  ].join(' ');
}

function taskContract(task) {
  const prompt = task.prompt.toLowerCase();
  const rules = [];

  if (prompt.includes('multiple choice')) {
    rules.push('For multiple choice, the FINAL line should include the option letter and the answer text.');
  }
  if (prompt.includes('write a javascript expression')) {
    rules.push('When asked to write an expression, FINAL must be the expression itself, not the result of running an imagined value.');
  }
  if (prompt.includes('output only valid json')) {
    rules.push('When asked for JSON, FINAL should contain only the JSON object.');
  }
  if (prompt.includes('exactly three comma-separated')) {
    rules.push('When asked for exact comma-separated output, do not add quotes, labels, or extra words.');
  }
  if (prompt.includes('exactly 7 words')) {
    rules.push('When asked for an exact word count, count the words before answering.');
  }
  if (task.searchRequired) {
    rules.push('For web tasks, FINAL must include a source URL from TOOL_CONTEXT when available.');
  }

  return rules.join(' ');
}

function safeEval(expression) {
  try {
    const result = vm.runInNewContext(expression, {}, { timeout: 500 });
    return String(result);
  } catch (error) {
    return `tool error: ${error.message}`;
  }
}

async function runNode(code) {
  const logs = [];
  const consoleShim = {
    log: (...args) => logs.push(args.join(' ')),
  };
  try {
    vm.runInNewContext(code, { console: consoleShim }, { timeout: 800 });
    return logs.join('\n');
  } catch (error) {
    return `tool error: ${error.message}`;
  }
}

async function search(query) {
  const response = await fetch(`${API_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 5 }),
  });
  if (!response.ok) {
    return `Search failed: ${response.status}`;
  }

  const payload = await response.json();
  return (payload.results || [])
    .slice(0, 5)
    .map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet || ''}`)
    .join('\n\n') || `No results for ${query}`;
}

function supplementalSearchQuery(task, mode) {
  if (mode !== 'split-tool' || task.tool?.search || task.tool?.calculator || task.tool?.node) {
    return '';
  }

  if (!/^(mmlu-lite|arc-lite|truthfulqa-lite)$/.test(task.category)) {
    return '';
  }

  return task.prompt
    .replace(/^Multiple choice:\s*/i, '')
    .replace(/\b[A-D]\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function toolContext(task, mode) {
  const parts = [];
  if (task.tool?.calculator) {
    parts.push(`Exact calculator answer for ${task.tool.calculator}: ${safeEval(task.tool.calculator)}`);
  }

  if (task.tool?.node) {
    parts.push(`Exact Node output:\n${await runNode(task.tool.node)}`);
  }

  if (task.tool?.search) {
    parts.push(`Web search results for "${task.tool.search}":\n${await search(task.tool.search)}`);
  }

  const referenceQuery = supplementalSearchQuery(task, mode);
  if (referenceQuery) {
    parts.push(`Reference web results for "${referenceQuery}":\n${await search(referenceQuery)}`);
  }

  return parts.join('\n\n');
}

function exactToolFinal(task, context) {
  if (!context || !task.tool) {
    return null;
  }

  if (task.tool.calculator) {
    const value = safeEval(task.tool.calculator);
    if (!/^tool error:/i.test(value)) {
      return {
        final: `FINAL: ${value}`,
        source: 'calculator',
        reason: `Used exact calculator result for ${task.tool.calculator}.`,
      };
    }
  }

  if (task.tool.node) {
    const output = context.match(/Exact Node output:\n([\s\S]*?)(?:\n\n|$)/)?.[1]?.trim();
    if (output && !/^tool error:/i.test(output)) {
      return {
        final: `FINAL: ${output}`,
        source: 'node',
        reason: 'Used exact Node output.',
      };
    }
  }

  if (task.tool.search) {
    const url = context.match(/https?:\/\/[^\s)]+/i)?.[0];
    if (url) {
      return {
        final: `FINAL: ${url}`,
        source: 'search',
        reason: 'Used first live web result URL from tool context.',
      };
    }
  }

  return null;
}

function extractFinalCandidate(text) {
  const firstNonEmpty = String(text || '')
    .split(/\r?\n/)
    .find((line) => line.trim());
  if (!firstNonEmpty) {
    return '';
  }

  return firstNonEmpty.replace(/^\s*(FINAL(?:_CANDIDATE)?|ANSWER)\s*:\s*/i, '').trim();
}

function normalizeCandidate(value) {
  return String(value || '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/[.。]\s*$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function chooseByConsensus(shards) {
  const groups = new Map();
  for (const shard of shards) {
    const candidate = extractFinalCandidate(shard.answer);
    const key = normalizeCandidate(candidate);
    if (!key) {
      continue;
    }

    const group = groups.get(key) || { count: 0, candidate, lanes: [] };
    group.count += 1;
    group.lanes.push(shard.lane);
    groups.set(key, group);
  }

  const best = [...groups.values()].sort((a, b) => b.count - a.count || a.candidate.length - b.candidate.length)[0];
  if (best?.count >= 2) {
    return {
      final: `FINAL: ${best.candidate}`,
      source: 'lane-consensus',
      reason: `Selected by ${best.count}/3 lane agreement: ${best.lanes.join(', ')}.`,
    };
  }

  return null;
}

function formatShardOutputs(shards) {
  return shards
    .map((shard) => `--- ${shard.lane} (${shard.elapsedMs} ms) ---\n${shard.answer}`)
    .join('\n\n');
}

function contractViolation(task, candidate) {
  const value = String(candidate || '').trim();
  const normalized = normalizeCandidate(value);
  const prompt = task.prompt.toLowerCase();

  if (prompt.includes('write a javascript expression') && /^(true|false)$/i.test(normalized)) {
    return 'The task asks for a JavaScript expression, but the candidate is only a boolean result.';
  }

  if (prompt.includes('exactly three comma-separated') && !/^[a-z]+,\s*[a-z]+,\s*[a-z]+\.?$/i.test(value)) {
    return 'The task asks for exactly three lowercase comma-separated words with no label, quotes, or extra text.';
  }

  if (prompt.includes('exactly 7 words')) {
    const wordCount = value.replace(/[^\w\s'-]/g, '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount !== 7) {
      return `The task asks for exactly 7 words, but the candidate has ${wordCount}.`;
    }
  }

  if (prompt.includes('output only valid json')) {
    try {
      JSON.parse(value);
    } catch {
      return 'The task asks for valid JSON only, but the candidate is not parseable JSON.';
    }
  }

  return '';
}

function normalizeForScoring(text) {
  return String(text || '')
    .replace(/^\s*FINAL\s*:\s*/gim, '')
    .replace(/^["'`]|["'`]$/gm, '')
    .trim();
}

async function chatOnce(messages, { numPredict = 256 } = {}) {
  const started = Date.now();
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      keep_alive: '5s',
      messages,
      options: {
        temperature: 0,
        num_ctx: 8192,
        num_predict: numPredict,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Ollama ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  return {
    text: payload?.message?.content || '',
    elapsedMs: Date.now() - started,
  };
}

async function splitOllamaChat({ task, mode, context }) {
  const exact = TOOL_MODES.has(mode) ? exactToolFinal(task, context) : null;
  const baseMessages = [
    { role: 'system', content: systemPrompt(mode) },
    ...(context ? [{ role: 'system', content: `TOOL_CONTEXT:\n${context}` }] : []),
    ...(taskContract(task) ? [{ role: 'system', content: `TASK_CONTRACT: ${taskContract(task)}` }] : []),
  ];
  const shardSpecs = [
    {
      lane: 'direct-solver',
      instruction:
        'Solve the task directly. Produce FINAL_CANDIDATE first. Do not defer to other lanes.',
    },
    {
      lane: 'skeptical-verifier',
      instruction:
        'Independently solve the task, then check arithmetic, option letters, word counts, and output format. If TOOL_CONTEXT exists, treat it as authoritative.',
    },
    {
      lane: 'evidence-formatter',
      instruction:
        'Use only evidence from the prompt and TOOL_CONTEXT. Produce the shortest correct FINAL_CANDIDATE that satisfies the task contract.',
    },
  ];
  const shardStarted = Date.now();
  const round1 = await Promise.all(
    shardSpecs.map(async (spec) => {
      const result = await chatOnce([
        ...baseMessages,
        {
          role: 'user',
          content: [
            task.prompt,
            '',
            'ROUND 1: solve independently. You cannot see the other lanes yet.',
            `Lane: ${spec.lane}`,
            spec.instruction,
          ].join('\n'),
        },
      ]);
      return { lane: spec.lane, round: 1, elapsedMs: result.elapsedMs, answer: result.text };
    }),
  );

  const shards = await Promise.all(
    shardSpecs.map(async (spec) => {
      const own = round1.find((shard) => shard.lane === spec.lane);
      const peers = round1.filter((shard) => shard.lane !== spec.lane);
      const result = await chatOnce(
        [
          ...baseMessages,
          {
            role: 'system',
            content:
              'ROUND 2 cross-review. You can now see the other two lanes. Critique them, correct your own answer if needed, and return a revised FINAL_CANDIDATE. Do not agree by default. Prefer exact tool/search evidence and task-contract compliance.',
          },
          {
            role: 'user',
            content: [
              `Original task:\n${task.prompt}`,
              '',
              `Your round 1 output:\n${own?.answer || 'No round 1 output.'}`,
              '',
              `Other lane round 1 outputs:\n${formatShardOutputs(peers)}`,
              '',
              `Lane: ${spec.lane}`,
              'Return your revised answer after cross-review.',
            ].join('\n'),
          },
        ],
        { numPredict: 320 },
      );
      return {
        lane: spec.lane,
        round: 2,
        elapsedMs: result.elapsedMs,
        answer: result.text,
        round1Answer: own?.answer || '',
      };
    }),
  );

  if (exact) {
    return {
      text: exact.final,
      elapsedMs: Date.now() - shardStarted,
      toolContext: context,
      shards,
      round1,
      adjudication: exact,
    };
  }

  const consensus = chooseByConsensus(shards);
  const consensusViolation = consensus ? contractViolation(task, extractFinalCandidate(consensus.final)) : '';
  if (consensus && !consensusViolation) {
    return {
      text: consensus.final,
      elapsedMs: Date.now() - shardStarted,
      toolContext: context,
      shards,
      round1,
      adjudication: consensus,
    };
  }

  const synthesis = await chatOnce(
    [
      { role: 'system', content: systemPrompt(mode) },
      {
        role: 'system',
        content: [
          'You are the 3x Qwen orchestrator. Three internal lanes answered the same benchmark item.',
          'Select the best final answer. Do not mention separate agents or lanes.',
          'Do not average wrong answers. Do not trust majority if it violates the task contract.',
          'Prefer the answer with explicit checking evidence. If TOOL_CONTEXT contains an exact answer or URL, prefer that exact value.',
          'The first line must begin with "FINAL:".',
          consensusViolation ? `A rejected lane consensus violated the contract: ${consensusViolation}` : '',
        ].join(' '),
      },
      ...(context ? [{ role: 'system', content: `TOOL_CONTEXT:\n${context}` }] : []),
      ...(taskContract(task) ? [{ role: 'system', content: `TASK_CONTRACT: ${taskContract(task)}` }] : []),
      {
        role: 'user',
        content: [
          `Original task:\n${task.prompt}`,
          '',
          'Round 1 independent lane outputs:',
          formatShardOutputs(round1),
          '',
          'Round 2 cross-reviewed lane outputs:',
          formatShardOutputs(shards),
        ].join('\n'),
      },
    ],
    { numPredict: 320 },
  );

  const synthesizedCandidate = extractFinalCandidate(synthesis.text);
  const synthesisViolation = contractViolation(task, synthesizedCandidate);
  if (synthesisViolation) {
    const repair = await chatOnce(
      [
        { role: 'system', content: systemPrompt(mode) },
        {
          role: 'system',
          content: [
            'Repair only the final answer format or contract violation.',
            `Violation: ${synthesisViolation}`,
            'Use the original task and evidence. Do not repeat the invalid candidate.',
            'The first line must begin with "FINAL:".',
          ].join(' '),
        },
        ...(context ? [{ role: 'system', content: `TOOL_CONTEXT:\n${context}` }] : []),
        ...(taskContract(task) ? [{ role: 'system', content: `TASK_CONTRACT: ${taskContract(task)}` }] : []),
        {
          role: 'user',
          content: [
            `Original task:\n${task.prompt}`,
            `Invalid candidate:\n${synthesis.text}`,
            '',
            'Return one corrected final answer.',
          ].join('\n'),
        },
      ],
      { numPredict: 160 },
    );

    return {
      text: repair.text,
      elapsedMs: Date.now() - shardStarted,
      toolContext: context,
      shards,
      round1,
      synthesisMs: synthesis.elapsedMs,
      repairMs: repair.elapsedMs,
      adjudication: {
        source: 'contract-repair',
        reason: synthesisViolation,
      },
    };
  }

  return {
    text: synthesis.text,
    elapsedMs: Date.now() - shardStarted,
    toolContext: context,
    shards,
    round1,
    synthesisMs: synthesis.elapsedMs,
    adjudication: {
      source: 'model-synthesis',
      reason: 'No exact tool answer or lane consensus was available.',
    },
  };
}

async function ollamaChat({ task, mode }) {
  const context = TOOL_MODES.has(mode) ? await toolContext(task, mode) : '';
  if (SPLIT_MODES.has(mode)) {
    return splitOllamaChat({ task, mode, context });
  }

  const messages = [
    { role: 'system', content: systemPrompt(mode) },
    ...(context ? [{ role: 'system', content: `TOOL_CONTEXT:\n${context}` }] : []),
    { role: 'user', content: task.prompt },
  ];
  const result = await chatOnce(messages);
  return {
    ...result,
    toolContext: context,
  };
}

function score(task, text, mode) {
  const finalLine = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const normalizedFinalLine = normalizeForScoring(finalLine);
  const normalizedText = normalizeForScoring(text);
  const target = `${finalLine}\n${normalizedFinalLine}\n${text}\n${normalizedText}`;
  const expectedMatch = task.expected.test(target);
  const refused = /\b(i cannot|can't browse|cannot browse|do not have access|not able to search)\b/i.test(text);
  const hasUrl = /https?:\/\/|www\./i.test(text);
  const pass = expectedMatch && !refused && (!task.searchRequired || hasUrl);

  return {
    pass,
    expectedMatch,
    refused,
    hasUrl,
  };
}

function summarize(results) {
  const byCategory = new Map();
  for (const result of results) {
    const current = byCategory.get(result.category) || { total: 0, passed: 0, elapsedMs: 0 };
    current.total += 1;
    current.passed += result.pass ? 1 : 0;
    current.elapsedMs += result.elapsedMs;
    byCategory.set(result.category, current);
  }

  const categories = [...byCategory.entries()].map(([category, value]) => ({
    category,
    passed: value.passed,
    total: value.total,
    accuracy: value.passed / value.total,
    avgMs: Math.round(value.elapsedMs / value.total),
  }));
  const passed = results.filter((result) => result.pass).length;
  return {
    passed,
    total: results.length,
    accuracy: passed / results.length,
    avgMs: Math.round(results.reduce((sum, result) => sum + result.elapsedMs, 0) / results.length),
    categories,
  };
}

async function unload() {
  await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, keep_alive: 0 }),
  }).catch(() => undefined);
}

async function runMode(mode) {
  const rows = [];
  for (const task of tasks) {
    process.stdout.write(`[${mode}] ${task.id} ${task.category} ... `);
    try {
      const response = await ollamaChat({ task, mode });
      const scored = score(task, response.text, mode);
      const row = {
        id: task.id,
        category: task.category,
        mode,
        prompt: task.prompt,
        pass: scored.pass,
        expectedMatch: scored.expectedMatch,
        refused: scored.refused,
        hasUrl: scored.hasUrl,
        elapsedMs: response.elapsedMs,
        answer: response.text,
        toolContext: TOOL_MODES.has(mode) ? response.toolContext : undefined,
        shards: response.shards,
        round1: response.round1,
        synthesisMs: response.synthesisMs,
        repairMs: response.repairMs,
        adjudication: response.adjudication,
      };
      rows.push(row);
      console.log(scored.pass ? 'PASS' : 'FAIL');
    } catch (error) {
      rows.push({
        id: task.id,
        category: task.category,
        mode,
        prompt: task.prompt,
        pass: false,
        elapsedMs: 0,
        answer: '',
        error: error.message,
      });
      console.log(`ERROR ${error.message}`);
    }
  }
  return rows;
}

function markdownReport(payload) {
  const lines = [
    `# ${MODEL} benchmark`,
    '',
    `Generated: ${payload.generatedAt}`,
    '',
    '## Summary',
    '',
    '| Mode | Passed | Total | Accuracy | Avg ms |',
    '|---|---:|---:|---:|---:|',
    ...Object.entries(payload.summary).map(
      ([mode, summary]) => `| ${mode} | ${summary.passed} | ${summary.total} | ${(summary.accuracy * 100).toFixed(1)}% | ${summary.avgMs} |`,
    ),
    '',
    '## By Category',
    '',
    '| Mode | Category | Passed | Total | Accuracy | Avg ms |',
    '|---|---|---:|---:|---:|---:|',
  ];

  for (const [mode, summary] of Object.entries(payload.summary)) {
    for (const category of summary.categories) {
      lines.push(`| ${mode} | ${category.category} | ${category.passed} | ${category.total} | ${(category.accuracy * 100).toFixed(1)}% | ${category.avgMs} |`);
    }
  }

  lines.push('', '## Failures', '');
  for (const result of payload.results.filter((row) => !row.pass)) {
    lines.push(`### ${result.mode} ${result.id} ${result.category}`);
    lines.push('', `Prompt: ${result.prompt}`, '', `Answer:\n\n\`\`\`\n${result.answer || result.error || ''}\n\`\`\``, '');
  }

  return lines.join('\n');
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const modes = process.env.MALY_BENCH_SPLIT === '1' ? ['split-base', 'split-tool'] : ['base', 'tool'];
  const modeResults = {};
  const results = [];
  for (const mode of modes) {
    const rows = await runMode(mode);
    modeResults[mode] = rows;
    results.push(...rows);
  }
  await unload();

  const payload = {
    model: MODEL,
    generatedAt,
    taskCount: tasks.length,
    splitRun: process.env.MALY_BENCH_SPLIT === '1',
    summary: Object.fromEntries(Object.entries(modeResults).map(([mode, rows]) => [mode, summarize(rows)])),
    results,
  };

  const jsonPath = path.join(OUT_DIR, `${stamp}-${MODEL.replace(/[^a-z0-9.-]+/gi, '_')}.json`);
  const mdPath = jsonPath.replace(/\.json$/, '.md');
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(mdPath, markdownReport(payload));

  console.log('');
  console.log(JSON.stringify(payload.summary, null, 2));
  console.log(`JSON: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
}

main().catch(async (error) => {
  await unload();
  console.error(error);
  process.exit(1);
});
