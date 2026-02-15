(() => {
  if (window.top !== window) return;

  const ORIGIN = location.origin;
  const STYLE_ID = 'fnos-ui-mods-style';
  const SCRIPT_ID = 'fnos-ui-mods-script';

  function isPrivateHost(hostname) {
    if (!hostname) return false;
    if (hostname === 'localhost' || hostname.endsWith('.local')) return true;

    const ipv4Match = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (!ipv4Match) return false;

    const parts = hostname.split('.').map(Number);
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;

    const [a, b] = parts;
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 127)
    );
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('mod.css');
    (document.head || document.documentElement).appendChild(link);
  }

  function injectScript() {
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = chrome.runtime.getURL('mod.js');
    script.type = 'text/javascript';
    (document.head || document.documentElement).appendChild(script);
  }

  function startInject() {
    injectStyle();
    injectScript();
  }

  function hasFnOSSignature() {
    const root = document.body?.querySelector(':scope > #root');
    if (!root) return false;

    const rootContainer = root.querySelector(':scope > div.flex.h-screen.w-full.relative');
    if (!rootContainer) return false;

    const backgroundContainer = rootContainer.querySelector('div.absolute.inset-0.z-0.object-contain');
    if (!backgroundContainer) return false;

    return Boolean(backgroundContainer.querySelector('.semi-image'));
  }

  function waitForFnOSSignature(timeoutMs = 3000) {
    if (hasFnOSSignature()) return Promise.resolve(true);

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!hasFnOSSignature()) return;

        observer.disconnect();
        resolve(true);
      });

      const onTimeout = () => {
        observer.disconnect();
        resolve(false);
      };

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      setTimeout(onTimeout, timeoutMs);
    });
  }

  chrome.storage.sync.get(
    {
      enabledOrigins: [],
      autoEnablePrivateIp: true
    },
    async ({ enabledOrigins, autoEnablePrivateIp }) => {
      const isWhitelisted = Array.isArray(enabledOrigins) && enabledOrigins.includes(ORIGIN);
      const matchesFnOSUi = await waitForFnOSSignature();
      const autoEnabled = autoEnablePrivateIp && isPrivateHost(location.hostname) && matchesFnOSUi;

      if (isWhitelisted || autoEnabled) {
        startInject();
      }
    }
  );
})();
