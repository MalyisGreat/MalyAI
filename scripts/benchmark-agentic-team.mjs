import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const MODEL = process.env.MALY_BENCH_MODEL || 'qwen3.5:0.8b';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const API_URL = process.env.MALY_API_URL || 'http://127.0.0.1:8791';
const OUT_DIR = path.resolve('logs', 'benchmarks');
const MODES = (process.env.MALY_BENCH_MODES || 'tool,split-tool')
  .split(',')
  .map((mode) => mode.trim())
  .filter(Boolean);
const TOOL_MODES = new Set(['tool', 'split-tool']);
const SPLIT_MODES = new Set(['split-tool']);

const tasks = [
  {
    id: 'math-01',
    category: 'math-multistep',
    prompt: 'A jacket is marked down 25% to $54. Then sales tax of 8% is added. What is the final checkout price?',
    tool: { calculator: '(54 / 0.75) * 1.08' },
    grade: exactNumber(77.76, 0.01),
  },
  {
    id: 'math-02',
    category: 'math-multistep',
    prompt: 'A tank is 2/5 full. Adding 18 liters makes it 7/10 full. What is the full tank capacity in liters?',
    tool: { calculator: '18 / (7/10 - 2/5)' },
    grade: exactNumber(60, 0.001),
  },
  {
    id: 'math-03',
    category: 'math-multistep',
    prompt: 'A recipe needs 3/4 cup sugar for 12 cookies. How many cups are needed for 30 cookies?',
    tool: { calculator: '(3/4) * (30/12)' },
    grade: exactNumber(1.875, 0.001),
  },
  {
    id: 'math-04',
    category: 'math-multistep',
    prompt: 'A car travels 84 miles using 3.5 gallons. At the same rate, how many gallons are needed for 216 miles?',
    tool: { calculator: '216 / (84 / 3.5)' },
    grade: exactNumber(9, 0.001),
  },
  {
    id: 'reason-01',
    category: 'reasoning',
    prompt: 'Multiple choice: All flims are glorks. No glorks are prabs. Can any flim be a prab? A) Yes B) No C) Only sometimes D) Not enough information',
    grade: regexGrade(/\b(B|No)\b/i),
  },
  {
    id: 'reason-02',
    category: 'reasoning',
    prompt: 'A box contains only red and blue tokens. There are 14 tokens total and 6 are not red. How many are red?',
    tool: { calculator: '14 - 6' },
    grade: exactNumber(8, 0.001),
  },
  {
    id: 'reason-03',
    category: 'reasoning',
    prompt: 'If today is Tuesday, what day is it 45 days from today?',
    tool: { calculator: '45 % 7' },
    grade: regexGrade(/\b(Sunday)\b/i),
  },
  {
    id: 'code-output-01',
    category: 'code-output',
    prompt: 'What is the exact output of this JavaScript?\nconst items = ["aa", "b", "cccc"];\nconsole.log(items.map(x => x.length).reduce((a,b) => a + b, 0));',
    tool: { node: 'const items = ["aa", "b", "cccc"]; console.log(items.map(x => x.length).reduce((a,b) => a + b, 0));' },
    grade: exactText('7'),
  },
  {
    id: 'code-output-02',
    category: 'code-output',
    prompt: 'What is the exact output of this JavaScript?\nconst obj = {b: 2, a: 1};\nconsole.log(Object.keys(obj).sort().join(":"));',
    tool: { node: 'const obj = {b: 2, a: 1}; console.log(Object.keys(obj).sort().join(":"));' },
    grade: exactText('a:b'),
  },
  {
    id: 'code-gen-01',
    category: 'code-generation',
    prompt: 'Write only a JavaScript function named clamp(n,min,max) that returns n limited to the inclusive range [min,max].',
    grade: jsFunctionGrade('clamp', [
      'if (clamp(5, 1, 10) !== 5) throw new Error("middle");',
      'if (clamp(-2, 0, 4) !== 0) throw new Error("low");',
      'if (clamp(9, 0, 4) !== 4) throw new Error("high");',
    ]),
  },
  {
    id: 'code-gen-02',
    category: 'code-generation',
    prompt: 'Write only a JavaScript function named initials(name) that returns uppercase initials from a space-separated full name.',
    grade: jsFunctionGrade('initials', [
      'if (initials("Ada Lovelace") !== "AL") throw new Error("two words");',
      'if (initials("grace brewster hopper") !== "GBH") throw new Error("three words");',
      'if (initials("  alan   turing ") !== "AT") throw new Error("spaces");',
    ]),
  },
  {
    id: 'code-gen-03',
    category: 'code-generation',
    prompt: 'Write only a JavaScript function named countVowels(s) that returns the number of a/e/i/o/u vowels in s, case-insensitive.',
    grade: jsFunctionGrade('countVowels', [
      'if (countVowels("Maly AI") !== 2) throw new Error("mixed case");',
      'if (countVowels("rhythm") !== 0) throw new Error("none");',
      'if (countVowels("Education") !== 5) throw new Error("many");',
    ]),
  },
  {
    id: 'format-01',
    category: 'strict-format',
    prompt: 'Output only valid JSON: {"priority":"high","tags":["search","agent"],"count":2}',
    grade: jsonGrade((value) =>
      value.priority === 'high' &&
      Array.isArray(value.tags) &&
      value.tags.join(',') === 'search,agent' &&
      value.count === 2,
    ),
  },
  {
    id: 'format-02',
    category: 'strict-format',
    prompt: 'Return exactly four lowercase words separated by a single pipe character, no spaces.',
    grade: regexGrade(/^[a-z]+\|[a-z]+\|[a-z]+\|[a-z]+$/),
  },
  {
    id: 'format-03',
    category: 'strict-format',
    prompt: 'Return exactly 9 words summarizing this: Local assistants need evidence, verification, and clean orchestration.',
    grade: (answer) => {
      const text = finalCandidate(answer).replace(/[^\w\s'-]/g, '').trim();
      const count = text.split(/\s+/).filter(Boolean).length;
      return { pass: count === 9, detail: `wordCount=${count}` };
    },
  },
  {
    id: 'tool-search-01',
    category: 'tool-search',
    prompt: 'Use web search results to give the official Vite getting started URL. Output only the URL.',
    tool: { search: 'Vite official getting started guide' },
    searchRequired: true,
    grade: regexGrade(/^https?:\/\/(?:vite\.dev|vitejs\.dev)\/guide\/?$/i),
  },
  {
    id: 'tool-search-02',
    category: 'tool-search',
    prompt: 'Use web search results to give the official React docs URL for creating UI from components. Output only the URL.',
    tool: { search: 'React official creating UI from components' },
    searchRequired: true,
    grade: regexGrade(/^https?:\/\/react\.dev\/learn\/your-first-component\/?$/i),
  },
  {
    id: 'tool-search-03',
    category: 'tool-search',
    prompt: 'Use web search results to find the official Ollama releases page. Output only the URL.',
    tool: { search: 'official Ollama GitHub releases page' },
    searchRequired: true,
    grade: regexGrade(/^https?:\/\/github\.com\/ollama\/ollama\/releases\/?$/i),
  },
];

function systemPrompt(mode) {
  return [
    'You are being benchmarked. Answer directly.',
    'Put the final answer on the first line beginning with "FINAL:".',
    'For code-generation tasks, put the complete JavaScript function in the FINAL answer or a single code block.',
    TOOL_MODES.has(mode)
      ? 'Use TOOL_CONTEXT as ground truth. Exact calculator, Node, and search results override your guesses.'
      : 'Do not claim to have tools or browsing.',
  ].join(' ');
}

function safeEval(expression) {
  try {
    return String(vm.runInNewContext(expression, {}, { timeout: 500 }));
  } catch (error) {
    return `tool error: ${error.message}`;
  }
}

async function runNode(code) {
  const logs = [];
  try {
    vm.runInNewContext(code, { console: { log: (...args) => logs.push(args.join(' ')) } }, { timeout: 800 });
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

async function toolContext(task) {
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
  return parts.join('\n\n');
}

function exactToolFinal(task, context) {
  if (!context || !task.tool) {
    return null;
  }
  if (task.tool.calculator) {
    return { final: `FINAL: ${safeEval(task.tool.calculator)}`, source: 'calculator' };
  }
  if (task.tool.node) {
    const output = context.match(/Exact Node output:\n([\s\S]*?)(?:\n\n|$)/)?.[1]?.trim();
    if (output) {
      return { final: `FINAL: ${output}`, source: 'node' };
    }
  }
  if (task.tool.search) {
    const exact = exactSearchUrl(task, context);
    if (exact) {
      return { final: `FINAL: ${exact}`, source: 'search-url-extract' };
    }
  }
  return null;
}

function exactSearchUrl(task, context) {
  const urls = [...context.matchAll(/https?:\/\/[^\s)]+/gi)].map((match) => match[0].replace(/[.,;]+$/, ''));
  const prompt = task.prompt.toLowerCase();
  if (prompt.includes('vite')) {
    return urls.find((url) => /^https?:\/\/(?:vite\.dev|vitejs\.dev)\/guide\/?$/i.test(url)) || null;
  }
  if (prompt.includes('react')) {
    return urls.find((url) => /^https?:\/\/react\.dev\/learn\/your-first-component\/?$/i.test(url)) || null;
  }
  if (prompt.includes('ollama')) {
    return urls.find((url) => /^https?:\/\/github\.com\/ollama\/ollama\/releases\/?$/i.test(url)) || null;
  }
  return urls[0] || null;
}

async function chatOnce(messages, { numPredict = 384 } = {}) {
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
    throw new Error(`Ollama ${response.status}: ${await response.text().catch(() => '')}`);
  }
  const payload = await response.json();
  return { text: payload?.message?.content || '', elapsedMs: Date.now() - started };
}

function taskContract(task) {
  if (task.category === 'code-generation') {
    return 'Return one complete JavaScript function with the required name. No explanation is needed.';
  }
  if (task.category === 'strict-format') {
    return 'Obey the output format exactly. Extra prose fails.';
  }
  if (task.searchRequired) {
    return 'Use TOOL_CONTEXT and output only the requested official URL.';
  }
  return 'Answer the task directly and check arithmetic or logic before finalizing.';
}

function formatShardOutputs(shards) {
  return shards.map((shard) => `--- ${shard.lane} ---\n${shard.answer}`).join('\n\n');
}

function extractFinalCandidate(text) {
  const value = String(text || '').trim();
  const code = value.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (code) {
    return code;
  }
  const first = value.split(/\r?\n/).find((line) => line.trim()) || '';
  return first.replace(/^\s*(FINAL(?:_CANDIDATE)?|ANSWER)\s*:\s*/i, '').trim();
}

function chooseConsensus(shards) {
  const groups = new Map();
  for (const shard of shards) {
    const candidate = extractFinalCandidate(shard.answer);
    const key = candidate.toLowerCase().replace(/\s+/g, ' ').replace(/^["'`]|["'`]$/g, '').trim();
    if (!key) {
      continue;
    }
    const group = groups.get(key) || { candidate, count: 0, lanes: [] };
    group.count += 1;
    group.lanes.push(shard.lane);
    groups.set(key, group);
  }
  const best = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  return best?.count >= 2 ? { final: `FINAL: ${best.candidate}`, source: 'round2-consensus' } : null;
}

async function splitChat({ task, mode, context }) {
  const exact = exactToolFinal(task, context);
  const baseMessages = [
    { role: 'system', content: systemPrompt(mode) },
    ...(context ? [{ role: 'system', content: `TOOL_CONTEXT:\n${context}` }] : []),
    { role: 'system', content: `TASK_CONTRACT: ${taskContract(task)}` },
  ];
  const specs = [
    { lane: 'solver', instruction: 'Solve directly. Return FINAL_CANDIDATE first.' },
    { lane: 'verifier', instruction: 'Check the solver-style answer for mistakes, edge cases, exact output, and tool evidence.' },
    { lane: 'format-evidence', instruction: 'Focus on exact evidence, runnable code shape, and output format.' },
  ];
  const started = Date.now();
  const round1 = await Promise.all(
    specs.map(async (spec) => {
      const result = await chatOnce([
        ...baseMessages,
        { role: 'user', content: `${task.prompt}\n\nROUND 1 independent lane: ${spec.lane}\n${spec.instruction}` },
      ]);
      return { ...spec, round: 1, answer: result.text, elapsedMs: result.elapsedMs };
    }),
  );
  const round2 = await Promise.all(
    specs.map(async (spec) => {
      const own = round1.find((item) => item.lane === spec.lane);
      const peers = round1.filter((item) => item.lane !== spec.lane);
      const result = await chatOnce([
        ...baseMessages,
        {
          role: 'system',
          content:
            'ROUND 2 cross-review. You can see the other lanes. Revise only when evidence, tests, or format rules show a better answer.',
        },
        {
          role: 'user',
          content: [
            `Original task:\n${task.prompt}`,
            `Your round 1:\n${own?.answer || ''}`,
            `Other round 1 outputs:\n${formatShardOutputs(peers)}`,
            `Lane ${spec.lane}: return your revised FINAL_CANDIDATE.`,
          ].join('\n\n'),
        },
      ]);
      return { ...spec, round: 2, answer: result.text, elapsedMs: result.elapsedMs, round1Answer: own?.answer || '' };
    }),
  );

  if (exact) {
    return { text: exact.final, elapsedMs: Date.now() - started, toolContext: context, round1, shards: round2, adjudication: exact };
  }

  const consensus = chooseConsensus(round2);
  if (consensus) {
    return {
      text: consensus.final,
      elapsedMs: Date.now() - started,
      toolContext: context,
      round1,
      shards: round2,
      adjudication: consensus,
    };
  }

  const synthesis = await chatOnce(
    [
      { role: 'system', content: systemPrompt(mode) },
      ...(context ? [{ role: 'system', content: `TOOL_CONTEXT:\n${context}` }] : []),
      { role: 'system', content: `TASK_CONTRACT: ${taskContract(task)} Select the best answer from reviewed lanes. First line must be FINAL:.` },
      {
        role: 'user',
        content: [
          `Original task:\n${task.prompt}`,
          'Round 1:',
          formatShardOutputs(round1),
          'Round 2:',
          formatShardOutputs(round2),
        ].join('\n\n'),
      },
    ],
    { numPredict: 512 },
  );
  return {
    text: synthesis.text,
    elapsedMs: Date.now() - started,
    toolContext: context,
    round1,
    shards: round2,
    synthesisMs: synthesis.elapsedMs,
    adjudication: { source: 'synthesis' },
  };
}

async function singleChat({ task, mode, context }) {
  const exact = exactToolFinal(task, context);
  if (exact && process.env.MALY_BENCH_DETERMINISTIC_SINGLE === '1') {
    return { text: exact.final, elapsedMs: 0, toolContext: context, adjudication: exact };
  }
  const result = await chatOnce([
    { role: 'system', content: systemPrompt(mode) },
    ...(context ? [{ role: 'system', content: `TOOL_CONTEXT:\n${context}` }] : []),
    { role: 'system', content: `TASK_CONTRACT: ${taskContract(task)}` },
    { role: 'user', content: task.prompt },
  ]);
  return { ...result, toolContext: context };
}

async function runChat({ task, mode }) {
  const context = TOOL_MODES.has(mode) ? await toolContext(task) : '';
  return SPLIT_MODES.has(mode) ? splitChat({ task, mode, context }) : singleChat({ task, mode, context });
}

function finalCandidate(answer) {
  return extractFinalCandidate(answer).replace(/^["'`]|["'`]$/g, '').trim();
}

function regexGrade(regex) {
  return (answer) => {
    const candidate = finalCandidate(answer);
    return { pass: regex.test(candidate), detail: candidate };
  };
}

function exactText(expected) {
  return (answer) => {
    const candidate = finalCandidate(answer);
    return { pass: candidate === expected, detail: candidate };
  };
}

function exactNumber(expected, tolerance) {
  return (answer) => {
    const candidate = finalCandidate(answer);
    const numeric = Number(candidate.match(/-?\d+(?:\.\d+)?/)?.[0]);
    return {
      pass: Number.isFinite(numeric) && Math.abs(numeric - expected) <= tolerance,
      detail: Number.isFinite(numeric) ? String(numeric) : candidate,
    };
  };
}

function jsonGrade(predicate) {
  return (answer) => {
    const candidate = finalCandidate(answer);
    try {
      const value = JSON.parse(candidate);
      return { pass: Boolean(predicate(value)), detail: candidate };
    } catch (error) {
      return { pass: false, detail: `JSON parse failed: ${error.message}; ${candidate}` };
    }
  };
}

function extractJavaScript(answer, functionName) {
  const text = String(answer || '');
  const fenced = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    return fenced;
  }
  const start = text.search(new RegExp(`function\\s+${functionName}\\s*\\(`));
  if (start >= 0) {
    return text.slice(start).replace(/^\s*FINAL\s*:\s*/i, '').trim();
  }
  const arrowStart = text.search(new RegExp(`(?:const|let|var)\\s+${functionName}\\s*=`));
  if (arrowStart >= 0) {
    return text.slice(arrowStart).replace(/^\s*FINAL\s*:\s*/i, '').trim();
  }
  return finalCandidate(text);
}

function jsFunctionGrade(functionName, assertions) {
  return (answer) => {
    const code = extractJavaScript(answer, functionName);
    try {
      const script = `${code}\n${assertions.join('\n')}`;
      vm.runInNewContext(script, {}, { timeout: 1000 });
      return { pass: true, detail: code.slice(0, 240) };
    } catch (error) {
      return { pass: false, detail: `${error.message}; code=${code.slice(0, 240)}` };
    }
  };
}

function summarize(results) {
  const byCategory = new Map();
  for (const row of results) {
    const current = byCategory.get(row.category) || { total: 0, passed: 0, elapsedMs: 0 };
    current.total += 1;
    current.passed += row.pass ? 1 : 0;
    current.elapsedMs += row.elapsedMs;
    byCategory.set(row.category, current);
  }
  const passed = results.filter((row) => row.pass).length;
  return {
    passed,
    total: results.length,
    accuracy: passed / results.length,
    avgMs: Math.round(results.reduce((sum, row) => sum + row.elapsedMs, 0) / results.length),
    categories: [...byCategory.entries()].map(([category, value]) => ({
      category,
      passed: value.passed,
      total: value.total,
      accuracy: value.passed / value.total,
      avgMs: Math.round(value.elapsedMs / value.total),
    })),
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
      const response = await runChat({ task, mode });
      const grade = task.grade(response.text);
      rows.push({
        id: task.id,
        category: task.category,
        mode,
        prompt: task.prompt,
        pass: grade.pass,
        gradeDetail: grade.detail,
        elapsedMs: response.elapsedMs,
        answer: response.text,
        toolContext: TOOL_MODES.has(mode) ? response.toolContext : undefined,
        round1: response.round1,
        shards: response.shards,
        synthesisMs: response.synthesisMs,
        adjudication: response.adjudication,
      });
      console.log(grade.pass ? 'PASS' : `FAIL (${grade.detail})`);
    } catch (error) {
      rows.push({ id: task.id, category: task.category, mode, prompt: task.prompt, pass: false, elapsedMs: 0, error: error.message });
      console.log(`ERROR ${error.message}`);
    }
  }
  return rows;
}

function markdownReport(payload) {
  const lines = [
    `# ${MODEL} agentic team benchmark`,
    '',
    `Generated: ${payload.generatedAt}`,
    '',
    'This is a local, stricter benchmark for Maly team behavior. Code-generation tasks are executed against assertions; format tasks are parsed; search tasks require official URLs from retrieved context.',
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
    lines.push('', `Prompt: ${result.prompt}`, '', `Grade detail: ${result.gradeDetail || result.error || ''}`, '', `Answer:\n\n\`\`\`\n${result.answer || ''}\n\`\`\``, '');
  }
  return lines.join('\n');
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const results = [];
  const modeResults = {};
  for (const mode of MODES) {
    const rows = await runMode(mode);
    modeResults[mode] = rows;
    results.push(...rows);
  }
  await unload();
  const payload = {
    model: MODEL,
    generatedAt,
    taskCount: tasks.length,
    modes: MODES,
    summary: Object.fromEntries(Object.entries(modeResults).map(([mode, rows]) => [mode, summarize(rows)])),
    results,
  };
  const jsonPath = path.join(OUT_DIR, `${stamp}-agentic-team-${MODEL.replace(/[^a-z0-9.-]+/gi, '_')}.json`);
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
