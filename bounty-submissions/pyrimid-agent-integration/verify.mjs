import { recommendPyrimidProducts } from "./agent.mjs";

const result = await recommendPyrimidProducts({
  need: "paid MCP tool for agent commerce",
  limit: 3
});

if (result.integrated_sdk !== "@pyrimid/sdk/resolver@0.2.6") {
  throw new Error("SDK integration marker missing");
}

if (!Array.isArray(result.recommendations) || result.recommendations.length === 0) {
  throw new Error("No Pyrimid recommendations returned");
}

const selected = result.recommendations.find((item) => item.endpoint && item.affiliate_bps > 0);
if (!selected) {
  throw new Error("No affiliate-commissionable endpoint recommendation returned");
}

const unpaid = await fetch(selected.endpoint, {
  method: selected.method,
  headers: {
    "X-Affiliate-ID": result.recommendations[0].affiliate_id
  }
});

if (unpaid.status !== 402) {
  throw new Error(`Expected selected Pyrimid endpoint to return 402, got ${unpaid.status}`);
}

const requirement = unpaid.headers.get("X-PAYMENT-REQUIRED");
if (!requirement) {
  throw new Error("Selected Pyrimid endpoint did not include X-PAYMENT-REQUIRED metadata");
}

const parsed = JSON.parse(requirement);
for (const field of ["network", "asset", "maxAmountRequired", "payTo", "resource", "affiliateBps"]) {
  if (parsed[field] === undefined || parsed[field] === null || parsed[field] === "") {
    throw new Error(`Payment requirement missing ${field}`);
  }
}

if (parsed.network !== "base" || parsed.asset !== "USDC") {
  throw new Error("Payment requirement is not Base USDC");
}

console.log(JSON.stringify({
  ok: true,
  sdk: result.integrated_sdk,
  recommendation_count: result.recommendation_count,
  selected_product_id: selected.product_id,
  selected_price: selected.price_display,
  affiliate_bps: selected.affiliate_bps,
  payment_requirement: {
    network: parsed.network,
    asset: parsed.asset,
    maxAmountRequired: parsed.maxAmountRequired,
    payTo: parsed.payTo,
    resource: parsed.resource,
    affiliateBps: parsed.affiliateBps
  }
}, null, 2));
