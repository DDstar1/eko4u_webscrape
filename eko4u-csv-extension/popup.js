// Flatten nested objects (dot-notation keys)
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = Array.isArray(v) ? v.join("|") : v;
    }
  }
  return out;
}

// Escape a single CSV cell
function csvCell(v) {
  const s = String(v ?? "");
  return (s.includes(",") || s.includes("\n") || s.includes('"'))
    ? `"${s.replace(/"/g, '""')}"` : s;
}

// Turn a flat object into PATH,VALUE rows (header + one row per key)
function objToPathValueRows(obj) {
  const rows = ["PATH,VALUE"];
  for (const [k, v] of Object.entries(obj)) {
    rows.push(`${csvCell(k)},${csvCell(v)}`);
  }
  return rows.join("\n");
}

function buildCSV(capture) {
  const { payload, response } = capture;
  const lines = [];

  // ── Section 1: Price summary (always first) ──────────────────────────
  const priceSummary = {};
  if (response) {
    if (response.PRICE      !== undefined) priceSummary["PRICE"]      = response.PRICE;
    if (response.SELL_PRICE !== undefined) priceSummary["SELL_PRICE"] = response.SELL_PRICE;
    if (response.UW         !== undefined) priceSummary["UW"]         = response.UW;
    if (response.details_info !== undefined) priceSummary["PRODUCT"]  = response.details_info;
    if (response.ERROR_CODE !== undefined) priceSummary["ERROR_CODE"] = response.ERROR_CODE;
    if (response.ERROR_MESSAGE !== undefined) priceSummary["ERROR_MESSAGE"] = response.ERROR_MESSAGE;
  }
  if (Object.keys(priceSummary).length > 0) {
    lines.push("# PRICE SUMMARY");
    lines.push(objToPathValueRows(priceSummary));
    lines.push(""); // blank separator
  }

  // ── Section 2: Request payload ────────────────────────────────────────
  if (payload && Object.keys(payload).length > 0) {
    const flat = flatten(payload);
    lines.push("# REQUEST PAYLOAD");
    lines.push(objToPathValueRows(flat));
  }

  return lines.join("\n");
}

// ── UI helpers ────────────────────────────────────────────────────────────

function showPriceBanner(response) {
  if (!response) return;
  const banner = document.getElementById("priceBanner");
  const price  = response.PRICE || "—";
  const sell   = response.SELL_PRICE;
  const uw     = response.UW;

  document.getElementById("priceVal").textContent = price;
  document.getElementById("sellVal").textContent  =
    sell ? `Sell price: ${sell}` : "";
  document.getElementById("uwVal").textContent    =
    uw ? `Uw: ${uw} W/(m²·K)` : "";

  banner.style.display = "block";
}

function load() {
  chrome.runtime.sendMessage({ type: "GET_LAST_CAPTURE" }, (capture) => {
    const statusEl = document.getElementById("status");
    const csvEl    = document.getElementById("csvOutput");

    if (chrome.runtime.lastError) {
      statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
      return;
    }

    if (!capture) {
      statusEl.textContent =
        "No POST captured yet. Trigger the configurator on eko4u.com first.";
      csvEl.value = "";
      return;
    }

    showPriceBanner(capture.response);
    csvEl.value = buildCSV(capture);
    statusEl.textContent =
      `✅ Captured at ${capture.timestamp}  |  ${capture.url}`;
  });
}

document.getElementById("refreshBtn").addEventListener("click", load);

document.getElementById("copyBtn").addEventListener("click", () => {
  const csv = document.getElementById("csvOutput").value;
  if (csv) navigator.clipboard.writeText(csv).then(() => alert("CSV copied!"));
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  const csv = document.getElementById("csvOutput").value;
  if (!csv) return;
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `eko4u-workshop-${Date.now()}.csv`
  });
  a.click();
});

load();
