// ESLint 扁平配置。
// 刻意不 import 任何包：CI 用 `npx eslint@10` 拉起 ESLint，配置里 import 的包在那边解析不到，
// 所以这里只用 ESLint 自带规则，并把脚本用到的全局名手写出来（no-undef 的价值就在这份清单上）。
// 从仓库根跑：npx eslint@10 .
// 想扩全局名（比如新用了 GM_addStyle），加到下面 globals 里即可。

const sharedRules = {
    // 核心：引用不存在的变量。油猴脚本里写错一个 API 名就是静默 undefined，这条最值钱
    'no-undef': 'error',
    // caughtErrors: none —— 代码里大量 `catch (error) { /* 忽略 */ }` 是刻意的兜底写法
    'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-dupe-else-if': 'error',
    'no-unreachable': 'error',
    'no-constant-condition': 'error',
    'no-empty': 'error', // 含注释的空块不算空，代码里靠注释说明「故意忽略」
    'no-fallthrough': 'error',
    'no-cond-assign': ['error', 'except-parens'],
    'no-self-assign': 'error',
    'no-useless-escape': 'error',
    'valid-typeof': 'error',
    'use-isnan': 'error',
    // smart 允许 `x == null` 这种同时判 null/undefined 的写法
    eqeqeq: ['error', 'smart'],
    'no-var': 'error',
    'prefer-const': 'error',
};

const languageOptions = (sourceType, globals) => ({
    ecmaVersion: 'latest',
    sourceType,
    globals,
});

// 浏览器 + 油猴全局。没列进来的油猴 API 会被 no-undef 抓住，这正是想要的效果。
const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    location: 'readonly',
    history: 'readonly',
    localStorage: 'readonly',
    navigator: 'readonly',
    URL: 'readonly',
    Node: 'readonly',
    Element: 'readonly',
    MutationObserver: 'readonly',
    requestAnimationFrame: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    console: 'readonly',
    GM: 'readonly',
    GM_info: 'readonly',
    GM_getValue: 'readonly',
    GM_setValue: 'readonly',
    GM_notification: 'readonly',
    GM_xmlhttpRequest: 'readonly',
    unsafeWindow: 'readonly',
};

const nodeGlobals = {
    console: 'readonly',
    process: 'readonly',
    Buffer: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    URL: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    module: 'readonly',
    require: 'readonly',
    exports: 'writable',
};

const moduleGlobals = Object.assign({}, nodeGlobals, {
    // ESM 里没有 require/module/exports
    module: 'off',
    require: 'off',
    exports: 'off',
});

export default [
    {
        // 构建产物、下载的工具、依赖目录都不看
        ignores: ['script.js', 'luogu-jumper.user.js', 'node_modules/**', '.tmp-tools/**'],
    },
    {
        files: ['src/**/*.js'],
        languageOptions: languageOptions('script', browserGlobals),
        rules: sharedRules,
    },
    {
        files: ['build.js', 'scripts/**/*.js', 'test/**/*.js'],
        languageOptions: languageOptions('commonjs', nodeGlobals),
        rules: sharedRules,
    },
    {
        files: ['**/*.mjs'],
        languageOptions: languageOptions('module', moduleGlobals),
        rules: sharedRules,
    },
];
