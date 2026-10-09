// 更新检查
// 油猴管理器没有提供触发更新检查的接口，也做不到在原地替换脚本，
// 所以这里只负责自己查 GitHub Releases，并引导用户打开安装页。
(function () {
    'use strict';

    const cfg = globalThis.__ljj;
    if (!cfg) {
        return;
    }

    function currentVersion() {
        try {
            return GM_info.script.version || '0.0.0';
        } catch (error) {
            return '0.0.0';
        }
    }

    function fetchText(url, headers) {
        return new Promise((resolve, reject) => {
            const done = (text, status) => {
                if (status >= 200 && status < 300) {
                    resolve(text);
                } else {
                    reject(new Error('HTTP ' + status));
                }
            };
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    headers,
                    timeout: 10000,
                    onload: (res) => done(res.responseText, res.status),
                    onerror: () => reject(new Error('网络错误')),
                    ontimeout: () => reject(new Error('请求超时')),
                });
                return;
            }
            if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
                GM.xmlHttpRequest({ method: 'GET', url, headers })
                    .then((res) => done(res.responseText, res.status), () => reject(new Error('网络错误')));
                return;
            }
            if (!cfg.nativeFetch) {
                reject(new Error('没有可用的网络通道'));
                return;
            }
            cfg.nativeFetch(url, { headers, cache: 'no-store', credentials: 'omit' })
                .then((res) => res.text().then((text) => done(text, res.status)))
                .catch(() => reject(new Error('网络错误')));
        });
    }

    // 分段数字比较，忽略前导 v；CI 产出的就是干净的 X.Y.Z，不需要 semver
    function compareVersion(a, b) {
        const parts = (value) => String(value == null ? '' : value)
            .replace(/^[vV]/, '')
            .split(/[.\-+_]/)
            .map((piece) => parseInt(piece, 10) || 0);
        const left = parts(a);
        const right = parts(b);
        const length = Math.max(left.length, right.length);
        for (let index = 0; index < length; index += 1) {
            const diff = (left[index] || 0) - (right[index] || 0);
            if (diff > 0) return 1;
            if (diff < 0) return -1;
        }
        return 0;
    }

    function notifyOnce(version) {
        if (!cfg.getConfig().updateNotice) {
            return;
        }
        if (cfg.get(cfg.UPDATE_NOTIFIED_KEY, '') === version) {
            return;
        }
        cfg.set(cfg.UPDATE_NOTIFIED_KEY, version);
        const options = { title: 'Luogu Jumper', text: '发现新版本 ' + version, timeout: 8000 };
        try {
            if (typeof GM_notification === 'function') {
                GM_notification(options);
            } else if (typeof GM !== 'undefined' && GM && typeof GM.notification === 'function') {
                GM.notification(options);
            }
        } catch (error) {
            /* 通知失败不影响其它功能 */
        }
    }

    function render(info) {
        const button = document.querySelector('#ljj-update-button');
        const note = document.querySelector('#ljj-update-status');
        if (!button || !note) {
            return;
        }
        if (info.available) {
            button.textContent = '更新';
            button.onclick = () => {
                window.open(cfg.UPDATE_URL, '_blank', 'noopener');
            };
            note.textContent = '发现新版本 v' + info.latest + '（当前 v' + info.current + '）';
            return;
        }
        button.disabled = false;
        button.textContent = '检查更新';
        button.onclick = () => {
            checkForUpdates(true);
        };
        note.textContent = info.text || ('已是最新版本（v' + info.current + '）');
    }

    async function checkForUpdates(force) {
        const current = currentVersion();
        const button = document.querySelector('#ljj-update-button');
        const cached = cfg.get(cfg.UPDATE_CACHE_KEY, null);
        const checkedAt = cfg.get(cfg.UPDATE_CHECKED_KEY, 0);
        const fresh = cached && cached.version
            && (Date.now() - checkedAt) < cfg.UPDATE_TTL
            && compareVersion(cached.version, current) >= 0;

        if (!force && fresh) {
            const available = compareVersion(cached.version, current) > 0;
            if (available) {
                notifyOnce(cached.version);
            }
            render({ current, latest: cached.version, available });
            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = '检查中…';
        }
        const note = document.querySelector('#ljj-update-status');
        if (note) {
            note.textContent = '';
        }

        try {
            const text = await fetchText(cfg.RELEASE_API, { Accept: 'application/vnd.github+json' });
            const release = JSON.parse(text);
            const latest = String(release.tag_name || '').replace(/^[vV]/, '');
            cfg.set(cfg.UPDATE_CACHE_KEY, { version: latest, url: release.html_url || '' });
            cfg.set(cfg.UPDATE_CHECKED_KEY, Date.now());

            const available = compareVersion(latest, current) > 0;
            if (available) {
                notifyOnce(latest);
            }
            render({ current, latest, available });
        } catch (error) {
            if (button) {
                button.disabled = false;
            }
            render({ current, available: false, text: '检查失败：' + error.message });
        }
    }

    globalThis.__ljjUpdate = { checkForUpdates, compareVersion, currentVersion };
})();
