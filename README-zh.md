# dsh-git-multirepo

在 DSH 里集中查看多个 Git 仓库的提交和未提交改动。

[English](https://github.com/drypeek/dsh-git-multirepo/blob/main/README.md) · 简体中文

工作区里有前端、后端、工具几个独立仓库时，**GIT日志** 页签会把它们的历史放在同一条时间线上。每条提交和每个改动文件都标着所属仓库，不用来回切换目录。

这是 DeepSeek Harness（DSH）的第三方插件，不是 DeepSeek 官方项目。

[![npm version](https://img.shields.io/npm/v/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![npm downloads](https://img.shields.io/npm/dm/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![CI](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml/badge.svg)](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/stargazers)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5%20--%200.2.x-blue)
![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow)

## 功能

- 查看当前分支或所有分支。当前分支模式下，远程新提交会单独列出来。
- 「工作区改动」按仓库列出冲突、已暂存、未暂存和未跟踪的文件。点文件即可在右侧栏查看差异。
- 展开提交可以看提交说明和改动文件，点文件名查看差异。
- 单仓库工作区会在提交历史里显示提交树，分支、合并和不同工作线一目了然。
- 按仓库、时间、提交信息、作者、短哈希或修改过的文件名筛选。
- 滚到列表底部（或点「加载更多提交」）可以继续往前翻；每个仓库最多加载 500 条，提交树会随加载继续延伸。
- 查看未提交改动和领先／落后远程的数量，也可以一次拉取多个仓库。
- 让 AI 帮你读提交：在提交行上右键，选择「添加到对话」，再输入你的问题；Agent 可以用插件的只读工具查看对应提交和差异。

## 安装

需要 DSH 0.2.1-rc.5 到 0.2.x、Git 2.36 及以上，以及 Node.js 20+。

从 npm 安装（[dsh-git-multirepo](https://www.npmjs.com/package/dsh-git-multirepo)）。在 DSH 侧边栏打开 **插件 → 添加插件 → 安装第三方插件**，输入 `dsh-git-multirepo`；或者运行：

```sh
dsh plugin --profile <profile> add dsh-git-multirepo
```

安装后插件默认启用。如果之前手动关过，到插件页重新打开即可。桌面版安装或升级后需要重启 DSH，Web 版刷新页面就行。打开一个会话后，**对话** 和 **轨迹** 旁边会出现 **GIT日志** 页签。

其他安装方式：

- 从最新 GitHub Release 安装预构建包：
  ```sh
  dsh plugin --profile <profile> add https://github.com/drypeek/dsh-git-multirepo/releases/latest/download/dsh-git-multirepo.tgz
  ```
- 本地目录，适合开发调试：
  ```sh
  git clone https://github.com/drypeek/dsh-git-multirepo.git
  dsh plugin --profile <profile> add "link:/absolute/path/to/dsh-git-multirepo"
  ```

## 使用

打开 **GIT日志** 时，插件会扫描当前会话的工作目录。切换会话后，列表也会跟着切换。

页签顶部有 **提交历史** 和 **工作区改动** 两个视图。工作区改动按仓库分组显示冲突、已暂存、未暂存和未跟踪的文件；点文件可以在右侧栏看差异，搜索框会同时匹配文件路径和仓库名。这个视图是只读的，不能暂存、提交或还原文件。

在提交历史里点一条提交可以展开详情，再点文件名查看差异。仓库标签用来控制哪些仓库出现在列表里，搜索框和时间选项用来缩小范围。

两个更新按钮做的事不一样：

| 按钮 | 作用 |
| --- | --- |
| 刷新 | 重新读取本地的提交、工作区改动和仓库状态，不联系远程。 |
| 拉取 | 对扫描到的仓库执行 `git fetch --all --prune`，然后刷新列表。有仓库时，会先用确认框说明仓库数量和只读行为。 |

确认结果只在当前页面、按工作区记住 10 分钟。刷新页面会重新询问，也不会写入磁盘；失败的拉取不会让下次跳过确认。拉取结果会显示在可关闭的横幅里：成功的话 3 秒后自动消失，部分失败、超时和错误会一直保留，直到你手动关闭。展开横幅还能看到每个仓库的详情，包括哪些目录因为不是仓库被跳过。超时会显示成超时，不会当成成功；在提交历史和工作区改动之间切换时，横幅也不会消失。

工作区改动视图里只有 **刷新**；拉取和回到 HEAD 属于提交历史。

这里的「拉取」是 `git fetch`，不是 `git pull`。它不会合并分支，也不会改动工作区文件。远程提交出现在列表里之后，要不要合并仍然由你决定。

这个页签打开时会隐藏底部的对话输入框，给列表多留一点空间。要接着聊天，切回 **对话** 就行。

## 让 AI 一起看提交

在提交行上右键，选择 **添加到对话**；也可以按 <kbd>Shift</kbd>+<kbd>F10</kbd> 打开菜单再选。插件会在输入框里插入一条类似 `[commit:web@a1b2c3d]` 的引用，但不会替你发送消息。补上自己的问题，需要的话再加几条提交，然后发送。发送后每条引用会变成行内胶囊，Agent 可以用插件的只读工具查看对应仓库、提交和差异。

## 常见问题

### 为什么找不到某个仓库？

先看看当前会话的工作目录对不对。插件默认向下扫描 4 层，最多列出 100 个仓库，会跳过隐藏目录，以及 `node_modules`、`bin`、`obj`、`dist`、`target` 这类目录。达到扫描上限时，界面会提示。

### 为什么看不到更早的提交？

列表默认只读每个仓库最近 40 条提交，也有总量和大小限制。要看完整历史，可以在终端里用 `git log`。提交列表、文件列表或差异太大时，内容会被截断或直接报错，界面会说明原因。

### 「工作区改动」有哪些限制？

- 只读展示，不能暂存、提交、还原或解决冲突。
- 重命名会显示成删除加新增，不显示改名关系。
- 未跟踪的目录在列表里折叠成一行，暂时不会逐文件展开。
- 冲突文件会列出来，但还不能渲染合并后的差异。
- 未跟踪文件超过 512 KB 就不预览内容；二进制文件和符号链接只显示状态。
- 提交文件名搜索覆盖当前已加载的提交窗口，每个提交最多保留 24 个改动文件名。

### 用 `git worktree` 时提示读不了怎么办？

如果主仓库在工作树所在的工作区外面，需要把主仓库也注册成 DSH 工作区。插件要求 Git 元数据和对象目录都在已注册的工作区内；目前也不支持通过 `objects/info/alternates` 共享对象的仓库。

### 部分克隆提示缺少对象怎么办？

查看提交和差异时，插件不会自动联网补对象。先点 **拉取** 试试；如果还缺，就在终端里把对象取回来，再重新打开差异。

## 安全与隐私

插件没有遥测或统计。日常查看只读本地记录；只有点 **拉取** 时才会用到 Git 的网络功能。插件不会提交、推送或合并代码。

查看工作区改动只会运行只读的 Git 命令（`status`、`diff`、`config`、`rev-parse`）。预览未跟踪文件时会直接读文件内容，但读取范围限制在仓库内，不跟随符号链接，单个文件最多 512 KB。

拉取会使用你现有的 SSH 和 Git 凭据配置，也可能运行仓库自己配置的程序，所以只对可信的仓库使用。系统和全局 Git 配置同样视为你信任的配置。

DSH 负责各接口的鉴权，仓库路径也限制在已注册的工作区内。具体防护、适用边界和漏洞反馈方式见 [SECURITY.md](https://github.com/drypeek/dsh-git-multirepo/blob/main/SECURITY.md)。

## 开发

在仓库目录中运行：

```sh
npm run check
npm test
```

测试会使用临时仓库和本地测试程序，不会连接外部远程仓库。`npm publish` 前也会自动跑这两项检查。

## 许可证

[MIT](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
