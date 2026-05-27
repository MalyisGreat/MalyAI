import { PyrimidResolver } from "@pyrimid/sdk/resolver";
import { fileURLToPath } from "node:url";

const DEFAULT_AFFILIATE_ID = "af_malyisgreat_codex";
const DEFAULT_CATALOG_URL = "https://pyrimid.ai/api/v1/catalog?source=pyrimid-seed&limit=20";

function atomicUsdcToDisplay(amount) {
  return `$${(Number(amount) / 1_000_000).toFixed(4)}`;
}

function splitPreview(product) {
  const total = Number(product.price_usdc);
  const protocolFee = Math.floor(total * 0.01);
  const afterProtocol = total - protocolFee;
  const affiliateCommission = Math.floor(afterProtocol * Number(product.affiliate_bps) / 10_000);
  const vendorShare = afterProtocol - affiliateCommission;
  return {
    total_usdc_atomic: total,
    protocol_fee_atomic: protocolFee,
    affiliate_commission_atomic: affiliateCommission,
    affiliate_commission_display: atomicUsdcToDisplay(affiliateCommission),
    vendor_share_atomic: vendorShare,
    vendor_share_display: atomicUsdcToDisplay(vendorShare)
  };
}

function recommendationFor(product, need, affiliateId) {
  return {
    need,
    affiliate_id: affiliateId,
    vendor_id: product.vendor_id,
    vendor_name: product.vendor_name,
    product_id: product.product_id,
    category: product.category,
    description: product.description,
    price_usdc_atomic: product.price_usdc,
    price_display: product.price_display,
    affiliate_bps: product.affiliate_bps,
    endpoint: product.endpoint,
    method: product.method,
    network: product.network,
    asset: product.asset,
    tags: product.tags,
    split_preview: splitPreview(product),
    buyer_agent_next_step: "Call the endpoint, read HTTP 402 X-PAYMENT-REQUIRED metadata, pay through x402/Base USDC under wallet policy, then retry with X-PAYMENT or X-PAYMENT-TX."
  };
}

export async function recommendPyrimidProducts({
  need = "paid MCP tool for agent commerce",
  affiliateId = process.env.PYRIMID_AFFILIATE_ID || DEFAULT_AFFILIATE_ID,
  catalogUrl = process.env.PYRIMID_CATALOG_URL || DEFAULT_CATALOG_URL,
  limit = 3
} = {}) {
  const resolver = new PyrimidResolver({
    affiliateId,
    catalogUrl,
    maxPriceUsdc: 1_000_000,
    preferVerifiedVendors: false
  });

  const products = await resolver.findProducts(need, limit);
  return {
    agent: "malyisgreat-codex-agent",
    integrated_sdk: "@pyrimid/sdk/resolver@0.2.6",
    catalog_url: catalogUrl,
    recommendation_count: products.length,
    recommendations: products.map((product) => recommendationFor(product, need, affiliateId))
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const need = process.argv.slice(2).join(" ") || "paid MCP tool for agent commerce";
  const result = await recommendPyrimidProducts({ need });
  console.log(JSON.stringify(result, null, 2));
}
