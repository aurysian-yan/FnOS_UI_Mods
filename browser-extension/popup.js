(async () => {
  const originEl = document.getElementById('origin');
  const siteToggleEl = document.getElementById('siteToggle');
  const autoSuspectedFnOSEl = document.getElementById('autoSuspectedFnOS');
  const styleWindowsEl = document.getElementById('styleWindows');
  const styleMacEl = document.getElementById('styleMac');
  const fnosBadgeEl = document.getElementById('fnosBadge');
  const fnosBadgeTextEl = document.getElementById('fnosBadgeText');
  const platformGroupEl = document.getElementById('platformGroup');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = tab?.url ? new URL(tab.url) : null;
  const origin = pageUrl?.origin;
  let isFnOSWebUi = false;

  function updatePlatformOptionsVisibility() {
    const hasAnyInjectionOptionOn = siteToggleEl.checked || autoSuspectedFnOSEl.checked;
    platformGroupEl.style.display = hasAnyInjectionOptionOn ? 'block' : 'none';
  }

  function setBadgeStatus(shouldShow) {
    if (!shouldShow) {
      fnosBadgeEl.style.display = 'none';
      return;
    }

    fnosBadgeEl.style.display = 'flex';
    fnosBadgeTextEl.textContent = '已检测：疑似 fnOS WebUI 页面';
    fnosBadgeEl.style.background = 'var(--switch-on)';
  }

  async function applyToCurrentTabIfNeeded() {
    const shouldInject = siteToggleEl.checked || (autoSuspectedFnOSEl.checked && isFnOSWebUi);
    if (!shouldInject) return;

    const style = styleMacEl.checked ? 'mac' : 'windows';
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'FNOS_APPLY', titlebarStyle: style });
    } catch (_error) {
      // ignore; content script may be unavailable for non-http(s) pages
    }
  }

  function setBadgeStatus(isFnOSWebUi) {
    if (isFnOSWebUi) {
      fnosBadgeTextEl.textContent = '已检测：疑似 fnOS WebUI 页面';
      fnosBadgeEl.style.background = 'var(--switch-on)';
      return;
    }

    fnosBadgeTextEl.textContent = '未检测到疑似 fnOS WebUI 页面';
    fnosBadgeEl.style.background = '#6b7280';
  }

  if (!origin || !/^https?:$/.test(pageUrl.protocol)) {
    originEl.textContent = '当前页不是 http/https 页面';
    siteToggleEl.disabled = true;
    autoSuspectedFnOSEl.disabled = true;
    styleWindowsEl.disabled = true;
    styleMacEl.disabled = true;
    setBadgeStatus(false);
    updatePlatformOptionsVisibility();
    return;
  }

  originEl.textContent = origin;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'FNOS_CHECK', wait: true });
    isFnOSWebUi = Boolean(response?.isFnOSWebUi);
    setBadgeStatus(isFnOSWebUi);
  } catch (_error) {
    isFnOSWebUi = false;
    setBadgeStatus(false);
  }

  const state = await chrome.storage.sync.get({
    enabledOrigins: [],
    autoEnableSuspectedFnOS: true,
    titlebarStyle: 'windows'
  });

  let enabledOrigins = Array.isArray(state.enabledOrigins) ? state.enabledOrigins : [];
  siteToggleEl.checked = enabledOrigins.includes(origin);
  autoSuspectedFnOSEl.checked = Boolean(state.autoEnableSuspectedFnOS);

  const titlebarStyle = state.titlebarStyle === 'mac' ? 'mac' : 'windows';
  styleWindowsEl.checked = titlebarStyle === 'windows';
  styleMacEl.checked = titlebarStyle === 'mac';

  updatePlatformOptionsVisibility();

  siteToggleEl.addEventListener('change', async () => {
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

  autoSuspectedFnOSEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoEnableSuspectedFnOS: autoSuspectedFnOSEl.checked });
    updatePlatformOptionsVisibility();
    await applyToCurrentTabIfNeeded();
  });

  for (const radio of [styleWindowsEl, styleMacEl]) {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      await chrome.storage.sync.set({ titlebarStyle: radio.value });
      await applyToCurrentTabIfNeeded();
    });
  }
})();
