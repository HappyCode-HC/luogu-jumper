// 双击题号跳转
(function () {
    'use strict';

    // 开关在页面加载时读取一次，修改后需刷新页面才生效
    const ENABLED = window.__ljj.getConfig().dblclickJump;

    if (!ENABLED) {
        return;
    }

    // 题号规则（整词命中、不区分大小写）：
    // P/B 至少 4 位数字；U/T/SP 任意位数字；UVA 至少 3 位数字；
    // CF 数字 + 至少一个字母 + 可再跟数字（CF1234D2）；
    // AT{contest}_{problem}：contest 为字母数字下划线混合，problem 为单个字母或数字
    const PID_RULES = [
        /^p\d{4,}$/,
        /^b\d{4,}$/,
        /^u\d+$/,
        /^t\d+$/,
        /^sp\d+$/,
        /^uva\d{3,}$/,
        /^cf\d+[a-z]\d*$/,
        /^at[a-z0-9_]+_[a-z0-9]$/,
    ];

    // 命中返回原词（洛谷题号页对大小写不敏感），否则返回 null
    function matchPid(word) {
        if (!word) {
            return null;
        }
        const lower = String(word).toLowerCase();
        for (const rule of PID_RULES) {
            if (rule.test(lower)) {
                return word;
            }
        }
        return null;
    }

    // 从文本 index 处向两侧扩展出连续的 [A-Za-z0-9_] 词：
    // 中文混排（「这题P1000，」「（CF1234A）」）里双击也能拿到完整题号
    function expandWord(text, index) {
        const at = Number(index);
        if (typeof text !== 'string' || text === ''
            || Number.isNaN(at) || at < 0 || at >= text.length) {
            return null;
        }
        if (!/[\w]/.test(text[at])) {
            return null;
        }
        let start = at;
        let end = at;
        while (start > 0 && /[\w]/.test(text[start - 1])) {
            start -= 1;
        }
        while (end < text.length - 1 && /[\w]/.test(text[end + 1])) {
            end += 1;
        }
        return text.slice(start, end + 1);
    }

    // 双击落点所在的文本节点与偏移；Chrome/Firefox 的 API 名不同，逐个尝试
    function getCaret(event) {
        const x = event.clientX;
        const y = event.clientY;

        if (typeof document.caretRangeFromPoint === 'function') {
            const range = document.caretRangeFromPoint(x, y);
            if (range && range.startContainer && range.startContainer.nodeType === 3) {
                return { text: range.startContainer.data, offset: range.startOffset };
            }
        }
        if (typeof document.caretPositionFromPoint === 'function') {
            const position = document.caretPositionFromPoint(x, y);
            if (position && position.offsetNode && position.offsetNode.nodeType === 3) {
                return { text: position.offsetNode.data, offset: position.offset };
            }
        }
        return null;
    }

    // 编辑区与链接内部不参与：双击在那里有更原生的语义
    function isExcluded(target) {
        if (!target || typeof target.closest !== 'function') {
            return true;
        }
        if (target.closest('a, input, textarea')) {
            return true;
        }
        return Boolean(target.isContentEditable);
    }

    document.addEventListener('dblclick', (event) => {
        if (event.button !== 0 || isExcluded(event.target)) {
            return;
        }

        // 优先从落点扩展整词；拿不到落点时退回双击选区整体
        const caret = getCaret(event);
        const word = (caret && expandWord(caret.text, caret.offset))
            || String((typeof window.getSelection === 'function' && window.getSelection()) || '').trim();

        const pid = matchPid(word);
        if (!pid) {
            return;
        }
        // 不用第三参 'noopener'（部分浏览器会退化成弹窗），打开后手动断开 opener
        const tab = window.open('https://www.luogu.com.cn/problem/' + pid, '_blank');
        if (tab) {
            tab.opener = null;
        }
    });

    // 供产物行为测试直接驱动纯函数部分
    globalThis.__ljjDblJump = { matchPid, expandWord, PID_RULES };
})();
