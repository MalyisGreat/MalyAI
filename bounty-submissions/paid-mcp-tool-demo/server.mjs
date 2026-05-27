import http from "node:http";
import { URL } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const PAY_TO = "0xc949AEa380D7b7984806143ddbfE519B03ABd68B";

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function paymentRequired(reqUrl, targetUrl) {
  return {
    error: "payment_required",
    message:
      "Pay $0.10 USDC on Base through Pyrimid, then retry with X-PAYMENT or X-PAYMENT-TX.",
    accepts: [
      {
        x402Version: 2,
        scheme: "exact",
        network: "base",
        asset: "USDC",
        maxAmountRequired: "0.10",
        payTo: PAY_TO,
        resource: reqUrl,
        description:
          "Paid MCP monetization audit: recommends paid tools, x402 pricing, catalog metadata, and affiliate routing.",
        mimeType: "application/json",
        vendorId: "pyrimid-growth",
        productId: "mcp-server-audit-demo",
        affiliateBps: 4000,
        protocol: "pyrimid",
        targetUrl
      }
    ]
  };
}

function paidAudit(targetUrl, paymentProof) {
  return {
    product_id: "mcp-server-audit-demo",
    vendor_id: "pyrimid-growth",
    payment_proof: paymentProof,
    audit: {
      url: targetUrl,
      server_kind: targetUrl.includes("github.com") ? "github-repository" : "http-endpoint",
      recommended_paid_tools: [
        {
          name: "premium_search",
          price: "$0.02/call",
          reason: "fresh discovery work has direct compute and API cost"
        },
        {
          name: "lead_enrichment",
          price: "$0.10/call",
          reason: "enrichment output is valuable and easy for buyer agents to compare"
        },
        {
          name: "export_report",
          price: "$0.25/call",
          reason: "exports bundle high-value analysis into a durable artifact"
        }
      ],
      integration_steps: [
        "Keep MCP discovery metadata free.",
        "Return HTTP 402 with x402 accepts[] metadata before paid work.",
        "Verify X-PAYMENT or X-PAYMENT-TX server-side.",
        "Return deterministic JSON after payment proof is accepted.",
        "Publish product metadata in the Pyrimid catalog."
      ],
      catalog_metadata_hint: {
        category: "devtools",
        tags: ["mcp", "x402", "paid-tools", "agent-commerce"],
        affiliate_bps: 4000
      }
    },
    routed_by: "pyrimid"
  };
}

const server = http.createServer((req, res) => {
  const absoluteUrl = `http://${HOST}:${PORT}${req.url}`;
  const parsed = new URL(absoluteUrl);

  if (parsed.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (parsed.pathname !== "/api/v1/paid/mcp-server-audit") {
    return sendJson(res, 404, { error: "not_found" });
  }

  const targetUrl = parsed.searchParams.get("url") || "https://example.com/mcp";
  const paymentProof = req.headers["x-payment-tx"] || req.headers["x-payment"];

  if (!paymentProof) {
    return sendJson(res, 402, paymentRequired(absoluteUrl, targetUrl));
  }

  return sendJson(res, 200, paidAudit(targetUrl, paymentProof));
});

server.listen(PORT, HOST, () => {
  console.log(`paid MCP tool demo listening on http://${HOST}:${PORT}`);
});
