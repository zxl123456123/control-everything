# 宠物（蜘蛛 / 奶龙 / 狸花猫）集成指南

本文是把「奶龙」和「狸花猫」两只 3D 宠物接进主项目的采用手册：改了什么、怎么应用、怎么验证、怎么回滚，以及接入时需要你拍板的适配点。嵌入到别的页面（浮动挂件、整页覆盖层、侧栏）请看 [`EMBEDDING.md`](EMBEDDING.md)；本文只讲「接进这个仓库」。

> 文件名 `PETS_INTEGRATION.md` / `EMBEDDING.md` 是大写，和 `docs/` 里其它小写文档风格不一致；它们已经登记在 `.gitignore` 白名单和两个检查脚本的公开文档清单里，改名时三处要一起改。

## 1. 现在是什么状态

- 新闻阅读器（`/news`）里有一个宠物切换器（页面底部「宠物」下拉，研究面板里还有一个）：**蜘蛛（默认）/ 奶龙 / 狸花猫**。
- 三只宠物实现同一个 `mount()` 接口，由 `window.NewsPets` 注册表统一管理。
- 奶龙、狸花猫是**按需加载**的：只有被选中时才请求各自的脚本，加载失败自动回退到蜘蛛。
- 状态条数据源 `news-pet-status.js` 只有在「页面可见、没暂停、当前宠物带状态条」时才轮询；默认蜘蛛不会发出任何额外请求。
- 偏好存在 `news-reader-pet`，通过 `CERemoteContext.storage('localStorage')` 读写，远程账号之间互相隔离。
- 本分支**没有**带演示页、演示面板、螳螂、Blender 源文件，也没有 `NAIDRAGON_NOTES.md` 之类的过程笔记。

## 2. 提交与文件清单

四个小提交（都在 `integrate/pets` 上，基于当时最新的 `develop`）：

1. `feat(news): add pet registry, Nailong pet and shared status feed to the reader`
2. `feat(news): add tabby cat pet and a pet exclusion flag`
3. `fix(news): poll pet status only for status-aware pets and keep the switcher robust`
4. `fix(news): give 3D pets room in the list view and keep them off the pet switch on narrow screens`

之后还有一个文档提交（本文 + 白名单登记）。

| 类别 | 文件 |
| --- | --- |
| 新增（运行时） | `web/workspace/news-pets.js`、`news-pet-status.js`、`news-naidragon.js`、`news-tabbycat.js` |
| 修改（阅读器） | `web/workspace/news-reader.js`、`news-reader.css`、`news-reader.html` |
| 打包与白名单 | `src/control_everything/http/news_reader.py`（`ASSETS`）、`tools/packaging/build_assets.py`（`WEB_ASSETS`）、`MANIFEST.in`、`.gitignore` |
| 检查脚本清单 | `tools/scripts/check_architecture.py`、`tools/scripts/check_repository.py` |
| 测试 | `tests/frontend/test_news_naidragon.cjs`、`test_news_tabbycat.cjs`；`tests/e2e/verify_news_reader.cjs`、`verify_news_reader_profiles.cjs`（资源白名单） |
| 文档 | `docs/EMBEDDING.md`、`docs/PETS_INTEGRATION.md`、`docs/usage.md`（两行）、`docs/examples/pets/naidragon-embed.{html,css,js}` |

## 3. 怎么应用

**方式 A：直接合并分支（推荐）**

```bash
git fetch <这个仓库的本地路径或 bundle> integrate/pets
git checkout -b integrate/pets FETCH_HEAD     # 或 git merge --no-ff FETCH_HEAD
```

用 bundle 时：`git fetch integrate-pets.bundle integrate/pets`。

**方式 B：只打补丁（不带提交历史）**

```bash
git switch -c integrate/pets develop
git apply --check integrate-pets.patch   # 先检查
git apply integrate-pets.patch
git add -A && git commit -m "feat(news): add selectable 3D pets to the reader"
```

`integrate-pets.patch` 是相对导出时 `develop` 最新提交的整体 diff。如果 `develop` 之后动过 `news-reader.js/css/html`，`git apply --check` 会失败，改用 `git apply --3way`，或方式 A / C。

**方式 C：挑提交**

```bash
git cherry-pick 9659b9b1 0d392b34 8c79e186 6f31295f   # 以导出时的哈希为准，见 summary.md
```

**冲突提示**：最容易冲突的是 `news-reader.js`（`mountMainPet / mountResearchPet / switchPet / petDock / syncPetStatusFeed`，以及 `window.NewsReader` 导出）、`news-reader.css`（`.pet-switch` 规则）和 `news-reader.html`（两个 `select.pet-select`）。解决冲突时保留 `develop` 的 `CERemoteContext` 逻辑（`canPoll()`、`active`、`suspended`、`destroyed`）。

## 4. 验证命令

Node 用 24 跑（我的验证全部在 Node 24 下完成）。

```bash
# 宠物测试
node --test tests/frontend/test_news_naidragon.cjs tests/frontend/test_news_tabbycat.cjs
# 阅读器相关
node --test tests/frontend/test_news_reader_scheduling.cjs
# 整个前端测试
for f in tests/frontend/*.cjs; do node --test "$f"; done
# 结构与仓库检查
python tools/scripts/check_architecture.py layout
python tools/scripts/check_repository.py changes --base <40位SHA> --head <40位SHA> --report work/repo_report.json
# 打包：构建 wheel（需要 setuptools、wheel），确认四个宠物脚本都在 _assets/web/workspace/ 里
pip wheel . --no-deps --no-build-isolation -w /tmp/whl
# 真实网关冒烟：启动网关后打开 /news，在底部「宠物」下拉切换三只
```

上面的 `<40位SHA>` 必须是完整 40 位哈希（`check_repository` 的要求）。结果与基线对比见 `summary.md`。

## 5. 适配点与建议（需要你确认）

**(a) 默认宠物与偏好键迁移**
默认仍是蜘蛛：`NewsPets.defaultName()` 返回蜘蛛（蜘蛛不存在时取第一个启用的宠物）。键名沿用 `news-reader-pet`，因为是新键，**不需要迁移**；值不认识、或对应宠物被排除时，自动回退到 `defaultName()`。想把奶龙设为默认，只改 `news-pets.js` 里的 `defaultName`（别的地方不用动）。

**(b) 状态轮询：全局还是只在宠物可见时**
已按「只在需要时」实现：页面活跃且可见、没暂停、当前宠物 `status: true` 才启动 `PetStatusFeed`；切回蜘蛛、隐藏页面、销毁阅读器都会停止。蜘蛛为默认时，网络上没有 `/api/workspace/usage`、`/api/workspace/observations` 请求（真实网关实测）。如果以后希望全局共享一份状态，可以把 `PetStatusFeed` 提到工作台壳里，宠物只调用 `setStatus`。

**(c) 停靠与安全边距**
- 文章阅读视图：宠物停在阅读器右下、底部操作栏上沿（`petDock()`），不会盖住按钮。
- 列表视图：没有停靠点，宠物回仓库（`depotHome`）；3D 宠物比蜘蛛宽，所以给 `html[data-pet=naidragon|tabbycat]` 的列表视图仓库加宽到 96px，避免盖住「等待阅读」。
- 窄屏（宽度小于 720px）：`petDock()` 返回 `null`，宠物留在仓库，因为那一行已经被「宠物」下拉占据；巡逻时仍会掠过正文，但画布 `pointer-events: none`，不挡点击。
- 如果主工作台以后在阅读器外加了固定条或悬浮按钮，需要同步调整 `petDock()` 或宠物的 `margin`。

**(d) CSP 与内联样式**
- 阅读器页面的 CSP 已经有 `style-src 'self' 'unsafe-inline'` 和 `script-src 'self'`，宠物无需改动。
- 宠物脚本不使用 `eval`、`innerHTML`、内联脚本；懒加载用同源 `<script src>`。
- **注意 `/workspace` 页面**：它的 CSP 是 `default-src 'self'; img-src 'none'; ...`，没有 `style-src`，宠物创建的 `<style>` 会被拦截，画布里的宠物能画出来，但仓库、气泡、状态条等 DOM 层会失去样式（实测）。要在 `/workspace` 挂宠物，有两种办法：给该页面 CSP 加 `style-src 'self' 'unsafe-inline'`（和新闻页一致），或者服务端生成 nonce，加到 `style-src 'nonce-…'`，再把同一个 nonce 作为 `styleNonce` 传给 `mount`。这个改动在网关（`gateway.py` 的默认 CSP）里，我没有动，需要你决定。

**(e) 打包与 e2e 白名单**
新增的四个脚本已加到：`news_reader.py` 的 `ASSETS`（否则网关 404）、`build_assets.py` 的 `WEB_ASSETS`、`MANIFEST.in`（wheel / sdist）。TypeScript 只编译固定入口，宠物是纯 JS，不需要进编译链。两份 e2e 脚本的资源白名单加了 `news-pets / news-pet-status / news-naidragon / news-tabbycat`。以后新增宠物脚本，这五处都要同步。

**(f) 授权与 IP；排除某只宠物的开关**
- 奶龙是第三方角色（表情包 IP）。仓库里是**原创的程序化几何建模**，没有使用任何官方图片、模型或贴图，但角色形象本身的权利不属于我们。**内部或个人使用问题不大；公开发布、商用或随安装包分发之前，需要确认授权，或者换成原创角色。**狸花猫是通用品种，没有这类问题。
- 不删代码就能把某只宠物从切换器里去掉，最小实现是两种方式：
  - 页面级：`<html data-pets-disabled="naidragon,tabbycat">`；
  - 源码级：`register('naidragon', {enabled: false, ...})`。
  被排除的宠物不出现在切换器和 `NewsPets.list()` 里，不会请求它的脚本；蜘蛛永远不能被排除；少于 2 只可用时整个切换器隐藏；已保存的偏好指向被排除的宠物时自动回退到默认。
- 如果只想在发行包里去掉奶龙，建议同时把 `news-naidragon.js` 从 `ASSETS / WEB_ASSETS / MANIFEST.in` 移除（并删除对应测试），否则安装包里仍带着这份文件。

**(g) 在 `/workspace` 和桌面壳里挂载**
- 通用做法见 `EMBEDDING.md` 第 1–3 节：页面里引入同源的 `news-pets.js`（和可选的 `news-pet-status.js`），准备一个有尺寸的容器（含 `<canvas>` 和仓库元素），调用 `NewsPets.mount('naidragon', {root, canvas, depot, options:{dock:'br'}})`。懒加载脚本的地址取自 `news-pets.js` 自身所在目录，所以挂在子路径或 WebView2 虚拟主机下也能找到。
- 示例页 `docs/examples/pets/naidragon-embed.html`（浮动挂件、整页覆盖、侧栏）已在无头 Chrome 里跑通，没有控制台错误（只有没有网关时状态接口的 404，状态源会自己退避）。
- 在真实网关的 `/workspace` 页面里动态注入并挂载奶龙，WebGL 正常，唯一问题是上面 (d) 的 CSP。
- **WebView2 桌面壳没有实机验证**（我这里是 Linux + Chrome + SwiftShader）。上线前请在 Windows 的 WebView2 里确认：WebGL 是否可用（不可用时宠物会退到 `canvas2d-fallback`）、DPI 缩放、虚拟主机下的懒加载路径。

**(h) 体积预算、懒加载、压缩**

| 文件 | 原始 | gzip |
| --- | --- | --- |
| `news-pets.js` | 6.0 KB | 2.4 KB |
| `news-pet-status.js` | 4.0 KB | 1.6 KB |
| `news-naidragon.js`（按需） | 116.6 KB | 39.8 KB |
| `news-tabbycat.js`（按需） | 153.9 KB | 52.5 KB |
| 阅读器自身增量（js+css+html） | +7.0 KB | +2.0 KB |

默认（蜘蛛）页面比以前多下载约 **6 KB gzip**；选择奶龙再多约 40 KB，狸花猫约 52 KB。仓库现有工具链里**没有压缩器**（没有 terser / esbuild），所以没有引入压缩；网关和 Edge/WebView2 本地回环下 gzip 收益有限。如果以后要压缩，建议在 `build_assets.py` 这一步对两只宠物脚本单独做，源码保持可读。

**(i) 演示代码：保留什么、去掉什么**
- 已去掉：演示路由 / 演示面板（`*-demo-panel.js`）、螳螂宠物、Blender 源文件与过程笔记。
- 保留：`docs/examples/pets/naidragon-embed.*`（嵌入示例，被 `check_repository` 公开文档清单登记）。如果你不想让公开仓库带示例，可以删这三个文件和两个检查脚本里对应的清单项、`.gitignore` 的 `!/docs/examples/` 不用动（它也被别的示例使用）。
- 保留：`window.NewsReader` 上的诊断接口（`inspect`、`switchPet`、`setPetStatus`…），测试和 e2e 在用。

## 8. 宠物设置页、开关与转盘

**入口**：个人工作台（`/studio`）左下角「设置」→「外观」（地址 `#settings/appearance`），里面有「宠物」开关和形象下拉（蜘蛛 / 奶龙 / 狸花猫）。阅读器顶部的「宠物」下拉与「显示宠物 / 隐藏宠物」按钮是同一份偏好的另一个入口。

**偏好与同步**（统一由 `web/workspace/news-pet-prefs.js` 提供 `window.NewsPetPrefs`，设置页和阅读器都只通过它读写）：

| 键（`localStorage`，经 `CERemoteContext.storage` 隔离远程账号） | 取值 | 默认 |
| --- | --- | --- |
| `news-reader-pet` | `spider` / `naidragon` / `tabbycat`，不认识的值回退到蜘蛛 | 蜘蛛 |
| `news-reader-pet-enabled` | `true` 开启，其余视为关闭 | **关闭**（蜘蛛原本就是可选的） |

- `NewsPetPrefs.read()`、`setPet(name)`、`setEnabled(flag)`、`subscribe(fn)`；只有值真的变化时才通知，写入失败返回 `false`，设置页会提示“无法保存设置”。
- 同一浏览器的其它标签页、嵌入的阅读器 iframe 通过 `storage` 事件实时跟随，不需要刷新。
- `data-pets-disabled` 仍然是宿主级的否决开关，不会被这个开关改写；被排除的宠物不会出现在设置页的下拉里。
- 3D 宠物脚本加载失败时，阅读器退回蜘蛛并派发 `window` 事件 `news-pet-fallback`；下拉仍显示用户的选择，转盘按钮隐藏。
- 开发分支里旧的 `news-spider-visible-v1:<scope>` 没有迁移（它只存在于未发布的 develop 版本）。

**转盘**（奶龙、狸花猫；蜘蛛没有转盘，`#pet-dial` 按钮会隐藏）：点宠物或点顶部「转盘」按钮展开，第一页最多 6 个宿主动作，由 `news-reader.js` 的 `petActions()` 提供，都作用在真实应用上：

| 动作 | 效果 |
| --- | --- |
| 打开工作台 | 跳到 `#home`（嵌入时改父页面的 hash） |
| 下一条 | 同顶部「下一条」按钮 |
| 搜索 | 打开阅读器搜索 |
| 采集新闻 | 同顶部「采集」按钮，打开采集面板 |
| 宠物设置 | 跳到 `#settings/appearance` |
| 隐藏宠物 | 关闭开关，焦点回到「显示宠物」，并提示在哪里再打开 |

键盘：不设全局快捷键。Tab 到「转盘」按钮按 Enter/空格，焦点进入转盘；方向键在动作间移动，Enter 执行，Esc 关闭并把焦点还给「转盘」按钮。窄屏（<720px）宠物没有停靠点，转盘仍可从按钮打开。

**新增脚本要登记的位置**：`news-pet-prefs.js` 在 `news_reader.py` 的 `ASSETS`；`studio-pet-settings.js` 在 `workbench.py` 的资源表、`preview_studio.py`；两者都在 `build_assets.py`、`MANIFEST.in`、`studio-preview.html`、桌面端 `platform-studio-surface.tsx` 的脚本列表，以及 e2e 资源白名单（`verify_news_reader*.cjs`）。

**测试**：`tests/frontend/test_news_pet_prefs.cjs`（偏好与回退事件）、`test_studio_pet_settings.cjs`（设置页）、`test_studio_navigation.cjs`（左下角入口）；`tests/e2e/verify_news_reader.cjs` 覆盖键盘开转盘与 Esc 还焦点。

## 6. 回滚

- **还没合并**：直接删除分支 `integrate/pets`。
- **已合并**：`git revert -m 1 <合并提交>`；用方式 B 的话，`git revert <那一个提交>`。
- **只想临时关掉某只宠物**：用 (f) 的开关，不需要回滚代码。
- **只想临时回到纯蜘蛛**：`<html data-pets-disabled="naidragon,tabbycat">`，切换器会自动隐藏。
- 用户浏览器里残留的 `news-reader-pet` 值无害：找不到对应宠物时回退到默认。

## 7. 已知限制

- 没有 Windows WebView2 实机验证（见 (g)）。
- `check_repository` 里的 gitleaks 步骤在我的环境里不可用，报 `tool-unavailable`。
- 仓库自带的几个 e2e 脚本（`verify_news_reader*.cjs`、`verify_news_navigation.cjs`）在我的 Linux + Chrome 环境里，**在没有改动的 `develop` 上同样失败**，失败位置和打补丁后完全一致，所以没法用它们做对比；改用真实网关的无头运行和单元测试做验证。
- 奶龙的授权问题见 (f)。
