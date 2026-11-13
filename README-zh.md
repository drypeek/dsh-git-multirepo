# dsh-git-multirepo

在 DSH 中集中查看多个 Git 仓库的提交记录和工作区改动。

[English](https://github.com/drypeek/dsh-git-multirepo/blob/main/README.md) · 简体中文

工作区里同时有前端、后端或工具仓库时，可以在「GIT日志」页签中一起查看它们的历史和未提交改动，不必逐个切换目录。提交按时间排列，并标明所属仓库。

这是 DeepSeek Harness（DSH）的第三方插件，与 DeepSeek 无隶属关系。

[![npm version](https://img.shields.io/npm/v/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![npm downloads](https://img.shields.io/npm/dm/dsh-git-multirepo)](https://www.npmjs.com/package/dsh-git-multirepo)
[![CI](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml/badge.svg)](https://github.com/drypeek/dsh-git-multirepo/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/drypeek/dsh-git-multirepo)](https://github.com/drypeek/dsh-git-multirepo/stargazers)
![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![dsh](https://img.shields.io/badge/dsh-0.2.1--rc.5%20--%200.2.x-blue)
![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow)

## 功能

- 查看当前分支或所有分支的提交。当前分支模式下，尚未合并的远程提交会单独分组。
- 「工作区改动」视图按仓库列出冲突、已暂存、未暂存和未跟踪文件，点击文件在右侧栏查看差异。
- 展开提交说明、作者和变更文件，点击文件在右侧查看差异。
- 按仓库、时间、提交信息、作者或短哈希筛选记录。
- 查看各仓库的未提交改动和领先／落后远程的数量，一次获取多个仓库的远程更新。
- 和 AI 联动：每个提交行都有「添加到对话」按钮，点击后把仓库、提交和变更文件发送到当前对话；Agent 可以通过只读的 `git_multirepo_*` 工具查看仓库状态、提交和差异。

## 安装

需要 DSH 0.2.1-rc.5 至 0.2.x、Git 2.36+，运行环境需满足 Node.js 20+。

从 npm 安装（[dsh-git-multirepo](https://www.npmjs.com/package/dsh-git-multirepo)）。在 DSH 侧边栏打开 **插件 → 添加插件 → 安装第三方插件**，输入 `dsh-git-multirepo`；或执行：

```sh
dsh plugin --profile <profile> add dsh-git-multirepo
```

安装后默认启用；如果之前手动关闭过，请在插件页重新启用。桌面版安装或升级后需要重启 DSH；Web 版刷新页面即可。打开会话后，「对话」「轨迹」旁会出现 **GIT日志** 页签。

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

打开 **GIT日志** 后，插件会扫描当前会话的工作目录。切换会话后，列表也会切换到对应目录。

页签顶部可在 **提交历史** 和 **工作区改动** 之间切换。工作区改动视图按仓库分组显示文件：冲突、暂存、未暂存、未跟踪。点击文件在右侧栏查看对应差异；搜索框按文件路径和仓库名筛选。该视图为只读，不提供暂存、提交或还原操作。

在提交历史视图点击一条提交展开详情，再点击文件名查看差异。仓库标签可以控制哪些仓库显示在列表中，搜索框和时间选项用于缩小范围。

两个更新按钮的作用不同：

| 按钮 | 作用 |
| --- | --- |
| 刷新 | 重新读取本地已有的提交、工作区改动和仓库状态，不获取远程更新。 |
| 拉取 | 对扫描到的仓库执行 `git fetch --all --prune`，获取远程更新后刷新列表。有仓库时会先询问确认。 |

在「工作区改动」视图中仅保留刷新按钮；拉取、回到 HEAD 等操作属于提交历史视图。

这里的「拉取」是 `git fetch`，不是 `git pull`。它不会合并分支，也不会把工作区文件更新成远程版本。远程提交出现在列表后，仍需自行决定是否合并。

这个页签会隐藏底部的对话输入框，给列表留出空间。需要继续聊天时，切回 **对话** 即可。

## 常见问题

### 为什么找不到某个仓库？

先检查当前会话的工作目录。插件默认向下扫描 4 层，最多列出 100 个仓库；扫描时会跳过隐藏子目录，以及 `node_modules`、`bin`、`obj`、`dist`、`target` 等目录。达到扫描上限时，界面会提示。

### 为什么看不到更早的提交？

列表默认读取每个仓库最近 40 条提交，并有总量和大小限制。需要查看完整历史时，可以在终端中使用 `git log`。提交列表、文件列表或差异过大时会截断或报错，界面会说明。

### 「工作区改动」有哪些限制？

- 只读展示，不提供暂存、提交、还原或冲突解决。
- 重命名显示为删除 + 新增，不显示 rename 关系。
- 未跟踪目录在列表中折叠为一行，暂不逐文件展开。
- 冲突文件会列出，但不渲染 combined diff。
- 单个未跟踪文件超过 512 KB 时不预览内容；二进制文件与符号链接只显示状态。

### 使用 `git worktree` 时提示无法读取怎么办？

如果主仓库位于工作树所在的工作区之外，需要把主仓库也注册为 DSH 工作区。插件要求 Git 元数据和对象目录位于已注册工作区内，目前不支持通过 `objects/info/alternates` 共享对象的仓库。

### 部分克隆提示缺少对象怎么办？

查看提交和差异时，插件不会自动联网补取对象。请先点击 **拉取**；如果仍缺少所需对象，在终端中获取后重新打开差异。

## 安全与隐私

插件不包含遥测或统计功能。日常查看只读取本地记录；Git 网络传输只在点击 **拉取** 后启用。插件不会提交、推送或合并代码。

查看工作区改动只运行只读 Git 命令（`status`、`diff`、`config`、`rev-parse`）。预览未跟踪文件时会直接读取文件内容，读取限制在仓库内、不跟随符号链接、单文件上限 512 KB。

拉取会使用你已有的 SSH 和 Git 凭据配置，也可能运行仓库配置的程序，因此只对可信仓库使用这一操作。系统和全局 Git 配置同样被视为你信任的配置。

各接口交由 DSH 鉴权，仓库路径限制在已注册的工作区内。具体防护、适用范围和漏洞反馈方式见 [SECURITY.md](https://github.com/drypeek/dsh-git-multirepo/blob/main/SECURITY.md)。

## 开发

在仓库目录中运行：

```sh
npm run check
npm test
```

测试使用临时仓库和本地测试程序，不连接外部远程仓库。`npm publish` 前也会自动运行这两项检查。

## 许可证

[MIT](https://github.com/drypeek/dsh-git-multirepo/blob/main/LICENSE)
