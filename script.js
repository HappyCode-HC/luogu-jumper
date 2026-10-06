// ==UserScript==
// @name         Luogu Jumper
// @namespace    https://github.com/HappyCode-HC/luogu-jumper
// @version      0.1.1
// @description  洛谷跳转器：支持题目跳转 Vjudge
// @match        https://www.luogu.com.cn/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    function getVjudgeUrl() {
        const luoguPath = window.location.pathname;

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
        if (!location.pathname.startsWith('/problem/')) {
            return;
        }

        const copyBtn = Array.from(document.querySelectorAll('button')).find(
            (btn) => btn.innerText.trim() === '复制题目'
        );

        const vjudgeUrl = getVjudgeUrl();
        if (!copyBtn || !vjudgeUrl) {
            return;
        }

        const oldBtn = copyBtn.nextElementSibling;
        if (oldBtn?.classList.contains('vjudge-jump-btn')) {
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