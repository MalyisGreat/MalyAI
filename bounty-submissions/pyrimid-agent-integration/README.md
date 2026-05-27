# Pyrimid Agent Integration

This is a reproducible integration artifact for the Pyrimid Integration Bounty.
It uses the published `@pyrimid/sdk/resolver` resolver to let an agent discover and
recommend paid Pyrimid products with affiliate metadata.

It does not spend funds. The verifier stops at the x402 `402 Payment Required`
step and checks that the selected product returns machine-readable Base USDC
payment metadata.

## Run

```powershell
npm install
npm run demo -- "paid MCP tool for agent commerce"
```

## Verify

```powershell
npm run verify
```

Expected output is JSON with:

- `ok: true`
- `sdk: "@pyrimid/sdk/resolver@0.2.6"`
- at least one recommended product
- a selected product endpoint that returns `402`
- Base USDC x402 payment metadata with `payTo`, `resource`, and `affiliateBps`

## Integration Point

The agent integration is in `agent.mjs`:

```js
const resolver = new PyrimidResolver({
  affiliateId,
  catalogUrl,
  maxPriceUsdc: 1_000_000,
  preferVerifiedVendors: false
});

const products = await resolver.findProducts(need, limit);
```

Set `PYRIMID_AFFILIATE_ID` to a registered Pyrimid affiliate id before using
this in production. The default id is a public demo id for reproducibility.
