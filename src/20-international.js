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
