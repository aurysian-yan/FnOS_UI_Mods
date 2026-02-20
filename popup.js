(async () => {
  const versionEl = document.querySelector("code.version");
  const originEl = document.getElementById("origin");
  const updatePanelEl = document.getElementById("updatePanel");
  const updateDotEl = document.getElementById("updateDot");
  const updateStatusEl = document.getElementById("updateStatus");
  const checkUpdateButtonEl = document.getElementById("checkUpdateButton");
  const latestCommitLinkEl = document.getElementById("latestCommitLink");
  const siteToggleEl = document.getElementById("siteToggle");
  const autoSuspectedFnOSEl = document.getElementById("autoSuspectedFnOS");
  const styleWindowsEl = document.getElementById("styleWindows");
  const styleMacEl = document.getElementById("styleMac");
  const styleClassicLaunchpadEl = document.getElementById("styleClassicLaunchpad");
  const styleSpotlightLaunchpadEl = document.getElementById("styleSpotlightLaunchpad");
  const launchpadIconScaleEnabledEl = document.getElementById(
    "launchpadIconScaleEnabled"
  );
  const launchpadAppListStatusEl = document.getElementById("launchpadAppListStatus");
  const launchpadAppListEl = document.getElementById("launchpadAppList");
  const platformGroupEl = document.getElementById("platformGroup");
  const launchpadGroupEl = document.getElementById("launchpadGroup");
  const brandColorEl = document.getElementById("brandColor");
  const resetBrandColorEl = document.getElementById("resetBrandColor");
  const brandColorTextEl = document.getElementById("brandColorText");
  const fontOverrideEnabledEl = document.getElementById("fontOverrideEnabled");
  const fontSettingsEl = document.getElementById("fontSettings");
  const fontFamilyEl = document.getElementById("fontFamily");
  const fontWeightEl = document.getElementById("fontWeight");
  const fontFeatureSettingsEl = document.getElementById("fontFeatureSettings");
  const fontFaceNameEl = document.getElementById("fontFaceName");
  const fontUrlEl = document.getElementById("fontUrl");
  const customCodeEnabledEl = document.getElementById("customCodeEnabled");
  const customCodeSettingsEl = document.getElementById("customCodeSettings");
  const customCssEl = document.getElementById("customCss");
  const customJsEl = document.getElementById("customJs");
  const customCodeStatusEl = document.getElementById("customCodeStatus");
  const fontFileEl = document.getElementById("fontFile");
  const clearFontFileEl = document.getElementById("clearFontFile");
  const fontFileStatusEl = document.getElementById("fontFileStatus");
  const firstCardEl = document.querySelector(".card");
  const manifestVersion = chrome.runtime.getManifest().version;
  const externalLinkEls = document.querySelectorAll(
    'a[href^="http://"], a[href^="https://"]'
  );

  const DEFAULT_BRAND_COLOR = "#0066ff";
  const BRAND_LIGHTNESS_MIN = 0.3;
  const BRAND_LIGHTNESS_MAX = 0.7;

  const DEFAULT_FONT_FACE_NAME = "FnOSCustomFont";
  const FONT_LOCAL_DATA_KEY = "customFontDataUrl";
  const FONT_LOCAL_NAME_KEY = "customFontFileName";
  const FONT_LOCAL_FORMAT_KEY = "customFontFormat";
  const UPDATE_STATE_LOCAL_KEY = "updateCheckState";
  const CUSTOM_CSS_LOCAL_KEY = "customCssCode";
  const CUSTOM_JS_LOCAL_KEY = "customJsCode";
  const CUSTOM_CODE_STATUS_DEFAULT = "失焦后自动保存并应用到当前页面";
  const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
  const GITHUB_COMMITS_PAGE_URL =
    "https://github.com/aurysian-yan/FnOS_UI_Mods/commits";
  const GITHUB_COMMITS_API_URL =
    "https://api.github.com/repos/aurysian-yan/FnOS_UI_Mods/commits?per_page=1";
  const ACTION_BADGE_TEXT = "UP";

  const DEFAULT_FONT_SETTINGS = {
    enabled: false,
    family: "",
    weight: "",
    featureSettings: "",
    faceName: DEFAULT_FONT_FACE_NAME,
    url: ""
  };
  const DEFAULT_CUSTOM_CODE_SETTINGS = {
    enabled: false,
    css: "",
    js: ""
  };
  const PREFECT_ICON_DIR = "prefect_icon";
  const PREFECT_ICON_MAP_FILE = `${PREFECT_ICON_DIR}/icon-map.json`;
  const DEFAULT_PREFECT_ICON_MAP = Object.freeze({
    aliases: {
      "docker-home-assistantan": "home-assistant",
      "home-assistantan": "home-assistant"
    },
    appNameMap: {},
    serviceIconMap: {},
    keyMap: {}
  });

  let brandColor = DEFAULT_BRAND_COLOR;
  let lastSavedBrandColor = null;

  let fontSettings = { ...DEFAULT_FONT_SETTINGS };
  let customCodeSettings = { ...DEFAULT_CUSTOM_CODE_SETTINGS };
  let launchpadIconScaleSelectedKeys = [];
  let launchpadIconMaskOnlyKeys = [];
  let launchpadIconRedrawKeys = [];
  let launchpadIconRedrawMap = {};
  let prefectIconMap = {
    aliases: { ...DEFAULT_PREFECT_ICON_MAP.aliases },
    appNameMap: {},
    serviceIconMap: {},
    keyMap: {}
  };
  let prefectIconMapLoadPromise = null;
  let launchpadRedrawAvailabilityByKey = new Map();
  const launchpadRedrawResourceExistsCache = new Map();
  let uploadedFontDataUrl = "";
  let uploadedFontFileName = "";
  let uploadedFontFormat = "";
  let updateCheckState = {
    baseVersion: manifestVersion,
    baseSha: "",
    lastCheckedAt: 0,
    latestSha: "",
    latestDate: "",
    latestUrl: GITHUB_COMMITS_PAGE_URL,
    latestMessage: "",
    hasUpdate: false,
    lastResult: "",
    lastError: ""
  };
  let updateCheckInFlight = null;

  function isStorageQuotaErrorMessage(message) {
    if (typeof message !== "string") return false;
    return /kQuotaBytes|QUOTA_BYTES|quota exceeded/i.test(message);
  }

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
    const display = hasAnyInjectionOptionOn ? "block" : "none";
    platformGroupEl.style.display = display;
    launchpadGroupEl.style.display = display;
  }

  function updateFontSettingsVisibility() {
    if (!fontSettingsEl || !fontOverrideEnabledEl) return;
    fontSettingsEl.style.display = fontOverrideEnabledEl.checked ? "grid" : "none";
  }

  function updateCustomCodeSettingsVisibility() {
    if (!customCodeSettingsEl || !customCodeEnabledEl) return;
    customCodeSettingsEl.style.display = customCodeEnabledEl.checked ? "flex" : "none";
  }

  function normalizeLaunchpadKeyList(value, maxLength = 320) {
    if (!Array.isArray(value)) return [];
    const unique = new Set();
    value.forEach((item) => {
      if (typeof item !== "string") return;
      const key = item.trim().slice(0, maxLength);
      if (!key) return;
      unique.add(key);
    });
    return Array.from(unique);
  }

  function isSameStringArray(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((item, index) => item === right[index]);
  }

  function normalizeLaunchpadRedrawMap(value, maxLength = 320) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const normalized = {};
    Object.entries(value).forEach(([rawKey, rawPath]) => {
      if (typeof rawKey !== "string" || typeof rawPath !== "string") return;
      const key = rawKey.trim().slice(0, maxLength);
      const path = rawPath.trim();
      if (!key) return;
      if (!/^prefect_icon\/[a-z0-9-]+\.png$/i.test(path)) return;
      normalized[key] = path;
    });
    return normalized;
  }

  function normalizeLaunchpadRedrawName(value) {
    if (typeof value !== "string") return "";
    return value
      .trim()
      .toLowerCase()
      .replace(/\.(png|jpg|jpeg|svg|webp)$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeLaunchpadAppName(value) {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }

  function normalizePrefectIconRelativePath(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim().replace(/\\/g, "/");
    if (!trimmed) return "";
    if (/^prefect_icon\/[a-z0-9-]+\.png$/i.test(trimmed)) {
      return trimmed;
    }
    const normalizedName = normalizeLaunchpadRedrawName(trimmed);
    if (!normalizedName) return "";
    return `${PREFECT_ICON_DIR}/${normalizedName}.png`;
  }

  function getLaunchpadKeyPathname(rawKey) {
    if (typeof rawKey !== "string" || !rawKey.trim()) return "";
    try {
      const url = new URL(rawKey.trim(), origin || "https://fnos.local");
      return url.pathname.toLowerCase();
    } catch {
      return rawKey.trim().split("?")[0].toLowerCase();
    }
  }

  function extractLaunchpadServiceIconId(key) {
    const pathname = getLaunchpadKeyPathname(key);
    if (!pathname) return "";
    const matched = pathname.match(/\/app-center-static\/serviceicon\/([^/]+)\//i);
    if (!matched?.[1]) return "";
    try {
      return decodeURIComponent(matched[1]);
    } catch {
      return matched[1];
    }
  }

  function normalizePrefectIconMapConfig(value) {
    const normalized = {
      aliases: {},
      appNameMap: {},
      serviceIconMap: {},
      keyMap: {}
    };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return normalized;
    }

    const aliases = value.aliases;
    if (aliases && typeof aliases === "object" && !Array.isArray(aliases)) {
      Object.entries(aliases).forEach(([rawFrom, rawTo]) => {
        const from = normalizeLaunchpadRedrawName(rawFrom);
        const to = normalizeLaunchpadRedrawName(rawTo);
        if (!from || !to) return;
        normalized.aliases[from] = to;
      });
    }

    const serviceIconMap = value.serviceIconMap;
    if (
      serviceIconMap &&
      typeof serviceIconMap === "object" &&
      !Array.isArray(serviceIconMap)
    ) {
      Object.entries(serviceIconMap).forEach(([rawId, rawPath]) => {
        const id = normalizeLaunchpadRedrawName(rawId);
        const path = normalizePrefectIconRelativePath(rawPath);
        if (!id || !path) return;
        normalized.serviceIconMap[id] = path;
      });
    }

    const appNameMap = value.appNameMap;
    if (
      appNameMap &&
      typeof appNameMap === "object" &&
      !Array.isArray(appNameMap)
    ) {
      Object.entries(appNameMap).forEach(([rawName, rawPath]) => {
        const name = normalizeLaunchpadAppName(rawName);
        const path = normalizePrefectIconRelativePath(rawPath);
        if (!name || !path) return;
        normalized.appNameMap[name] = path;
      });
    }

    const keyMap = value.keyMap;
    if (keyMap && typeof keyMap === "object" && !Array.isArray(keyMap)) {
      Object.entries(keyMap).forEach(([rawKey, rawPath]) => {
        const keyPath = getLaunchpadKeyPathname(rawKey);
        const path = normalizePrefectIconRelativePath(rawPath);
        if (!keyPath || !path) return;
        normalized.keyMap[keyPath] = path;
      });
    }

    return normalized;
  }

  function applyPrefectIconMapConfig(rawConfig) {
    const normalized = normalizePrefectIconMapConfig(rawConfig);
    prefectIconMap = {
      aliases: {
        ...DEFAULT_PREFECT_ICON_MAP.aliases,
        ...normalized.aliases
      },
      appNameMap: normalized.appNameMap,
      serviceIconMap: normalized.serviceIconMap,
      keyMap: normalized.keyMap
    };
  }

  async function loadPrefectIconMapConfig(force = false) {
    if (!force && prefectIconMapLoadPromise) {
      await prefectIconMapLoadPromise;
      return;
    }
    prefectIconMapLoadPromise = (async () => {
      try {
        const response = await fetch(chrome.runtime.getURL(PREFECT_ICON_MAP_FILE), {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error(`load_failed_${response.status}`);
        }
        const parsed = await response.json();
        applyPrefectIconMapConfig(parsed);
      } catch (_error) {
        applyPrefectIconMapConfig({});
      }
    })();
    await prefectIconMapLoadPromise;
  }

  function resolveMappedPrefectIconPathForItem(key, title) {
    const appName = normalizeLaunchpadAppName(title);
    if (appName) {
      const appNameMappedPath = normalizePrefectIconRelativePath(
        prefectIconMap.appNameMap[appName]
      );
      if (appNameMappedPath) return appNameMappedPath;
    }

    const keyPath = getLaunchpadKeyPathname(key);
    if (!keyPath) return "";

    const keyMappedPath = normalizePrefectIconRelativePath(
      prefectIconMap.keyMap[keyPath]
    );
    if (keyMappedPath) return keyMappedPath;

    const serviceIconId = normalizeLaunchpadRedrawName(
      extractLaunchpadServiceIconId(key)
    );
    if (!serviceIconId) return "";
    return normalizePrefectIconRelativePath(
      prefectIconMap.serviceIconMap[serviceIconId]
    );
  }

  function extractLaunchpadStaticIconName(key) {
    const pathname = getLaunchpadKeyPathname(key);
    if (!pathname) return "";
    const matched = pathname.match(/\/static\/app\/icons\/([^/]+)\.(png|jpg|jpeg|svg|webp)$/i);
    if (!matched?.[1]) return "";
    try {
      return decodeURIComponent(matched[1]);
    } catch {
      return matched[1];
    }
  }

  function buildLaunchpadRedrawNameCandidates(key, title) {
    const unique = new Set();
    const addCandidate = (rawValue) => {
      const normalized = normalizeLaunchpadRedrawName(rawValue);
      if (!normalized) return;
      unique.add(normalized);
      const alias = prefectIconMap.aliases[normalized];
      if (typeof alias === "string") {
        const aliasName = normalizeLaunchpadRedrawName(alias);
        if (aliasName) {
          unique.add(aliasName);
        }
      }
    };

    const serviceIconId = extractLaunchpadServiceIconId(key);
    addCandidate(serviceIconId);
    if (serviceIconId.startsWith("docker-")) {
      addCandidate(serviceIconId.slice("docker-".length));
    }
    const serviceIconTokens = serviceIconId.split("-").filter(Boolean);
    if (serviceIconTokens.length > 1) {
      addCandidate(serviceIconTokens.slice(1).join("-"));
    }

    addCandidate(extractLaunchpadStaticIconName(key));
    addCandidate(title);

    const keyFileName = getLaunchpadKeyPathname(key).split("/").pop() || "";
    addCandidate(keyFileName);
    return Array.from(unique);
  }

  async function checkPrefectIconResourceExists(relativePath) {
    if (launchpadRedrawResourceExistsCache.has(relativePath)) {
      return launchpadRedrawResourceExistsCache.get(relativePath);
    }
    const checkPromise = (async () => {
      const resourceUrl = chrome.runtime.getURL(relativePath);
      try {
        const headResponse = await fetch(resourceUrl, {
          method: "HEAD",
          cache: "no-store"
        });
        if (headResponse.ok) return true;
      } catch (_error) {
        // ignore and fallback to GET
      }
      try {
        const getResponse = await fetch(resourceUrl, { cache: "no-store" });
        return getResponse.ok;
      } catch (_error) {
        return false;
      }
    })();
    launchpadRedrawResourceExistsCache.set(relativePath, checkPromise);
    return checkPromise;
  }

  async function resolveLaunchpadRedrawAvailability(items) {
    const normalizedItems = normalizeLaunchpadAppItems(items);
    const result = new Map();
    await Promise.all(
      normalizedItems.map(async ({ key, title }) => {
        const mappedPath = resolveMappedPrefectIconPathForItem(key, title);
        const candidates = buildLaunchpadRedrawNameCandidates(key, title);
        let path = "";
        if (mappedPath) {
          const mappedExists = await checkPrefectIconResourceExists(mappedPath);
          if (mappedExists) {
            path = mappedPath;
          }
        }
        for (const candidate of candidates) {
          if (path) break;
          const relativePath = `${PREFECT_ICON_DIR}/${candidate}.png`;
          const exists = await checkPrefectIconResourceExists(relativePath);
          if (!exists) continue;
          path = relativePath;
          break;
        }
        result.set(key, { path, candidates, mappedPath });
      })
    );
    return result;
  }

  function buildLaunchpadRedrawMapFromSelection(
    selectedKeys,
    availabilityByKey = launchpadRedrawAvailabilityByKey
  ) {
    const normalizedKeys = normalizeLaunchpadKeyList(selectedKeys);
    const map = {};
    normalizedKeys.forEach((key) => {
      const availabilityPath = availabilityByKey.get(key)?.path;
      const fallbackPath = launchpadIconRedrawMap[key];
      const path = typeof availabilityPath === "string" && availabilityPath
        ? availabilityPath
        : typeof fallbackPath === "string" && fallbackPath
          ? fallbackPath.trim()
          : "";
      if (!path) return;
      if (!/^prefect_icon\/[a-z0-9-]+\.png$/i.test(path)) return;
      map[key] = path;
    });
    return map;
  }

  function areStringMapsEqual(left, right) {
    const leftObj = left && typeof left === "object" ? left : {};
    const rightObj = right && typeof right === "object" ? right : {};
    const leftKeys = Object.keys(leftObj).sort();
    const rightKeys = Object.keys(rightObj).sort();
    if (!isSameStringArray(leftKeys, rightKeys)) return false;
    return leftKeys.every((key) => leftObj[key] === rightObj[key]);
  }

  async function persistLaunchpadIconSelections() {
    const nextRedrawKeys = normalizeLaunchpadKeyList(launchpadIconRedrawKeys);
    const nextRedrawMap = buildLaunchpadRedrawMapFromSelection(nextRedrawKeys);
    const redrawKeySet = new Set(nextRedrawKeys);
    const nextScaleKeys = normalizeLaunchpadKeyList(
      launchpadIconScaleSelectedKeys
    ).filter((key) => !redrawKeySet.has(key));
    const nextMaskOnlyKeys = normalizeLaunchpadKeyList(
      launchpadIconMaskOnlyKeys
    ).filter((key) => !redrawKeySet.has(key));

    launchpadIconScaleSelectedKeys = nextScaleKeys;
    launchpadIconMaskOnlyKeys = nextMaskOnlyKeys;
    launchpadIconRedrawKeys = nextRedrawKeys;
    launchpadIconRedrawMap = nextRedrawMap;

    await safeSyncSet({
      launchpadIconScaleSelectedKeys: launchpadIconScaleSelectedKeys,
      launchpadIconMaskOnlyKeys: launchpadIconMaskOnlyKeys,
      launchpadIconRedrawKeys: launchpadIconRedrawKeys,
      launchpadIconRedrawMap: launchpadIconRedrawMap
    });
  }

  function normalizeLaunchpadAppItems(items) {
    if (!Array.isArray(items)) return [];
    const keyMap = new Map();
    items.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const rawKey =
        typeof item.key === "string"
          ? item.key
          : typeof item.src === "string"
            ? item.src
            : "";
      const key = rawKey.trim();
      if (!key) return;
      const title =
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : key.split("/").pop() || key;
      const iconSrc =
        typeof item.iconSrc === "string" && item.iconSrc.trim()
          ? item.iconSrc.trim()
          : typeof item.src === "string" && item.src.trim()
            ? item.src.trim()
            : "";
      if (keyMap.has(key)) return;
      keyMap.set(key, { key, title, iconSrc });
    });
    return Array.from(keyMap.values());
  }

  function setLaunchpadAppList(items, status) {
    if (launchpadAppListStatusEl) {
      launchpadAppListStatusEl.textContent = status;
    }
    if (!launchpadAppListEl) return;

    const normalizedItems = normalizeLaunchpadAppItems(items);
    if (!normalizedItems.length) {
      launchpadAppListEl.textContent = "暂无数据";
      return;
    }

    const selectedSet = new Set(launchpadIconScaleSelectedKeys);
    const maskOnlySet = new Set(launchpadIconMaskOnlyKeys);
    const redrawSet = new Set(launchpadIconRedrawKeys);
    const selectedCount = normalizedItems.filter(({ key }) => selectedSet.has(key)).length;
    const maskOnlyCount = normalizedItems.filter(({ key }) => maskOnlySet.has(key)).length;
    const redrawCount = normalizedItems.filter(({ key }) => redrawSet.has(key)).length;
    if (launchpadAppListStatusEl) {
      launchpadAppListStatusEl.textContent =
        `应用列表：共 ${normalizedItems.length} 项，缩放 ${selectedCount} 项，蒙版 ${maskOnlyCount} 项，重绘 ${redrawCount} 项`;
    }

    launchpadAppListEl.textContent = "";
    const fragment = document.createDocumentFragment();

    normalizedItems.forEach(({ key, title, iconSrc }) => {
      const itemEl = document.createElement("label");
      itemEl.className = "launchpad-app-item";
      const redrawInfo = launchpadRedrawAvailabilityByKey.get(key);
      const redrawPath =
        typeof redrawInfo?.path === "string" && redrawInfo.path
          ? redrawInfo.path
          : launchpadIconRedrawMap[key] || "";
      const redrawAvailable = Boolean(redrawPath);

      const checkboxEl = document.createElement("input");
      checkboxEl.type = "checkbox";
      checkboxEl.checked = selectedSet.has(key);
      checkboxEl.addEventListener("change", async () => {
        const nextSet = new Set(launchpadIconScaleSelectedKeys);
        const nextMaskSet = new Set(launchpadIconMaskOnlyKeys);
        const nextRedrawSet = new Set(launchpadIconRedrawKeys);
        if (checkboxEl.checked) {
          nextSet.add(key);
          nextRedrawSet.delete(key);
        } else {
          nextSet.delete(key);
        }
        launchpadIconScaleSelectedKeys = Array.from(nextSet);
        launchpadIconMaskOnlyKeys = Array.from(nextMaskSet);
        launchpadIconRedrawKeys = Array.from(nextRedrawSet);
        await persistLaunchpadIconSelections();
        setLaunchpadAppList(normalizedItems, status);
        await applyToCurrentTabIfNeeded();
      });

      const maskOnlyEl = document.createElement("input");
      maskOnlyEl.type = "checkbox";
      maskOnlyEl.checked = maskOnlySet.has(key);
      maskOnlyEl.addEventListener("change", async () => {
        const nextSet = new Set(launchpadIconScaleSelectedKeys);
        const nextMaskSet = new Set(launchpadIconMaskOnlyKeys);
        const nextRedrawSet = new Set(launchpadIconRedrawKeys);
        if (maskOnlyEl.checked) {
          nextMaskSet.add(key);
          nextRedrawSet.delete(key);
        } else {
          nextMaskSet.delete(key);
        }
        launchpadIconScaleSelectedKeys = Array.from(nextSet);
        launchpadIconMaskOnlyKeys = Array.from(nextMaskSet);
        launchpadIconRedrawKeys = Array.from(nextRedrawSet);
        await persistLaunchpadIconSelections();
        setLaunchpadAppList(normalizedItems, status);
        await applyToCurrentTabIfNeeded();
      });

      const redrawEl = document.createElement("input");
      redrawEl.type = "checkbox";
      redrawEl.checked = redrawSet.has(key);
      redrawEl.disabled = !redrawAvailable;
      redrawEl.addEventListener("change", async () => {
        if (!redrawAvailable) return;
        const nextSet = new Set(launchpadIconScaleSelectedKeys);
        const nextMaskSet = new Set(launchpadIconMaskOnlyKeys);
        const nextRedrawSet = new Set(launchpadIconRedrawKeys);
        if (redrawEl.checked) {
          nextRedrawSet.add(key);
          nextSet.delete(key);
          nextMaskSet.delete(key);
        } else {
          nextRedrawSet.delete(key);
        }
        launchpadIconScaleSelectedKeys = Array.from(nextSet);
        launchpadIconMaskOnlyKeys = Array.from(nextMaskSet);
        launchpadIconRedrawKeys = Array.from(nextRedrawSet);
        await persistLaunchpadIconSelections();
        setLaunchpadAppList(normalizedItems, status);
        await applyToCurrentTabIfNeeded();
      });

      const textWrapEl = document.createElement("span");
      textWrapEl.className = "launchpad-app-text";

      const titleRowEl = document.createElement("span");
      titleRowEl.className = "launchpad-app-title-row";

      const iconEl = document.createElement("img");
      iconEl.className = "launchpad-app-icon";
      iconEl.alt = "";
      if (iconSrc) {
        iconEl.src = iconSrc;
      }
      iconEl.addEventListener("error", () => {
        iconEl.style.visibility = "hidden";
      });

      const titleEl = document.createElement("span");
      titleEl.textContent = title;

      const modeWrapEl = document.createElement("span");
      modeWrapEl.className = "launchpad-app-modes";

      const scaleLabelEl = document.createElement("label");
      scaleLabelEl.className = "launchpad-mode-tag";
      scaleLabelEl.title = "缩放到 0.75";
      scaleLabelEl.appendChild(checkboxEl);
      scaleLabelEl.append("缩放");

      const maskLabelEl = document.createElement("label");
      maskLabelEl.className = "launchpad-mode-tag";
      maskLabelEl.title = "仅裁切蒙版，可与缩放叠加";
      maskLabelEl.appendChild(maskOnlyEl);
      maskLabelEl.append("蒙版");

      const redrawLabelEl = document.createElement("label");
      redrawLabelEl.className = "launchpad-mode-tag";
      redrawLabelEl.title = redrawAvailable
        ? `使用 ${redrawPath} 替换原始图标`
        : `未找到重绘图标：${[
            redrawInfo?.mappedPath || "",
            ...(redrawInfo?.candidates || [])
              .slice(0, 3)
              .map((name) => `${PREFECT_ICON_DIR}/${name}.png`)
          ]
            .filter(Boolean)
            .join(" / ") || `${PREFECT_ICON_DIR}/<name>.png`}`;
      redrawLabelEl.appendChild(redrawEl);
      redrawLabelEl.append("重绘");

      modeWrapEl.appendChild(scaleLabelEl);
      modeWrapEl.appendChild(maskLabelEl);
      modeWrapEl.appendChild(redrawLabelEl);

      titleRowEl.appendChild(iconEl);
      titleRowEl.appendChild(titleEl);
      textWrapEl.appendChild(titleRowEl);
      itemEl.appendChild(textWrapEl);
      itemEl.appendChild(modeWrapEl);
      fragment.appendChild(itemEl);
    });

    launchpadAppListEl.appendChild(fragment);
  }

  async function refreshLaunchpadAppList() {
    if (!tab?.id) return;
    if (!isFnOSWebUi) {
      setLaunchpadAppList([], "应用列表：当前页面未检测为 fnOS WebUI");
      return;
    }

    try {
      await loadPrefectIconMapConfig();
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "FNOS_GET_LAUNCHPAD_APP_ITEMS"
      });
      const fallbackItems = Array.isArray(response?.titles)
        ? response.titles.map((title) => ({
            title,
            key: String(title || "").trim(),
            iconSrc: ""
          }))
        : [];
      const items = normalizeLaunchpadAppItems(response?.items || fallbackItems);
      if (!items.length) {
        setLaunchpadAppList([], "应用列表：未读取到应用，先打开启动台再试");
        return;
      }

      launchpadRedrawAvailabilityByKey =
        await resolveLaunchpadRedrawAvailability(items);
      const availableSet = new Set(items.map((item) => item.key));
      const availableRedrawSet = new Set(
        Array.from(launchpadRedrawAvailabilityByKey.entries())
          .filter(([, value]) => typeof value?.path === "string" && Boolean(value.path))
          .map(([key]) => key)
      );
      const nextRedraw = normalizeLaunchpadKeyList(launchpadIconRedrawKeys).filter(
        (key) => availableSet.has(key) && availableRedrawSet.has(key)
      );
      const redrawSet = new Set(nextRedraw);
      const nextMaskOnly = launchpadIconMaskOnlyKeys.filter((key) =>
        availableSet.has(key) && !redrawSet.has(key)
      );
      const nextSelected = launchpadIconScaleSelectedKeys.filter(
        (key) => availableSet.has(key) && !redrawSet.has(key)
      );
      const nextRedrawMap = buildLaunchpadRedrawMapFromSelection(
        nextRedraw,
        launchpadRedrawAvailabilityByKey
      );
      const hasSelectionChanged = !isSameStringArray(
        nextSelected,
        launchpadIconScaleSelectedKeys
      );
      const hasMaskOnlyChanged = !isSameStringArray(
        nextMaskOnly,
        launchpadIconMaskOnlyKeys
      );
      const hasRedrawChanged = !isSameStringArray(
        nextRedraw,
        launchpadIconRedrawKeys
      );
      const hasRedrawMapChanged = !areStringMapsEqual(
        nextRedrawMap,
        launchpadIconRedrawMap
      );
      launchpadIconScaleSelectedKeys = nextSelected;
      launchpadIconMaskOnlyKeys = nextMaskOnly;
      launchpadIconRedrawKeys = nextRedraw;
      launchpadIconRedrawMap = nextRedrawMap;
      if (
        hasSelectionChanged ||
        hasMaskOnlyChanged ||
        hasRedrawChanged ||
        hasRedrawMapChanged
      ) {
        await safeSyncSet({
          launchpadIconScaleSelectedKeys: launchpadIconScaleSelectedKeys,
          launchpadIconMaskOnlyKeys: launchpadIconMaskOnlyKeys,
          launchpadIconRedrawKeys: launchpadIconRedrawKeys,
          launchpadIconRedrawMap: launchpadIconRedrawMap
        });
      }

      setLaunchpadAppList(items, `应用列表：共 ${items.length} 项`);
    } catch (_error) {
      setLaunchpadAppList([], "应用列表：读取失败，请刷新页面后重试");
    }
  }

  function setFnUICheckedStatus(isChecked) {
    firstCardEl?.classList.toggle("fnUIChecked", isChecked);
  }

  function syncSwitchAccent(color) {
    document.documentElement.style.setProperty("--switch-on", color);
  }

  function normalizeHex(value) {
    if (typeof value !== "string") return null;
    const hex = value.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) return null;
    return hex;
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) {
      return { h: 0, s: 0, l };
    }
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
    return { h, s, l };
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      const value = clampChannel(l * 255);
      return { r: value, g: value, b: value };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);
    return {
      r: clampChannel(r * 255),
      g: clampChannel(g * 255),
      b: clampChannel(b * 255)
    };
  }

  function rgbToHex({ r, g, b }) {
    return (
      "#" +
      [r, g, b]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function clampBrandLightness(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return DEFAULT_BRAND_COLOR;
    const intValue = parseInt(normalized.slice(1), 16);
    const rgb = {
      r: (intValue >> 16) & 255,
      g: (intValue >> 8) & 255,
      b: intValue & 255
    };
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const clampedL = Math.min(
      BRAND_LIGHTNESS_MAX,
      Math.max(BRAND_LIGHTNESS_MIN, hsl.l)
    );
    const nextRgb = hslToRgb(hsl.h, hsl.s, clampedL);
    return rgbToHex(nextRgb);
  }

  function setBrandColorUI(next) {
    if (brandColorEl) {
      brandColorEl.value = next;
    }
    if (brandColorTextEl) {
      brandColorTextEl.value = next;
    }
    syncSwitchAccent(next);
  }

  function normalizeText(value, maxLength = 300) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
  }

  function truncateText(value, maxLength = 60) {
    const normalized = normalizeText(value, maxLength);
    return normalized;
  }

  function normalizeUpdateState(raw) {
    const next = raw && typeof raw === "object" ? raw : {};
    const parsedLastCheckedAt = Number(next.lastCheckedAt);
    const allowedResult = new Set(["first", "same", "new", "error"]);
    const lastResult = allowedResult.has(next.lastResult) ? next.lastResult : "";
    return {
      baseVersion: normalizeText(next.baseVersion, 40) || manifestVersion,
      baseSha: normalizeText(next.baseSha, 128),
      lastCheckedAt:
        Number.isFinite(parsedLastCheckedAt) && parsedLastCheckedAt > 0
          ? parsedLastCheckedAt
          : 0,
      latestSha: normalizeText(next.latestSha, 128),
      latestDate: normalizeText(next.latestDate, 80),
      latestUrl:
        normalizeText(next.latestUrl, 1000) || GITHUB_COMMITS_PAGE_URL,
      latestMessage: normalizeText(next.latestMessage, 200),
      hasUpdate: Boolean(next.hasUpdate || next.lastResult === "new"),
      lastResult,
      lastError: normalizeText(next.lastError, 200)
    };
  }

  function shortSha(sha) {
    const normalized = normalizeText(sha, 128);
    return normalized ? normalized.slice(0, 7) : "";
  }

  function formatCommitDate(dateText) {
    if (!dateText) return "";
    const parsed = new Date(dateText);
    if (!Number.isFinite(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(parsed);
  }

  function formatElapsedText(timestamp) {
    if (!timestamp || !Number.isFinite(timestamp)) return "";
    const diff = Date.now() - timestamp;
    if (diff < 0) return "";
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
    }
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`;
  }

  function updateCheckStatusText() {
    const elapsedText = formatElapsedText(updateCheckState.lastCheckedAt);
    if (updateCheckState.hasUpdate || updateCheckState.lastResult === "new") {
      return elapsedText ? `发现可用更新 (上次检查：${elapsedText})` : "发现可用更新";
    }
    if (updateCheckState.lastResult === "same") {
      return elapsedText ? `暂无更新 (上次检查：${elapsedText})` : "暂无更新";
    }
    if (updateCheckState.lastResult === "first") {
      return elapsedText ? `已记录当前最新提交 (上次检查：${elapsedText})` : "已记录当前最新提交";
    }
    if (updateCheckState.lastResult === "error") {
      return updateCheckState.lastError || "检查失败";
    }
    return "等待检查";
  }

  function renderUpdateLink() {
    if (!latestCommitLinkEl) return;
    const href =
      normalizeText(updateCheckState.latestUrl, 1000) || GITHUB_COMMITS_PAGE_URL;
    latestCommitLinkEl.href = href;

    const shaText = shortSha(updateCheckState.latestSha);
    if (!shaText) {
      latestCommitLinkEl.textContent = "最新提交：读取中...";
      return;
    }

    const dateText = formatCommitDate(updateCheckState.latestDate);
    const messageText = truncateText(updateCheckState.latestMessage, 48);
    let content = `最新提交：${shaText}`;
    if (dateText) {
      content += ` · ${dateText}`;
    }
    latestCommitLinkEl.textContent = content;
  }

  function setUpdateStatusText(text) {
    if (!updateStatusEl) return;
    updateStatusEl.textContent = text;
  }

  function setUpdateButtonState(isLoading) {
    if (!checkUpdateButtonEl) return;
    checkUpdateButtonEl.disabled = Boolean(isLoading);
    checkUpdateButtonEl.textContent = isLoading ? "检查中" : "检查";
  }

  async function syncActionBadge() {
    if (!chrome?.action?.setBadgeText) return;
    const hasUpdate = Boolean(updateCheckState.hasUpdate);
    try {
      await chrome.action.setBadgeText({
        text: hasUpdate ? ACTION_BADGE_TEXT : ""
      });
      if (hasUpdate && chrome.action.setBadgeBackgroundColor) {
        await chrome.action.setBadgeBackgroundColor({
          color: "#ff6633"
        });
      }
    } catch (_error) {
      // ignore action badge errors in unsupported contexts
    }
  }

  function renderUpdateCheckUI() {
    setUpdateStatusText(updateCheckStatusText());
    renderUpdateLink();
    const hasUpdate = Boolean(updateCheckState.hasUpdate);
    updatePanelEl?.classList.toggle("has-update", hasUpdate);
    updateDotEl?.classList.toggle("has-update", hasUpdate);
    void syncActionBadge();
  }

  function parseUpdateErrorMessage(error) {
    const rawMessage = String(error?.message || "").toLowerCase();
    if (rawMessage.includes("http-403") || rawMessage.includes("http-429")) {
      return "检查失败：GitHub API 频率限制";
    }
    if (rawMessage.includes("http-404")) {
      return "检查失败：仓库不存在或无权限";
    }
    if (rawMessage.includes("aborted")) {
      return "检查失败：请求已取消";
    }
    return "检查失败：网络或接口异常";
  }

  async function fetchLatestCommit() {
    const response = await fetch(GITHUB_COMMITS_API_URL, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    });
    if (!response.ok) {
      throw new Error(`http-${response.status}`);
    }
    const data = await response.json();
    const latest = Array.isArray(data) ? data[0] : null;
    if (!latest || typeof latest !== "object" || typeof latest.sha !== "string") {
      throw new Error("invalid-response");
    }
    const firstLine = String(latest?.commit?.message || "").split("\n")[0];
    const message = normalizeText(firstLine, 200);
    const date =
      normalizeText(latest?.commit?.committer?.date, 80) ||
      normalizeText(latest?.commit?.author?.date, 80);
    const url = normalizeText(latest?.html_url, 1000) || GITHUB_COMMITS_PAGE_URL;
    return {
      sha: latest.sha,
      date,
      url,
      message
    };
  }

  function normalizeFontFamily(value) {
    return normalizeText(value, 400);
  }

  function normalizeFontWeight(value) {
    const raw = normalizeText(value, 16);
    if (!raw) return "";
    const lowered = raw.toLowerCase();
    if (/^(normal|bold|bolder|lighter)$/.test(lowered)) {
      return lowered;
    }
    if (/^\d{1,4}$/.test(raw)) {
      const numeric = Math.max(1, Math.min(1000, Number(raw)));
      return String(numeric);
    }
    return "";
  }

  function normalizeFontFeatureSettings(value) {
    return normalizeText(value, 200);
  }

  function normalizeFontFaceName(value) {
    const cleaned = normalizeText(value, 64).replace(/["'`]/g, "");
    return cleaned || DEFAULT_FONT_FACE_NAME;
  }

  function normalizeFontUrl(value) {
    const raw = normalizeText(value, 800);
    if (!raw) return "";
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }
      return parsed.toString();
    } catch (_error) {
      return "";
    }
  }

  function normalizeFontSettings(raw) {
    return {
      enabled: Boolean(raw?.enabled),
      family: normalizeFontFamily(raw?.family),
      weight: normalizeFontWeight(raw?.weight),
      featureSettings: normalizeFontFeatureSettings(raw?.featureSettings),
      faceName: normalizeFontFaceName(raw?.faceName),
      url: normalizeFontUrl(raw?.url)
    };
  }

  function normalizeCodeText(value, maxLength = 120000) {
    if (typeof value !== "string") return "";
    return value.slice(0, maxLength);
  }

  function normalizeCustomCodeSettings(raw) {
    return {
      enabled: Boolean(raw?.enabled),
      css: normalizeCodeText(raw?.css),
      js: normalizeCodeText(raw?.js)
    };
  }

  function inferFontFormat(fileName, mimeType) {
    const lower = `${fileName || ""} ${mimeType || ""}`.toLowerCase();
    if (lower.includes("woff2")) return "woff2";
    if (lower.includes("woff")) return "woff";
    if (lower.includes("otf") || lower.includes("opentype")) return "opentype";
    if (lower.includes("ttf") || lower.includes("truetype")) return "truetype";
    return "";
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read-failed"));
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("invalid-result"));
          return;
        }
        resolve(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function setFontFileStatus() {
    if (!fontFileStatusEl) return;
    if (uploadedFontDataUrl && uploadedFontFileName) {
      const suffix = uploadedFontFormat ? ` / ${uploadedFontFormat}` : "";
      fontFileStatusEl.textContent = `已导入: ${uploadedFontFileName}${suffix}`;
      return;
    }
    if (fontSettings.url) {
      fontFileStatusEl.textContent = "未导入本地字体文件，将尝试使用 URL 字体";
      return;
    }
    fontFileStatusEl.textContent = "未导入字体文件";
  }

  function setFontSettingsUI(next) {
    if (fontOverrideEnabledEl) {
      fontOverrideEnabledEl.checked = next.enabled;
    }
    if (fontFamilyEl) {
      fontFamilyEl.value = next.family;
    }
    if (fontWeightEl) {
      fontWeightEl.value = next.weight;
    }
    if (fontFeatureSettingsEl) {
      fontFeatureSettingsEl.value = next.featureSettings;
    }
    if (fontFaceNameEl) {
      fontFaceNameEl.value = next.faceName;
    }
    if (fontUrlEl) {
      fontUrlEl.value = next.url;
    }
    updateFontSettingsVisibility();
    setFontFileStatus();
  }

  function setCustomCodeStatus(text) {
    if (!customCodeStatusEl) return;
    customCodeStatusEl.textContent = text || CUSTOM_CODE_STATUS_DEFAULT;
  }

  function setCustomCodeSettingsUI(next) {
    if (customCodeEnabledEl) {
      customCodeEnabledEl.checked = next.enabled;
    }
    if (customCssEl) {
      customCssEl.value = next.css;
    }
    if (customJsEl) {
      customJsEl.value = next.js;
    }
    updateCustomCodeSettingsVisibility();
    setCustomCodeStatus("");
  }

  function collectFontSettingsFromUI() {
    return normalizeFontSettings({
      enabled: fontOverrideEnabledEl?.checked,
      family: fontFamilyEl?.value,
      weight: fontWeightEl?.value,
      featureSettings: fontFeatureSettingsEl?.value,
      faceName: fontFaceNameEl?.value,
      url: fontUrlEl?.value
    });
  }

  function collectCustomCodeSettingsFromUI() {
    return normalizeCustomCodeSettings({
      enabled: customCodeEnabledEl?.checked,
      css: customCssEl?.value,
      js: customJsEl?.value
    });
  }

  function getFontPayload() {
    return { ...fontSettings };
  }

  function getCustomCodePayload() {
    return { ...customCodeSettings };
  }

  async function safeSyncSet(data) {
    try {
      await chrome.storage.sync.set(data);
      return true;
    } catch (error) {
      if (typeof error?.message === "string") {
        console.warn("[FnOS UI Mods] 同步存储写入失败:", error.message);
      }
      return false;
    }
  }

  async function safeLocalSet(data) {
    try {
      await chrome.storage.local.set(data);
      return { ok: true, message: "" };
    } catch (error) {
      const message =
        typeof error?.message === "string" ? error.message : "unknown-error";
      if (typeof error?.message === "string") {
        console.warn("[FnOS UI Mods] 本地存储写入失败:", error.message);
      }
      return {
        ok: false,
        message,
        isQuota: isStorageQuotaErrorMessage(message)
      };
    }
  }

  async function safeLocalRemove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (error) {
      if (typeof error?.message === "string") {
        console.warn("[FnOS UI Mods] 本地存储删除失败:", error.message);
      }
      return false;
    }
  }

  async function saveUpdateState() {
    const result = await safeLocalSet({
      [UPDATE_STATE_LOCAL_KEY]: updateCheckState
    });
    return result.ok;
  }

  async function runUpdateCheck({ force = false } = {}) {
    if (updateCheckInFlight) {
      return updateCheckInFlight;
    }

    if (updateCheckState.baseVersion !== manifestVersion) {
      updateCheckState = {
        ...updateCheckState,
        baseVersion: manifestVersion,
        baseSha: "",
        hasUpdate: false
      };
    }

    const isFresh =
      !force &&
      updateCheckState.lastCheckedAt > 0 &&
      Date.now() - updateCheckState.lastCheckedAt < UPDATE_CHECK_INTERVAL_MS &&
      updateCheckState.lastResult !== "error";
    if (isFresh) {
      renderUpdateCheckUI();
      return updateCheckState;
    }

    setUpdateButtonState(true);
    setUpdateStatusText("检查中...");

    updateCheckInFlight = (async () => {
      try {
        const latest = await fetchLatestCommit();
        const baseSha = normalizeText(updateCheckState.baseSha, 128);
        const hasBase = Boolean(baseSha);
        const hasUpdate = hasBase && latest.sha !== baseSha;
        const nextBaseSha = hasBase ? baseSha : latest.sha;

        updateCheckState = {
          ...updateCheckState,
          baseVersion: manifestVersion,
          baseSha: nextBaseSha,
          lastCheckedAt: Date.now(),
          latestSha: latest.sha,
          latestDate: latest.date,
          latestUrl: latest.url,
          latestMessage: latest.message,
          hasUpdate,
          lastResult: hasUpdate ? "new" : hasBase ? "same" : "first",
          lastError: ""
        };
      } catch (error) {
        updateCheckState = {
          ...updateCheckState,
          lastCheckedAt: Date.now(),
          lastResult: "error",
          lastError: parseUpdateErrorMessage(error)
        };
      }

      await saveUpdateState();
      renderUpdateCheckUI();
      return updateCheckState;
    })()
      .finally(() => {
        updateCheckInFlight = null;
        setUpdateButtonState(false);
      });

    return updateCheckInFlight;
  }

  async function initializeUpdateChecker() {
    if (!updateStatusEl && !latestCommitLinkEl && !checkUpdateButtonEl) {
      return;
    }

    const localUpdateState = await chrome.storage.local.get({
      [UPDATE_STATE_LOCAL_KEY]: null
    });
    updateCheckState = normalizeUpdateState(
      localUpdateState[UPDATE_STATE_LOCAL_KEY]
    );
    renderUpdateCheckUI();

    if (checkUpdateButtonEl) {
      checkUpdateButtonEl.addEventListener("click", async () => {
        await runUpdateCheck({ force: true });
      });
    }

    await runUpdateCheck();
  }

  async function saveBrandColor(next) {
    if (next === lastSavedBrandColor) return true;
    const ok = await safeSyncSet({ brandColor: next });
    if (ok) {
      lastSavedBrandColor = next;
    }
    return ok;
  }

  async function saveFontSettings(next) {
    return safeSyncSet({
      fontOverrideEnabled: next.enabled,
      fontFamily: next.family,
      fontWeight: next.weight,
      fontFeatureSettings: next.featureSettings,
      fontFaceName: next.faceName,
      fontUrl: next.url
    });
  }

  async function saveCustomCodeSettings(next) {
    const syncOk = await safeSyncSet({
      customCodeEnabled: next.enabled
    });
    const localSetResult = await safeLocalSet({
      [CUSTOM_CSS_LOCAL_KEY]: next.css,
      [CUSTOM_JS_LOCAL_KEY]: next.js
    });

    if (!localSetResult.ok) {
      setCustomCodeStatus(
        localSetResult.isQuota
          ? "自定义代码保存失败：存储空间不足，请精简代码后重试"
          : "自定义代码保存失败：本地存储写入失败"
      );
      return false;
    }

    setCustomCodeStatus("");
    return syncOk && localSetResult.ok;
  }

  async function applyToCurrentTabIfNeeded(options = {}) {
    const shouldInject =
      siteToggleEl.checked || (autoSuspectedFnOSEl.checked && isFnOSWebUi);
    if (!shouldInject) return;

    const titlebarStyle = styleMacEl.checked ? "mac" : "windows";
    const launchpadStyle = styleSpotlightLaunchpadEl.checked
      ? "spotlight"
      : "classic";
    const launchpadIconScaleEnabled = Boolean(launchpadIconScaleEnabledEl?.checked);
    const launchpadIconScaleSelected = launchpadIconScaleSelectedKeys.slice();
    const launchpadIconMaskOnlySelected = launchpadIconMaskOnlyKeys.slice();
    const launchpadIconRedrawSelected = launchpadIconRedrawKeys.slice();
    const launchpadIconRedrawSelectedMap = buildLaunchpadRedrawMapFromSelection(
      launchpadIconRedrawSelected
    );
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "FNOS_APPLY",
        titlebarStyle,
        launchpadStyle,
        launchpadIconScaleEnabled,
        launchpadIconScaleSelectedKeys: launchpadIconScaleSelected,
        launchpadIconMaskOnlyKeys: launchpadIconMaskOnlySelected,
        launchpadIconRedrawKeys: launchpadIconRedrawSelected,
        launchpadIconRedrawMap: launchpadIconRedrawSelectedMap,
        brandColor,
        fontSettings: getFontPayload(),
        customCodeSettings: getCustomCodePayload(),
        refreshFontAsset: Boolean(options.refreshFontAsset),
        refreshCustomCode: Boolean(options.refreshCustomCode)
      });
    } catch (_error) {
      // ignore; content script may be unavailable for non-http(s) pages
    }
  }

  async function applyBrandColor(next, persist) {
    const normalized = normalizeHex(next) || DEFAULT_BRAND_COLOR;
    const clamped = clampBrandLightness(normalized);
    brandColor = clamped;
    setBrandColorUI(clamped);
    if (persist) {
      await saveBrandColor(clamped);
    }
    await applyToCurrentTabIfNeeded();
  }

  async function applyFontSettings(next, persist, options = {}) {
    fontSettings = normalizeFontSettings(next);
    setFontSettingsUI(fontSettings);
    if (persist) {
      await saveFontSettings(fontSettings);
    }
    await applyToCurrentTabIfNeeded(options);
  }

  function commitFontInputs(persist) {
    return applyFontSettings(collectFontSettingsFromUI(), persist);
  }

  async function applyCustomCodeSettings(next, persist, options = {}) {
    customCodeSettings = normalizeCustomCodeSettings(next);
    setCustomCodeSettingsUI(customCodeSettings);
    if (persist) {
      await saveCustomCodeSettings(customCodeSettings);
    }
    await applyToCurrentTabIfNeeded(options);
  }

  function commitCustomCodeInputs(persist) {
    return applyCustomCodeSettings(collectCustomCodeSettingsFromUI(), persist, {
      refreshCustomCode: persist
    });
  }

  await initializeUpdateChecker();

  if (!pageUrl || !origin || !/^https?:$/.test(pageUrl.protocol)) {
    originEl.textContent = "当前页不是 http/https 页面";
    siteToggleEl.disabled = true;
    autoSuspectedFnOSEl.disabled = true;
    styleWindowsEl.disabled = true;
    styleMacEl.disabled = true;
    styleClassicLaunchpadEl.disabled = true;
    styleSpotlightLaunchpadEl.disabled = true;
    if (launchpadIconScaleEnabledEl) launchpadIconScaleEnabledEl.disabled = true;

    if (fontOverrideEnabledEl) fontOverrideEnabledEl.disabled = true;
    if (fontFamilyEl) fontFamilyEl.disabled = true;
    if (fontWeightEl) fontWeightEl.disabled = true;
    if (fontFeatureSettingsEl) fontFeatureSettingsEl.disabled = true;
    if (fontFaceNameEl) fontFaceNameEl.disabled = true;
    if (fontUrlEl) fontUrlEl.disabled = true;
    if (customCodeEnabledEl) customCodeEnabledEl.disabled = true;
    if (customCssEl) customCssEl.disabled = true;
    if (customJsEl) customJsEl.disabled = true;
    if (fontFileEl) fontFileEl.disabled = true;
    if (clearFontFileEl) clearFontFileEl.disabled = true;

    setFnUICheckedStatus(false);
    updatePlatformOptionsVisibility();
    updateFontSettingsVisibility();
    updateCustomCodeSettingsVisibility();
    setLaunchpadAppList([], "应用列表：当前页不是 http/https 页面");
    return;
  }

  originEl.textContent = origin;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "FNOS_CHECK",
      wait: true
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
    launchpadStyle: "classic",
    launchpadIconScaleEnabled: false,
    launchpadIconScaleSelectedKeys: [],
    launchpadIconMaskOnlyKeys: [],
    launchpadIconRedrawKeys: [],
    launchpadIconRedrawMap: {},
    brandColor: DEFAULT_BRAND_COLOR,
    fontOverrideEnabled: DEFAULT_FONT_SETTINGS.enabled,
    fontFamily: DEFAULT_FONT_SETTINGS.family,
    fontWeight: DEFAULT_FONT_SETTINGS.weight,
    fontFeatureSettings: DEFAULT_FONT_SETTINGS.featureSettings,
    fontFaceName: DEFAULT_FONT_SETTINGS.faceName,
    fontUrl: DEFAULT_FONT_SETTINGS.url,
    customCodeEnabled: DEFAULT_CUSTOM_CODE_SETTINGS.enabled
  });

  const localState = await chrome.storage.local.get({
    [FONT_LOCAL_DATA_KEY]: "",
    [FONT_LOCAL_NAME_KEY]: "",
    [FONT_LOCAL_FORMAT_KEY]: "",
    [CUSTOM_CSS_LOCAL_KEY]: "",
    [CUSTOM_JS_LOCAL_KEY]: ""
  });

  let enabledOrigins = Array.isArray(state.enabledOrigins)
    ? state.enabledOrigins
    : [];

  brandColor =
    typeof state.brandColor === "string" ? state.brandColor : DEFAULT_BRAND_COLOR;
  brandColor = clampBrandLightness(brandColor);
  lastSavedBrandColor =
    normalizeHex(
      typeof state.brandColor === "string" ? state.brandColor : DEFAULT_BRAND_COLOR
    ) || DEFAULT_BRAND_COLOR;
  if (brandColor !== lastSavedBrandColor) {
    await saveBrandColor(brandColor);
  }

  fontSettings = normalizeFontSettings({
    enabled: state.fontOverrideEnabled,
    family: state.fontFamily,
    weight: state.fontWeight,
    featureSettings: state.fontFeatureSettings,
    faceName: state.fontFaceName,
    url: state.fontUrl
  });
  customCodeSettings = normalizeCustomCodeSettings({
    enabled: state.customCodeEnabled,
    css: localState[CUSTOM_CSS_LOCAL_KEY],
    js: localState[CUSTOM_JS_LOCAL_KEY]
  });

  uploadedFontDataUrl =
    typeof localState[FONT_LOCAL_DATA_KEY] === "string"
      ? localState[FONT_LOCAL_DATA_KEY]
      : "";
  uploadedFontFileName =
    typeof localState[FONT_LOCAL_NAME_KEY] === "string"
      ? localState[FONT_LOCAL_NAME_KEY]
      : "";
  uploadedFontFormat =
    typeof localState[FONT_LOCAL_FORMAT_KEY] === "string"
      ? localState[FONT_LOCAL_FORMAT_KEY]
      : "";

  siteToggleEl.checked = enabledOrigins.includes(origin);
  autoSuspectedFnOSEl.checked = Boolean(state.autoEnableSuspectedFnOS);

  const titlebarStyle = state.titlebarStyle === "mac" ? "mac" : "windows";
  styleWindowsEl.checked = titlebarStyle === "windows";
  styleMacEl.checked = titlebarStyle === "mac";
  const launchpadStyle =
    state.launchpadStyle === "spotlight" ? "spotlight" : "classic";
  styleClassicLaunchpadEl.checked = launchpadStyle === "classic";
  styleSpotlightLaunchpadEl.checked = launchpadStyle === "spotlight";
  if (launchpadIconScaleEnabledEl) {
    launchpadIconScaleEnabledEl.checked = Boolean(state.launchpadIconScaleEnabled);
  }
  launchpadIconScaleSelectedKeys = normalizeLaunchpadKeyList(
    state.launchpadIconScaleSelectedKeys
  );
  launchpadIconMaskOnlyKeys = normalizeLaunchpadKeyList(
    state.launchpadIconMaskOnlyKeys
  );
  launchpadIconRedrawKeys = normalizeLaunchpadKeyList(state.launchpadIconRedrawKeys);
  const redrawKeySet = new Set(launchpadIconRedrawKeys);
  launchpadIconScaleSelectedKeys = launchpadIconScaleSelectedKeys.filter(
    (key) => !redrawKeySet.has(key)
  );
  launchpadIconMaskOnlyKeys = launchpadIconMaskOnlyKeys.filter(
    (key) => !redrawKeySet.has(key)
  );
  launchpadIconRedrawMap = normalizeLaunchpadRedrawMap(state.launchpadIconRedrawMap);
  launchpadIconRedrawMap = buildLaunchpadRedrawMapFromSelection(
    launchpadIconRedrawKeys,
    new Map(
      Object.entries(launchpadIconRedrawMap).map(([key, path]) => [key, { path }])
    )
  );

  setBrandColorUI(brandColor);
  setFontSettingsUI(fontSettings);
  setCustomCodeSettingsUI(customCodeSettings);

  updatePlatformOptionsVisibility();

  siteToggleEl.addEventListener("change", async () => {
    const enabled = siteToggleEl.checked;

    if (enabled) {
      enabledOrigins = [...new Set([...enabledOrigins, origin])];
    } else {
      enabledOrigins = enabledOrigins.filter((item) => item !== origin);
    }

    await safeSyncSet({ enabledOrigins });
    updatePlatformOptionsVisibility();
    await applyToCurrentTabIfNeeded();
  });

  autoSuspectedFnOSEl.addEventListener("change", async () => {
    await safeSyncSet({
      autoEnableSuspectedFnOS: autoSuspectedFnOSEl.checked
    });
    updatePlatformOptionsVisibility();
    await applyToCurrentTabIfNeeded();
  });

  for (const radio of [styleWindowsEl, styleMacEl]) {
    radio.addEventListener("change", async () => {
      if (!radio.checked) return;
      await safeSyncSet({ titlebarStyle: radio.value });
      await applyToCurrentTabIfNeeded();
    });
  }

  for (const radio of [styleClassicLaunchpadEl, styleSpotlightLaunchpadEl]) {
    radio.addEventListener("change", async () => {
      if (!radio.checked) return;
      await safeSyncSet({ launchpadStyle: radio.value });
      await applyToCurrentTabIfNeeded();
      await refreshLaunchpadAppList();
    });
  }

  if (launchpadIconScaleEnabledEl) {
    launchpadIconScaleEnabledEl.addEventListener("change", async () => {
      await safeSyncSet({
        launchpadIconScaleEnabled: launchpadIconScaleEnabledEl.checked
      });
      await applyToCurrentTabIfNeeded();
      await refreshLaunchpadAppList();
    });
  }

  if (brandColorEl) {
    const handlePickerInput = async () => {
      await applyBrandColor(brandColorEl.value, false);
    };
    const handlePickerCommit = async () => {
      await applyBrandColor(brandColorEl.value, true);
    };

    brandColorEl.addEventListener("input", handlePickerInput);
    brandColorEl.addEventListener("change", handlePickerCommit);
  }

  if (resetBrandColorEl) {
    resetBrandColorEl.addEventListener("click", async () => {
      await applyBrandColor(DEFAULT_BRAND_COLOR, true);
    });
  }

  if (brandColorTextEl) {
    const handleTextCommit = async () => {
      await applyBrandColor(brandColorTextEl.value, true);
    };
    brandColorTextEl.addEventListener("change", handleTextCommit);
    brandColorTextEl.addEventListener("blur", handleTextCommit);
    brandColorTextEl.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await handleTextCommit();
      }
    });
  }

  if (fontOverrideEnabledEl) {
    fontOverrideEnabledEl.addEventListener("change", async () => {
      await commitFontInputs(true);
    });
  }

  for (const inputEl of [
    fontFamilyEl,
    fontWeightEl,
    fontFeatureSettingsEl,
    fontFaceNameEl,
    fontUrlEl
  ]) {
    if (!inputEl) continue;

    inputEl.addEventListener("change", async () => {
      await commitFontInputs(true);
    });

    inputEl.addEventListener("blur", async () => {
      await commitFontInputs(true);
    });

    inputEl.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      await commitFontInputs(true);
    });
  }

  if (customCodeEnabledEl) {
    customCodeEnabledEl.addEventListener("change", async () => {
      await commitCustomCodeInputs(true);
    });
  }

  for (const inputEl of [customCssEl, customJsEl]) {
    if (!inputEl) continue;

    inputEl.addEventListener("change", async () => {
      await commitCustomCodeInputs(true);
    });

    inputEl.addEventListener("blur", async () => {
      await commitCustomCodeInputs(true);
    });

    inputEl.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      await commitCustomCodeInputs(true);
    });
  }

  if (fontFileEl) {
    fontFileEl.addEventListener("change", async () => {
      const file = fontFileEl.files?.[0];
      if (!file) return;

      try {
        const dataUrl = await readFileAsDataUrl(file);
        const format = inferFontFormat(file.name, file.type);
        const localSetResult = await safeLocalSet({
          [FONT_LOCAL_DATA_KEY]: dataUrl,
          [FONT_LOCAL_NAME_KEY]: file.name,
          [FONT_LOCAL_FORMAT_KEY]: format
        });
        if (!localSetResult.ok) {
          if (fontFileStatusEl) {
            fontFileStatusEl.textContent = localSetResult.isQuota
              ? "字体导入失败：存储空间不足（请重载扩展后重试，或改用更小的 woff2 / URL 字体）"
              : "字体导入失败：本地存储写入失败";
          }
          return;
        }

        uploadedFontDataUrl = dataUrl;
        uploadedFontFileName = file.name;
        uploadedFontFormat = format;
        setFontFileStatus();
        await applyToCurrentTabIfNeeded({ refreshFontAsset: true });
      } catch (_error) {
        if (fontFileStatusEl) {
          fontFileStatusEl.textContent = "字体导入失败：文件读取失败";
        }
      } finally {
        fontFileEl.value = "";
      }
    });
  }

  if (clearFontFileEl) {
    clearFontFileEl.addEventListener("click", async () => {
      const ok = await safeLocalRemove([
        FONT_LOCAL_DATA_KEY,
        FONT_LOCAL_NAME_KEY,
        FONT_LOCAL_FORMAT_KEY
      ]);
      if (!ok) return;

      uploadedFontDataUrl = "";
      uploadedFontFileName = "";
      uploadedFontFormat = "";
      setFontFileStatus();
      await applyToCurrentTabIfNeeded({ refreshFontAsset: true });
    });
  }

  await refreshLaunchpadAppList();
})();
