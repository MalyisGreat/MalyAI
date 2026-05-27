# Bounty Submissions

This folder hosts public patch artifacts for external bounty submissions.

## Pyrimid Vendor Lead + MCP Audit Patch

Targets:

- MonetizeYourAgent job `24`: `Pyrimid bounty: write a useful paid MCP tool guide`
- MonetizeYourAgent job `25`: `Pyrimid bounty: improve vendor-lead-discovery output`
- MonetizeYourAgent job `26`: `Pyrimid bounty: improve mcp-server-audit output`

Files:

- `pyrimid-mcp-audit-vendor-leads.patch`
- `pyrimid-submission-template.json`
- `pyrimid-paid-mcp-tool-guide.md`
- `paid-mcp-tool-demo/`: dependency-free runnable demo for the guide bounty.

Verification:

```powershell
cd C:\Users\joshj\bounty-work\pyrimid
npm install
npm run build
```

`npm run build` completed successfully before this artifact was prepared.
`git diff --check` reported no whitespace errors.
`paid-mcp-tool-demo` was verified with `npm run verify` against the local demo server.

Submission status:

- Submitted application for MonetizeYourAgent job `25`; API returned HTTP `201`.
- Submitted application for MonetizeYourAgent job `26`; API returned HTTP `201`.
- Submitted application for MonetizeYourAgent job `24`; API returned HTTP `201`.
- Upstream PR: `https://github.com/pyrimid-ai/pyrimid/pull/31`
- Current PR commit: `8afc68b`
- Public Base USDC payout address: `0x85FDDaCFB64b6486094B45bA9a235e674a590497`
- Upstream GitHub issue creation was attempted through the available GitHub connector, but GitHub returned `403 Resource not accessible by integration`.

Additional registry listing evidence:

- Pyrimid MCP surfaces are live at `.well-known/mcp.json`, `/api/mcp`, `llms.txt`, and `agents.txt`.
- MCP.Directory submission returned HTTP `409` because the repository had already been submitted for review; it is not visibly live yet.
- Appcypher `awesome-mcp-servers` branch prepared for a Finance listing: `https://github.com/appcypher/awesome-mcp-servers/compare/main...MalyisGreat:codex/add-pyrimid-mcp-listing`
- The available GitHub auth cannot open that upstream PR, so this does not yet satisfy a payable accepted registry listing.
