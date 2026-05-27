const baseUrl = process.env.DEMO_URL || "http://127.0.0.1:4173";
const endpoint = `${baseUrl}/api/v1/paid/mcp-server-audit?url=${encodeURIComponent(
  "https://github.com/pyrimid-ai/pyrimid"
)}`;

async function assertResponse(name, response, expectedStatus) {
  if (response.status !== expectedStatus) {
    const body = await response.text();
    throw new Error(`${name}: expected ${expectedStatus}, got ${response.status}: ${body}`);
  }
  return response.json();
}

const unpaid = await assertResponse("unpaid request", await fetch(endpoint), 402);
if (unpaid.error !== "payment_required" || unpaid.accepts?.[0]?.protocol !== "pyrimid") {
  throw new Error("unpaid request did not return Pyrimid x402 metadata");
}

const paid = await assertResponse(
  "paid retry",
  await fetch(endpoint, { headers: { "X-PAYMENT-TX": "0x-demo-payment" } }),
  200
);
if (paid.product_id !== "mcp-server-audit-demo" || !paid.audit?.recommended_paid_tools?.length) {
  throw new Error("paid retry did not return a usable audit payload");
}

console.log("verified 402 metadata and paid retry JSON");
