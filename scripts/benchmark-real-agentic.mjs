import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const MODEL = process.env.MALY_BENCH_MODEL || 'qwen3.5:0.8b';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OUT_DIR = path.resolve('logs', 'benchmarks');
const SAMPLE_SIZE = Math.max(1, Number(process.env.MALY_REAL_BENCH_N) || 5);
const MODES = (process.env.MALY_REAL_BENCH_MODES || 'single,agentic,agentic-synthesis,agentic-toolbelt,agentic-program,qwen5-judge')
  .split(',')
  .map((mode) => mode.trim())
  .filter(Boolean);
const BENCH_FILTER = new Set(
  (process.env.MALY_REAL_BENCHMARKS || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean),
);

const BENCHMARKS = [
  {
    name: 'gsm8k',
    dataset: 'openai/gsm8k',
    config: 'main',
    split: 'test',
    offset: Number(process.env.MALY_GSM8K_OFFSET) || 50,
    source: 'https://huggingface.co/datasets/openai/gsm8k',
    mapRow(row, rowIdx) {
      const answer = String(row.answer || '').match(/####\s*(-?\d+(?:\.\d+)?)/)?.[1];
      return {
        id: `gsm8k-${rowIdx}`,
        benchmark: 'gsm8k',
        prompt: [
          'GSM8K math problem. Solve it carefully.',
          'Put only the final numeric answer on the first line as FINAL: <number>.',
          '',
          row.question,
        ].join('\n'),
        expected: answer,
        grade: numericGrade(answer),
      };
    },
  },
  {
    name: 'arc-challenge',
    dataset: 'allenai/ai2_arc',
    config: 'ARC-Challenge',
    split: 'test',
    offset: Number(process.env.MALY_ARC_OFFSET) || 50,
    source: 'https://huggingface.co/datasets/allenai/ai2_arc',
    mapRow(row, rowIdx) {
      return {
        id: `arc-${row.id || rowIdx}`,
        benchmark: 'arc-challenge',
        prompt: multipleChoicePrompt('ARC-Challenge science question', row.question, row.choices.label, row.choices.text),
        expected: row.answerKey,
        grade: choiceGrade(row.answerKey, row.choices),
      };
    },
  },
  {
    name: 'mmlu-abstract-algebra',
    dataset: 'cais/mmlu',
    config: 'abstract_algebra',
    split: 'test',
    offset: Number(process.env.MALY_MMLU_OFFSET) || 50,
    source: 'https://huggingface.co/datasets/cais/mmlu',
    mapRow(row, rowIdx) {
      const labels = ['A', 'B', 'C', 'D'];
      const expected = labels[Number(row.answer)];
      return {
        id: `mmlu-abstract-algebra-${rowIdx}`,
        benchmark: 'mmlu-abstract-algebra',
        prompt: multipleChoicePrompt('MMLU abstract algebra question', row.question, labels, row.choices),
        expected,
        grade: choiceGrade(expected, { label: labels, text: row.choices }),
      };
    },
  },
];

function rowsUrl(spec) {
  const params = new URLSearchParams({
    dataset: spec.dataset,
    config: spec.config,
    split: spec.split,
    offset: String(spec.offset),
    length: String(SAMPLE_SIZE),
  });
  return `https://datasets-server.huggingface.co/rows?${params}`;
}

async function fetchBenchmarkRows(spec) {
  const response = await fetch(rowsUrl(spec));
  if (!response.ok) {
    throw new Error(`${spec.name} fetch failed ${response.status}: ${await response.text().catch(() => '')}`);
  }
  const payload = await response.json();
  return (payload.rows || []).map((item) => spec.mapRow(item.row, item.row_idx));
}

function multipleChoicePrompt(title, question, labels, choices) {
  return [
    title,
    'Choose the single best answer. Put only the option letter on the first line as FINAL: <letter>.',
    '',
    question,
    '',
    ...labels.map((label, index) => `${label}) ${choices[index]}`),
  ].join('\n');
}

function finalCandidate(text) {
  const first = String(text || '')
    .split(/\r?\n/)
    .find((line) => line.trim()) || '';
  return first
    .replace(/^\s*(FINAL(?:_CANDIDATE)?|ANSWER)\s*:\s*/i, '')
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
}

function numericGrade(expected) {
  return (answer) => {
    const candidate = finalCandidate(answer).replace(/,/g, '');
    const actual = Number(candidate.match(/-?\d+(?:\.\d+)?/)?.[0]);
    const target = Number(expected);
    return {
      pass: Number.isFinite(actual) && Math.abs(actual - target) <= 1e-6,
      detail: Number.isFinite(actual) ? String(actual) : candidate,
    };
  };
}

function choiceGrade(expected, choices) {
  const labels = choices.label.map(String);
  const texts = choices.text.map(String);
  return (answer) => {
    const candidate = finalCandidate(answer);
    const letter = candidate.match(/\b([A-D])\b/i)?.[1]?.toUpperCase();
    const byText = texts.findIndex((choice) => normalize(choice) === normalize(candidate));
    const actual = letter || (byText >= 0 ? labels[byText] : '');
    return {
      pass: actual === expected,
      detail: actual || candidate,
    };
  };
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function systemPrompt() {
  return [
    'You are being evaluated on a real public benchmark sample.',
    'Answer the benchmark item directly.',
    'The first line must be FINAL: followed by only the required answer.',
    'Do not include explanations before the FINAL line.',
  ].join(' ');
}

function safeArithmetic(expression) {
  const source = String(expression || '').trim();
  if (!source || source.length > 160 || !/^[\d\s+\-*/().,%]+$/.test(source)) {
    return null;
  }

  try {
    const normalized = source.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
    const result = vm.runInNewContext(normalized, {}, { timeout: 300 });
    return Number.isFinite(Number(result)) ? String(result) : null;
  } catch {
    return null;
  }
}

function extractCalcRequests(outputs) {
  const requests = [];
  for (const output of outputs) {
    const text = String(output.answer || '');
    for (const match of text.matchAll(/^\s*CALC\s*:\s*([^\r\n]+)/gim)) {
      const expression = match[1].trim();
      const value = safeArithmetic(expression);
      if (value !== null) {
        requests.push({ lane: output.lane, expression, value });
      }
    }
  }

  const seen = new Set();
  return requests.filter((request) => {
    const key = request.expression.replace(/\s+/g, '');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatToolResults(results) {
  if (!results.length) {
    return 'No valid calculator requests were made.';
  }

  return results.map((result) => `- ${result.expression} = ${result.value} (${result.lane})`).join('\n');
}

async function chatOnce(messages, { numPredict = 512 } = {}) {
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

function extractJavaScript(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    return fenced;
  }

  return raw
    .replace(/^\s*(FINAL(?:_CANDIDATE)?|ANSWER|CODE)\s*:\s*/i, '')
    .trim();
}

function runJavaScriptAnswer(code) {
  if (!code || code.length > 4000) {
    return { ok: false, error: 'empty or too large' };
  }

  if (/\b(require|import|process|fs|child_process|fetch|XMLHttpRequest|eval|Function)\b/i.test(code)) {
    return { ok: false, error: 'blocked api' };
  }

  const logs = [];
  try {
    vm.runInNewContext(
      code,
      {
        console: {
          log: (...args) => logs.push(args.join(' ')),
        },
        Math,
      },
      { timeout: 1000 },
    );
    const output = logs.join('\n').trim();
    return output ? { ok: true, output } : { ok: false, error: 'no console output' };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function numericConsensus(programs) {
  const groups = new Map();
  for (const program of programs) {
    if (!program.execution?.ok) {
      continue;
    }
    const numeric = Number(String(program.execution.output).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0]);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    const key = String(numeric);
    const group = groups.get(key) || { value: numeric, count: 0, lanes: [] };
    group.count += 1;
    group.lanes.push(program.lane);
    groups.set(key, group);
  }
  const best = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  return best?.count >= 2 ? best : null;
}

async function singleChat(task) {
  return chatOnce([
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: task.prompt },
  ]);
}

function isMathTask(task) {
  if (task.benchmark === 'gsm8k') {
    return true;
  }

  if (/choose the single best answer|^[\s\S]*\nA\)/i.test(task.prompt)) {
    return false;
  }

  return /\b(calculate|how many|how much|total|percent|rate|per|dollars?|liters?|eggs?|week)\b/i.test(task.prompt);
}

async function programAgenticChat(task) {
  if (!isMathTask(task)) {
    return agenticChat(task, { finalMode: 'synthesis' });
  }

  const lanes = [
    {
      lane: 'direct-programmer',
      instruction: 'Translate the problem into straightforward JavaScript arithmetic. Print only the final numeric answer.',
    },
    {
      lane: 'unit-programmer',
      instruction: 'Track units carefully in JavaScript variables. Print only the final numeric answer.',
    },
    {
      lane: 'audit-programmer',
      instruction: 'Write a small JavaScript calculation that checks intermediate quantities before printing the final numeric answer.',
    },
  ];
  const started = Date.now();
  const programs = await Promise.all(
    lanes.map(async (lane) => {
      const result = await chatOnce(
        [
          {
            role: 'system',
            content:
              'You are a calculator-program lane. Return only JavaScript code. The code must compute the answer from the prompt and call console.log(finalNumber). Do not use imports, require, fetch, process, files, or external APIs.',
          },
          {
            role: 'user',
            content: [
              task.prompt,
              '',
              `Lane: ${lane.lane}`,
              lane.instruction,
            ].join('\n'),
          },
        ],
        { numPredict: 512 },
      );
      const code = extractJavaScript(result.text);
      return {
        ...lane,
        answer: result.text,
        code,
        elapsedMs: result.elapsedMs,
        execution: runJavaScriptAnswer(code),
      };
    }),
  );

  const consensus = numericConsensus(programs);
  if (consensus) {
    return {
      text: `FINAL: ${consensus.value}`,
      elapsedMs: Date.now() - started,
      programs,
      adjudication: {
        source: 'program-consensus',
        lanes: consensus.lanes,
      },
    };
  }

  const fallback = await chatOnce([
    { role: 'system', content: systemPrompt() },
    {
      role: 'system',
      content:
        'You are the final adjudicator. Use successful program outputs as evidence. If no two programs agree, solve the original problem carefully. First line must be FINAL: with only the numeric answer.',
    },
    {
      role: 'user',
      content: [
        `Original benchmark item:\n${task.prompt}`,
        '',
        'Program lane results:',
        ...programs.map(
          (program) =>
            `--- ${program.lane} ---\ncode:\n${program.code}\nexecution: ${program.execution.ok ? program.execution.output : `ERROR ${program.execution.error}`}`,
        ),
      ].join('\n\n'),
    },
  ]);

  return {
    text: fallback.text,
    elapsedMs: Date.now() - started,
    programs,
    synthesisMs: fallback.elapsedMs,
    adjudication: { source: 'program-synthesis' },
  };
}

function formatLaneOutputs(outputs) {
  return outputs.map((output) => `--- ${output.lane} ---\n${output.answer}`).join('\n\n');
}

async function qwen5JudgeChat(task) {
  const started = Date.now();
  const solverSpecs = [
    {
      lane: 'solver-1-direct',
      instruction: 'Solve directly and keep the final answer concise.',
    },
    {
      lane: 'solver-2-careful',
      instruction: 'Solve carefully, checking each step before the final answer.',
    },
    {
      lane: 'solver-3-skeptical',
      instruction: 'Assume the obvious answer may be wrong. Look for traps, units, and wording details.',
    },
    {
      lane: 'solver-4-format',
      instruction: 'Focus on the exact required final format and option/numeric answer.',
    },
    {
      lane: 'solver-5-alternate',
      instruction: 'Use an alternate reasoning path from the direct solution if possible.',
    },
  ];

  const solvers = await Promise.all(
    solverSpecs.map(async (solver) => {
      const result = await chatOnce([
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: [
            task.prompt,
            '',
            `Independent Qwen instance: ${solver.lane}`,
            solver.instruction,
            'Return your answer with FINAL: first.',
          ].join('\n'),
        },
      ]);
      return { ...solver, answer: result.text, elapsedMs: result.elapsedMs };
    }),
  );

  const judge = await chatOnce([
    { role: 'system', content: systemPrompt() },
    {
      role: 'system',
      content:
        'You are the judge Qwen. Read five independent Qwen answers. Pick the best answer by checking reasoning quality, arithmetic, option consistency, and final-format compliance. Do not average answers. The first line must be FINAL: with only the answer.',
    },
    {
      role: 'user',
      content: [
        `Original benchmark item:\n${task.prompt}`,
        '',
        'Independent Qwen answers:',
        formatLaneOutputs(solvers),
      ].join('\n\n'),
    },
  ]);

  return {
    text: judge.text,
    elapsedMs: Date.now() - started,
    solvers,
    judgeMs: judge.elapsedMs,
    adjudication: { source: 'qwen5-judge' },
  };
}

function laneSpecs({ toolbelt = false } = {}) {
  return [
    {
      lane: 'solver',
      instruction: `Solve independently. Return FINAL_CANDIDATE first.${toolbelt ? ' If arithmetic is useful, include CALC: <expression> lines after your candidate.' : ''}`,
    },
    {
      lane: 'verifier',
      instruction: `Solve independently and check the likely answer, arithmetic, and option letter.${toolbelt ? ' Include CALC: <expression> lines for every arithmetic step that should be checked.' : ''}`,
    },
    {
      lane: 'format-guard',
      instruction: `Focus on the exact benchmark output format and evidence from the prompt.${toolbelt ? ' Check whether calculator results support or contradict the candidate.' : ''}`,
    },
  ];
}

async function agenticChat(task, { finalMode = 'consensus', toolbelt = false } = {}) {
  const lanes = laneSpecs({ toolbelt });
  const started = Date.now();
  const round1 = await Promise.all(
    lanes.map(async (lane) => {
      const result = await chatOnce([
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: [
            task.prompt,
            '',
            `ROUND 1 independent lane: ${lane.lane}`,
            lane.instruction,
          ].join('\n'),
        },
      ]);
      return { ...lane, round: 1, answer: result.text, elapsedMs: result.elapsedMs };
    }),
  );
  const toolResults = toolbelt ? extractCalcRequests(round1) : [];

  const round2 = await Promise.all(
    lanes.map(async (lane) => {
      const own = round1.find((item) => item.lane === lane.lane);
      const peers = round1.filter((item) => item.lane !== lane.lane);
      const result = await chatOnce([
        { role: 'system', content: systemPrompt() },
        {
          role: 'system',
          content:
            [
              'ROUND 2 cross-review. You can see the other two lanes.',
              'Revise if their reasoning exposes a mistake; otherwise keep your answer.',
              toolbelt ? 'Use CALCULATOR_RESULTS as exact arithmetic evidence. If a calculator result contradicts a lane, prefer the calculator.' : '',
              'Return FINAL_CANDIDATE first.',
            ].filter(Boolean).join(' '),
        },
        ...(toolbelt ? [{ role: 'system', content: `CALCULATOR_RESULTS:\n${formatToolResults(toolResults)}` }] : []),
        {
          role: 'user',
          content: [
            `Original benchmark item:\n${task.prompt}`,
            '',
            `Your round 1 answer:\n${own?.answer || ''}`,
            '',
            `Other round 1 answers:\n${formatLaneOutputs(peers)}`,
          ].join('\n'),
        },
      ]);
      return { ...lane, round: 2, answer: result.text, elapsedMs: result.elapsedMs, round1Answer: own?.answer || '' };
    }),
  );

  const consensus = chooseConsensus(round2);
  if (finalMode === 'consensus' && consensus) {
    return {
      text: consensus,
      elapsedMs: Date.now() - started,
      round1,
      shards: round2,
      toolResults,
      adjudication: { source: 'round2-consensus' },
    };
  }

  const synthesis = await chatOnce([
    { role: 'system', content: systemPrompt() },
    {
      role: 'system',
      content:
        [
          'You are the final adjudicator. Select the most likely benchmark answer from the two-round lane outputs.',
          toolbelt ? 'Use CALCULATOR_RESULTS as exact arithmetic evidence and reject lane answers that contradict it.' : '',
          'First line must be FINAL: with only the answer.',
        ].filter(Boolean).join(' '),
    },
    ...(toolbelt ? [{ role: 'system', content: `CALCULATOR_RESULTS:\n${formatToolResults(toolResults)}` }] : []),
    {
      role: 'user',
      content: [
        `Original benchmark item:\n${task.prompt}`,
        '',
        'Round 1 independent outputs:',
        formatLaneOutputs(round1),
        '',
        'Round 2 reviewed outputs:',
        formatLaneOutputs(round2),
      ].join('\n'),
    },
  ]);
  return {
    text: synthesis.text,
    elapsedMs: Date.now() - started,
    round1,
    shards: round2,
    toolResults,
    synthesisMs: synthesis.elapsedMs,
    adjudication: { source: toolbelt ? 'toolbelt-synthesis' : 'synthesis' },
  };
}

function chooseConsensus(outputs) {
  const groups = new Map();
  for (const output of outputs) {
    const candidate = finalCandidate(output.answer);
    const key = normalize(candidate);
    if (!key) {
      continue;
    }
    const group = groups.get(key) || { candidate, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  const best = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  return best?.count >= 2 ? `FINAL: ${best.candidate}` : null;
}

async function runMode(mode, tasks) {
  const rows = [];
  for (const task of tasks) {
    process.stdout.write(`[${mode}] ${task.id} ${task.benchmark} ... `);
    try {
      const result = await runStrategy(mode, task);
      const grade = task.grade(result.text);
      rows.push({
        id: task.id,
        benchmark: task.benchmark,
        mode,
        prompt: task.prompt,
        expected: task.expected,
        pass: grade.pass,
        gradeDetail: grade.detail,
        elapsedMs: result.elapsedMs,
        answer: result.text,
        round1: result.round1,
        shards: result.shards,
        synthesisMs: result.synthesisMs,
        toolResults: result.toolResults,
        programs: result.programs,
        solvers: result.solvers,
        judgeMs: result.judgeMs,
        adjudication: result.adjudication,
      });
      console.log(grade.pass ? 'PASS' : `FAIL expected=${task.expected} got=${grade.detail}`);
    } catch (error) {
      rows.push({ id: task.id, benchmark: task.benchmark, mode, prompt: task.prompt, expected: task.expected, pass: false, elapsedMs: 0, error: error.message });
      console.log(`ERROR ${error.message}`);
    }
  }
  return rows;
}

async function runStrategy(mode, task) {
  if (mode === 'agentic') {
    return agenticChat(task, { finalMode: 'consensus' });
  }
  if (mode === 'agentic-synthesis') {
    return agenticChat(task, { finalMode: 'synthesis' });
  }
  if (mode === 'agentic-toolbelt') {
    return agenticChat(task, { finalMode: 'synthesis', toolbelt: true });
  }
  if (mode === 'agentic-program') {
    return programAgenticChat(task);
  }
  if (mode === 'qwen5-judge') {
    return qwen5JudgeChat(task);
  }
  return singleChat(task);
}

function summarize(results) {
  const byBenchmark = new Map();
  for (const result of results) {
    const current = byBenchmark.get(result.benchmark) || { total: 0, passed: 0, elapsedMs: 0 };
    current.total += 1;
    current.passed += result.pass ? 1 : 0;
    current.elapsedMs += result.elapsedMs;
    byBenchmark.set(result.benchmark, current);
  }
  const passed = results.filter((row) => row.pass).length;
  return {
    passed,
    total: results.length,
    accuracy: passed / results.length,
    avgMs: Math.round(results.reduce((sum, row) => sum + row.elapsedMs, 0) / results.length),
    benchmarks: [...byBenchmark.entries()].map(([benchmark, value]) => ({
      benchmark,
      passed: value.passed,
      total: value.total,
      accuracy: value.passed / value.total,
      avgMs: Math.round(value.elapsedMs / value.total),
    })),
  };
}

function markdownReport(payload) {
  const lines = [
    `# ${MODEL} real benchmark agentic run`,
    '',
    `Generated: ${payload.generatedAt}`,
    `Sample size per benchmark: ${payload.sampleSize}`,
    '',
    '## Sources',
    '',
    ...payload.sources.map((source) => `- ${source.name}: ${source.source} (${source.dataset}, ${source.config}, ${source.split}, offset ${source.offset})`),
    '',
    '## Summary',
    '',
    '| Mode | Passed | Total | Accuracy | Avg ms |',
    '|---|---:|---:|---:|---:|',
    ...Object.entries(payload.summary).map(
      ([mode, summary]) => `| ${mode} | ${summary.passed} | ${summary.total} | ${(summary.accuracy * 100).toFixed(1)}% | ${summary.avgMs} |`,
    ),
    '',
    '## By Benchmark',
    '',
    '| Mode | Benchmark | Passed | Total | Accuracy | Avg ms |',
    '|---|---|---:|---:|---:|---:|',
  ];

  for (const [mode, summary] of Object.entries(payload.summary)) {
    for (const item of summary.benchmarks) {
      lines.push(`| ${mode} | ${item.benchmark} | ${item.passed} | ${item.total} | ${(item.accuracy * 100).toFixed(1)}% | ${item.avgMs} |`);
    }
  }

  lines.push('', '## Failures', '');
  for (const result of payload.results.filter((row) => !row.pass)) {
    lines.push(`### ${result.mode} ${result.id} ${result.benchmark}`);
    lines.push('', `Expected: ${result.expected}`, `Got: ${result.gradeDetail || result.error || ''}`, '', `Answer:\n\n\`\`\`\n${result.answer || ''}\n\`\`\``, '');
  }
  return lines.join('\n');
}

async function unload() {
  await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, keep_alive: 0 }),
  }).catch(() => undefined);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const benchmarkTasks = [];
  for (const spec of BENCHMARKS.filter((item) => BENCH_FILTER.size === 0 || BENCH_FILTER.has(item.name))) {
    benchmarkTasks.push(...await fetchBenchmarkRows(spec));
  }

  const results = [];
  const modeResults = {};
  for (const mode of MODES) {
    const rows = await runMode(mode, benchmarkTasks);
    modeResults[mode] = rows;
    results.push(...rows);
  }
  await unload();

  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/[:.]/g, '-');
  const payload = {
    model: MODEL,
    generatedAt,
    sampleSize: SAMPLE_SIZE,
    modes: MODES,
    sources: BENCHMARKS.map(({ name, dataset, config, split, offset, source }) => ({ name, dataset, config, split, offset, source })),
    summary: Object.fromEntries(Object.entries(modeResults).map(([mode, rows]) => [mode, summarize(rows)])),
    results,
  };
  const jsonPath = path.join(OUT_DIR, `${stamp}-real-agentic-${MODEL.replace(/[^a-z0-9.-]+/gi, '_')}.json`);
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
