let lastCapture = null; // { payload, response, url, timestamp }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "WORKSHOP_CAPTURED") {
    lastCapture = {
      payload:   message.payload,    // POST request body fields
      response:  message.response,   // POST response JSON
      url:       message.url,
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
