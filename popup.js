(async () => {
  const versionEl = document.querySelector("code.version");
  const originEl = document.getElementById("origin");
  const siteToggleEl = document.getElementById("siteToggle");
  const autoSuspectedFnOSEl = document.getElementById("autoSuspectedFnOS");
  const styleWindowsEl = document.getElementById("styleWindows");
  const styleMacEl = document.getElementById("styleMac");
  const platformGroupEl = document.getElementById("platformGroup");
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
  const CUSTOM_CSS_LOCAL_KEY = "customCssCode";
  const CUSTOM_JS_LOCAL_KEY = "customJsCode";
  const CUSTOM_CODE_STATUS_DEFAULT = "失焦后自动保存并应用到当前页面";

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

  let brandColor = DEFAULT_BRAND_COLOR;
  let lastSavedBrandColor = null;

  let fontSettings = { ...DEFAULT_FONT_SETTINGS };
  let customCodeSettings = { ...DEFAULT_CUSTOM_CODE_SETTINGS };
  let uploadedFontDataUrl = "";
  let uploadedFontFileName = "";
  let uploadedFontFormat = "";

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
    platformGroupEl.style.display = hasAnyInjectionOptionOn ? "block" : "none";
  }

  function updateFontSettingsVisibility() {
    if (!fontSettingsEl || !fontOverrideEnabledEl) return;
    fontSettingsEl.style.display = fontOverrideEnabledEl.checked ? "grid" : "none";
  }

  function updateCustomCodeSettingsVisibility() {
    if (!customCodeSettingsEl || !customCodeEnabledEl) return;
    customCodeSettingsEl.style.display = customCodeEnabledEl.checked ? "flex" : "none";
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

    const style = styleMacEl.checked ? "mac" : "windows";
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "FNOS_APPLY",
        titlebarStyle: style,
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

  if (!origin || !/^https?:$/.test(pageUrl.protocol)) {
    originEl.textContent = "当前页不是 http/https 页面";
    siteToggleEl.disabled = true;
    autoSuspectedFnOSEl.disabled = true;
    styleWindowsEl.disabled = true;
    styleMacEl.disabled = true;

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
})();
