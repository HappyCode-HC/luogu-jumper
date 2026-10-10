#!/usr/bin/env node
'use strict';

// 仓库自检：跑一遍构建契约、userscript 元数据、GM 权限、安全红线和 Actions 配置。
// 只用 Node 标准库 —— 这个仓库刻意不引入第三方依赖（见 build.js 顶部说明）。
//
// 用法：
//   node scripts/check-userscript.js                     校验源码；产物存在时顺带校验
//   node scripts/check-userscript.js --require-artifact   产物必须在（CI 用，先跑 build）
//   node scripts/check-userscript.js --root <目录>        校验别的目录（默认仓库根）
//
// 在 GitHub Actions 里会额外输出 ::error / ::warning 注解，直接标在 PR 的改动行上。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- 参数与路径 ---------- */

const argv = process.argv.slice(2);
let requireArtifact = false;
let ROOT = path.resolve(__dirname, '..');

for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--require-artifact') {
        requireArtifact = true;
    } else if (arg === '--root') {
        ROOT = path.resolve(argv[index + 1]);
        index += 1;
    } else if (arg.startsWith('--root=')) {
        ROOT = path.resolve(arg.slice('--root='.length));
    } else if (arg === '--help' || arg === '-h') {
        console.log('用法：node scripts/check-userscript.js [--require-artifact] [--root <目录>]');
        process.exit(0);
    } else {
        console.error('未知参数：' + arg);
        process.exit(2);
    }
}

const SRC_DIR = path.join(ROOT, 'src');
const HEADER_FILE = path.join(SRC_DIR, 'header.txt');
const ARTIFACT_FILE = path.join(ROOT, 'script.js');
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');

// 模块名：两位数字前缀决定合并顺序，写成 5-x.js 会排到 40-x.js 后面
const MODULE_RE = /^\d{2}-[a-z0-9][a-z0-9-]*\.js$/;
// GM_info 不用授权：Tampermonkey 文档写明 @grant none 时没有 GM_* 函数，但 GM_info 仍然可用
const NO_GRANT_NEEDED = new Set(['GM_info', 'GM.info']);
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
// 在请求上下文里出现的域名必须被 @connect 覆盖，否则提示
const REQUEST_CONTEXT_RE = /\bGM_xmlhttpRequest\b|\bGM\.xmlHttpRequest\b|\bGM_download\b|\bGM\.download\b|\bfetch\s*\(|nativeFetch|xmlHttpRequest/;

/* ---------- 结果收集与输出 ---------- */

const problems = [];

function escapeData(text) {
    return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(text) {
    return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function report(level, file, line, message) {
    const relative = file ? path.relative(ROOT, file).split(path.sep).join('/') : '';
    problems.push({ level, file: relative, line: line || 0, message });
    const where = relative ? relative + (line ? ':' + line : '') : '仓库';
    console.log((level === 'error' ? '[错误] ' : '[警告] ') + where + ' ' + message);
}

const fail = (file, line, message) => report('error', file, line, message);
const warn = (file, line, message) => report('warning', file, line, message);

/* ---------- 文本工具 ---------- */

function readText(file) {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

function lineOf(text, index) {
    let line = 1;
    for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
        if (text[cursor] === '\n') {
            line += 1;
        }
    }
    return line;
}

function firstMeaningfulLine(text) {
    return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) || '';
}

// 先做语法检查，避免后面拿半截代码做静态分析
function checkSyntax(file, text) {
    try {
        new vm.Script(text, { filename: file });
        return true;
    } catch (error) {
        const firstLine = String(error.stack || '').split('\n')[0];
        const matched = /:(\d+)\b/.exec(firstLine);
        fail(file, matched ? Number(matched[1]) : 0, '语法错误：' + error.message);
        return false;
    }
}

// 把注释和字符串替换成等长空白（换行保留），这样下标与行号都还对得上
const REGEX_START_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'case', 'in', 'of', 'new', 'delete', 'void',
    'do', 'else', 'yield', 'await', 'throw',
]);
const REGEX_START_PUNCT = new Set([
    '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>',
]);

function stripCommentsAndStrings(code) {
    let out = '';
    let cursor = 0;
    let word = '';
    const length = code.length;
    const blank = (from, to) => {
        out += code.slice(from, to).replace(/[^\n]/g, ' ');
    };

    while (cursor < length) {
        const start = cursor;
        const char = code[cursor];
        const next = code[cursor + 1];

        if (char === '/' && next === '/') {
            while (cursor < length && code[cursor] !== '\n') cursor += 1;
            blank(start, cursor);
            continue;
        }

        if (char === '/' && next === '*') {
            cursor += 2;
            while (cursor < length && !(code[cursor] === '*' && code[cursor + 1] === '/')) cursor += 1;
            cursor = Math.min(cursor + 2, length);
            blank(start, cursor);
            continue;
        }

        if (char === '"' || char === "'" || char === '`') {
            cursor += 1;
            while (cursor < length) {
                if (code[cursor] === '\\') {
                    cursor += 2;
                    continue;
                }
                if (code[cursor] === char) {
                    cursor += 1;
                    break;
                }
                cursor += 1;
            }
            blank(start, cursor);
            word = '';
            continue;
        }

        if (char === '/' && (word === '' || REGEX_START_KEYWORDS.has(word) || REGEX_START_PUNCT.has(word))) {
            cursor += 1;
            let inClass = false;
            let closed = false;
            while (cursor < length) {
                const inner = code[cursor];
                if (inner === '\\') {
                    cursor += 2;
                    continue;
                }
                if (inner === '\n') break;
                if (inner === '[') inClass = true;
                else if (inner === ']') inClass = false;
                else if (inner === '/' && !inClass) {
                    cursor += 1;
                    closed = true;
                    break;
                }
                cursor += 1;
            }
            if (closed) {
                while (cursor < length && /[A-Za-z]/.test(code[cursor])) cursor += 1;
            } else {
                cursor = start + 1; // 不是正则，当除号处理
            }
            blank(start, cursor);
            word = '';
            continue;
        }

        out += char;
        if (/[A-Za-z0-9_$]/.test(char)) {
            word += char;
        } else if (!/\s/.test(char)) {
            word = '';
        }
        cursor += 1;
    }

    return out;
}

// 从去掉注释字符串的源码里挑出真正用到的特权 API：GM_xxx、GM.xxx、unsafeWindow
function collectApis(stripped) {
    const found = new Map();
    const remember = (name, index) => {
        if (!found.has(name)) found.set(name, index);
    };
    const patterns = [
        /\bGM_[A-Za-z][A-Za-z0-9]*\b/g,
        /\bGM\.[A-Za-z][A-Za-z0-9]*\b/g,
        /\bunsafeWindow\b/g,
    ];
    for (const pattern of patterns) {
        for (const matched of stripped.matchAll(pattern)) remember(matched[0], matched.index);
    }
    return found;
}

/* ---------- 元数据块 ---------- */

const META_LINE_RE = /^\/\/\s*@([A-Za-z][A-Za-z0-9-]*)\s*(.*?)\s*$/;

function parseMetadata(text) {
    const entries = [];
    text.split('\n').forEach((line, index) => {
        const matched = META_LINE_RE.exec(line);
        if (matched) {
            entries.push({ key: matched[1].toLowerCase(), value: matched[2], line: index + 1 });
        }
    });
    return entries;
}

function expectedRepoSlug() {
    if (process.env.GITHUB_REPOSITORY) {
        return process.env.GITHUB_REPOSITORY;
    }
    try {
        const config = readText(path.join(ROOT, '.git', 'config'));
        const url = /url\s*=\s*(\S+)/.exec(config);
        const slug = url && /github\.com[/:]([^/]+)\/([^/\s]+?)(?:\.git)?$/.exec(url[1]);
        return slug ? slug[1] + '/' + slug[2] : null;
    } catch (error) {
        return null; // 不是 git 仓库就不做这项比对
    }
}

function slugOf(url) {
    const matched = /github\.com\/([^/]+)\/([^/?#]+)/.exec(url);
    return matched ? matched[1] + '/' + matched[2].replace(/\.git$/, '') : null;
}

/* ---------- 1. 源码模块 ---------- */

function checkModules() {
    console.log('\n== src/ 模块 ==');
    let names;
    try {
        names = fs.readdirSync(SRC_DIR).sort();
    } catch (error) {
        fail(SRC_DIR, 0, '读不到 src/ 目录：' + error.message);
        return [];
    }

    const files = names.filter((name) => fs.statSync(path.join(SRC_DIR, name)).isFile());
    const modules = files.filter((name) => name.endsWith('.js'));

    if (modules.length === 0) {
        fail(SRC_DIR, 0, 'src/ 下没有可合并的 .js 模块');
    }

    for (const name of files) {
        const file = path.join(SRC_DIR, name);
        if (!name.endsWith('.js')) {
            if (!name.endsWith('.txt') && !name.endsWith('.md')) {
                warn(file, 0, 'build.js 只合并 .js，这个文件不会进产物，确认是有意为之');
            }
            continue;
        }
        if (!MODULE_RE.test(name)) {
            fail(file, 0, '模块名要形如 NN-name.js：数字前缀决定合并顺序，5-x.js 会排到 40-x.js 后面');
        }

        const text = readText(file);
        const syntaxOk = checkSyntax(file, text);
        checkStyle(file, text);
        if (/==\/?UserScript==/.test(text)) {
            fail(file, 0, '元数据块只能写在 src/header.txt，模块里不要再出现 ==UserScript==');
        }
        if (syntaxOk) {
            const functionAt = text.indexOf('(function');
            if (!/'use strict'/.test(text)) {
                warn(file, functionAt >= 0 ? lineOf(text, functionAt) : 1, "建议模块带上 'use strict';");
            }
            checkSinks(file, stripCommentsAndStrings(text));
        }
    }

    console.log('   ' + modules.length + ' 个模块：' + modules.join(', '));
    return modules.map((name) => {
        const file = path.join(SRC_DIR, name);
        const text = readText(file);
        return { name, file, text, stripped: stripCommentsAndStrings(text) };
    });
}

function checkStyle(file, text) {
    const lines = text.split('\n');
    let crlfReported = false;
    lines.forEach((line, index) => {
        if (line.includes('\t')) {
            fail(file, index + 1, '不要用制表符缩进（本仓库统一 4 空格）');
        }
        if (/[ \t]+$/.test(line)) {
            fail(file, index + 1, '行尾有多余空白');
        }
        if (!crlfReported && /\r$/.test(line)) {
            crlfReported = true;
            warn(file, index + 1, '换行是 CRLF；build.js 会归一化，但建议统一 LF（可以加 .gitattributes）');
        }
    });
    if (text.length > 0 && !text.endsWith('\n')) {
        fail(file, lines.length, '文件末尾要有一个换行');
    }
}

/* ---------- 2. userscript 头部 ---------- */

function checkHeader() {
    console.log('\n== userscript 头部 ==');
    let text;
    try {
        text = readText(HEADER_FILE);
    } catch (error) {
        fail(HEADER_FILE, 0, '读不到 src/header.txt：' + error.message);
        return null;
    }

    const first = text.split('\n')[0];
    if (first.trim() !== '// ==UserScript==') {
        fail(HEADER_FILE, 1, '第 1 行必须是 // ==UserScript==，前面不能有多余字符（含 BOM）');
    }
    if (!/^\/\/ ==\/UserScript==\s*$/m.test(text)) {
        fail(HEADER_FILE, 0, '缺少元数据块结束行 // ==/UserScript==');
    }

    const entries = parseMetadata(text);
    // 元数据键统一按小写比对：@updateURL 解析出来是 updateurl
    const values = (key) => entries
        .filter((entry) => entry.key === key.toLowerCase())
        .map((entry) => entry.value);
    const lineOfKey = (key) => {
        const entry = entries.find((item) => item.key === key.toLowerCase());
        return entry ? entry.line : 0;
    };

    for (const key of ['name', 'namespace', 'version', 'description']) {
        if (values(key).length === 0) {
            fail(HEADER_FILE, 0, '缺少 @' + key);
        }
    }

    const versions = values('version');
    if (versions.length > 1) {
        fail(HEADER_FILE, lineOfKey('version'), '@version 只能出现一次，管理器会取错');
    }
    if (versions.length === 1 && versions[0] !== '__VERSION__') {
        fail(HEADER_FILE, lineOfKey('version'), '@version 必须是 __VERSION__ 占位符（当前 ' + versions[0] + '）：版本号由 tag 注入，写死会被 build.js 覆盖');
    }

    const matches = entries.filter((entry) => entry.key === 'match');
    if (matches.length === 0) {
        fail(HEADER_FILE, 0, '缺少 @match：脚本会注入到所有页面');
    }
    for (const entry of entries) {
        if (entry.key === 'include') {
            warn(HEADER_FILE, entry.line, '@include 比 @match 宽松，确认是有意为之：' + entry.value);
            continue;
        }
        if (entry.key !== 'match') continue;
        if (entry.value === '<all_urls>' || /^\*:\/\/\*?\//.test(entry.value)) {
            fail(HEADER_FILE, entry.line, '@match 范围过宽（' + entry.value + '）：脚本只需要洛谷站点');
        } else if (!/^(https?|file|ftp|\*):\/\/[^/\s]+\//.test(entry.value)) {
            fail(HEADER_FILE, entry.line, '@match 不是合法的匹配模式：' + entry.value);
        }
    }

    checkUpdateUrls(values, lineOfKey);

    const connects = values('connect').map((value) => value.toLowerCase());
    if (connects.length === 0) {
        fail(HEADER_FILE, 0, '缺少 @connect：GM_xmlhttpRequest 会受到跨域限制');
    }
    if (connects.includes('*')) {
        warn(HEADER_FILE, lineOfKey('connect'), '@connect * 允许脚本请求任意域名，范围过大');
    }

    const grants = values('grant');
    if (grants.includes('none') && grants.length > 1) {
        fail(HEADER_FILE, lineOfKey('grant'), '@grant none 与其它 @grant 同时出现，声明自相矛盾');
    }

    console.log('   元数据 ' + entries.length + ' 条，@match ' + matches.length + ' 条，@grant ' + grants.length + ' 条');
    return { entries, values, grants, lineOfKey };
}

function checkUpdateUrls(values, lineOfKey) {
    const slug = expectedRepoSlug();
    const update = values('updateURL');
    const download = values('downloadURL');

    if (update.length === 0) {
        fail(HEADER_FILE, 0, '缺少 @updateURL：脚本管理器收不到更新');
    }
    if (download.length === 0) {
        fail(HEADER_FILE, 0, '缺少 @downloadURL');
    }
    if (update.length > 0 && download.length > 0 && update[0] !== download[0]) {
        warn(HEADER_FILE, lineOfKey('downloadURL'), '@updateURL 与 @downloadURL 不一致，装的和更新的会是两个文件');
    }

    for (const key of ['updateURL', 'downloadURL']) {
        for (const value of values(key)) {
            const line = lineOfKey(key);
            if (!value.startsWith('https://')) {
                fail(HEADER_FILE, line, '@' + key + ' 必须是 https：' + value);
            }
            if (!/\.user\.js$/.test(value)) {
                fail(HEADER_FILE, line, '@' + key + ' 要指向 .user.js 结尾的地址，否则脚本管理器可能不当它是脚本：' + value);
            }
            const found = slugOf(value);
            if (found && slug && found !== slug) {
                fail(HEADER_FILE, line, '@' + key + ' 指向 ' + found + '，但当前仓库是 ' + slug + '（从模板复制来的地址）');
            }
        }
    }
}

/* ---------- 3. GM 权限与代码是否对得上 ---------- */

function checkGrants(header, srcFiles) {
    console.log('\n== GM 权限 ==');
    const declaredAt = new Map();
    header.entries.filter((entry) => entry.key === 'grant').forEach((entry) => {
        if (!declaredAt.has(entry.value)) declaredAt.set(entry.value, entry.line);
    });

    const used = new Map();
    for (const item of srcFiles) {
        for (const [name, index] of collectApis(item.stripped)) {
            if (!used.has(name)) used.set(name, { file: item.file, line: lineOf(item.text, index) });
        }
    }

    for (const [name, at] of used) {
        if (NO_GRANT_NEEDED.has(name)) continue;
        if (!declaredAt.has(name)) {
            fail(at.file, at.line, '用到了 ' + name + '，但 src/header.txt 里没有 @grant ' + name
                + '：没授权的 API 在管理器里是 undefined，运行时会静默失败');
        }
    }

    for (const [name, line] of declaredAt) {
        if (name === 'none' || NO_GRANT_NEEDED.has(name)) continue;
        if (!used.has(name)) {
            warn(HEADER_FILE, line, '@grant ' + name + ' 在源码里没用到，可以删掉');
        }
    }

    const list = [...declaredAt.keys()].filter((name) => name !== 'none');
    const usedCount = [...used.keys()].filter((name) => !NO_GRANT_NEEDED.has(name)).length;
    console.log('   声明 ' + list.length + ' 项，实际用到 ' + usedCount + ' 项');
}

/* ---------- 4. 安全红线 ---------- */

function checkSinks(file, stripped) {
    const rules = [
        { pattern: /\beval\s*\(/, level: 'error', message: 'eval() 让页面可控的内容获得脚本权限，去掉它' },
        { pattern: /\bnew\s+Function\s*\(/, level: 'error', message: 'new Function() 等同于 eval，去掉它' },
        { pattern: /\bdocument\.write\s*\(/, level: 'warning', message: 'document.write() 会破坏页面结构，改用 DOM API' },
        { pattern: /\.(innerHTML|outerHTML)\s*=|\binsertAdjacentHTML\s*\(/, level: 'warning', message: '插入 HTML 字符串时要确认内容不是页面可控的，否则就是 XSS' },
    ];
    for (const rule of rules) {
        const matched = rule.pattern.exec(stripped);
        if (!matched) continue;
        // stripped 与原文等长，行号可以直接取自它
        const line = lineOf(stripped, matched.index);
        if (rule.level === 'error') fail(file, line, rule.message);
        else warn(file, line, rule.message);
    }
}

function checkConnectCoverage(header, srcFiles) {
    console.log('\n== @connect 覆盖 ==');
    const connects = new Set(header.values('connect').map((value) => value.toLowerCase()));
    let inspected = 0;

    for (const item of srcFiles) {
        item.text.split('\n').forEach((line, index) => {
            if (!REQUEST_CONTEXT_RE.test(line)) return;
            for (const matched of line.matchAll(/https:\/\/([A-Za-z0-9.-]+)/g)) {
                const host = matched[1].toLowerCase();
                inspected += 1;
                if (connects.has(host) || connects.has('*')) continue;
                warn(item.file, index + 1, '请求 ' + host + ' 但 @connect 里没有它：GM_xmlhttpRequest 会被拒绝（原生 fetch 也会被 CORS 拦）');
            }
        });
    }

    console.log('   检查了 ' + inspected + ' 处请求地址');
}

/* ---------- 5. 构建产物 ---------- */

function checkArtifact(modules, srcFiles) {
    console.log('\n== 构建产物 ==');
    if (!fs.existsSync(ARTIFACT_FILE)) {
        if (requireArtifact) {
            fail(ARTIFACT_FILE, 0, '产物不存在：CI 里要先跑 node build.js');
        } else {
            console.log('   script.js 不存在，跳过（npm run build 之后会自动检查）');
        }
        return;
    }

    const text = readText(ARTIFACT_FILE);
    if (!checkSyntax(ARTIFACT_FILE, text)) {
        return;
    }

    const first = text.split('\n')[0];
    if (first.trim() !== '// ==UserScript==') {
        fail(ARTIFACT_FILE, 1, '产物第 1 行必须是 // ==UserScript==，脚本管理器靠它识别脚本');
    }
    if (!/^\/\/ ==\/UserScript==\s*$/m.test(text)) {
        fail(ARTIFACT_FILE, 0, '产物里找不到元数据块结束行 // ==/UserScript==');
    }
    if (text.includes('__VERSION__')) {
        fail(ARTIFACT_FILE, 0, '产物里还留着 __VERSION__：build.js 没有替换成版本号');
    }

    const version = (parseMetadata(text).find((entry) => entry.key === 'version') || {}).value;
    if (!version) {
        fail(ARTIFACT_FILE, 0, '产物头部没有 @version');
    } else if (!VERSION_RE.test(version)) {
        fail(ARTIFACT_FILE, 0, '产物 @version 不合法：' + version);
    }

    // 模块要一个不漏，而且顺序必须按文件名前缀
    let previous = -1;
    for (const name of modules) {
        const source = (srcFiles.find((item) => item.name === name) || {}).text || '';
        const marker = firstMeaningfulLine(source);
        if (!marker) {
            warn(path.join(SRC_DIR, name), 0, '模块是空的');
            continue;
        }
        const index = text.indexOf(marker);
        if (index < 0) {
            fail(ARTIFACT_FILE, 0, '产物里缺少模块 ' + name + '（首行是「' + marker + '」）');
            continue;
        }
        if (index < previous) {
            fail(ARTIFACT_FILE, lineOf(text, index), '模块 ' + name + ' 在产物里的位置不对：合并顺序由文件名前缀决定');
        }
        previous = index;
    }

    console.log('   script.js：' + text.length + ' 字符，@version ' + (version || '(缺失)'));
}

/* ---------- 6. 工具脚本格式 ---------- */

function checkTooling() {
    console.log('\n== 工具脚本 ==');
    const candidates = [path.join(ROOT, 'build.js')];
    try {
        for (const name of fs.readdirSync(path.join(ROOT, 'scripts')).sort()) {
            if (name.endsWith('.js')) candidates.push(path.join(ROOT, 'scripts', name));
        }
    } catch (error) {
        /* 没有 scripts/ 就只查 build.js */
    }

    const files = candidates.filter((file) => fs.existsSync(file));
    for (const file of files) {
        const text = readText(file);
        checkSyntax(file, text);
        checkStyle(file, text);
    }
    console.log('   ' + files.length + ' 个文件：' + files.map((file) => path.basename(file)).join(', '));
}

/* ---------- 7. Actions 配置 ---------- */

// push 触发里有没有 branches 列表（只有 tags 的发布工作流不算门禁）
function pushHasBranches(text) {
    const lines = text.split('\n');
    const pushAt = lines.findIndex((line) => /^ {2}push:\s*$/.test(line));
    if (pushAt < 0) return false;
    for (let index = pushAt + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim() === '' || /^\s*#/.test(line)) continue;
        if (/^ {4}branches:/.test(line)) return true;
        if (!/^ {4}/.test(line)) return false; // 缩进退回到 push 的同级，说明 push 块结束了
    }
    return false;
}

// 只看整行注释之外的文本：注释里提到 pull_request_target 不等于用了它
function withoutComments(text) {
    return text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
}

function checkWorkflows(downloadName) {
    console.log('\n== .github/workflows ==');
    let names;
    try {
        names = fs.readdirSync(WORKFLOW_DIR).filter((name) => /\.ya?ml$/.test(name)).sort();
    } catch (error) {
        warn(WORKFLOW_DIR, 0, '没有 .github/workflows 目录：主干与 PR 就没有门禁');
        return;
    }

    let gate = false;
    for (const name of names) {
        const file = path.join(WORKFLOW_DIR, name);
        const text = readText(file);

        text.split('\n').forEach((line, index) => {
            const matched = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
            if (!matched) return;
            if (!matched[1].includes('@')) {
                fail(file, index + 1, 'uses: ' + matched[1] + ' 没有固定版本，要写成 owner/repo@vX 或 @<commit sha>');
            } else if (/@(main|master)$/.test(matched[1])) {
                warn(file, index + 1, 'uses: ' + matched[1] + ' 跟随可变分支，建议改成 tag 或 commit SHA');
            }
        });

        if (!/^permissions:/m.test(text)) {
            warn(file, 0, '没有声明顶层 permissions：默认权限可能超过作业需要');
        }
        if (!/^concurrency:/m.test(text)) {
            warn(file, 0, '没有 concurrency：同一分支连续推送会排队重复跑');
        }
        const code = withoutComments(text);
        if (/\bpull_request_target\b/.test(code)) {
            warn(file, 0, '用了 pull_request_target：若再 checkout PR 的代码，就等于把写权限交给外部贡献者');
        }

        const triggersPr = /^\s{2}pull_request(_target)?:/m.test(text);
        if (triggersPr && pushHasBranches(text)) {
            gate = true;
            if (/^\s{4}paths(-ignore)?:/m.test(text)) {
                warn(file, 0, '同时用了 path 过滤和 pull_request：把它设成必需检查后，被过滤掉的 PR 会一直停在 Expected，无法合并');
            }
        }
    }

    if (names.length > 0 && !gate) {
        warn(WORKFLOW_DIR, 0, '没有工作流同时在 push 分支和 pull_request 上触发：主干与 PR 不是同一套门禁');
    }

    if (downloadName) {
        const found = names.some((name) => readText(path.join(WORKFLOW_DIR, name)).includes(downloadName));
        if (!found) {
            fail(HEADER_FILE, 0, '@downloadURL 指向的 ' + downloadName
                + ' 没有出现在任何工作流里：发布产物的文件名和头部对不上，自动更新会 404');
        }
    }

    console.log('   ' + names.length + ' 个工作流：' + (names.join(', ') || '(空)'));
}

/* ---------- 主流程 ---------- */

function main() {
    console.log('检查目录：' + ROOT);

    const srcFiles = checkModules();
    const modules = srcFiles.map((item) => item.name);

    const header = checkHeader();
    if (header) {
        checkGrants(header, srcFiles);
        checkConnectCoverage(header, srcFiles);
    }

    checkArtifact(modules, srcFiles);
    checkTooling();

    const downloadName = header
        ? (header.values('downloadURL')[0] || '').split('/').pop().split('?')[0]
        : '';
    checkWorkflows(downloadName);

    /* 收尾 */
    const errors = problems.filter((problem) => problem.level === 'error');
    const warnings = problems.filter((problem) => problem.level === 'warning');

    if (process.env.GITHUB_ACTIONS === 'true' && problems.length > 0) {
        console.log('');
        for (const problem of problems) {
            const properties = [];
            if (problem.file) properties.push('file=' + escapeProperty(problem.file));
            if (problem.line) properties.push('line=' + problem.line);
            console.log('::' + problem.level + (properties.length ? ' ' + properties.join(',') : '')
                + '::' + escapeData(problem.message));
        }
    }

    console.log('\n结果：' + errors.length + ' 个错误，' + warnings.length + ' 个警告');
    if (errors.length > 0) {
        console.error('自检未通过。');
        process.exit(1);
    }
    console.log('自检通过。');
}

main();
