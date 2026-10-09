# Luogu Jumper 洛谷跳转器

## 安装

首先，你需要一个脚本管理器，例如Tampermonkey 或 Violentmonkey。

打开 [Release 页面](https://github.com/HappyCode-HC/luogu-jumper/releases)，点击 `luogu-jumper.user.js` 即可安装。

## 功能

### 题目页跳转 VJudge

打开任意题目页，「复制题目」按钮右边会多出一个「跳转VJudge」。

![](/assets/problem.jpg)

### 国际站跳转保存站

在 `www.luogu.com` 上打开 `/article/...` 或 `/paste/...`，直接跳到 `www.luogu.me` 上的同一个地址。

## 扩展设置

打开[用户设置](https://www.luogu.com.cn/user/setting)，选项卡里会多出一个「扩展设置」，与「个人信息」「偏好设置」等并列，里面是各功能的开关和更新选项。

- 开关在页面加载时读取一次，改完需要刷新页面生效。
- 扩展设置的状态记录在地址栏参数 `?luogu-jumper-setting` 上，因此可以直接收藏或分享带该参数的链接；不带参数时进入的是洛谷原生的「个人信息」。
- 该选项卡只出现在用户设置页，其他页面不做改动。

## 更新

脚本头部声明了 `@updateURL` / `@downloadURL`，Tampermonkey 与 Violentmonkey 会按各自周期自动检查更新。

「扩展设置」里另有更新选项：进入设置页时会自动检查一次（结果缓存 6 小时），也可以手动点「检查更新」。发现新版本时点「更新」，会在新标签页打开最新的 `.user.js`，由脚本管理器接管安装。

> 从 `0.1.x` 升级到带更新元数据的版本需要手动重装一次 —— 旧版本的头部没有 `@updateURL`，收不到那次自动更新。此后自动更新才会生效。

版本号不需要手动改，打 tag 时由 CI 写进脚本头部，详见「发布」。

## 开发

源码按职责拆在 `src/` 下，文件名前缀决定合并顺序：

| 模块 | 负责 |
| --- | --- |
| `src/00-core.js` | 存储与配置 |
| `src/10-problem.js` | 题目页跳转 VJudge |
| `src/20-international.js` | 国际站跳转保存站 |
| `src/30-update.js` | 更新检查 |
| `src/40-settings.js` | 用户设置页的扩展设置选项卡 |
| `src/header.txt` | userscript 头部，`@version` 用 `__VERSION__` 占位 |

`build.js` 把模块按文件名顺序合并，并用 `--version` 指定的值替换头部占位符，输出仓库根目录的 `script.js`：

```bash
node build.js --version 1.2.3   # 写入指定版本号
node build.js --no-version      # 不写版本号，头部回落 0.0.0
node build.js                   # 沿用 script.js 里已有的版本号
```

仓库没有第三方依赖，`script.js` 作为产物一并提交，方便直接安装和阅读。

## 发布

推一个 `v*` tag 即可发布，`Release` 工作流会：

1. 合并 `src/` 模块，把头部 `@version` 写成 tag 版本号；
2. 提交这次改动，再把 tag 移到这个「写版本号」的提交上；
3. 发布 Release，附上 `luogu-jumper.user.js`。

tag 被移走后工作流会再跑一次，此时产物已经带着版本号，只更新 Release 资产，不会反复提交。

Release 被撤销或删除时，`Unpublish` 工作流执行相反的操作：重新合并、去掉头部版本号，提交这次改动，再把 tag 挪回不含版本号的源码提交。这样下一次发布时会重新合并、重新写版本号、重新打 tag。

`script.js` 里带着上次发版的版本号，从源码安装不影响使用；版本号只在打 tag 时由 CI 改写。

