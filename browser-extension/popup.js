(async () => {
  const originEl = document.getElementById('origin');
  const toggleBtn = document.getElementById('toggle');
  const autoPrivateEl = document.getElementById('autoPrivate');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = tab?.url ? new URL(tab.url) : null;
  const origin = pageUrl?.origin;

  if (!origin || !/^https?:$/.test(pageUrl.protocol)) {
    originEl.textContent = '当前页不是 http/https 页面';
    toggleBtn.disabled = true;
    toggleBtn.textContent = '不可用';
    return;
  }

  originEl.textContent = origin;

  const state = await chrome.storage.sync.get({
    enabledOrigins: [],
    autoEnablePrivateIp: true
  });

  let enabledOrigins = Array.isArray(state.enabledOrigins) ? state.enabledOrigins : [];
  let enabled = enabledOrigins.includes(origin);

  function renderButton() {
    toggleBtn.dataset.enabled = String(enabled);
    toggleBtn.textContent = enabled ? '已对当前站点启用（点击关闭）' : '对当前站点启用';
  }

  renderButton();
  autoPrivateEl.checked = Boolean(state.autoEnablePrivateIp);

  toggleBtn.addEventListener('click', async () => {
    enabled = !enabled;

    if (enabled) {
      enabledOrigins = [...new Set([...enabledOrigins, origin])];
    } else {
      enabledOrigins = enabledOrigins.filter((item) => item !== origin);
    }

    await chrome.storage.sync.set({ enabledOrigins });
    renderButton();
  });

  autoPrivateEl.addEventListener('change', async () => {
    await chrome.storage.sync.set({ autoEnablePrivateIp: autoPrivateEl.checked });
  });
})();
