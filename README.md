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

## 开发

`script.js` 就是全部源码，CI 在打 tag 时把 `@version` 重写为 tag 版本号，再复制成 `luogu-jumper.user.js` 作为 Release 资产。仓库没有构建步骤、测试和依赖。
