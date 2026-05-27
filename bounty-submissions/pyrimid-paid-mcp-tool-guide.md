# Selling a Paid MCP Tool with x402 and Pyrimid

This guide shows the minimal shape for turning an MCP-style tool or HTTP API into a paid, agent-readable endpoint using x402 and Pyrimid.

## Goal

Expose one valuable tool as:

- free discovery metadata,
- HTTP `402 Payment Required` before purchase,
- JSON output after a valid payment proof,
- catalog metadata that buyer agents can evaluate automatically.

## Example Paid Tool

Tool: `mcp_server_audit`

Use case: inspect an MCP server URL and return monetization recommendations.

Paid endpoint:

```text
GET https://pyrimid.ai/api/v1/paid/mcp-server-audit?url=https://example.com/mcp
```

Price: `$0.10` USDC on Base.

Runnable demo:

```text
https://github.com/MalyisGreat/MalyAI/tree/main/bounty-submissions/paid-mcp-tool-demo
```

The demo is a dependency-free Node endpoint that returns the same `402` shape
shown below, then returns paid JSON when retried with `X-PAYMENT` or
`X-PAYMENT-TX`. It is intentionally a local reproducibility harness, not a
payment verifier.

Run it:

```bash
cd bounty-submissions/paid-mcp-tool-demo
npm start
```

Verify it:

```bash
npm run verify
```

Expected verifier output:

```text
verified 402 metadata and paid retry JSON
```

## Expected 402 Response

Before payment, the endpoint should return a machine-readable `402` response with x402 metadata.

```bash
curl -i "https://pyrimid.ai/api/v1/paid/mcp-server-audit?url=https://example.com/mcp"
```

Expected shape:

```json
{
  "error": "payment_required",
  "message": "Pay $0.10 USDC on Base through Pyrimid, then retry with X-PAYMENT or X-PAYMENT-TX.",
  "accepts": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "base",
      "asset": "USDC",
      "maxAmountRequired": "0.10",
      "payTo": "0xc949AEa380D7b7984806143ddbfE519B03ABd68B",
      "resource": "https://pyrimid.ai/api/v1/paid/mcp-server-audit?url=https://example.com/mcp",
      "description": "Paid MCP monetization audit: tells an MCP server how to add paid tools, x402 pricing, and affiliate routing.",
      "mimeType": "application/json",
      "vendorId": "pyrimid-growth",
      "productId": "mcp-server-audit",
      "affiliateBps": 4000,
      "protocol": "pyrimid"
    }
  ]
}
```

Buyer agents should parse `accepts[0]`, check the price/network/asset, pay through the compatible x402 flow, then retry the same URL with `X-PAYMENT` or `X-PAYMENT-TX`.

## Paid Retry

After a valid payment, retry:

```bash
curl "https://pyrimid.ai/api/v1/paid/mcp-server-audit?url=https://example.com/mcp" \
  -H "X-PAYMENT-TX: BASE_TRANSACTION_HASH"
```

Expected paid output shape:

```json
{
  "product_id": "mcp-server-audit",
  "vendor_id": "pyrimid-growth",
  "payment_tx": "0x...",
  "audit": {
    "url": "https://example.com/mcp",
    "recommended_paid_tools": [
      "premium_search",
      "enrich",
      "export",
      "analyze"
    ],
    "pricing": "$0.01-$0.25 per call depending on compute/data cost",
    "integration_steps": [
      "Add 402 response with x402 accepts[] metadata",
      "Register vendor/product in Pyrimid catalog",
      "Expose tool schema in MCP server card",
      "Add affiliateBps for distribution agents"
    ]
  },
  "routed_by": "pyrimid"
}
```

## Catalog Metadata

At minimum, publish product metadata in a catalog endpoint so buyer agents can discover the paid tool without calling it first.

```json
{
  "vendor_id": "pyrimid-growth",
  "vendor_name": "Pyrimid Growth",
  "product_id": "mcp-server-audit",
  "description": "Paid MCP monetization audit: tells an MCP server how to add paid tools, x402 pricing, and affiliate routing.",
  "category": "devtools",
  "tags": ["mcp", "audit", "monetization", "paid-tools", "x402", "developer-tools"],
  "price_usdc": 100000,
  "price_display": "$0.10",
  "affiliate_bps": 4000,
  "endpoint": "https://pyrimid.ai/api/v1/paid/mcp-server-audit?url=https://example.com/mcp",
  "method": "GET",
  "network": "base",
  "asset": "USDC",
  "source": "pyrimid-seed",
  "sdk_integrated": true
}
```

Pyrimid catalog link:

```text
https://pyrimid.ai/api/v1/catalog?source=pyrimid-seed
```

## MCP Server Card

The MCP server card should keep discovery free and only charge for high-value work.

Free:

- server name,
- tool list,
- JSON schemas,
- health check,
- documentation links.

Paid:

- fresh searches,
- enrichment calls,
- exports,
- browser/API work,
- LLM-heavy analysis,
- data with direct vendor cost.

Example tool declaration:

```json
{
  "name": "mcp_server_audit",
  "description": "Analyze an MCP server and recommend paid-tool routes, x402 pricing, catalog metadata, and risk notes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": {
        "type": "string",
        "description": "MCP server URL or repository URL to inspect."
      }
    },
    "required": ["url"]
  },
  "x402": {
    "endpoint": "https://pyrimid.ai/api/v1/paid/mcp-server-audit",
    "network": "base",
    "asset": "USDC",
    "price": "0.10",
    "affiliateBps": 4000
  }
}
```

## Implementation Checklist

1. Choose one paid tool where the output has clear value.
2. Keep metadata and docs free.
3. Return `402` with `accepts[]` before payment.
4. Verify `X-PAYMENT` or `X-PAYMENT-TX` server-side.
5. Return deterministic JSON after payment.
6. Add the product to Pyrimid catalog metadata.
7. Include `affiliateBps` so distribution agents have a reason to recommend it.
8. Publish a reproducible curl example.

## Link to Pyrimid

Pyrimid quickstart:

```text
https://pyrimid.ai/quickstart
```

Pyrimid repository:

```text
https://github.com/pyrimid-ai/pyrimid
```
