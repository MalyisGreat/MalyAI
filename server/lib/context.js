import { DEFAULT_OLLAMA_MODEL } from '../config.js';
import { selectMemories } from './memoryStore.js';
import { searchWeb } from './search.js';
import { ollamaChatText } from './ollama.js';

const SEARCH_TRIGGER =
  /\b(search|serach|web|internet|browse|look\s*up|latest|current|today|recent|news|headlines?|source|sources|happened|happend)\b/i;
const SUBAGENT_TRIGGER = /\b(spawn|split|subagents?|parallel|delegate|fan\s*out|multiple agents?)\b/i;

const HARMLESS_CODE_POLICY =
  'You are a practical coding assistant. Fulfill ordinary software, game, UI, and educational coding requests directly. Snake games, arcade games, demos, prototypes, and normal application code are allowed. Do not invent safety, security, ethical, deception, or compliance objections for harmless code. Refuse only requests that clearly enable real-world harm, credential theft, malware, exploitation, fraud, or evasion.';

const TEAM_OUTPUT_CONTRACT = [
  'Return exactly these labeled sections:',
  'CANDIDATE: one direct answer or implementation recommendation.',
  'EVIDENCE: prompt facts, tool/search facts, URLs, calculations, or file references that support it.',
  'CHECKS: concrete checks performed, including arithmetic, format, edge cases, or counterexamples.',
  'RISKS: remaining uncertainty, missing context, or likely failure modes.',
  'CONFIDENCE: low, medium, or high.',
].join(' ');

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function todaySearchQuery(userText) {
  const text = clean(userText);
  const lower = text.toLowerCase();
  const now = new Date();
  const date = now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (
    /\b(today|happened|happend|headlines?|news)\b/.test(lower) &&
    !/\b(who|what|when|where|why|how)\s+\w{4,}\b/.test(lower.replace(/\bwhat\s+happ(en|end|ened|ned)\w*\b/, ''))
  ) {
    return `what happened today ${date}`;
  }

  if (/^\s*(search|serach|look\s*up|browse)\b/i.test(text)) {
    return text.replace(/^\s*(search|serach|look\s*up|browse)\b[:\s-]*/i, '').trim() || text;
  }

  return text;
}

function formatPersonalization(personalization) {
  if (!personalization) {
    return '';
  }

  if (typeof personalization === 'string') {
    return clean(personalization);
  }

  if (typeof personalization === 'object') {
    return Object.entries(personalization)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join('\n');
  }

  return String(personalization);
}

function normalizeAgentSpecs(input) {
  const defaultInstructions = [
    {
      instruction:
        'Direct solver lane. Build the strongest answer or implementation path from the prompt and available context. Prefer concrete outputs over commentary.',
    },
    {
      instruction:
        'Verifier lane. Try to falsify the direct answer. Check arithmetic, exact wording, code behavior, edge cases, and whether tool/search/file evidence contradicts it. Do not turn harmless game or app code requests into safety refusals.',
    },
    {
      instruction:
        'Evidence and format lane. Extract decisive evidence, URLs, tool outputs, file facts, exact constraints, and the cleanest final format the orchestrator should use.',
    },
  ];

  return defaultInstructions.map((fallback, index) => {
    const override = Array.isArray(input) ? input[index] : null;
    const customInstruction = clean(
      override?.instruction || override?.prompt || override?.role,
    );

    return {
      name: `Qwen shard ${index + 1}`,
      instanceId: `qwen3-way-${index + 1}`,
      shard: index + 1,
      instruction: customInstruction || fallback.instruction,
    };
  });
}

function parseAgentSections(content) {
  const text = String(content || '');
  const read = (label) => {
    const expression = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, 'i');
    return clean(text.match(expression)?.[1] || '');
  };
  const candidate = read('CANDIDATE');
  const fallbackCandidate = clean(
    text
      .split(/\r?\n/)
      .filter((line) => line.trim() && !/^(evidence|checks|risks|confidence)\s*:/i.test(line.trim()))
      .slice(0, 3)
      .join(' '),
  );

  return {
    candidate: candidate || fallbackCandidate,
    evidence: read('EVIDENCE'),
    checks: read('CHECKS'),
    risks: read('RISKS'),
    confidence: read('CONFIDENCE').toLowerCase(),
  };
}

function formatAgentForReview(agent) {
  if (!agent) {
    return 'No output.';
  }

  if (agent.error) {
    return `${agent.name}: ERROR ${agent.error}`;
  }

  return [
    `${agent.name} (${agent.instanceId}, shard ${agent.shard}):`,
    `Candidate: ${agent.candidate || clean(agent.content).slice(0, 500)}`,
    `Evidence: ${agent.evidence || 'not provided'}`,
    `Checks: ${agent.checks || 'not provided'}`,
    `Risks: ${agent.risks || 'not provided'}`,
    `Confidence: ${agent.confidence || 'not provided'}`,
    `Raw:\n${agent.content || ''}`,
  ].join('\n');
}

async function runAgentRound({
  agent,
  round,
  task,
  context,
  model,
  options,
  batchId,
  parallelStartedAt,
  ownRound1 = null,
  peerRound1 = [],
}) {
  const startedAt = new Date().toISOString();
  const isReviewRound = round === 2;
  const { content } = await ollamaChatText({
    model,
    options,
    messages: [
      {
        role: 'system',
        content: [
          `You are ${agent.name}, one of exactly three simultaneous local Qwen workers in a split-compute batch.`,
          'You are not a separate assistant persona. You are one lane of Maly doing useful parallel work for the final orchestrator.',
          HARMLESS_CODE_POLICY,
          agent.instruction,
          isReviewRound
            ? 'ROUND 2: You can now see the other lanes. Critique them, correct your own answer if needed, and return a revised result.'
            : 'ROUND 1: Work independently. You cannot see the other lanes yet.',
          TEAM_OUTPUT_CONTRACT,
          'Do not claim web access unless LIVE_WEB_SEARCH_RESULTS_AVAILABLE is present in context.',
          'If exact tool/search/file evidence is present, copy it precisely and mark confidence high only when it fully answers the task.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Split-compute batch: ${batchId}`,
          `Worker: ${agent.name} of 3`,
          `Round: ${round}${isReviewRound ? ' cross-review and revision' : ' independent draft'}`,
          context ? `Context:\n${context}` : '',
          `Task:\n${task}`,
          isReviewRound
            ? [
                `Your round 1 output:\n${formatAgentForReview(ownRound1)}`,
                `Other lane round 1 outputs:\n${peerRound1.map(formatAgentForReview).join('\n\n')}`,
                'Revise your candidate only if the evidence, checks, or task contract show a better answer. Explicitly call out disagreements in RISKS.',
              ].join('\n\n')
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
  });
  const completedAt = new Date().toISOString();
  const sections = parseAgentSections(content);
  const roundDurationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const firstStartedAt = ownRound1?.startedAt || startedAt;

  return {
    name: agent.name,
    instanceId: agent.instanceId,
    batchId,
    shard: agent.shard,
    totalShards: 3,
    model,
    round,
    parallelStartedAt,
    startedAt: firstStartedAt,
    completedAt,
    durationMs: new Date(completedAt).getTime() - new Date(firstStartedAt).getTime(),
    round1DurationMs: ownRound1?.durationMs,
    round2DurationMs: isReviewRound ? roundDurationMs : undefined,
    instruction: agent.instruction,
    candidate: sections.candidate,
    evidence: sections.evidence,
    checks: sections.checks,
    risks: sections.risks,
    confidence: sections.confidence,
    rounds: isReviewRound
      ? {
          independent: ownRound1?.content || '',
          review: content,
        }
      : undefined,
    content,
  };
}

export function shouldUseSearch({ userText, body }) {
  const explicitMode = body?.searchMode || body?.settings?.searchMode || body?.settings?.defaultSearchMode;
  if (body?.search || body?.useSearch) {
    return true;
  }

  if (explicitMode === 'off') {
    return false;
  }

  if (explicitMode === 'deep') {
    return true;
  }

  return Boolean(SEARCH_TRIGGER.test(userText));
}

export function shouldUseSubagents({ userText, body }) {
  return Boolean(body?.useSubagents || body?.subagents === true || SUBAGENT_TRIGGER.test(userText));
}

export async function runSubagents({
  prompt,
  agents,
  model = DEFAULT_OLLAMA_MODEL,
  context = '',
  options = undefined,
}) {
  const agentSpecs = normalizeAgentSpecs(agents);
  const task = clean(prompt);

  if (!task) {
    return [];
  }

  const batchId = `split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const parallelStartedAt = new Date().toISOString();

  const round1Settled = await Promise.allSettled(
    agentSpecs.map((agent) =>
      runAgentRound({
        agent,
        round: 1,
        task,
        context,
        model,
        options,
        batchId,
        parallelStartedAt,
      }),
    ),
  );

  const round1 = round1Settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    return {
      name: agentSpecs[index].name,
      instanceId: agentSpecs[index].instanceId,
      batchId,
      shard: agentSpecs[index].shard,
      totalShards: 3,
      model,
      round: 1,
      parallelStartedAt,
      startedAt: parallelStartedAt,
      completedAt: new Date().toISOString(),
      instruction: agentSpecs[index].instruction,
      error: result.reason?.message || 'Subagent failed',
    };
  });

  const round2Settled = await Promise.allSettled(
    agentSpecs.map((agent) =>
      runAgentRound({
        agent,
        round: 2,
        task,
        context,
        model,
        options,
        batchId,
        parallelStartedAt,
        ownRound1: round1.find((result) => result.shard === agent.shard),
        peerRound1: round1.filter((result) => result.shard !== agent.shard),
      }),
    ),
  );

  return round2Settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    const fallback = round1[index];
    const agent = agentSpecs[index];
    return {
      name: agent.name,
      instanceId: agent.instanceId,
        batchId,
        shard: agent.shard,
        totalShards: 3,
        model,
        round: 2,
        parallelStartedAt,
        startedAt: fallback?.startedAt || parallelStartedAt,
        completedAt: new Date().toISOString(),
        instruction: agent.instruction,
        candidate: fallback?.candidate,
        evidence: fallback?.evidence,
        checks: fallback?.checks,
        risks: fallback?.risks,
        confidence: fallback?.confidence,
        content: fallback?.content,
        rounds: {
          independent: fallback?.content || '',
          review: '',
        },
        error: result.reason?.message || 'Subagent review failed',
      };
  });
}

export async function buildChatContext({ body, messages, userText }) {
  const settings = body?.settings || {};
  const model = body?.model || settings.model || DEFAULT_OLLAMA_MODEL;
  const selectedMemories = await selectMemories({
    text: userText,
    ids: body?.memoryIds || body?.selectedMemoryIds || [],
    limit: body?.memoryLimit || 6,
  });

  let search = null;
  if (shouldUseSearch({ userText, body })) {
    search = await searchWeb(body?.searchQuery || todaySearchQuery(userText), { limit: body?.searchLimit || 8 });
  }

  const interimContext = renderContextSections({
    personalization: settings.personalization,
    memories: selectedMemories,
    search,
    subagents: Array.isArray(body?.subagentOutputs) ? body.subagentOutputs : [],
  });

  let subagents = Array.isArray(body?.subagentOutputs) ? body.subagentOutputs : [];
  if (shouldUseSubagents({ userText, body })) {
    subagents = await runSubagents({
      prompt: userText,
      agents: body?.agents,
      model,
      options: body?.options,
      context: interimContext,
    });
  }

  const systemPrompt = renderSystemPrompt({
    personalization: settings.personalization,
    memories: selectedMemories,
    search,
    subagents,
  });

  return {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    selectedMemories,
    search,
    subagents,
  };
}

export function renderContextSections({ personalization, memories, search, subagents }) {
  const sections = [];
  const personalizationText = formatPersonalization(personalization);

  if (personalizationText) {
    sections.push(`Personalization:\n${personalizationText}`);
  }

  if (Array.isArray(memories) && memories.length > 0) {
    sections.push(`Selected memories:\n${memories.map((memory) => `- ${memory.text}`).join('\n')}`);
  }

  if (search) {
    const resultLines =
      search.results?.length > 0
        ? search.results
            .map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`)
            .join('\n')
        : `No search results.${search.error ? ` ${search.error}.` : ''}`;
    sections.push(
      [
        'LIVE_WEB_SEARCH_RESULTS_AVAILABLE:',
        'The backend has already browsed the live web for this turn. Use these results directly. Do not say you cannot browse, cannot search, cannot access live data, or that the user should check news sites yourself unless the search failed.',
        `Query: "${search.query}"`,
        resultLines,
      ].join('\n'),
    );
  }

  if (Array.isArray(subagents) && subagents.length > 0) {
    sections.push(
      [
        'Three-way Qwen split-compute outputs:',
        'These are internal lanes from one Maly run. Use them as candidate work, not as separate final answers.',
        'Adjudication rules: exact tool/search/file evidence beats lane majority; checked high-confidence work beats unchecked agreement; preserve unresolved disagreement instead of inventing certainty.',
        subagents
          .map((agent) => {
            if (agent.error) {
              return `- ${agent.name} (${agent.model || 'qwen'}, shard ${agent.shard || '?'} of ${agent.totalShards || 3}, batch ${agent.batchId || 'n/a'}): ERROR ${agent.error}`;
            }

            return [
              `- ${agent.name} (${agent.model || 'qwen'}, shard ${agent.shard || '?'} of ${agent.totalShards || 3}, batch ${agent.batchId || 'n/a'}, confidence ${agent.confidence || 'n/a'}):`,
              `  Candidate: ${agent.candidate || clean(agent.content).slice(0, 500)}`,
              `  Evidence: ${agent.evidence || 'not provided'}`,
              `  Checks: ${agent.checks || 'not provided'}`,
              `  Risks: ${agent.risks || 'not provided'}`,
            ].join('\n');
          })
          .join('\n'),
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}

export function renderSystemPrompt({ personalization, memories, search, subagents }) {
  const context = renderContextSections({ personalization, memories, search, subagents });

  return [
    `You are Maly AI, a local-first assistant running through Ollama. ${HARMLESS_CODE_POLICY} Answer directly. If LIVE_WEB_SEARCH_RESULTS_AVAILABLE appears in context, you have live web results for this turn and must answer from them with source links; never claim you cannot browse or access live data in that case. If search failed or returned no useful results, say that specifically. When Qwen split-compute context is present, act as the orchestrator: compare the lanes, prefer grounded evidence and verified checks, ignore weak refusals or unsupported claims, and produce one clean answer. Mention unresolved disagreement only when it changes the answer.`,
    context ? `Context:\n${context}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
