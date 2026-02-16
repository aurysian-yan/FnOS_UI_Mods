(() => {
  if (window.top !== window) return;

  const ORIGIN = location.origin;
  const BASIC_STYLE_ID = 'fnos-ui-mods-basic-style';
  const TITLEBAR_STYLE_ID = 'fnos-ui-mods-titlebar-style';
  const SCRIPT_ID = 'fnos-ui-mods-script';
  const TITLEBAR_STYLES = {
    windows: 'windows_titlebar_mod.css',
    mac: 'mac_titlebar_mod.css'
  };

  function injectStyle(id, href) {
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      (document.head || document.documentElement).appendChild(link);
    }

    const nextHref = chrome.runtime.getURL(href);
    if (link.href !== nextHref) {
      link.href = nextHref;
    }
  }

  function injectStyles(titlebarStyle) {
    const normalizedStyle = titlebarStyle === 'mac' ? 'mac' : 'windows';
    injectStyle(BASIC_STYLE_ID, 'basic_mod.css');
    injectStyle(TITLEBAR_STYLE_ID, TITLEBAR_STYLES[normalizedStyle]);
  }

  function injectScript() {
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = chrome.runtime.getURL('mod.js');
    script.type = 'text/javascript';
    (document.head || document.documentElement).appendChild(script);
  }

  function startInject(titlebarStyle) {
    injectStyles(titlebarStyle);
    injectScript();
  }

  function hasFnOSSignature() {
    const root = document.body?.querySelector(':scope > #root');
    if (!root) return false;

    const rootContainer = root.querySelector(':scope > div.flex.h-screen.w-full.relative');
    if (!rootContainer) return false;

    const backgroundContainer = rootContainer.querySelector(':scope > div.absolute.inset-0.z-0.object-contain');
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'FNOS_CHECK') return;
    sendResponse({ isFnOSWebUi: hasFnOSSignature() });
  });

  chrome.storage.sync.get(
    {
      enabledOrigins: [],
      autoEnableSuspectedFnOS: true,
      titlebarStyle: 'windows'
    },
    async ({ enabledOrigins, autoEnableSuspectedFnOS, titlebarStyle }) => {
      const isWhitelisted = Array.isArray(enabledOrigins) && enabledOrigins.includes(ORIGIN);
      const matchesFnOSUi = await waitForFnOSSignature();
      const autoEnabled = autoEnableSuspectedFnOS && matchesFnOSUi;

      if (isWhitelisted || autoEnabled) {
        startInject(titlebarStyle);
      }
    }
  );
})();
