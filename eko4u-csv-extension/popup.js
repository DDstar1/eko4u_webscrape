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

function buildPayloadCSV(capture) {
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

function buildHeadersCSV(capture) {
  const { headers } = capture;
  if (!headers || Object.keys(headers).length === 0) return "";
  return objToPathValueRows(headers);
}

// ── Tab handling ────────────────────────────────────────────────────────

function activeTab() {
  return document.querySelector(".tab.active")?.dataset.tab || "payload";
}

function activeTextarea() {
  return activeTab() === "headers"
    ? document.getElementById("headersOutput")
    : document.getElementById("payloadOutput");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

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
    const statusEl        = document.getElementById("status");
    const payloadOutputEl = document.getElementById("payloadOutput");
    const headersOutputEl = document.getElementById("headersOutput");

    if (chrome.runtime.lastError) {
      statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
      return;
    }

    if (!capture) {
      statusEl.textContent =
        "No POST captured yet. Trigger the configurator on eko4u.com first.";
      payloadOutputEl.value = "";
      headersOutputEl.value = "";
      return;
    }

    showPriceBanner(capture.response);
    payloadOutputEl.value = buildPayloadCSV(capture);
    headersOutputEl.value = buildHeadersCSV(capture) ||
      "No headers captured for this request.";
    statusEl.textContent =
      `✅ Captured at ${capture.timestamp}  |  ${capture.url}`;
  });
}

document.getElementById("refreshBtn").addEventListener("click", load);

document.getElementById("copyBtn").addEventListener("click", () => {
  const csv = activeTextarea().value;
  if (csv) navigator.clipboard.writeText(csv).then(() => alert("CSV copied!"));
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  const csv = activeTextarea().value;
  if (!csv) return;
  const suffix = activeTab();
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: `eko4u-workshop-${suffix}-${Date.now()}.csv`
  });
  a.click();
});

load();
