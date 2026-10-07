// ==UserScript==
// @name         Luogu Jumper
// @namespace    https://github.com/HappyCode-HC/luogu-jumper
// @version      0.1.2
// @description  洛谷跳转器：支持题目跳转 Vjudge，国际站跳转保存站
// @match        https://www.luogu.com.cn/*
// @match        https://www.luogu.com/*
// @grant        none
// ==/UserScript==

// 题目跳转 Vjudge
(function () {
    'use strict';

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
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);

    window.addEventListener('popstate', check);
})();