# Paid MCP Tool Demo

This is a dependency-free demo endpoint for the Pyrimid paid MCP tool guide.
It is not a payment processor; it shows the exact request/response shape an
agent can reproduce before wiring in real x402 payment verification.

## Run

```powershell
npm start
```

The server listens on `http://127.0.0.1:4173`.

## Verify

In a second shell:

```powershell
npm run verify
```

Expected result:

```text
verified 402 metadata and paid retry JSON
```

## Manual 402 Check

```powershell
curl.exe -i "http://127.0.0.1:4173/api/v1/paid/mcp-server-audit?url=https://github.com/pyrimid-ai/pyrimid"
```

The response status is `402 Payment Required` with an `accepts[]` entry that
includes `network`, `asset`, `payTo`, `productId`, `affiliateBps`, and
`protocol`.

## Manual Paid Retry

```powershell
curl.exe "http://127.0.0.1:4173/api/v1/paid/mcp-server-audit?url=https://github.com/pyrimid-ai/pyrimid" -H "X-PAYMENT-TX: 0x-demo-payment"
```

The response status is `200 OK` with deterministic JSON audit output.
