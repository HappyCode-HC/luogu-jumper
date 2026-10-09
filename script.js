// ==UserScript==
// @name         Luogu Jumper
// @namespace    https://github.com/HappyCode-HC/luogu-jumper
// @version      0.1.3
// @description  洛谷跳转器：支持题目跳转 Vjudge，国际站跳转保存站
// @match        https://www.luogu.com.cn/*
// @match        https://www.luogu.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.notification
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// @connect      api.github.com
// ==/UserScript==

// 存储与配置
(function () {
    'use strict';

    // 进入沙箱后 pageWindow 是页面世界的 window，没有 unsafeWindow 时为 null
    const pageWindow = (typeof unsafeWindow === 'undefined') ? null : unsafeWindow;
    let nativeFetch = null;
    try {
        const owner = pageWindow || globalThis;
        nativeFetch = owner.fetch ? owner.fetch.bind(owner) : null;
    } catch (error) {
        nativeFetch = null;
    }

    // 油猴存储：GM_* 优先，GM.* 别名兜底，都不可用时退回 localStorage
    function pickAccessors() {
        if (typeof GM_getValue === 'function' && typeof GM_setValue === 'function') {
            return {
                get: (key, fallback) => GM_getValue(key, fallback),
                set: (key, value) => GM_setValue(key, value),
            };
        }
        if (typeof GM !== 'undefined' && GM
            && typeof GM.getValue === 'function' && typeof GM.setValue === 'function') {
            return {
                get: (key, fallback) => GM.getValue(key, fallback),
                set: (key, value) => GM.setValue(key, value),
            };
        }
        return {
            get: (key, fallback) => {
                let text = null;
                try {
                    text = localStorage.getItem(key);
                } catch (error) {
                    return fallback;
                }
                if (text === null) {
                    return fallback;
                }
                try {
                    return JSON.parse(text);
                } catch (error) {
                    return fallback;
                }
            },
            set: (key, value) => {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                } catch (error) {
                    /* 隐私模式等场景下写入失败，忽略 */
                }
            },
        };
    }

    const accessors = pickAccessors();
    const STORE_PREFIX = 'luogu-jumper:';
    const CONFIG_KEY = STORE_PREFIX + 'config';
    const UPDATE_CACHE_KEY = STORE_PREFIX + 'update-cache';
    const UPDATE_CHECKED_KEY = STORE_PREFIX + 'update-checked-at';
    const UPDATE_NOTIFIED_KEY = STORE_PREFIX + 'update-notified';
    const UPDATE_TTL = 6 * 60 * 60 * 1000;
    const UPDATE_URL = 'https://github.com/HappyCode-HC/luogu-jumper/releases/latest/download/luogu-jumper.user.js';
    const RELEASE_API = 'https://api.github.com/repos/HappyCode-HC/luogu-jumper/releases/latest';

    const DEFAULT_CONFIG = {
        problemVjudge: true,
        intlRedirect: true,
        updateNotice: true,
    };

    // 只取已知键，未知键丢弃，缺失键补默认值
    function normalizeConfig(raw) {
        const source = (raw && typeof raw === 'object') ? raw : {};
        const config = {};
        Object.keys(DEFAULT_CONFIG).forEach((key) => {
            config[key] = (typeof source[key] === 'boolean') ? source[key] : DEFAULT_CONFIG[key];
        });
        return config;
    }

    let config = normalizeConfig(accessors.get(CONFIG_KEY, null));

    function saveConfig() {
        accessors.set(CONFIG_KEY, config);
    }

    globalThis.__ljj = {
        DEFAULT_CONFIG,
        UPDATE_URL,
        RELEASE_API,
        UPDATE_TTL,
        UPDATE_CACHE_KEY,
        UPDATE_CHECKED_KEY,
        UPDATE_NOTIFIED_KEY,
        pageWindow,
        nativeFetch,
        accessors,
        get: (key, fallback) => accessors.get(key, fallback),
        set: (key, value) => accessors.set(key, value),
        // 每次读取都回源，页面内被改写的配置能立刻反映到界面
        getConfig: () => {
            config = normalizeConfig(accessors.get(CONFIG_KEY, null));
            return Object.assign({}, config);
        },
        setConfig: (key, value) => {
            if (!(key in DEFAULT_CONFIG)) {
                return;
            }
            config[key] = Boolean(value);
            saveConfig();
        },
    };
})();


// 题目跳转 Vjudge
(function () {
    'use strict';

    // 开关在页面加载时读取一次，修改后需刷新页面才生效
    const ENABLED = window.__ljj.getConfig().problemVjudge;

    if (!ENABLED) {
        return;
    }

    function isContestPrivateProblem(path) {
        return (
            /(^|[?&])contestId=/.test(window.location.search) &&
            /^\/problem\/(T|U)\d+/.test(path)
        );
    }

    function getVjudgeUrl() {
        const luoguPath = window.location.pathname;

        if (isContestPrivateProblem(luoguPath)) {
            return null;
        }

        if (luoguPath.startsWith('/problem/CF')) {
            const match = luoguPath.match(/CF(\d+[A-Za-z\d]*)/);
            return match ? `https://vjudge.net/problem/CodeForces-${match[1]}` : null;
        }

        if (luoguPath.startsWith('/problem/AT_')) {
            const match = luoguPath.match(/AT_(\w+)/);
            return match ? `https://vjudge.net/problem/AtCoder-${match[1]}` : null;
        }

        if (luoguPath.startsWith('/problem/SP')) {
            let spojId = null;
            const originalLink = document.querySelector('a[href*="spoj.com/problems/"]');

            if (originalLink) {
                spojId = originalLink.href.split('/problems/')[1].replace('/', '');
            } else {
                const pageText = document.body.innerText;
                const spojTextMatch = pageText.match(/SPOJ\s*[-\s:]([A-Za-z0-9_-]+)/i);
                spojId = spojTextMatch ? spojTextMatch[1].trim() : null;
            }

            return spojId ? `https://vjudge.net/problem/SPOJ-${spojId}` : null;
        }

        if (luoguPath.startsWith('/problem/UVA')) {
            const match = luoguPath.match(/UVA(\d+)/);
            return match ? `https://vjudge.net/problem/UVA-${match[1]}` : null;
        }

        if (luoguPath.startsWith('/problem/B')) {
            const match = luoguPath.match(/B(\d+)/);
            return match ? `https://vjudge.net/problem/洛谷-B${match[1]}` : null;
        }

        if (luoguPath.startsWith('/problem/P')) {
            const match = luoguPath.match(/P(\d+)/);
            return match ? `https://vjudge.net/problem/洛谷-P${match[1]}` : null;
        }

        if (luoguPath.startsWith('/problem/U')) {
            const match = luoguPath.match(/U(\d+)/);
            return match ? `https://vjudge.net/problem/洛谷-U${match[1]}` : null;
        }

        if (luoguPath.startsWith('/problem/T')) {
            const match = luoguPath.match(/T(\d+)/);
            return match ? `https://vjudge.net/problem/洛谷-T${match[1]}` : null;
        }

        return null;
    }

    function tryAddJumpButton() {
        const oldBtn = document.querySelector('.vjudge-jump-btn');
        const vjudgeUrl = location.pathname.startsWith('/problem/')
            ? getVjudgeUrl()
            : null;

        // 不展示按钮时（如比赛中的私题），把可能残留的按钮移除
        if (!vjudgeUrl) {
            oldBtn?.remove();
            return;
        }

        const copyBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.innerText.trim() === '复制题目'
        );
        if (!copyBtn) {
            return;
        }

        if (oldBtn) {
            if (oldBtn.dataset.url === vjudgeUrl) {
                return;
            }
            oldBtn.remove();
        }

        const jumpBtn = document.createElement('button');
        jumpBtn.className = 'vjudge-jump-btn';
        jumpBtn.dataset.url = vjudgeUrl;
        jumpBtn.innerText = '跳转VJudge';

        const copyStyles = window.getComputedStyle(copyBtn);
        [
            'backgroundColor',
            'color',
            'border',
            'borderRadius',
            'padding',
            'fontSize',
            'fontFamily',
            'cursor',
            'height',
            'lineHeight',
            'textAlign',
            'whiteSpace',
            'verticalAlign',
            'display',
            'marginTop',
            'marginBottom',
        ].forEach((styleProp) => {
            jumpBtn.style[styleProp] = copyStyles[styleProp];
        });

        jumpBtn.style.marginLeft = '5px';
        jumpBtn.style.minWidth = copyStyles.minWidth || '80px';

        jumpBtn.addEventListener('click', () => {
            window.open(vjudgeUrl, '_blank');
        });

        copyBtn.parentNode.insertBefore(jumpBtn, copyBtn.nextSibling);
    }

    tryAddJumpButton();
    new MutationObserver(tryAddJumpButton).observe(document.body, {
        childList: true,
        subtree: true,
    });
})();

// 国际站云剪/专栏跳转保存站
(function () {
    'use strict';

    // 开关在页面加载时读取一次，修改后需刷新页面才生效
    const ENABLED = window.__ljj.getConfig().intlRedirect;

    if (!ENABLED) {
        return;
    }

    function check() {
        if (location.hostname !== 'www.luogu.com') return;
        if (!/^\/(article|paste)\//.test(location.pathname)) return;
        const target = new URL(location.href);
        target.hostname = 'www.luogu.me';
        location.replace(target.href);
    }
    check();

    function wrap(fn) {
        return function (...args) {
            const result = fn.apply(this, args);
            check();
            return result;
        };
    }
    // 沿用 window.history 覆盖不到页面世界时，补打页面世界的 History（需 @grant unsafeWindow）
    const historyTarget = (window.__ljj
        && window.__ljj.pageWindow
        && window.__ljj.pageWindow.history !== history)
        ? window.__ljj.pageWindow.history
        : history;
    historyTarget.pushState = wrap(historyTarget.pushState);
    historyTarget.replaceState = wrap(historyTarget.replaceState);

    window.addEventListener('popstate', check);
})();

