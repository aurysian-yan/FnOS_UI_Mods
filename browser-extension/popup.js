(async () => {
  const originEl = document.getElementById('origin');
  const siteToggleEl = document.getElementById('siteToggle');
  const autoSuspectedFnOSEl = document.getElementById('autoSuspectedFnOS');
  const styleWindowsEl = document.getElementById('styleWindows');
  const styleMacEl = document.getElementById('styleMac');
  const fnosBadgeEl = document.getElementById('fnosBadge');
  const fnosBadgeTextEl = document.getElementById('fnosBadgeText');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = tab?.url ? new URL(tab.url) : null;
  const origin = pageUrl?.origin;

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
    return;
  }

  originEl.textContent = origin;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'FNOS_CHECK' });
    setBadgeStatus(Boolean(response?.isFnOSWebUi));
  } catch (_error) {
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

  siteToggleEl.addEventListener('change', async () => {
    const enabled = siteToggleEl.checked;

    if (enabled) {
      enabledOrigins = [...new Set([...enabledOrigins, origin])];
    } else {
      enabledOrigins = enabledOrigins.filter((item) => item !== origin);
    }

    await chrome.storage.sync.set({ enabledOrigins });
  });

  autoSuspectedFnOSEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoEnableSuspectedFnOS: autoSuspectedFnOSEl.checked });
  });

  for (const radio of [styleWindowsEl, styleMacEl]) {
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      await chrome.storage.sync.set({ titlebarStyle: radio.value });
    });
  }
})();
