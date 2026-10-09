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

`build.js` 把模块按文件名顺序合并，并用 `--version` 指定的值替换头部占位符：

```bash
node build.js --version 1.2.3   # 写入指定版本号
node build.js --no-version      # 不写版本号，头部回落 0.0.0
node build.js                   # 沿用已有产物里的版本号
```

产物 `script.js` 写在仓库根目录，已加入 `.gitignore`，不入库：仓库只保存 `src/` 源码与构建脚本，发版时由 CI 重新构建。

## 检查

推 `main` / `dev` 与提 PR 都会跑 `.github/workflows/ci.yml`：先按与发版相同的方式构建一遍产物（含 `--version` 注入），再执行 `scripts/check-userscript.js`。这个自检只用 Node 标准库，和构建脚本一样不引入第三方依赖，覆盖：

- `src/` 模块的命名（两位数字前缀决定合并顺序）、语法、缩进/行尾/末尾换行；
- 头部元数据：`@version` 必须是 `__VERSION__` 占位符、`@match` 不能过宽、`@updateURL` / `@downloadURL` 指向本仓库且与 Release 资产同名；
- 代码与 `@grant` 是否对得上：用了没声明、声明了没用都会报出来；
- 产物是否完整（模块一个不漏、顺序正确、占位符已替换）；
- `.github/workflows/` 里的 `uses:` 是否固定版本、`permissions` 是否收敛。

本地跑同样的检查：

```bash
npm run check     # 先构建再自检
npm run verify    # 只自检，要求产物已存在
```

CI 还会把构建好的 `luogu-jumper.user.js` 作为 artifact 上传，PR 页面可以直接下载安装试用。注意它的 `@updateURL` 仍指向 latest release，脚本管理器下次检查更新时会把 PR 版本换回正式版本。

## 发布

推一个 `v*` tag 即可发布，`Release` 工作流会合并 `src/` 模块、把头部 `@version` 写成 tag 版本号，再把产物作为 `luogu-jumper.user.js` 附到 Release 上。产物不提交进仓库，所以发布不改动代码历史。

