let lastCapture = null; // { payload, response, url, headers, timestamp }
let lastRequestHeaders = null; // full outgoing headers from webRequest (incl. Cookie, User-Agent, etc.)

// JS (fetch/XHR) cannot read or set browser-managed headers like Cookie,
// User-Agent, Referer, Accept-Encoding, sec-ch-ua, etc. webRequest sees the
// real outgoing headers, including those, right before the request is sent.
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.method !== "POST" || !details.url.includes("configurator.workshop")) return;
    lastRequestHeaders = Object.fromEntries(
      (details.requestHeaders || []).map((h) => [h.name, h.value])
    );
  },
  { urls: ["https://eko4u.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "WORKSHOP_CAPTURED") {
    lastCapture = {
      payload:   message.payload,    // POST request body fields
      response:  message.response,   // POST response JSON
      url:       message.url,
      headers:   lastRequestHeaders || message.headers,
      timestamp: new Date().toISOString()
    };
    console.log("[Eko4u] Captured:", lastCapture);
    sendResponse({ ok: true });
  }

  if (message.type === "GET_LAST_CAPTURE") {
    sendResponse(lastCapture);
  }

  return true;
});

// Inject interceptor into every eko4u.com tab on load
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "loading" &&
    tab.url &&
    tab.url.startsWith("https://eko4u.com/")
  ) {
    chrome.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      files: ["bridge.js"]
    }).catch(err => console.warn("[Eko4u] Bridge inject failed:", err));

    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["interceptor.js"]
    }).catch(err => console.warn("[Eko4u] Interceptor inject failed:", err));
  }
});
