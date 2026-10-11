// 产物的行为测试：不联网、不开浏览器，用 node:vm 在假页面环境里跑真产物。
// 跑之前要先有 script.js（node build.js），CI 里由工作流先构建。
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ARTIFACT = path.join(__dirname, '..', 'script.js');

// 一份够用的假页面：DOM 查询一律返回空，MutationObserver 只记录观察不触发回调，
// 两个功能开关都打开，这样每个模块都会走到自己的主路径而不是提前 return。
function makePage(overrides) {
    const page = Object.assign({
        hostname: 'www.luogu.com.cn',
        pathname: '/problem/P1001',
        search: '',
        href: 'https://www.luogu.com.cn/problem/P1001',
        replaced: [],
    }, overrides);

    const location = {
        hostname: page.hostname,
        pathname: page.pathname,
        search: page.search,
        href: page.href,
        replace(url) {
            page.replaced.push(url);
        },
    };

    const sandbox = {
        location,
        document: {
            body: {},
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ style: {}, dataset: {}, addEventListener() {} }),
            addEventListener: () => {},
        },
        history: { state: null, pushState() {}, replaceState() {} },
        MutationObserver: class {
            constructor(callback) {
                this.callback = callback;
            }
            observe() {}
            disconnect() {}
        },
        requestAnimationFrame: () => 0,
        addEventListener: () => {},
        URL,
        console,
        // 油猴 API 一律不提供，走脚本自己的兜底分支
    };
    vm.createContext(sandbox);
    // window 指向上下文自身，脚本里 window.__ljj 才拿得到
    sandbox.window = sandbox;
    return { sandbox, page };
}

function load(sandbox) {
    const source = fs.readFileSync(ARTIFACT, 'utf8');
    vm.runInContext(source, sandbox, { filename: 'script.js' });
    return sandbox;
}

function requireArtifact() {
    if (!fs.existsSync(ARTIFACT)) {
        assert.fail('找不到 script.js，先跑 node build.js');
    }
}

/* ---------- SPA 换页回归用的迷你 DOM ---------- */

// 洛谷换页不刷新，设置模块必须在离开时拆干净、进入时再注入。
// 这里给一份够设置模块用的迷你 DOM：节点增删、cloneNode、classList、事件记录，
// 以及支持逗号分组、后代/子代组合器、标签/类/ID 复合的简化选择器引擎。
// 设置页与题单页各持有一份结构相同的选项卡容器和主内容区，
// 复现洛谷在不同路由复用同一套结构、裸 DOM 注入会残留的场景。
function makeSpaPage(startPath) {
    const rafQueue = [];
    const observers = [];

    function matchesCompound(node, text) {
        let rest = text;
        const tag = /^([a-zA-Z][\w-]*)/.exec(rest);
        if (tag) {
            if (node.tagName !== tag[1].toUpperCase()) {
                return false;
            }
            rest = rest.slice(tag[0].length);
        }
        const re = /([.#])([\w-]+)/g;
        let matched = re.exec(rest);
        while (matched !== null) {
            if (matched[1] === '.' && !node.classList.contains(matched[2])) {
                return false;
            }
            if (matched[1] === '#' && node.id !== matched[2]) {
                return false;
            }
            matched = re.exec(rest);
        }
        return true;
    }

    function collect(node, maxDepth, compound, out) {
        node.childNodes.forEach((kid) => {
            if (matchesCompound(kid, compound) && !out.includes(kid)) {
                out.push(kid);
            }
            if (maxDepth > 1) {
                collect(kid, maxDepth - 1, compound, out);
            }
        });
    }

    function queryAll(root, selector) {
        const out = [];
        selector.split(',').forEach((rawPath) => {
            const tokens = rawPath.trim().split(/\s+/).filter(Boolean);
            let current = [root];
            let childOnly = false;
            tokens.forEach((token) => {
                if (token === '>') {
                    childOnly = true;
                    return;
                }
                const next = [];
                current.forEach((node) => collect(node, childOnly ? 1 : Infinity, token, next));
                current = next;
                childOnly = false;
            });
            current.forEach((node) => {
                if (!out.includes(node)) {
                    out.push(node);
                }
            });
        });
        return out;
    }

    function el(tagName, className) {
        const node = {
            tagName: tagName.toUpperCase(),
            childNodes: [],
            parentNode: null,
            style: {},
            attrs: {},
            listeners: {},
            className: className || '',
            textContent: '',
        };
        node.classList = {
            contains: (name) => node.className.split(/\s+/).includes(name),
            add: (name) => {
                if (!node.classList.contains(name)) {
                    node.className = (node.className + ' ' + name).trim();
                }
            },
            remove: (name) => {
                node.className = node.className.split(/\s+/)
                    .filter((piece) => piece && piece !== name)
                    .join(' ');
            },
            toggle: (name, force) => {
                if (force) {
                    node.classList.add(name);
                } else {
                    node.classList.remove(name);
                }
            },
        };
        node.appendChild = (child) => {
            if (child.parentNode) {
                child.parentNode.removeChild(child);
            }
            child.parentNode = node;
            node.childNodes.push(child);
            return child;
        };
        node.removeChild = (child) => {
            const at = node.childNodes.indexOf(child);
            if (at >= 0) {
                node.childNodes.splice(at, 1);
            }
            child.parentNode = null;
            return child;
        };
        node.remove = () => {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
        };
        node.setAttribute = (name, value) => {
            node.attrs[name] = value;
        };
        node.removeAttribute = (name) => {
            delete node.attrs[name];
        };
        node.addEventListener = (type, fn) => {
            if (!node.listeners[type]) {
                node.listeners[type] = [];
            }
            node.listeners[type].push(fn);
        };
        node.contains = (other) => {
            for (let at = other; at; at = at.parentNode) {
                if (at === node) {
                    return true;
                }
            }
            return false;
        };
        node.cloneNode = () => {
            const copy = el(tagName, node.className);
            copy.textContent = node.textContent;
            copy.attrs = Object.assign({}, node.attrs);
            node.childNodes.forEach((kid) => copy.appendChild(kid.cloneNode()));
            return copy;
        };
        node.querySelectorAll = (selector) => queryAll(node, selector);
        node.querySelector = (selector) => queryAll(node, selector)[0] || null;
        return node;
    }

    function buildPageDom(tabText) {
        const wrap = el('div');
        const headerCard = el('div', 'header-card');
        const bottomRow = el('div', 'bottom-row');
        const left = el('div', 'left');
        const menu = el('div', 'menu');
        const list = el('ul', 'items');
        const item = el('li');
        const entry = el('span', 'entry selected');
        entry.textContent = tabText;
        item.appendChild(entry);
        list.appendChild(item);
        menu.appendChild(list);
        left.appendChild(menu);
        bottomRow.appendChild(left);
        headerCard.appendChild(bottomRow);
        const main = el('main');
        const content = el('div', 'columba-content-wrap main-content');
        const nativeCard = el('div', 'l-card');
        content.appendChild(nativeCard);
        main.appendChild(content);
        wrap.appendChild(headerCard);
        wrap.appendChild(main);
        return { wrap, list, content, nativeCard };
    }

    const pages = {
        settings: buildPageDom('个人信息'),
        problem: buildPageDom('题单'),
    };
    let current = startPath.startsWith('/user/setting') ? pages.settings : pages.problem;

    const page = { navCalls: [], replaced: [] };
    const location = {
        hostname: 'www.luogu.com.cn',
        pathname: startPath,
        search: '',
        href: 'https://www.luogu.com.cn' + startPath,
        replace(url) {
            page.replaced.push(url);
        },
    };

    function applyUrl(url) {
        const parsed = new URL(url, location.href);
        location.pathname = parsed.pathname;
        location.search = parsed.search;
        location.href = parsed.href;
    }

    const sandbox = {
        location,
        document: {
            body: el('body'),
            documentElement: el('html'),
            head: el('head'),
            createElement: (tagName) => el(tagName),
            querySelector: (selector) => current.wrap.querySelector(selector),
            querySelectorAll: (selector) => current.wrap.querySelectorAll(selector),
            addEventListener: () => {},
        },
        history: {
            state: null,
            pushState(state, title, url) {
                page.navCalls.push('push ' + url);
                // Vue 的渲染在微任务里完成、早于 rAF 回调：sync 跑起来时看到的已是新页面 DOM
                current = String(url).startsWith('/user/setting') ? pages.settings : pages.problem;
                applyUrl(url);
            },
            replaceState(state, title, url) {
                page.navCalls.push('replace ' + url);
                applyUrl(url);
            },
        },
        MutationObserver: class {
            constructor(callback) {
                observers.push(callback);
            }
            observe() {}
            disconnect() {}
        },
        requestAnimationFrame: (callback) => {
            rafQueue.push(callback);
            return rafQueue.length;
        },
        addEventListener: () => {},
        URL,
        console,
    };
    vm.createContext(sandbox);
    sandbox.window = sandbox;

    function flush() {
        while (rafQueue.length > 0) {
            rafQueue.shift()();
        }
    }

    return {
        sandbox,
        page,
        pages,
        // 模拟洛谷 SPA 换页：pushState 换掉 DOM 与 URL，再放行防抖后的 sync
        navigate(path) {
            sandbox.history.pushState({}, '', path);
            flush();
        },
        // 模拟一次 Vue 渲染引发的 DOM 变动
        mutate() {
            observers.slice().forEach((callback) => callback([], null));
            flush();
        },
        flush,
    };
}

test('产物能在页面环境里加载，并暴露出内部接口', () => {
    requireArtifact();
    const { sandbox } = makePage({});
    // 未授权的油猴 API 与缺失的 DOM 都不能让脚本在加载阶段抛异常
    load(sandbox);

    assert.equal(typeof sandbox.__ljj.getConfig, 'function', '没有挂上 __ljj');
    assert.equal(typeof sandbox.__ljjUpdate.compareVersion, 'function', '没有挂上 __ljjUpdate');
    assert.equal(sandbox.__ljj.getConfig().problemVjudge, true, '默认配置读不到');
});

test('版本比较按数字段比，而不是按字符串比', () => {
    requireArtifact();
    const { sandbox } = makePage({});
    load(sandbox);
    const { compareVersion } = sandbox.__ljjUpdate;

    assert.equal(compareVersion('0.2.1', '0.2.0'), 1, '补丁号更大的应更新');
    assert.equal(compareVersion('1.10.0', '1.9.0'), 1, '10 应大于 9，不能被字符串序骗到');
    assert.equal(compareVersion('2.0.0', '10.0.0'), -1, '2 应小于 10');
    assert.equal(compareVersion('v1.2.3', '1.2.3'), 0, '前导 v 应被忽略');
    assert.equal(compareVersion('1.2', '1.2.0'), 0, '缺省段按 0 处理');
    assert.equal(compareVersion('1.2.3-rc', '1.2.3'), 0, 'CI 产出的就是 X.Y.Z，后缀不参与比较');
});

test('国际站的专栏链接会跳到保存站', () => {
    requireArtifact();
    const { sandbox, page } = makePage({
        hostname: 'www.luogu.com',
        pathname: '/article/abc123',
        href: 'https://www.luogu.com/article/abc123',
    });
    load(sandbox);

    assert.deepEqual(page.replaced, ['https://www.luogu.me/article/abc123']);
});

test('题目页以外的路径不会触发跳转', () => {
    requireArtifact();
    const { sandbox, page } = makePage({
        pathname: '/user/setting',
        href: 'https://www.luogu.com.cn/user/setting',
    });
    load(sandbox);
    assert.deepEqual(page.replaced, [], '不该有跳转');
    assert.equal(sandbox.__ljj.getConfig().intlRedirect, true, '开关仍然可读');
});

test('SPA 换页进设置页能注入扩展设置，离开时拆干净', () => {
    requireArtifact();
    const env = makeSpaPage('/problem/list');
    load(env.sandbox);

    // 脚本加载在题单页：该页也有能匹配上的选项卡容器，但什么都不该注入
    env.mutate();
    assert.equal(env.pages.problem.list.childNodes.length, 1, '题单页不该出现扩展设置选项卡');
    assert.equal(env.pages.problem.content.childNodes.length, 1, '题单页不该被塞进扩展设置卡片');

    // 不刷新换页进设置页：选项卡与卡片都应注入（无标记参数时卡片隐藏）
    env.navigate('/user/setting');
    const { list, content, nativeCard } = env.pages.settings;
    assert.equal(list.childNodes.length, 2, '设置页应注入扩展设置选项卡');
    const tab = list.childNodes[1];
    assert.equal(tab.querySelector('span.entry').textContent, 'Luogu Jumper 设置', '选项卡文案不对');
    assert.equal(content.childNodes.length, 2, '设置页应挂上扩展设置卡片');
    const card = content.childNodes[1];
    assert.equal(card.style.display, 'none', '无标记参数时卡片应隐藏');
    assert.equal(nativeCard.style.display, '', '原生卡片不该被隐藏');

    // 点击扩展设置选项卡：URL 写入标记参数，卡片显示、原生卡片隐藏、选项卡高亮
    tab.listeners.click[0]();
    env.flush();
    assert.ok(
        env.page.navCalls.some((call) => call.startsWith('replace') && call.includes('luogu-jumper-setting=1')),
        '标记参数没写进 URL'
    );
    assert.equal(card.style.display, '', '点击后卡片应可见');
    assert.equal(nativeCard.style.display, 'none', '原生卡片应被隐藏');
    assert.ok(tab.querySelector('span.entry').classList.contains('selected'), '选项卡应高亮');
    const nativeTab = list.childNodes[0].querySelector('span.entry');
    assert.ok(!nativeTab.classList.contains('selected'), '原生选项卡不该跟扩展设置一起高亮');

    // 再不刷新换回题单页：注入应全部拆除，原生卡片的内联样式要还原
    env.navigate('/problem/list');
    assert.equal(list.childNodes.length, 1, '离开设置页应移除扩展设置选项卡');
    assert.equal(content.childNodes.length, 1, '离开设置页应移除扩展设置卡片');
    assert.equal(nativeCard.style.display, '', '原生卡片的内联样式应被还原');
    assert.ok(nativeTab.classList.contains('selected'), '离开设置页应还原原生选项卡的高亮');
    assert.equal(env.pages.problem.list.childNodes.length, 1, '题单页仍不该出现扩展设置');
});

test('设置页加载后 SPA 换页去别的页面，扩展设置不残留', () => {
    requireArtifact();
    const env = makeSpaPage('/user/setting');
    load(env.sandbox);

    // 加载时 DOM 已就绪：应立即注入；随后的 DOM 变动不应重复注入
    assert.equal(env.pages.settings.list.childNodes.length, 2, '设置页加载时就该注入选项卡');
    env.mutate();
    assert.equal(env.pages.settings.list.childNodes.length, 2, 'sync 应幂等，不重复注入');

    // 不刷新换页去题单：那边有一模一样的结构，不能把扩展设置带过去
    env.navigate('/problem/list');
    assert.equal(env.pages.problem.list.childNodes.length, 1, '题单页不该出现扩展设置选项卡');
    assert.equal(env.pages.problem.content.childNodes.length, 1, '题单页不该被塞进扩展设置卡片');
    assert.equal(env.pages.settings.list.childNodes.length, 1, '旧选项卡应被移除');
    assert.equal(env.pages.settings.content.childNodes.length, 1, '旧卡片应被移除');
});
