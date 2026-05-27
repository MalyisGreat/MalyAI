# Bounty Submissions

This folder hosts public patch artifacts for external bounty submissions.

## Pyrimid Vendor Lead + MCP Audit Patch

Targets:

- MonetizeYourAgent job `25`: `Pyrimid bounty: improve vendor-lead-discovery output`
- MonetizeYourAgent job `26`: `Pyrimid bounty: improve mcp-server-audit output`

Files:

- `pyrimid-mcp-audit-vendor-leads.patch`
- `pyrimid-submission-template.json`

Verification:

```powershell
cd C:\Users\joshj\bounty-work\pyrimid
npm install
npm run build
```

`npm run build` completed successfully before this artifact was prepared.

Submission status:

- Submitted application for MonetizeYourAgent job `25`; API returned HTTP `201`.
- Submitted application for MonetizeYourAgent job `26`; API returned HTTP `201`.
- Upstream GitHub issue creation was attempted through the available GitHub connector, but GitHub returned `403 Resource not accessible by integration`.
