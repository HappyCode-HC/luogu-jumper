#!/usr/bin/env node
'use strict';

// 把 src/ 下的模块合并成单文件 userscript，并按 tag 版本号写头部。
// 只依赖 Node 标准库，仓库本身没有第三方依赖。

const fs = require('fs');
const path = require('path');

// 打包根目录：优先脚本所在目录，拿不到 src/header.txt 时回退到当前工作目录
const MARKER = 'src/header.txt';

function resolveRoot() {
    const candidates = [
        path.resolve(__dirname, '..'),
        process.cwd(),
        __dirname,
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, MARKER))) {
            return candidate;
        }
    }
    throw new Error('找不到 ' + MARKER + '，请在仓库根目录运行 npm run build');
}

const ROOT = resolveRoot();
const SRC_DIR = path.join(ROOT, 'src');
const HEADER = path.join(SRC_DIR, 'header.txt');
const OUTPUT = path.join(ROOT, 'script.js');
const VERSION_PLACEHOLDER = '__VERSION__';
// 源码里不含版本号；未注入版本（取消发布）时头部回落到这个占位版本
const FALLBACK_VERSION = '0.0.0';

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function usage() {
    console.log([
        '用法：',
        '  node build.js                   头部版本写成 ' + VERSION_PLACEHOLDER,
        '  node build.js --version 1.2.3   头部版本写成 1.2.3',
        '  node build.js --no-version      头部版本写成 ' + FALLBACK_VERSION,
        '  VERSION=1.2.3 node build.js     等价于 --version 1.2.3',
    ].join('\n'));
}

function parseArgs(args) {
    // undefined：未指定，沿用已生成文件里的版本；null：--no-version，回落到占位版本
    let version = process.env.VERSION || undefined;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--version') {
            version = args[index + 1];
            index += 1;
        } else if (arg.startsWith('--version=')) {
            version = arg.slice('--version='.length);
        } else if (arg === '--no-version') {
            version = null;
        } else if (arg === '--help' || arg === '-h') {
            usage();
            process.exit(0);
        } else {
            console.error('未知参数：' + arg);
            usage();
            process.exit(1);
        }
    }
    return version;
}

function readVersion(file) {
    try {
        const matched = read(file).match(/^\/\/\s*@version\s+(\S+)\s*$/m);
        return matched ? matched[1] : null;
    } catch (error) {
        return null;
    }
}

function main() {
    const version = parseArgs(process.argv.slice(2));
    if (typeof version === 'string' && !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(version)) {
        console.error('版本号不合法：' + version);
        process.exit(1);
    }

    let banner = read(HEADER);
    if (!banner.includes(VERSION_PLACEHOLDER)) {
        console.error('src/header.txt 里没有 ' + VERSION_PLACEHOLDER + ' 占位符');
        process.exit(1);
    }

    const modules = fs.readdirSync(SRC_DIR)
        .filter((name) => name.endsWith('.js'))
        .sort();
    if (modules.length === 0) {
        console.error('src/ 下没有可合并的 js 模块');
        process.exit(1);
    }

    // 未指定版本时，沿用已生成文件里的版本，避免本地构建把仓库里的版本号冲成占位值
    let used;
    if (version === undefined) {
        used = readVersion(OUTPUT) || FALLBACK_VERSION;
    } else {
        used = version === null ? FALLBACK_VERSION : version;
    }
    banner = banner.split(VERSION_PLACEHOLDER).join(used);

    const body = modules
        .map((name) => read(path.join(SRC_DIR, name)).replace(/\s+$/, '') + '\n')
        .join('\n\n');

    fs.writeFileSync(OUTPUT, banner.trimEnd() + '\n\n' + body, 'utf8');

    console.log('已生成 ' + path.relative(ROOT, OUTPUT)
        + '：版本 ' + used + '，合并 ' + modules.length + ' 个模块');
}

if (require.main === module) {
    main();
}

module.exports = { OUTPUT, SRC_DIR, VERSION_PLACEHOLDER, FALLBACK_VERSION, parseArgs };
