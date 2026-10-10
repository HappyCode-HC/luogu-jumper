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
