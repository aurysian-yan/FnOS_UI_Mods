(async () => {
  const versionEl = document.querySelector("code.version");
  const originEl = document.getElementById("origin");
  const siteToggleEl = document.getElementById("siteToggle");
  const autoSuspectedFnOSEl = document.getElementById("autoSuspectedFnOS");
  const styleWindowsEl = document.getElementById("styleWindows");
  const styleMacEl = document.getElementById("styleMac");
  const platformGroupEl = document.getElementById("platformGroup");
  const firstCardEl = document.querySelector(".card");
  const manifestVersion = chrome.runtime.getManifest().version;
  const externalLinkEls = document.querySelectorAll(
    'a[href^="http://"], a[href^="https://"]'
  );

  if (versionEl) {
    versionEl.textContent = `版本 ${manifestVersion}`;
  }

  for (const linkEl of externalLinkEls) {
    linkEl.addEventListener("click", async (event) => {
      event.preventDefault();
      const href = linkEl.getAttribute("href");
      if (!href) return;

      try {
        await chrome.tabs.create({ url: href });
      } catch (_error) {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    });
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = tab?.url ? new URL(tab.url) : null;
  const origin = pageUrl?.origin;
  let isFnOSWebUi = false;

  function updatePlatformOptionsVisibility() {
    const hasAnyInjectionOptionOn =
      siteToggleEl.checked || autoSuspectedFnOSEl.checked;
    platformGroupEl.style.display = hasAnyInjectionOptionOn ? "block" : "none";
  }

  function setFnUICheckedStatus(isChecked) {
    firstCardEl?.classList.toggle("fnUIChecked", isChecked);
  }

  async function applyToCurrentTabIfNeeded() {
    const shouldInject =
      siteToggleEl.checked || (autoSuspectedFnOSEl.checked && isFnOSWebUi);
    if (!shouldInject) return;

    const style = styleMacEl.checked ? "mac" : "windows";
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "FNOS_APPLY",
        titlebarStyle: style,
      });
    } catch (_error) {
      // ignore; content script may be unavailable for non-http(s) pages
    }
  }

  if (!origin || !/^https?:$/.test(pageUrl.protocol)) {
    originEl.textContent = "当前页不是 http/https 页面";
    siteToggleEl.disabled = true;
    autoSuspectedFnOSEl.disabled = true;
    styleWindowsEl.disabled = true;
    styleMacEl.disabled = true;
    setFnUICheckedStatus(false);
    updatePlatformOptionsVisibility();
    return;
  }

  originEl.textContent = origin;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "FNOS_CHECK",
      wait: true,
    });
    isFnOSWebUi = Boolean(response?.isFnOSWebUi);
    setFnUICheckedStatus(isFnOSWebUi);
  } catch (_error) {
    isFnOSWebUi = false;
    setFnUICheckedStatus(false);
  }

  const state = await chrome.storage.sync.get({
    enabledOrigins: [],
    autoEnableSuspectedFnOS: true,
    titlebarStyle: "windows",
  });

  let enabledOrigins = Array.isArray(state.enabledOrigins)
    ? state.enabledOrigins
    : [];
  siteToggleEl.checked = enabledOrigins.includes(origin);
  autoSuspectedFnOSEl.checked = Boolean(state.autoEnableSuspectedFnOS);

  const titlebarStyle = state.titlebarStyle === "mac" ? "mac" : "windows";
  styleWindowsEl.checked = titlebarStyle === "windows";
  styleMacEl.checked = titlebarStyle === "mac";

  updatePlatformOptionsVisibility();

  siteToggleEl.addEventListener("change", async () => {
    const enabled = siteToggleEl.checked;

    if (enabled) {
      enabledOrigins = [...new Set([...enabledOrigins, origin])];
    } else {
      enabledOrigins = enabledOrigins.filter((item) => item !== origin);
    }

    await chrome.storage.sync.set({ enabledOrigins });
    updatePlatformOptionsVisibility();
    await applyToCurrentTabIfNeeded();
  });

  autoSuspectedFnOSEl.addEventListener("change", async () => {
    await chrome.storage.sync.set({
      autoEnableSuspectedFnOS: autoSuspectedFnOSEl.checked,
    });
    updatePlatformOptionsVisibility();
    await applyToCurrentTabIfNeeded();
  });

  for (const radio of [styleWindowsEl, styleMacEl]) {
    radio.addEventListener("change", async () => {
      if (!radio.checked) return;
      await chrome.storage.sync.set({ titlebarStyle: radio.value });
      await applyToCurrentTabIfNeeded();
    });
  }
})();
