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
