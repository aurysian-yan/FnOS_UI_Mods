const messageEl = document.getElementById('message');
const injectBtn = document.getElementById('inject-btn');
const restoreBtn = document.getElementById('restore-btn');

const statusIndex = document.getElementById('status-index');
const statusBackup = document.getElementById('status-backup');
const statusIndexMeta = document.getElementById('status-index-meta');
const statusBackupMeta = document.getElementById('status-backup-meta');

const cssFileInput = document.getElementById('css-file');
const jsFileInput = document.getElementById('js-file');
const cssFileHint = document.getElementById('css-file-hint');
const jsFileHint = document.getElementById('js-file-hint');
const cssTextArea = document.getElementById('css-text');
const jsTextArea = document.getElementById('js-text');
const cssPathInput = document.getElementById('css-path');
const jsPathInput = document.getElementById('js-path');
const injectDelayInput = document.getElementById('inject-delay');
const cssEnableToggle = document.getElementById('css-enable');
const jsEnableToggle = document.getElementById('js-enable');
const cssOverview = document.getElementById('css-overview');
const jsOverview = document.getElementById('js-overview');
const cssOverviewDesc = document.querySelector('#css-overview p');
const jsOverviewDesc = document.querySelector('#js-overview p');
const DEFAULT_INJECT_DELAY = 5;

const presetTabBtn = document.getElementById('preset-tab-btn');
const customTabBtn = document.getElementById('custom-tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const modeTabs = document.querySelectorAll('.mode-tab');

const brandColorEl = document.getElementById('brandColor');
const resetBrandColorEl = document.getElementById('resetBrandColor');
const styleWindowsEl = document.getElementById('styleWindows');
const styleMacEl = document.getElementById('styleMac');
const styleClassicLaunchpadEl = document.getElementById('styleClassicLaunchpad');
const styleSpotlightLaunchpadEl = document.getElementById('styleSpotlightLaunchpad');
const launchpadIconScaleEnabledEl = document.getElementById('launchpadIconScaleEnabled');
const launchpadAppListStatusEl = document.getElementById('launchpadAppListStatus');
const launchpadAppListEl = document.getElementById('launchpadAppList');
const fontOverrideEnabledEl = document.getElementById('fontOverrideEnabled');
const fontSettingsEl = document.getElementById('fontSettings');
const fontFamilyEl = document.getElementById('fontFamily');
const fontUrlEl = document.getElementById('fontUrl');
const fontWeightEl = document.getElementById('fontWeight');
const fontFeatureSettingsEl = document.getElementById('fontFeatureSettings');
const customCodeEnabledEl = document.getElementById('customCodeEnabled');
const customCodeSettingsEl = document.getElementById('customCodeSettings');
const customCssEl = document.getElementById('customCss');
const customJsEl = document.getElementById('customJs');

const PRESET_STORAGE_KEY = 'fnos-ui-mods:preset-config';
const DEFAULT_BRAND_COLOR = '#0066ff';
const BRAND_LIGHTNESS_MIN = 0.3;
const BRAND_LIGHTNESS_MAX = 0.7;

const DEFAULT_PRESET_CONFIG = {
  titlebarStyle: 'windows',
  launchpadStyle: 'classic',
  launchpadIconScaleEnabled: false,
  launchpadIconScaleSelectedKeys: [],
  brandColor: DEFAULT_BRAND_COLOR,
  fontOverrideEnabled: false,
  fontFamily: '',
  fontUrl: '',
  fontWeight: '',
  fontFeatureSettings: '',
  customCodeEnabled: false,
  customCss: '',
  customJs: '',
};

const THEME_MODE_MSG = 'fnos-ui-mods:theme-mode';
const THEME_MODE_REQ_MSG = 'fnos-ui-mods:theme-mode:request';
const CHILD_ORIGIN = window.location.origin;
const DEFAULT_PARENT_ORIGIN = `${window.location.protocol}//${window.location.hostname}:5666`;
const QUERY_PARENT_ORIGIN = new URLSearchParams(window.location.search).get('parentOrigin');
const REFERRER_PARENT_ORIGIN = (() => {
  try {
    return document.referrer ? new URL(document.referrer).origin : '';
  } catch (_) {
    return '';
  }
})();
const PARENT_ORIGIN = QUERY_PARENT_ORIGIN || REFERRER_PARENT_ORIGIN || DEFAULT_PARENT_ORIGIN;
const prefersDarkMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let themeModeObserver = null;
let themeModeSyncedFromParent = false;
let activeTab = 'preset';
let launchpadAppItems = [];
let launchpadIconScaleSelectedKeys = [];
let launchpadPollTimer = null;

function apiUrl(path) {
  const cleanPath = path.replace(/^\/+/, '');
  return new URL(cleanPath, window.location.href).toString();
}

function setMessage(text, type = '') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function formatTime(iso) {
  if (!iso) return '未知';
  try {
    return new Date(iso).toLocaleString();
  } catch (err) {
    return iso;
  }
}

async function loadStatus() {
  try {
    const res = await fetch(apiUrl('api/status'));
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || '状态读取失败');

    const status = data.data;
    statusIndex.textContent = status.indexExists ? '已找到' : '未找到';
    statusBackup.textContent = status.backupExists ? '已存在' : '未创建';
    statusIndexMeta.textContent = `${status.indexPath} · ${status.indexMtime ? formatTime(status.indexMtime) : '无时间信息'}`;
    statusBackupMeta.textContent = `${status.backupPath} · ${status.backupMtime ? formatTime(status.backupMtime) : '无时间信息'}`;
  } catch (err) {
    setMessage(err.message || '状态加载失败', 'error');
  }
}

function updateModePanels(cardElement, mode) {
  if (!cardElement) return;
  const panels = cardElement.querySelectorAll('.mode-panel');
  panels.forEach((panel) => {
    if (panel.dataset.mode === mode) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });
}

function getCheckedMode(name) {
  const checked = document.querySelector(`input[name="${name}-mode"]:checked`);
  return checked ? checked.value : 'none';
}

function syncSectionToggle(name) {
  const mode = getCheckedMode(name);
  const enabled = mode !== 'none';

  const toggle = name === 'css' ? cssEnableToggle : jsEnableToggle;
  const overview = name === 'css' ? cssOverview : jsOverview;

  if (toggle) toggle.checked = enabled;
  if (overview) overview.classList.toggle('disabled', !enabled);
}

function setMode(name, mode) {
  const target = document.querySelector(`input[name="${name}-mode"][value="${mode}"]`);
  if (!target) return;
  target.checked = true;
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSectionEnabled(name, enabled) {
  if (enabled) {
    if (getCheckedMode(name) === 'none') {
      setMode(name, 'file');
    } else {
      syncSectionToggle(name);
    }
    return;
  }
  setMode(name, 'none');
}

function wireOverviewDescToggle(name, element) {
  if (!element) return;
  element.addEventListener('click', () => {
    const toggle = name === 'css' ? cssEnableToggle : jsEnableToggle;
    if (!toggle) return;
    toggle.checked = !toggle.checked;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function normalizeThemeMode(mode) {
  return mode === 'dark' ? 'dark' : '';
}

function applyThemeMode(mode) {
  const normalized = normalizeThemeMode(mode);
  if (document.body) {
    document.body.removeAttribute('theme-mode');
  }
  if (normalized === 'dark') {
    document.documentElement.setAttribute('theme-mode', 'dark');
    return;
  }
  document.documentElement.removeAttribute('theme-mode');
}

function getDirectParentThemeMode() {
  try {
    if (window.parent && window.parent !== window && window.parent.document && window.parent.document.body) {
      return {
        available: true,
        mode: window.parent.document.body.getAttribute('theme-mode'),
      };
    }
  } catch (_) {
    // cross-origin or blocked access
  }
  return { available: false, mode: null };
}

function getFallbackThemeMode() {
  if (prefersDarkMedia && prefersDarkMedia.matches) return 'dark';
  return '';
}

function syncThemeModeFromParent() {
  const direct = getDirectParentThemeMode();
  if (direct.available) {
    themeModeSyncedFromParent = true;
    applyThemeMode(direct.mode);
    return;
  }
  applyThemeMode(getFallbackThemeMode());
}

function onThemeMessage(event) {
  const data = event && event.data;
  if (!data || typeof data !== 'object') return;
  if (event.origin !== PARENT_ORIGIN) return;
  if (window.parent && event.source !== window.parent) return;
  if (data.type !== THEME_MODE_MSG) return;
  themeModeSyncedFromParent = true;
  applyThemeMode(data.themeMode);
}

function requestThemeModeFromParent() {
  if (!window.parent || window.parent === window) return;
  try {
    window.parent.postMessage(
      {
        type: THEME_MODE_REQ_MSG,
        childOrigin: CHILD_ORIGIN,
      },
      PARENT_ORIGIN,
    );
  } catch (_) {
    // ignore
  }
}

function onSystemThemeChanged() {
  if (themeModeSyncedFromParent) return;
  applyThemeMode(getFallbackThemeMode());
}

function observeThemeMode() {
  let sourceBody = null;
  try {
    if (window.parent && window.parent !== window && window.parent.document && window.parent.document.body) {
      sourceBody = window.parent.document.body;
    }
  } catch (_) {
    sourceBody = null;
  }

  if (!sourceBody) {
    sourceBody = document.body;
  }
  if (!sourceBody) return;

  themeModeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'theme-mode') {
        syncThemeModeFromParent();
        break;
      }
    }
  });

  themeModeObserver.observe(sourceBody, { attributes: true, attributeFilter: ['theme-mode'] });
}

function wireModeGroup(name) {
  const radios = document.querySelectorAll(`input[name="${name}-mode"]`);
  if (!radios || radios.length === 0) return;
  const card = radios[0].closest('.card');
  const current = getCheckedMode(name);
  updateModePanels(card, current);
  syncSectionToggle(name);

  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      updateModePanels(card, radio.value);
      syncSectionToggle(name);
    });
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

function fileHint(input, hintEl) {
  const file = input.files && input.files[0];
  if (!file) {
    hintEl.textContent = '未选择文件';
    return;
  }
  const size = (file.size / 1024).toFixed(1);
  hintEl.textContent = `${file.name} · ${size} KB`;
}

function normalizeLaunchpadKeyList(value, maxLength = 320) {
  if (!Array.isArray(value)) return [];
  const unique = new Set();
  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const key = item.trim().slice(0, maxLength);
    if (!key) return;
    unique.add(key);
  });
  return Array.from(unique);
}

function normalizeLaunchpadAppItems(items) {
  if (!Array.isArray(items)) return [];
  const keyMap = new Map();
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const key = typeof item.key === 'string' ? item.key.trim().slice(0, 320) : '';
    if (!key) return;
    const titleRaw = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : '';
    const title = titleRaw || key.split('/').pop() || key;
    const iconSrc = typeof item.iconSrc === 'string' ? item.iconSrc.trim() : '';
    keyMap.set(key, { key, title, iconSrc });
  });
  return Array.from(keyMap.values());
}

function setLaunchpadAppListStatus(text) {
  if (!launchpadAppListStatusEl) return;
  launchpadAppListStatusEl.textContent = text;
}

function renderLaunchpadAppList() {
  if (!launchpadAppListEl) return;

  if (!launchpadAppItems.length) {
    launchpadAppListEl.textContent = '暂无数据';
    return;
  }

  const selectedSet = new Set(launchpadIconScaleSelectedKeys);
  const fragment = document.createDocumentFragment();

  launchpadAppItems.forEach(({ key, title, iconSrc }) => {
    const itemEl = document.createElement('label');
    itemEl.className = 'launchpad-app-item';

    const checkboxEl = document.createElement('input');
    checkboxEl.type = 'checkbox';
    checkboxEl.dataset.launchpadKey = key;
    checkboxEl.checked = selectedSet.has(key);

    const textWrapEl = document.createElement('span');
    textWrapEl.className = 'launchpad-app-text';

    const titleRowEl = document.createElement('span');
    titleRowEl.className = 'launchpad-app-title-row';

    const iconEl = document.createElement('img');
    iconEl.className = 'launchpad-app-icon';
    iconEl.alt = '';
    if (iconSrc) {
      iconEl.src = iconSrc;
      iconEl.referrerPolicy = 'no-referrer';
      iconEl.addEventListener('error', () => {
        iconEl.style.visibility = 'hidden';
      });
    } else {
      iconEl.style.visibility = 'hidden';
    }

    const titleEl = document.createElement('span');
    titleEl.textContent = title;

    const keyEl = document.createElement('span');
    keyEl.className = 'launchpad-app-key';
    keyEl.textContent = key;

    titleRowEl.appendChild(iconEl);
    titleRowEl.appendChild(titleEl);
    textWrapEl.appendChild(titleRowEl);
    textWrapEl.appendChild(keyEl);

    itemEl.appendChild(checkboxEl);
    itemEl.appendChild(textWrapEl);
    fragment.appendChild(itemEl);
  });

  launchpadAppListEl.textContent = '';
  launchpadAppListEl.appendChild(fragment);
}

async function loadLaunchpadAppItems() {
  try {
    const res = await fetch(apiUrl('api/launchpad/apps'), { cache: 'no-store' });
    const payload = await res.json();
    if (!payload.ok) {
      throw new Error(payload.message || '启动台应用列表读取失败');
    }

    const report = payload.data || {};
    launchpadAppItems = normalizeLaunchpadAppItems(report.items || []);
    launchpadIconScaleSelectedKeys = normalizeLaunchpadKeyList(launchpadIconScaleSelectedKeys);
    renderLaunchpadAppList();

    if (launchpadAppItems.length > 0) {
      const updatedAtText = report.updatedAt ? `，最近更新：${formatTime(report.updatedAt)}` : '';
      const fromCli = typeof report.source === 'string' && report.source.startsWith('appcenter-cli');
      if (fromCli) {
        setLaunchpadAppListStatus(`应用列表：${launchpadAppItems.length} 项（来自 appcenter-cli 估算，打开启动台后会自动修正）`);
      } else {
        setLaunchpadAppListStatus(`应用列表：${launchpadAppItems.length} 项${updatedAtText}`);
      }
      return;
    }

    setLaunchpadAppListStatus('应用列表：等待启动台页面上报（打开启动台后自动同步）');
  } catch (_) {
    setLaunchpadAppListStatus('应用列表：读取失败，稍后自动重试');
  }
}

function ensureLaunchpadPolling() {
  if (launchpadPollTimer) return;
  launchpadPollTimer = window.setInterval(() => {
    if (activeTab !== 'preset') return;
    loadLaunchpadAppItems().catch(() => {});
  }, 3000);
}

async function getPayloadForSection(mode, fileInput, textArea, pathInput, label) {
  if (mode === 'none') {
    return { text: '', path: '' };
  }

  if (mode === 'file') {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      throw new Error(`${label} 未选择文件`);
    }
    return { text: (await readFileAsText(file)).trim(), path: '' };
  }

  if (mode === 'text') {
    const text = textArea.value.trim();
    if (!text) {
      throw new Error(`${label} 编辑内容为空`);
    }
    return { text, path: '' };
  }

  if (mode === 'path') {
    const pathValue = pathInput.value.trim();
    if (!pathValue) {
      throw new Error(`${label} 路径为空`);
    }
    return { text: '', path: pathValue };
  }

  return { text: '', path: '' };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
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
  let h = 0;

  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }

  h /= 6;
  return { h, s, l };
}

function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return null;
  if (hex.length === 4) {
    return `#${hex.slice(1).split('').map((c) => c + c).join('')}`;
  }
  return hex;
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

function clampBrandLightness(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return DEFAULT_BRAND_COLOR;

  const intValue = Number.parseInt(normalized.slice(1), 16);
  const rgb = {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const clampedL = Math.min(BRAND_LIGHTNESS_MAX, Math.max(BRAND_LIGHTNESS_MIN, hsl.l));
  return rgbToHex(hslToRgb(hsl.h, hsl.s, clampedL));
}

function getCurrentPresetConfig() {
  const titlebarStyle = styleMacEl && styleMacEl.checked ? 'mac' : 'windows';
  const launchpadStyle = styleSpotlightLaunchpadEl && styleSpotlightLaunchpadEl.checked ? 'spotlight' : 'classic';
  const brandColor = clampBrandLightness(brandColorEl ? brandColorEl.value : DEFAULT_BRAND_COLOR);

  return {
    titlebarStyle,
    launchpadStyle,
    launchpadIconScaleEnabled: Boolean(launchpadIconScaleEnabledEl && launchpadIconScaleEnabledEl.checked),
    launchpadIconScaleSelectedKeys: normalizeLaunchpadKeyList(launchpadIconScaleSelectedKeys),
    brandColor,
    fontOverrideEnabled: Boolean(fontOverrideEnabledEl && fontOverrideEnabledEl.checked),
    fontFamily: fontFamilyEl ? fontFamilyEl.value.trim() : '',
    fontUrl: fontUrlEl ? fontUrlEl.value.trim() : '',
    fontWeight: fontWeightEl ? fontWeightEl.value.trim() : '',
    fontFeatureSettings: fontFeatureSettingsEl ? fontFeatureSettingsEl.value.trim() : '',
    customCodeEnabled: Boolean(customCodeEnabledEl && customCodeEnabledEl.checked),
    customCss: customCssEl ? customCssEl.value : '',
    customJs: customJsEl ? customJsEl.value : '',
  };
}

function getPresetAssetBaseUrl() {
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '127.0.0.1';
  return `${protocol}//${hostname}:8964`;
}

function updateFontSettingsVisibility() {
  if (!fontSettingsEl || !fontOverrideEnabledEl) return;
  fontSettingsEl.style.display = fontOverrideEnabledEl.checked ? 'grid' : 'none';
}

function updateCustomCodeSettingsVisibility() {
  if (!customCodeSettingsEl || !customCodeEnabledEl) return;
  customCodeSettingsEl.style.display = customCodeEnabledEl.checked ? 'grid' : 'none';
}

function savePresetConfig() {
  try {
    const config = getCurrentPresetConfig();
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(config));
  } catch (_) {
    // ignore
  }
}

function setPresetConfig(nextConfig) {
  const merged = { ...DEFAULT_PRESET_CONFIG, ...(nextConfig || {}) };

  const brand = clampBrandLightness(typeof merged.brandColor === 'string' ? merged.brandColor : DEFAULT_BRAND_COLOR);
  if (brandColorEl) brandColorEl.value = brand;

  if (styleWindowsEl) styleWindowsEl.checked = merged.titlebarStyle !== 'mac';
  if (styleMacEl) styleMacEl.checked = merged.titlebarStyle === 'mac';
  if (styleClassicLaunchpadEl) styleClassicLaunchpadEl.checked = merged.launchpadStyle !== 'spotlight';
  if (styleSpotlightLaunchpadEl) styleSpotlightLaunchpadEl.checked = merged.launchpadStyle === 'spotlight';
  if (launchpadIconScaleEnabledEl) launchpadIconScaleEnabledEl.checked = Boolean(merged.launchpadIconScaleEnabled);
  launchpadIconScaleSelectedKeys = normalizeLaunchpadKeyList(merged.launchpadIconScaleSelectedKeys);

  if (fontOverrideEnabledEl) fontOverrideEnabledEl.checked = Boolean(merged.fontOverrideEnabled);
  if (fontFamilyEl) fontFamilyEl.value = typeof merged.fontFamily === 'string' ? merged.fontFamily : '';
  if (fontUrlEl) fontUrlEl.value = typeof merged.fontUrl === 'string' ? merged.fontUrl : '';
  if (fontWeightEl) fontWeightEl.value = typeof merged.fontWeight === 'string' ? merged.fontWeight : '';
  if (fontFeatureSettingsEl) {
    fontFeatureSettingsEl.value = typeof merged.fontFeatureSettings === 'string' ? merged.fontFeatureSettings : '';
  }

  if (customCodeEnabledEl) customCodeEnabledEl.checked = Boolean(merged.customCodeEnabled);
  if (customCssEl) customCssEl.value = typeof merged.customCss === 'string' ? merged.customCss : '';
  if (customJsEl) customJsEl.value = typeof merged.customJs === 'string' ? merged.customJs : '';

  updateFontSettingsVisibility();
  updateCustomCodeSettingsVisibility();
  renderLaunchpadAppList();
}

function loadPresetConfig() {
  let saved = null;
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    saved = raw ? JSON.parse(raw) : null;
  } catch (_) {
    saved = null;
  }

  setPresetConfig(saved || DEFAULT_PRESET_CONFIG);
}

function setActiveTab(tab) {
  activeTab = tab === 'custom' ? 'custom' : 'preset';

  modeTabs.forEach((tabBtn) => {
    const selected = tabBtn.dataset.tabTarget === activeTab;
    tabBtn.classList.toggle('is-active', selected);
    tabBtn.setAttribute('aria-selected', selected ? 'true' : 'false');
  });

  tabPanels.forEach((panel) => {
    const selected = panel.dataset.tab === activeTab;
    panel.classList.toggle('is-active', selected);
  });

  if (activeTab === 'preset') {
    loadLaunchpadAppItems().catch(() => {});
  }
}

async function handleInject() {
  setMessage('');
  injectBtn.disabled = true;
  restoreBtn.disabled = true;

  try {
    const delayRaw = injectDelayInput ? injectDelayInput.value.trim() : '';
    const injectDelaySec = delayRaw ? Number(delayRaw) : DEFAULT_INJECT_DELAY;

    if (!Number.isFinite(injectDelaySec) || injectDelaySec < 0 || injectDelaySec > 120) {
      throw new Error('注入延时无效 (0-120 秒)');
    }

    if (activeTab === 'preset') {
      const presetConfig = getCurrentPresetConfig();
      const res = await fetch(apiUrl('api/inject'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          injectMode: 'preset',
          presetConfig,
          assetBaseUrl: getPresetAssetBaseUrl(),
          injectDelaySec,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.message || '注入失败');
      setMessage(data.message || '注入成功', 'ok');
      savePresetConfig();
      await loadStatus();
      return;
    }

    const cssMode = document.querySelector('input[name="css-mode"]:checked').value;
    const jsMode = document.querySelector('input[name="js-mode"]:checked').value;

    if (cssMode === 'none' && jsMode === 'none') {
      throw new Error('请至少选择 CSS 或 JS 之一进行注入');
    }

    const [cssPayload, jsPayload] = await Promise.all([
      getPayloadForSection(cssMode, cssFileInput, cssTextArea, cssPathInput, 'CSS'),
      getPayloadForSection(jsMode, jsFileInput, jsTextArea, jsPathInput, 'JS'),
    ]);

    const res = await fetch(apiUrl('api/inject'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        injectMode: 'custom',
        cssText: cssPayload.text || '',
        jsText: jsPayload.text || '',
        cssPath: cssPayload.path || '',
        jsPath: jsPayload.path || '',
        injectDelaySec,
      }),
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.message || '注入失败');

    setMessage(data.message || '注入成功', 'ok');
    await loadStatus();
  } catch (err) {
    setMessage(err.message || '注入失败', 'error');
  } finally {
    injectBtn.disabled = false;
    restoreBtn.disabled = false;
  }
}

async function handleRestore() {
  setMessage('');
  const confirmed = window.confirm('确认还原到官方默认状态？此操作会覆盖当前注入内容。');
  if (!confirmed) return;

  injectBtn.disabled = true;
  restoreBtn.disabled = true;

  try {
    const res = await fetch(apiUrl('api/restore'), { method: 'POST' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.message || '还原失败');
    setMessage(data.message || '还原完成', 'ok');
    await loadStatus();
  } catch (err) {
    setMessage(err.message || '还原失败', 'error');
  } finally {
    injectBtn.disabled = false;
    restoreBtn.disabled = false;
  }
}

cssFileInput.addEventListener('change', () => fileHint(cssFileInput, cssFileHint));
jsFileInput.addEventListener('change', () => fileHint(jsFileInput, jsFileHint));

injectBtn.addEventListener('click', handleInject);
restoreBtn.addEventListener('click', handleRestore);
cssEnableToggle?.addEventListener('change', () => setSectionEnabled('css', cssEnableToggle.checked));
jsEnableToggle?.addEventListener('change', () => setSectionEnabled('js', jsEnableToggle.checked));
wireOverviewDescToggle('css', cssOverviewDesc);
wireOverviewDescToggle('js', jsOverviewDesc);

presetTabBtn?.addEventListener('click', () => setActiveTab('preset'));
customTabBtn?.addEventListener('click', () => setActiveTab('custom'));

fontOverrideEnabledEl?.addEventListener('change', () => {
  updateFontSettingsVisibility();
  savePresetConfig();
});
customCodeEnabledEl?.addEventListener('change', () => {
  updateCustomCodeSettingsVisibility();
  savePresetConfig();
});
launchpadIconScaleEnabledEl?.addEventListener('change', savePresetConfig);

launchpadAppListEl?.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.type !== 'checkbox') return;
  const key = typeof target.dataset.launchpadKey === 'string' ? target.dataset.launchpadKey.trim() : '';
  if (!key) return;

  const selectedSet = new Set(launchpadIconScaleSelectedKeys);
  if (target.checked) {
    selectedSet.add(key);
  } else {
    selectedSet.delete(key);
  }
  launchpadIconScaleSelectedKeys = Array.from(selectedSet);
  savePresetConfig();
});

resetBrandColorEl?.addEventListener('click', () => {
  if (!brandColorEl) return;
  brandColorEl.value = DEFAULT_BRAND_COLOR;
  savePresetConfig();
});

[
  brandColorEl,
  styleWindowsEl,
  styleMacEl,
  styleClassicLaunchpadEl,
  styleSpotlightLaunchpadEl,
  fontFamilyEl,
  fontUrlEl,
  fontWeightEl,
  fontFeatureSettingsEl,
  customCssEl,
  customJsEl,
].forEach((el) => {
  el?.addEventListener('change', savePresetConfig);
  el?.addEventListener('blur', savePresetConfig);
});

window.addEventListener('message', onThemeMessage);
window.addEventListener('focus', requestThemeModeFromParent);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestThemeModeFromParent();
  }
});
if (prefersDarkMedia) {
  if (typeof prefersDarkMedia.addEventListener === 'function') {
    prefersDarkMedia.addEventListener('change', onSystemThemeChanged);
  } else if (typeof prefersDarkMedia.addListener === 'function') {
    prefersDarkMedia.addListener(onSystemThemeChanged);
  }
}

syncThemeModeFromParent();
observeThemeMode();
requestThemeModeFromParent();

wireModeGroup('css');
wireModeGroup('js');
loadPresetConfig();
setActiveTab('preset');
loadStatus();
loadLaunchpadAppItems().catch(() => {});
ensureLaunchpadPolling();
