// 用户设置页的扩展设置选项卡
(function () {
    'use strict';

    const cfg = globalThis.__ljj;
    if (!cfg) {
        return;
    }

    // 与洛谷原生选项卡并列的扩展设置项，URL 上的标记参数
    const TAB_LABEL = 'Luogu Jumper 设置';
    const FLAG = 'luogu-jumper-setting';
    // 只认未哈希的类名：data-v-* 每次发版都会变，硬编码必然失效
    const TAB_LIST = '.header-card .bottom-row .left .menu > ul.items';
    const CONTENT = 'main > .columba-content-wrap.main-content';

    function hasFlag(url) {
        try {
            return new URL(url, location.href).searchParams.has(FLAG);
        } catch (error) {
            return false;
        }
    }

    // 洛谷是 SPA，换页不会重新执行脚本：路径必须在每次 sync 时判定，
    // 不能只在加载时判一次，否则换页进设置页看不到注入、换页离开又拆不掉
    function isSettingPage() {
        return /^\/user\/setting(?![^/])/.test(location.pathname);
    }

    function setFlag(on) {
        const url = new URL(location.href);
        if (on) {
            url.searchParams.set(FLAG, '1');
        } else {
            url.searchParams.delete(FLAG);
        }
        if (url.href !== location.href) {
            history.replaceState(history.state, '', url.href);
        }
    }

    function version() {
        try {
            return GM_info.script.version || '未知';
        } catch (error) {
            return '未知';
        }
    }

    // 洛谷单选框的主题蓝，与原生「学术模式」等设置项的选中色一致
    const ACCENT = 'rgb(52, 152, 219)';

    // 原生单选框是靠 FontAwesome 图标 + scoped CSS 画出来的空心圈/实心点样式，
    // 裸 DOM 拿不到那套 scoped 规则，干脆自己注入一份不依赖哈希类名的样式，
    // 用 appearance:none 在原生 input 上画同款圆圈
    let stylesInjected = false;
    function ensureStyles() {
        if (stylesInjected) {
            return;
        }
        stylesInjected = true;

        const style = document.createElement('style');
        style.textContent = `
            .ljj-radio-row { display: flex; align-items: center; gap: 8px; cursor: pointer; margin-bottom: 6px; }
            .ljj-radio {
                appearance: none;
                -webkit-appearance: none;
                position: relative;
                flex: 0 0 auto;
                width: 14px;
                height: 14px;
                margin: 0;
                border: 1.5px solid ${ACCENT};
                border-radius: 50%;
                cursor: pointer;
            }
            .ljj-radio:checked::after {
                content: '';
                position: absolute;
                top: 3px;
                left: 3px;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: ${ACCENT};
            }
        `;
        document.head.appendChild(style);
    }

    // 功能行：标签 + 浅色功能介绍 + 关闭/开启单选，左右两栏对齐洛谷原生设置项的排版。
    // .l-form-layout.row 的左右分栏样式是 Vue scoped CSS，绑定着每版都变的 data-v-* hash，
    // 我们的裸 DOM 拿不到这个 hash、吃不到那条规则，所以布局必须自己用内联样式摆，
    // class 只用来蹭字体、颜色之类的全局样式
    function makeRow(labelText, key, descText) {
        const row = document.createElement('div');
        row.className = 'l-form-layout row';
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.gap = '24px';
        row.style.marginBottom = '14px';

        const label = document.createElement('span');
        label.style.flex = '0 0 140px';
        label.style.fontWeight = '600';
        label.textContent = labelText;

        const box = document.createElement('div');
        box.style.flex = '1 1 auto';

        const desc = document.createElement('p');
        desc.style.margin = '0 0 10px';
        desc.style.fontSize = '13px';
        desc.style.opacity = '0.75';
        desc.textContent = descText;
        box.appendChild(desc);

        box.appendChild(makeRadioGroup(key));

        row.appendChild(label);
        row.appendChild(box);
        return row;
    }

    function makeRadioGroup(key) {
        const group = document.createElement('div');
        const current = Boolean(cfg.getConfig()[key]);

        [['关闭', false], ['开启', true]].forEach(([text, value]) => {
            const line = document.createElement('label');
            line.className = 'ljj-radio-row';

            const input = document.createElement('input');
            input.type = 'radio';
            input.className = 'ljj-radio';
            input.name = 'ljj-' + key;
            input.checked = current === value;
            input.addEventListener('change', () => {
                if (!input.checked) {
                    return;
                }
                cfg.setConfig(key, value);
                setStatus('设置已保存，刷新页面后生效');
            });
            line.appendChild(input);

            const name = document.createElement('span');
            name.textContent = text;
            line.appendChild(name);

            group.appendChild(line);
        });

        return group;
    }

    let card = null;

    function buildCard() {
        ensureStyles();

        const el = document.createElement('div');
        el.className = 'l-card';
        el.style.padding = '20px';

        const hint = document.createElement('p');
        hint.style.margin = '4px 0 16px';
        hint.style.opacity = '0.75';
        hint.style.fontSize = '13px';
        hint.textContent = '修改后刷新页面生效。';
        el.appendChild(hint);

        const featureTitle = document.createElement('h3');
        featureTitle.className = 'lfe-h3';
        featureTitle.textContent = '功能开关';
        el.appendChild(featureTitle);

        el.appendChild(makeRow('题目跳转', 'problemVjudge', '在题目页显示「跳转VJudge」按钮'));
        el.appendChild(makeRow('国际站跳转', 'intlRedirect', '国际站云剪/专栏自动跳转到保存站'));
        el.appendChild(makeRow('新版本提醒', 'updateNotice', '发现新版本时通知一次'));

        const updateTitle = document.createElement('h3');
        updateTitle.className = 'lfe-h3';
        updateTitle.textContent = '插件更新';
        updateTitle.style.marginTop = '22px';
        el.appendChild(updateTitle);

        el.appendChild(buildUpdateRow());

        // 卡片是裸 DOM，可能被 Vue 重建；重建后状态要重新填充
        requestAnimationFrame(() => refreshUpdateStatus(false));

        return el;
    }

    function buildUpdateRow() {
        const status = document.createElement('div');

        const current = document.createElement('div');
        current.style.fontSize = '13px';
        current.style.opacity = '0.75';
        current.textContent = '当前版本：' + version();
        status.appendChild(current);

        const line = document.createElement('div');
        line.style.display = 'flex';
        line.style.alignItems = 'center';
        line.style.gap = '10px';
        line.style.marginTop = '8px';

        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'ljj-update-button';
        button.className = 'lfe-button';
        button.textContent = '检查更新';
        button.addEventListener('click', () => {
            if (globalThis.__ljjUpdate) {
                globalThis.__ljjUpdate.checkForUpdates(true);
            }
        });
        line.appendChild(button);

        const note = document.createElement('span');
        note.id = 'ljj-update-status';
        note.style.fontSize = '13px';
        note.style.opacity = '0.8';
        line.appendChild(note);

        status.appendChild(line);
        return status;
    }

    function refreshUpdateStatus(force) {
        const update = globalThis.__ljjUpdate;
        if (update) {
            update.checkForUpdates(Boolean(force));
        } else {
            setStatus('更新检查模块未就绪');
        }
    }

    function setStatus(text) {
        const note = document.querySelector('#ljj-update-status');
        if (note) {
            note.textContent = text;
        }
    }

    // 克隆原生选项卡，自动带上当版的 data-v-* 作用域属性，继承洛谷自己的样式
    function cloneTab() {
        const list = document.querySelector(TAB_LIST);
        const item = list && list.querySelector('li');
        if (!list || !item) {
            return null;
        }

        const clone = item.cloneNode(true);

        clone.querySelectorAll('.expand, .expand-content, .expand-item').forEach((node) => node.remove());

        const entry = clone.querySelector('span.entry') || clone.querySelector('span');
        if (!entry) {
            return null;
        }
        entry.textContent = TAB_LABEL;
        entry.classList.remove('selected');
        entry.removeAttribute('data-badge');

        clone.addEventListener('click', () => {
            setFlag(true);
            sync();
        });
        return clone;
    }

    let injectedTab = null;
    // 被我们隐藏过的原生卡片；拆除时要还原内联样式，
    // 免得 Vue 跨页面复用节点时把 display:none 带到别的页面
    const hiddenCards = new Set();
    // 被我们摘掉 selected 的原生选项卡；该状态是 Vue 按真实路由渲染的，
    // 我们的 URL 参数切页不会触发 Vue 重算，摘掉后必须自己摘回去
    const suppressedTabs = new Set();
    // sync 由 DOM 变动高频驱动，克隆失败的告警只报一次
    let cloneWarned = false;

    function listEntries(list) {
        return Array.from(list.querySelectorAll('li'))
            .map((item) => item.querySelector('span.entry') || item.querySelector('span'))
            .filter(Boolean);
    }

    // 原生选项卡的高亮由 Vue 按当前路由渲染，不会因为我们换 URL 参数而改变；
    // 扩展选项卡激活时要手动摘掉它，切回去时再还给它
    function syncNativeSelection(list, show) {
        if (show) {
            listEntries(list).forEach((entry) => {
                if (injectedTab && injectedTab.contains(entry)) {
                    return;
                }
                if (entry.classList.contains('selected')) {
                    entry.classList.remove('selected');
                    suppressedTabs.add(entry);
                }
            });
        } else {
            suppressedTabs.forEach((entry) => entry.classList.add('selected'));
            suppressedTabs.clear();
        }
    }

    // SPA 换页离开设置页后清掉全部注入痕迹：
    // 裸 DOM 节点对 Vue 不可见，不主动拆就会残留在复用了同结构的页面上
    function teardown() {
        if (injectedTab) {
            injectedTab.remove();
            injectedTab = null;
        }
        if (card) {
            card.remove();
        }
        hiddenCards.forEach((node) => {
            node.style.display = '';
        });
        hiddenCards.clear();
        suppressedTabs.forEach((entry) => entry.classList.add('selected'));
        suppressedTabs.clear();
    }

    function sync() {
        // 只处理用户设置页及其子路径；其余页面一律拆除后返回
        if (!isSettingPage()) {
            teardown();
            return;
        }

        const list = document.querySelector(TAB_LIST);
        const show = hasFlag(location.href);

        if (list) {
            // Vue 重建后旧选项卡会脱离文档或挂在已被替换的列表上，从当前列表重新克隆
            if (injectedTab && injectedTab.parentNode !== list) {
                injectedTab.remove();
                injectedTab = null;
            }
            if (!injectedTab) {
                injectedTab = cloneTab();
                if (injectedTab) {
                    list.appendChild(injectedTab);
                } else if (!cloneWarned) {
                    cloneWarned = true;
                    console.warn('[Luogu Jumper] 未能克隆设置页选项卡，扩展设置入口暂不可用');
                }
            }
            if (injectedTab) {
                // 激活态只由 URL 参数决定，但原生选项卡的高亮要一并摘掉/还回去，
                // 否则两个选项卡会同时亮着
                const entry = injectedTab.querySelector('span.entry');
                if (entry) {
                    entry.classList.toggle('selected', show);
                }
            }
            syncNativeSelection(list, show);
        }

        const container = document.querySelector(CONTENT);
        if (!container) {
            return;
        }

        if (!card) {
            card = buildCard();
        }
        if (card.parentNode !== container) {
            container.appendChild(card);
        }

        container.querySelectorAll('.l-card').forEach((node) => {
            if (node === card) {
                return;
            }
            node.style.display = show ? 'none' : '';
            if (show) {
                hiddenCards.add(node);
            } else {
                hiddenCards.delete(node);
            }
        });
        card.style.display = show ? '' : 'none';
    }

    function schedule() {
        if (schedule.queued) {
            return;
        }
        schedule.queued = true;
        requestAnimationFrame(() => {
            schedule.queued = false;
            sync();
        });
    }

    // SPA 换页时 URL 先于 DOM 变化，挂上 pushState/replaceState 是最早的可靠信号。
    // 与 20-international 一致：window.history 覆盖不到页面世界时补打页面世界的 History
    const historyTarget = (cfg.pageWindow && cfg.pageWindow.history !== history)
        ? cfg.pageWindow.history
        : history;
    ['pushState', 'replaceState'].forEach((name) => {
        const native = historyTarget[name];
        if (typeof native !== 'function') {
            return;
        }
        historyTarget[name] = function (...args) {
            const result = native.apply(this, args);
            schedule();
            return result;
        };
    });

    window.addEventListener('popstate', () => {
        setFlag(false);
        sync();
    });
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (injectedTab && target instanceof Node && injectedTab.contains(target)) {
            return;
        }
        const list = document.querySelector(TAB_LIST);
        if (list && target instanceof Node && list.contains(target)) {
            setFlag(false);
            sync();
        }
    }, true);

    // Vue 异步渲染、节点重建与 SPA 换页都表现为 DOM 增删：常驻文档级观察 + rAF 防抖。
    // 不能只盯单个选项卡容器——换页后旧节点脱离文档，观察器就再也收不到信号；
    // sync 幂等，非设置页时只做一次路径判断加空拆除，文档级回调没有性能问题
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    sync();
})();
