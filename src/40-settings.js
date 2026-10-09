// 用户设置页的扩展设置选项卡
(function () {
    'use strict';

    const cfg = globalThis.__ljj;
    if (!cfg) {
        return;
    }

    // 与洛谷原生选项卡并列的扩展设置项，URL 上的标记参数
    const TAB_LABEL = '扩展设置';
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

    // 只处理用户设置页及其子路径
    if (!/^\/user\/setting(?![^/])/.test(location.pathname)) {
        return;
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

    function makeRow(labelText, control, hintText) {
        const row = document.createElement('div');
        row.className = 'l-form-layout row';
        row.style.marginBottom = '14px';

        const label = document.createElement('span');
        label.textContent = labelText;

        const box = document.createElement('div');

        const line = document.createElement('label');
        line.style.display = 'flex';
        line.style.alignItems = 'center';
        line.style.gap = '8px';
        line.style.cursor = 'pointer';
        line.appendChild(control);

        const name = document.createElement('span');
        name.textContent = hintText;
        line.appendChild(name);

        box.appendChild(line);
        row.appendChild(label);
        row.appendChild(box);
        return row;
    }

    function makeCheckbox(key) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(cfg.getConfig()[key]);
        input.addEventListener('change', () => {
            cfg.setConfig(key, input.checked);
            setStatus('设置已保存，刷新页面后生效');
        });
        return input;
    }

    let card = null;

    function buildCard() {
        const el = document.createElement('div');
        el.className = 'l-card';
        el.style.padding = '20px';

        const title = document.createElement('h2');
        title.className = 'lfe-h2';
        title.textContent = TAB_LABEL;
        el.appendChild(title);

        const hint = document.createElement('p');
        hint.style.margin = '4px 0 16px';
        hint.style.opacity = '0.75';
        hint.style.fontSize = '13px';
        hint.textContent = '所有开关在页面加载时读取一次，修改后刷新页面生效。';
        el.appendChild(hint);

        const featureTitle = document.createElement('h3');
        featureTitle.className = 'lfe-h3';
        featureTitle.textContent = '功能开关';
        el.appendChild(featureTitle);

        el.appendChild(makeRow('题目跳转', makeCheckbox('problemVjudge'), '在题目页显示「跳转VJudge」按钮'));
        el.appendChild(makeRow('国际站跳转', makeCheckbox('intlRedirect'), '国际站云剪/专栏自动跳转到保存站'));

        const updateTitle = document.createElement('h3');
        updateTitle.className = 'lfe-h3';
        updateTitle.textContent = '更新选项';
        updateTitle.style.marginTop = '22px';
        el.appendChild(updateTitle);

        el.appendChild(makeRow('新版本提醒', makeCheckbox('updateNotice'), '发现新版本时通知一次'));

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

    function sync() {
        const list = document.querySelector(TAB_LIST);
        const show = hasFlag(location.href);

        if (list) {
            if (!injectedTab || !injectedTab.isConnected) {
                injectedTab = cloneTab();
                if (injectedTab) {
                    list.appendChild(injectedTab);
                } else {
                    console.warn('[Luogu Jumper] 未能克隆设置页选项卡，扩展设置入口暂不可用');
                }
            }
            if (injectedTab) {
                // 绝不抢原生选项卡的高亮：激活态只由 URL 参数决定
                const entry = injectedTab.querySelector('span.entry');
                if (entry) {
                    entry.classList.toggle('selected', show);
                }
            }
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
            if (node !== card) {
                node.style.display = show ? 'none' : '';
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

    // 只观察洛谷的选项卡容器，避免全文档级别的回调抖动
    function observe() {
        const list = document.querySelector(TAB_LIST);
        if (!list) {
            return false;
        }
        new MutationObserver(schedule).observe(list, { childList: true });
        return true;
    }

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

    if (observe()) {
        sync();
    } else {
        const waiter = new MutationObserver(() => {
            if (observe()) {
                waiter.disconnect();
                sync();
            }
        });
        waiter.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
