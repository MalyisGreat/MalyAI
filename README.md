# Maly AI

Maly AI is a local-first chat workspace for Ollama models. It includes clean chat, web search, file/image attachments, code artifacts, workspace tools, memory, automations, Google Workspace read-only integration, and experimental multi-agent Qwen benchmark tooling.

## What To Download

Install these first:

1. **Git**
   - Download: https://git-scm.com/downloads
   - Verify:
     ```powershell
     git --version
     ```

2. **Node.js 22 LTS or newer**
   - Download: https://nodejs.org/
   - Verify:
     ```powershell
     node --version
     npm --version
     ```

3. **Ollama**
   - Download: https://ollama.com/download
   - Verify:
     ```powershell
     ollama --version
     ```

4. **Maly AI models**
   Pull the local models used by the app:
   ```powershell
   ollama pull qwen3.5:0.8b
   ollama pull qwen3.5:2b
   ollama pull qwen3.5:4b
   ollama pull qwen2.5vl:3b
   ```

   Model usage:
   - `qwen3.5:0.8b`: default fast chat
   - `qwen3.5:2b`: better reasoning/coding
   - `qwen3.5:4b`: harder planning/refactor work
   - `qwen2.5vl:3b`: optional vision model for image uploads

## Install

Clone and install:

```powershell
git clone https://github.com/MalyisGreat/MalyAI.git
cd MalyAI
npm install
```

Create local environment config:

```powershell
Copy-Item .env.example .env
```

The default `.env` values work for normal local usage if Ollama is running at `http://127.0.0.1:11434`.

## Run

Start Ollama if it is not already running, then start Maly AI:

```powershell
npm run dev
```

Open:

```text
http://127.0.0.1:5177/
```

The backend API runs at:

```text
http://127.0.0.1:8791/
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8791/api/health
```

## Optional Google Workspace Setup

Google Workspace support is optional. Without it, the rest of Maly AI still works.

1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Create or select a project.
3. Enable these APIs:
   - Google Drive API
   - Google Calendar API
   - Gmail API
4. Configure OAuth consent.
5. Create an OAuth **Web application** client.
6. Add this authorized redirect URI:
   ```text
   http://127.0.0.1:8791/api/google/callback
   ```
7. Put the credentials in `.env`:
   ```powershell
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://127.0.0.1:8791/api/google/callback
   ```

Google tokens are stored locally in `server/data/google-session.json`, which is ignored by git.

## Features

- Clean chat UI with no recent-chat sidebar and no profile images.
- Ollama backend with model presets.
- Web search using backend search results.
- File and image attachments.
- Artifact Studio for HTML, React, Markdown, JSON, Mermaid, charts, SVG, runnable JS, and code previews.
- Workspace mode with file tree, file preview, attach-to-chat, diffs, and AI file actions.
- Personalization settings that are added to the system prompt.
- Memory capture and memory review/editing.
- Long-running automation queue that waits for idle interactive usage.
- Google Workspace read-only panels for Drive metadata, Calendar events, and Gmail summaries.
- Experimental Qwen split-compute / multi-agent modes.
- Real benchmark scripts for GSM8K, ARC-Challenge, and MMLU samples.

## Useful Commands

```powershell
npm run dev
npm run build
npm run lint
```

Run automation smoke test:

```powershell
npm run smoke:automations
```

Run real benchmark samples:

```powershell
node scripts\benchmark-real-agentic.mjs
```

Run a focused GSM8K comparison:

```powershell
$env:MALY_REAL_BENCHMARKS='gsm8k'
$env:MALY_REAL_BENCH_MODES='single,qwen5-judge'
$env:MALY_REAL_BENCH_N='50'
$env:MALY_GSM8K_OFFSET='200'
node scripts\benchmark-real-agentic.mjs
Remove-Item Env:\MALY_REAL_BENCHMARKS
Remove-Item Env:\MALY_REAL_BENCH_MODES
Remove-Item Env:\MALY_REAL_BENCH_N
Remove-Item Env:\MALY_GSM8K_OFFSET
```

Benchmark reports are written to `logs/benchmarks/`, which is ignored by git.

## Environment Variables

Common values:

```text
MALY_API_PORT=8791
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:0.8b
MALY_REQUEST_TIMEOUT_MS=300000
MALY_JSON_LIMIT=25mb
MALY_SEARCH_TIMEOUT_MS=12000
MALY_AUTOMATION_POLL_MS=5000
MALY_AUTOMATION_IDLE_MS=12000
```

Google Workspace:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://127.0.0.1:8791/api/google/callback
```

Benchmark controls:

```text
MALY_REAL_BENCHMARKS=gsm8k,arc-challenge,mmlu-abstract-algebra
MALY_REAL_BENCH_MODES=single,agentic,qwen5-judge
MALY_REAL_BENCH_N=5
MALY_GSM8K_OFFSET=50
MALY_ARC_OFFSET=50
MALY_MMLU_OFFSET=50
```

## Local Data

These files are intentionally local-only and ignored by git:

- `server/data/google-session.json`
- `server/data/automations.json`
- `server/data/memories.json`
- `server/data/runs/`
- `logs/`
- `dist/`
- `node_modules/`

## Troubleshooting

If chat does not work:

```powershell
ollama list
ollama ps
Invoke-RestMethod http://127.0.0.1:8791/api/health
```

If a model is missing:

```powershell
ollama pull qwen3.5:0.8b
```

If ports are busy, stop old Node processes or change `MALY_API_PORT` and the Vite port in `package.json`.
