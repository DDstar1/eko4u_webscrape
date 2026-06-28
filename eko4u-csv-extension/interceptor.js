(function () {
  if (window.__eko4uInterceptorInstalled) return;
  window.__eko4uInterceptorInstalled = true;

  const TARGET = "configurator.workshop";

  // Parse URLSearchParams, JSON, or return { raw }
  function parseBody(body) {
    if (!body) return {};
    try {
      const p = new URLSearchParams(body);
      const obj = {};
      for (const [k, v] of p.entries()) obj[k] = v;
      if (Object.keys(obj).length > 0) return obj;
    } catch (_) {}
    try { return JSON.parse(body); } catch (_) {}
    return { raw: body };
  }

  // Parse response – eko4u returns JSON with PRICE, SELL_PRICE, UW, details_info, etc.
  async function parseResponse(res) {
    try {
      const clone = res.clone();
      const text = await clone.text();
      try { return JSON.parse(text); } catch (_) { return { raw_response: text.substring(0, 500) }; }
    } catch (_) { return {}; }
  }

  // Normalize fetch's options.headers (Headers instance, array of pairs,
  // or plain object) into a plain object.
  function normalizeHeaders(headers) {
    if (!headers) return {};
    if (headers instanceof Headers) {
      const obj = {};
      for (const [k, v] of headers.entries()) obj[k] = v;
      return obj;
    }
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    return { ...headers };
  }

  function sendToBackground(payload, response, url, headers) {
    // This script runs in the page's MAIN world, which has no access to
    // chrome.runtime. Relay via postMessage to bridge.js (ISOLATED world),
    // which forwards it on to the background service worker.
    window.postMessage({
      type: "EKO4U_WORKSHOP_CAPTURED",
      payload,
      response,
      url,
      headers
    }, "*");
  }

  // ── Intercept fetch ──────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, options = {}] = args;
    const url    = typeof resource === "string" ? resource : resource?.url ?? "";
    const method = (options.method || "GET").toUpperCase();

    if (url.includes(TARGET) && method === "POST") {
      // Extract request body
      let bodyText = "";
      if (options.body instanceof FormData) {
        const obj = {};
        for (const [k, v] of options.body.entries()) obj[k] = v;
        bodyText = JSON.stringify(obj);
      } else if (options.body) {
        bodyText = typeof options.body === "string"
          ? options.body
          : await new Response(options.body).text();
      }
      const payload = parseBody(bodyText);

      const headers = normalizeHeaders(options.headers);

      // Make the real request and intercept response
      const res = await _fetch.apply(this, args);
      const respData = await parseResponse(res);
      sendToBackground(payload, respData, url, headers);
      return res;
    }

    return _fetch.apply(this, args);
  };

  // ── Intercept XMLHttpRequest ─────────────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._eko4uMethod  = method;
    this._eko4uUrl     = url;
    this._eko4uHeaders = {};
    return _open.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._eko4uHeaders) this._eko4uHeaders[name] = value;
    return _setRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (
      this._eko4uUrl?.includes(TARGET) &&
      this._eko4uMethod?.toUpperCase() === "POST"
    ) {
      // Capture request payload
      let payload = {};
      if (body instanceof FormData) {
        for (const [k, v] of body.entries()) payload[k] = v;
      } else if (typeof body === "string") {
        payload = parseBody(body);
      }

      const headers = { ...this._eko4uHeaders };

      // Listen for the response
      this.addEventListener("load", () => {
        let respData = {};
        try { respData = JSON.parse(this.responseText); } catch (_) {
          respData = { raw_response: this.responseText?.substring(0, 500) };
        }
        sendToBackground(payload, respData, this._eko4uUrl, headers);
      });
    }

    return _send.apply(this, arguments);
  };

  console.log("[Eko4u Extension] Interceptor v1.1 installed.");
})();
