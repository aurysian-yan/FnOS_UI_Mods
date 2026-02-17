window.figmaSquircleConfig = {
    ".semi-switch": { cornerRadius: 999, smoothing:1 }
};
// 从全局配置应用 Figma Squircle
function applyFigmaSquirclesFromConfig() {
    if (typeof window.figmaSquircleConfig !== 'object' || !window.figmaSquircleConfig) return;

    // 存储已处理的元素及其 ResizeObserver
    const processedElements = new WeakMap();

    // 创建LRU缓存，限制最大数量
    const LRU_CACHE_SIZE = 1000;
    const squircleCache = new Map();

    // 清理超出LRU_CACHE_SIZE的旧缓存项
    function cleanupCache() {
        if (squircleCache.size > LRU_CACHE_SIZE) {
            const firstKey = squircleCache.keys().next().value;
            const svgElement = document.getElementById(firstKey + '-svg');
            if (svgElement) svgElement.remove();
            squircleCache.delete(firstKey);
        }
    }

    // 应用 squircle 到单个元素
    function applyToElement(el, radius, smoothing) {
        const rect = el.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        
        // 检查是否有相同参数的缓存
        const cacheKey = `squircle-w${width}h${height}r${radius}s${smoothing}`;

        // 清理旧的 clip-path（移除旧 SVG）
        const oldId = el.dataset.squircleId;
        if (oldId && oldId !== cacheKey) {
            const oldSvg = document.getElementById(oldId + '-svg');
            if (oldSvg) oldSvg.remove();
        }

        // 生成新的ID作为缓存键
        el.dataset.squircleId = cacheKey;

        // 应用新 squircle
        if (typeof window.applyFigmaSquircle === 'function') {
            window.applyFigmaSquircle(el, radius, smoothing, cacheKey);
            
            // 添加到缓存
            squircleCache.set(cacheKey, `url(#${cacheKey})`);
            cleanupCache(); // 清理超出限制的缓存
        }
    }

    // 处理所有匹配的类
    function processAllClasses() {
        Object.entries(window.figmaSquircleConfig).forEach(([cssClass, config]) => {
            const radius = parseFloat(config.cornerRadius) || 16;
            const smoothing = parseFloat(config.smoothing) || 1;

            document.querySelectorAll(cssClass).forEach(el => {
                // 避免重复初始化
                if (processedElements.has(el)) return;

                // 首次应用
                applyToElement(el, radius, smoothing);

                // 监听尺寸变化
                const resizeObserver = new ResizeObserver(() => {
                    requestAnimationFrame(() => {
                        applyToElement(el, radius, smoothing);
                    });
                });
                resizeObserver.observe(el);
                processedElements.set(el, resizeObserver);
            });
        });
    }

    // 初始处理
    processAllClasses();

    // 监听 DOM 变化（新增/删除元素）
    const mutationObserver = new MutationObserver(() => {
        processAllClasses();
    });

    mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 可选：暴露清理函数（一般不需要）
    window._cleanupSquircleObservers = () => {
        mutationObserver.disconnect();
        processedElements.forEach((ro, el) => ro.disconnect());
        processedElements.clear();
        // 清理缓存中的所有SVG元素
        squircleCache.forEach((_, key) => {
            const svgElement = document.getElementById(key + '-svg');
            if (svgElement) svgElement.remove();
        });
        squircleCache.clear();
    };
}


// figma-squircle-web.js
// 适用于网页的 Figma 平滑圆角实现（clip-path）
// 26.1.27: 支持平滑横向胶囊！

(function () {
    'use strict';

    function toRadians(degrees) {
        return (degrees * Math.PI) / 180;
    }

    function f(num) {
        // 格式化数字，保留4位小数，去除尾随0（可选），但确保是字符串
        return num.toFixed(4).replace(/\.?0+$/, '');
    }

    function getPathParamsForCorner(params) {
        var cornerRadius = params.cornerRadius;
        var cornerSmoothing = params.cornerSmoothing;
        var preserveSmoothing = params.preserveSmoothing;
        var roundingAndSmoothingBudget = params.roundingAndSmoothingBudget;

        var p = (1 + cornerSmoothing) * cornerRadius;

        if (!preserveSmoothing) {
            var maxCornerSmoothing = roundingAndSmoothingBudget / cornerRadius - 1;
            cornerSmoothing = Math.min(cornerSmoothing, Math.max(0, maxCornerSmoothing));
            p = Math.min(p, roundingAndSmoothingBudget);
        }

        var arcMeasure = 90 * (1 - cornerSmoothing);
        var arcSectionLength = Math.sin(toRadians(arcMeasure / 2)) * cornerRadius * Math.sqrt(2);
        var angleAlpha = (90 - arcMeasure) / 2;
        var p3ToP4Distance = cornerRadius * Math.tan(toRadians(angleAlpha / 2));
        var angleBeta = 45 * cornerSmoothing;
        var c = p3ToP4Distance * Math.cos(toRadians(angleBeta));
        var d = c * Math.tan(toRadians(angleBeta));

        var b = (p - arcSectionLength - c - d) / 3;
        var a = 2 * b;

        if (preserveSmoothing && p > roundingAndSmoothingBudget) {
            var p1ToP3MaxDistance = roundingAndSmoothingBudget - d - arcSectionLength - c;
            var minA = p1ToP3MaxDistance / 6;
            var maxB = p1ToP3MaxDistance - minA;
            b = Math.min(b, maxB);
            a = p1ToP3MaxDistance - b;
            p = roundingAndSmoothingBudget;
        }

        return { a: a, b: b, c: c, d: d, p: p, cornerRadius: cornerRadius, arcSectionLength: arcSectionLength };
    }

    function drawTopRightPath(p) {
        if (p.cornerRadius) {
            return 'c ' + f(p.a) + ' 0 ' + f(p.a + p.b) + ' 0 ' + f(p.a + p.b + p.c) + ' ' + f(p.d) +
                ' a ' + f(p.cornerRadius) + ' ' + f(p.cornerRadius) + ' 0 0 1 ' + f(p.arcSectionLength) + ' ' + f(p.arcSectionLength) +
                ' c ' + f(p.d) + ' ' + f(p.c) + ' ' + f(p.d) + ' ' + f(p.b + p.c) + ' ' + f(p.d) + ' ' + f(p.a + p.b + p.c);
        } else {
            return 'l ' + f(p.p) + ' 0';
        }
    }

    function drawBottomRightPath(p) {
        if (p.cornerRadius) {
            return 'c 0 ' + f(p.a) + ' 0 ' + f(p.a + p.b) + ' ' + f(-p.d) + ' ' + f(p.a + p.b + p.c) +
                ' a ' + f(p.cornerRadius) + ' ' + f(p.cornerRadius) + ' 0 0 1 ' + f(-p.arcSectionLength) + ' ' + f(p.arcSectionLength) +
                ' c ' + f(-p.c) + ' ' + f(p.d) + ' ' + f(-(p.b + p.c)) + ' ' + f(p.d) + ' ' + f(-(p.a + p.b + p.c)) + ' ' + f(p.d);
        } else {
            return 'l 0 ' + f(p.p);
        }
    }

    function drawBottomLeftPath(p) {
        if (p.cornerRadius) {
            return 'c ' + f(-p.a) + ' 0 ' + f(-(p.a + p.b)) + ' 0 ' + f(-(p.a + p.b + p.c)) + ' ' + f(-p.d) +
                ' a ' + f(p.cornerRadius) + ' ' + f(p.cornerRadius) + ' 0 0 1 ' + f(-p.arcSectionLength) + ' ' + f(-p.arcSectionLength) +
                ' c ' + f(-p.d) + ' ' + f(-p.c) + ' ' + f(-p.d) + ' ' + f(-(p.b + p.c)) + ' ' + f(-p.d) + ' ' + f(-(p.a + p.b + p.c));
        } else {
            return 'l ' + f(-p.p) + ' 0';
        }
    }

    function drawTopLeftPath(p) {
        if (p.cornerRadius) {
            return 'c 0 ' + f(-p.a) + ' 0 ' + f(-(p.a + p.b)) + ' ' + f(p.d) + ' ' + f(-(p.a + p.b + p.c)) +
                ' a ' + f(p.cornerRadius) + ' ' + f(p.cornerRadius) + ' 0 0 1 ' + f(p.arcSectionLength) + ' ' + f(-p.arcSectionLength) +
                ' c ' + f(p.c) + ' ' + f(-p.d) + ' ' + f(p.b + p.c) + ' ' + f(-p.d) + ' ' + f(p.a + p.b + p.c) + ' ' + f(-p.d);
        } else {
            return 'l 0 ' + f(-p.p);
        }
    }

    function getSVGPathFromPathParams(params) {
        var w = params.width;
        var h = params.height;
        var tl = params.topLeftPathParams;
        var tr = params.topRightPathParams;
        var bl = params.bottomLeftPathParams;
        var br = params.bottomRightPathParams;

        var path = [
            'M', f(w - tr.p), '0',
            drawTopRightPath(tr),
            'L', f(w), f(h - br.p),
            drawBottomRightPath(br),
            'L', f(bl.p), f(h),
            drawBottomLeftPath(bl),
            'L', '0', f(tl.p),
            drawTopLeftPath(tl),
            'Z'
        ].join(' ');

        return path.replace(/\s+/g, ' ').trim();
    }

    function getSquirclePath(width, height, cornerRadius, cornerSmoothing) {
        var budget = Math.min(width, height) / 2;
        var actualRadius = Math.min(cornerRadius, budget);
        var pathParams = getPathParamsForCorner({
            cornerRadius: actualRadius,
            cornerSmoothing: cornerSmoothing,
            preserveSmoothing: false,
            roundingAndSmoothingBudget: budget
        });
        return getSVGPathFromPathParams({
            width: width,
            height: height,
            topLeftPathParams: pathParams,
            topRightPathParams: pathParams,
            bottomLeftPathParams: pathParams,
            bottomRightPathParams: pathParams
        });
    }

    function getSmoothCapsulePath(width, height, cornerSmoothing) {
        var minSide = height;
        var circleSize = minSide * 0.98;
        var r = circleSize / 2;
        var cy = height / 2;

        var rMid = minSide * 0.28;
        var rOuter = minSide * 0.5;
        var midWidth = width - (rOuter - rMid) * 2;
        if (midWidth < 0) midWidth = 0;

        var midPath = getSquirclePath(
            midWidth,
            height,
            rMid,
            cornerSmoothing
        );

        var midX = (width - midWidth) / 2;
        var translatedMidPath = midPath.replace(
            /([MLCA])\s*([-\d.]+)\s+([-\d.]+)/g,
            function (_, cmd, x, y) {
                return cmd + ' ' + f(parseFloat(x) + midX) + ' ' + y;
            }
        );

        var leftCx = r;
        var rightCx = width - r;

        var leftCirclePath = [
            'M', f(leftCx + r), f(cy),
            'A', f(r), f(r), '0 1 0', f(leftCx - r), f(cy),
            'A', f(r), f(r), '0 1 0', f(leftCx + r), f(cy),
            'Z'
        ].join(' ');

        var rightCirclePath = [
            'M', f(rightCx + r), f(cy),
            'A', f(r), f(r), '0 1 0', f(rightCx - r), f(cy),
            'A', f(r), f(r), '0 1 0', f(rightCx + r), f(cy),
            'Z'
        ].join(' ');

        return {
            left: leftCirclePath,
            middle: translatedMidPath,
            right: rightCirclePath
        };
    }

    window.applyFigmaSquircle = function (element, cornerRadius, cornerSmoothing, cacheKey) {
        if (cornerRadius === undefined) cornerRadius = 16;
        if (cornerSmoothing === undefined) cornerSmoothing = 1;

        var rect = element.getBoundingClientRect();
        var width = rect.width;
        var height = rect.height;

        if (width <= 0 || height <= 0) return;

        var isCapsule = cornerRadius >= height / 2 && width > height;

        var pathData = isCapsule
            ? getSmoothCapsulePath(width, height, cornerSmoothing)
            : getSquirclePath(width, height, cornerRadius, cornerSmoothing);

        // 使用提供的缓存键
        var id = cacheKey;

        // 检查是否存在具有相同ID的SVG元素，如果存在则更新它
        var existingSvg = document.getElementById(id + '-svg');
        if (existingSvg) {
            // 更新现有的SVG而不是创建新的
            var existingClipPath = existingSvg.querySelector('clipPath');
            if (existingClipPath) {
                // 移除现有的路径元素
                while (existingClipPath.firstChild) {
                    existingClipPath.removeChild(existingClipPath.firstChild);
                }
                
                if (isCapsule) {
                    var paths = pathData; // 现在是 { left, middle, right }

                    ['left', 'middle', 'right'].forEach(function (key) {
                        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        p.setAttribute('d', paths[key]);
                        p.setAttribute('fill', 'white');
                        existingClipPath.appendChild(p);
                    });
                } else {
                    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    p.setAttribute('d', pathData);
                    p.setAttribute('fill', 'white');
                    existingClipPath.appendChild(p);
                }
            }
        } else {
            // 创建新的SVG元素
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '0');
            svg.setAttribute('height', '0');
            svg.style.position = 'absolute';
            svg.style.pointerEvents = 'none';
            svg.id = id + '-svg'; // 添加ID用于后续清理

            var clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipPath.setAttribute('id', id);
            clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse');

            if (isCapsule) {
                var paths = pathData; // 现在是 { left, middle, right }

                ['left', 'middle', 'right'].forEach(function (key) {
                    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    p.setAttribute('d', paths[key]);
                    p.setAttribute('fill', 'white');
                    clipPath.appendChild(p);
                });
            } else {
                var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                p.setAttribute('d', pathData);
                p.setAttribute('fill', 'white');
                clipPath.appendChild(p);
            }

            svg.appendChild(clipPath);
            document.body.appendChild(svg);
        }

        element.style.clipPath = 'url(#' + id + ')';
        element.style.webkitClipPath = 'url(#' + id + ')';
    };

    window.initFigmaSquircles = function () {
        document.querySelectorAll('.figma-squircle').forEach(function (el) {
            var radius = parseFloat(el.dataset.cornerRadius) || 16;
            var smoothing = parseFloat(el.dataset.smoothing) || 0.6;
            window.applyFigmaSquircle(el, radius, smoothing);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initFigmaSquircles);
    } else {
        window.initFigmaSquircles();
    }

})();

function setupAppWindowAnimations() {
    if (window._fnosWindowAnimationInitialized) return;
    window._fnosWindowAnimationInitialized = true;

    const WINDOW_ENTER_CLASS = 'fnos-window--enter';
    const WINDOW_EXIT_CLASS = 'fnos-window--exit';
    const WINDOW_EXIT_CLOSE_CLASS = 'fnos-window--exit-close';
    const WINDOW_EXIT_MINIMIZE_CLASS = 'fnos-window--exit-minimize';
    const WINDOW_RESTORE_CLASS = 'fnos-window--restore';
    const ENTER_DURATION_MS = 300;
    const EXIT_DURATION_MS = 600;
    const RESTORE_DURATION_MS = 600;
    const animatedWindows = new WeakSet();
    const windowVisibility = new WeakMap();
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    function shouldReduceMotion() {
        return !!reduceMotionQuery && reduceMotionQuery.matches;
    }

    function parseAnimationDurationMs(durationValue, fallbackMs) {
        if (typeof durationValue !== 'string' || !durationValue.trim()) return fallbackMs;

        const parts = durationValue
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
        if (!parts.length) return fallbackMs;

        let maxMs = 0;
        parts.forEach((item) => {
            if (item.endsWith('ms')) {
                const value = Number.parseFloat(item.slice(0, -2));
                if (Number.isFinite(value)) maxMs = Math.max(maxMs, value);
                return;
            }
            if (item.endsWith('s')) {
                const value = Number.parseFloat(item.slice(0, -1));
                if (Number.isFinite(value)) maxMs = Math.max(maxMs, value * 1000);
            }
        });

        return maxMs > 0 ? maxMs : fallbackMs;
    }

    function getCurrentAnimationDurationMs(windowEl, fallbackMs) {
        if (!(windowEl instanceof HTMLElement)) return fallbackMs;
        const computedStyle = window.getComputedStyle(windowEl);
        return parseAnimationDurationMs(computedStyle.animationDuration, fallbackMs);
    }

    function isWindowVisible(windowEl) {
        if (!(windowEl instanceof HTMLElement)) return false;
        if (!document.body || !document.body.contains(windowEl)) return false;

        const styles = window.getComputedStyle(windowEl);
        if (styles.display === 'none' || styles.visibility === 'hidden') return false;
        return windowEl.getClientRects().length > 0;
    }

    function normalizeIconKey(src) {
        if (typeof src !== 'string' || !src.trim()) return '';
        try {
            const url = new URL(src, window.location.origin);
            let path = url.pathname.toLowerCase();
            path = path.replace(/icon_\{0\}\.png$/, 'icon.png');
            return path;
        } catch {
            return src.split('?')[0].toLowerCase();
        }
    }

    function getWindowIconKey(windowEl) {
        if (!(windowEl instanceof HTMLElement)) return '';
        const img = windowEl.querySelector('.trim-ui__app-layout--header-title img');
        if (!(img instanceof HTMLImageElement)) return '';
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        return normalizeIconKey(src);
    }

    function getTaskbarIconEntries() {
        const navRoot = document.querySelector('.h-screen.fixed.left-0');
        if (!(navRoot instanceof Element)) return [];

        const icons = Array.from(navRoot.querySelectorAll('img'));
        return icons
            .map((img) => {
                if (!(img instanceof HTMLImageElement)) return null;
                const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                const key = normalizeIconKey(src);
                if (!key) return null;
                if (!key.includes('/static/app/icons/') && !key.includes('/app-center-static/serviceicon/')) {
                    return null;
                }

                const clickable =
                    img.closest('[tabindex]') ||
                    img.closest('.flex.h-9') ||
                    img.closest('.flex.h-10.w-\\[47px\\]') ||
                    img;
                if (!(clickable instanceof HTMLElement)) return null;

                const rect = clickable.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return null;

                return {
                    key,
                    rect,
                    size: Math.max(1, Math.min(rect.width, rect.height))
                };
            })
            .filter(Boolean);
    }

    function resolveTaskbarTarget(windowEl) {
        const taskbarEntries = getTaskbarIconEntries();
        if (!taskbarEntries.length) return null;

        const allWindows = Array.from(document.querySelectorAll('.trim-ui__app-layout--window'));
        const globalWindowIndex = allWindows.indexOf(windowEl);
        const safeGlobalIndex = globalWindowIndex >= 0 ? globalWindowIndex : 0;

        const windowIconKey = getWindowIconKey(windowEl);
        let candidates = taskbarEntries;
        let targetIndex = safeGlobalIndex;

        if (windowIconKey) {
            const sameAppEntries = taskbarEntries.filter((entry) => entry.key === windowIconKey);
            if (sameAppEntries.length) {
                const sameAppWindows = allWindows.filter((item) => getWindowIconKey(item) === windowIconKey);
                const sameAppIndex = sameAppWindows.indexOf(windowEl);
                candidates = sameAppEntries;
                targetIndex = sameAppIndex >= 0 ? sameAppIndex : 0;
            }
        }

        const resolved = candidates[Math.min(targetIndex, candidates.length - 1)] || candidates[0];
        if (!resolved) return null;

        return {
            x: resolved.rect.left + resolved.rect.width * 0.5,
            y: resolved.rect.top + resolved.rect.height * 0.5,
            size: resolved.size
        };
    }

    function animateWindowRestore(windowEl) {
        if (!(windowEl instanceof HTMLElement)) return;
        if (shouldReduceMotion()) return;
        if (!isWindowVisible(windowEl)) return;

        windowEl.classList.remove(
            WINDOW_ENTER_CLASS,
            WINDOW_EXIT_CLASS,
            WINDOW_EXIT_CLOSE_CLASS,
            WINDOW_EXIT_MINIMIZE_CLASS
        );
        windowEl.classList.add(WINDOW_RESTORE_CLASS);

        const restoreDurationMs = getCurrentAnimationDurationMs(windowEl, RESTORE_DURATION_MS);
        window.setTimeout(() => {
            windowEl.classList.remove(WINDOW_RESTORE_CLASS);
        }, restoreDurationMs);
    }

    function updateWindowVisibility(windowEl) {
        if (!(windowEl instanceof HTMLElement)) return;

        const isVisible = isWindowVisible(windowEl);
        const previousVisible = windowVisibility.get(windowEl);
        windowVisibility.set(windowEl, isVisible);

        if (
            previousVisible === false &&
            isVisible &&
            windowEl.dataset.fnosWindowRestorePending === '1'
        ) {
            animateWindowRestore(windowEl);
            windowEl.removeAttribute('data-fnos-window-restore-pending');
        }
    }

    function setMinimizeMotionVars(windowEl) {
        if (!(windowEl instanceof HTMLElement)) return;

        const rect = windowEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const windowCenterX = rect.left + rect.width * 0.5;
        const windowCenterY = rect.top + rect.height * 0.5;

        // 优先飞向对应任务栏图标中心；匹配不到时回退到左侧中线
        const resolvedTarget = resolveTaskbarTarget(windowEl);
        const targetX = resolvedTarget ? resolvedTarget.x : Math.max(34, viewportWidth * 0.022);
        const targetY = resolvedTarget ? resolvedTarget.y : viewportHeight * 0.50;
        const deltaX = targetX - windowCenterX;
        const deltaY = targetY - windowCenterY;

        // 目标缩放到接近对应图标尺寸，避免不同窗口大小下观感差异过大
        const targetSize = resolvedTarget ? resolvedTarget.size : 64;
        const widthScale = targetSize / Math.max(rect.width, 1);
        const heightScale = targetSize / Math.max(rect.height, 1);
        const minimizeScale = Math.max(0.08, Math.min(0.26, Math.min(widthScale, heightScale)));

        windowEl.style.setProperty('--fnos-window-minimize-dx', `${deltaX}px`);
        windowEl.style.setProperty('--fnos-window-minimize-dy', `${deltaY}px`);
        windowEl.style.setProperty('--fnos-window-minimize-scale', `${minimizeScale}`);
    }

    function animateWindowIn(windowEl) {
        if (!(windowEl instanceof HTMLElement)) return;
        if (!isWindowVisible(windowEl)) return;
        if (animatedWindows.has(windowEl)) return;
        animatedWindows.add(windowEl);
        if (shouldReduceMotion()) return;

        windowEl.classList.add(WINDOW_ENTER_CLASS);
        const enterDurationMs = getCurrentAnimationDurationMs(windowEl, ENTER_DURATION_MS);
        window.setTimeout(() => {
            windowEl.classList.remove(WINDOW_ENTER_CLASS);
        }, enterDurationMs);
    }

    function scanWindowNodes(node) {
        if (!(node instanceof Element)) return;
        if (node.classList.contains('trim-ui__app-layout--window')) {
            animateWindowIn(node);
            updateWindowVisibility(node);
        }
        node.querySelectorAll('.trim-ui__app-layout--window').forEach((windowEl) => {
            animateWindowIn(windowEl);
            updateWindowVisibility(windowEl);
        });
    }

    function animateWindowOut(button, exitClass) {
        const windowEl = button.closest('.trim-ui__app-layout--window');
        if (!(windowEl instanceof HTMLElement)) return false;
        if (windowEl.dataset.fnosWindowAnimatingOut === '1') return true;
        if (shouldReduceMotion()) return false;

        windowEl.dataset.fnosWindowAnimatingOut = '1';
        if (exitClass === WINDOW_EXIT_MINIMIZE_CLASS) {
            windowEl.dataset.fnosWindowRestorePending = '1';
            setMinimizeMotionVars(windowEl);
        }

        windowEl.classList.remove(WINDOW_ENTER_CLASS);
        windowEl.classList.add(WINDOW_EXIT_CLASS, exitClass);

        const exitDurationMs = getCurrentAnimationDurationMs(windowEl, EXIT_DURATION_MS);
        window.setTimeout(() => {
            button.dataset.fnosWindowAnimationBypass = '1';
            button.click();
            button.removeAttribute('data-fnos-window-animation-bypass');

            window.setTimeout(() => {
                if (!document.body.contains(windowEl)) return;
                windowEl.classList.remove(WINDOW_EXIT_CLASS, WINDOW_EXIT_CLOSE_CLASS, WINDOW_EXIT_MINIMIZE_CLASS);
                windowEl.removeAttribute('data-fnos-window-animating-out');
                updateWindowVisibility(windowEl);
            }, 100);
        }, exitDurationMs);

        return true;
    }

    function bindExitAnimation() {
        document.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const button = target.closest('.app-layout-header-close, .app-layout-header-minimize');
            if (!(button instanceof HTMLElement)) return;
            if (button.dataset.fnosWindowAnimationBypass === '1') return;

            const exitClass = button.classList.contains('app-layout-header-minimize')
                ? WINDOW_EXIT_MINIMIZE_CLASS
                : WINDOW_EXIT_CLOSE_CLASS;
            const handled = animateWindowOut(button, exitClass);
            if (!handled) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
        }, true);
    }

    function observeWindowCreation() {
        function startObserving() {
            if (!document.body) return;
            scanWindowNodes(document.body);

            const windowObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(scanWindowNodes);
                        return;
                    }
                    if (mutation.type === 'attributes') {
                        const target = mutation.target;
                        if (!(target instanceof Element)) return;

                        if (target.classList.contains('trim-ui__app-layout--window')) {
                            updateWindowVisibility(target);
                        }
                        target.querySelectorAll('.trim-ui__app-layout--window').forEach(updateWindowVisibility);

                        const parentWindow = target.closest('.trim-ui__app-layout--window');
                        if (parentWindow instanceof HTMLElement) {
                            updateWindowVisibility(parentWindow);
                        }
                    }
                });
            });

            windowObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
            });

            window._cleanupWindowAnimationObservers = () => {
                windowObserver.disconnect();
            };
        }

        if (document.body) {
            startObserving();
            return;
        }

        document.addEventListener('DOMContentLoaded', startObserving, { once: true });
    }

    bindExitAnimation();
    observeWindowCreation();
}


// 初始化函数
function initialize() {
	applyFigmaSquirclesFromConfig();
    setupAppWindowAnimations();
}

// DOM 加载完毕后执行初始化
document.addEventListener("DOMContentLoaded", initialize);

applyFigmaSquirclesFromConfig();
if (document.readyState !== 'loading') {
    setupAppWindowAnimations();
}
