(function () {
  if (window.__eko4uBridgeInstalled) return;
  window.__eko4uBridgeInstalled = true;

  // Runs in the ISOLATED world, so chrome.runtime is available here.
  // Relays captures from interceptor.js (MAIN world) to background.js.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "EKO4U_WORKSHOP_CAPTURED") return;

    chrome.runtime.sendMessage({
      type: "WORKSHOP_CAPTURED",
      payload: event.data.payload,
      response: event.data.response,
      url: event.data.url,
      headers: event.data.headers
    });
  });

  console.log("[Eko4u Extension] Bridge installed.");
})();
