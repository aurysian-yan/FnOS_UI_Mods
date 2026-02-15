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

  chrome.storage.sync.get(
    {
      enabledOrigins: [],
      autoEnablePrivateIp: true
    },
    ({ enabledOrigins, autoEnablePrivateIp }) => {
      const isWhitelisted = Array.isArray(enabledOrigins) && enabledOrigins.includes(ORIGIN);
      const autoEnabled = autoEnablePrivateIp && isPrivateHost(location.hostname);

      if (isWhitelisted || autoEnabled) {
        startInject();
      }
    }
  );
})();
