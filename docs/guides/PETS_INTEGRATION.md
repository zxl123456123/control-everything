# 宠物使用与集成

宠物由新闻阅读器与 Studio 共用。默认关闭；在 `/studio#settings/appearance` 的“宠物”区块开启，选择蜘蛛、奶龙或狸花猫。新闻页的显示开关和形象选择使用同一份偏好。其他页面嵌入接口见[嵌入指南](EMBEDDING.md)。

## 显示范围

| 页面或条件 | 行为 |
| --- | --- |
| Studio 首页、事项、高级管理、外观设置 | 显示选中的 3D 宠物 |
| Studio 新闻路由 | 由阅读器显示宠物，外层吉祥物隐藏 |
| 项目、编辑器、终端、账号与设备 | 隐藏外层吉祥物 |
| 视口宽度小于 560px | 隐藏外层吉祥物；新闻阅读器仍有自己的宠物入口 |
| 选择蜘蛛 | 仅在新闻阅读器显示；Studio 不挂载蜘蛛 |
| 宠物关闭 | 不挂载宠物引擎 |

同一时刻最多显示一只宠物。切换形象先销毁旧实例；新闻采集面板显示自己的宠物时隐藏主舞台宠物。设置卡片使用静态缩略图，不创建第二个引擎。

3D 宠物的收集托盘只在采集及投递后的短暂时间出现。宠物画布不接管普通页面点击；宠物身体由引擎做命中测试，转盘按钮可独立操作。

## 偏好

`web/workspace/news-pet-prefs.js` 提供 `window.NewsPetPrefs`。宿主通过 `read()`、`set(patch)`、`setPet(name)`、`setEnabled(flag)`、`subscribe(listener)` 读写和订阅；写入失败返回 `false`，设置页显示保存失败提示。

| 字段 | 存储键 | 取值与默认值 |
| --- | --- | --- |
| `pet` | `news-reader-pet` | `spider` / `naidragon` / `tabbycat`，默认蜘蛛 |
| `enabled` | `news-reader-pet-enabled` | 默认关闭 |
| `quiet` | `news-reader-pet-quiet` | 默认关闭；开启后暂停动作、提示和状态轮询 |
| `newsFx` | `news-reader-pet-news-fx` | 默认开启新闻事件互动 |
| `size` | `news-reader-pet-size` | `small` / `medium` / `large`，默认 `medium` |
| `dock` | `news-reader-pet-dock` | `auto` / `bl` / `br`，默认 `auto` |
| `dial` | `news-reader-pet-dial` | 3～6 个动作 ID 的逗号列表 |
| `dialPin` | `news-reader-pet-dial-pin` | 默认不固定 |

偏好经 `CERemoteContext.storage('localStorage')` 读取，在远程上下文中使用账号范围。相同上下文的页面、标签页及嵌入阅读器通过订阅和 `storage` 事件同步。不能识别或被宿主排除的形象回退到注册表默认值。

Studio 首次互动提示另用 `news-reader-pet-hint` 记录是否展示，不属于可编辑设置。

宿主可通过 `<html data-pets-disabled="naidragon,tabbycat">` 排除形象，或注册时设置 `enabled: false`。被排除的形象不出现在选择器里，也不请求其懒加载脚本。保留默认蜘蛛可用。

## 转盘

应用内的阅读器和 Studio 使用同一个 `NewsPetWheel`，动作池由 `NewsPetDial` 提供，实际处理函数由宿主交给 `NewsPetDirector.buildActions()`。3D 引擎以 `dial: false` 且不传 `actions` 挂载，只报告宠物点击事件；研究面板不创建转盘。引擎保留的内置转盘仅用于独立嵌入。

| 动作 | 可用页面 |
| --- | --- |
| 打开工作台、安静模式、宠物设置、隐藏宠物 | 阅读器与 Studio，按当前页面过滤 |
| 下一条、上一条、搜索新闻、采集新闻、收藏本条、读完归档 | 新闻阅读器 |
| 去看新闻 | Studio |

默认动作是打开工作台、下一条、搜索新闻、采集新闻、安静模式和宠物设置。设置页可选择 3～6 个动作；宿主过滤当前不能执行的动作，并按页面补齐。应用内共享转盘没有引擎内置转盘的第二页互动。

点击 3D 宠物或“宠物转盘”按钮展开。蜘蛛通过阅读器按钮打开。转盘以宠物停靠槽为锚点，不跟随宠物移动。未固定时点击外部或执行动作会收起；固定后变为侧边竖条，外部点击和执行动作保持展开。Esc 始终可收起，固定偏好仍保留。刷新后默认收起。

固定竖条通过 `<html data-pw-rail="left|right">` 和所属 Shadow DOM 宿主的同名属性告知页面预留空间；新闻页还提供 `safeTop` 避开工具栏。未固定的环在窄屏可暂时覆盖邻近控件，点击外部可关闭。

键盘通过 Tab 到达“宠物转盘”按钮，Enter 或空格打开；方向键移动，Enter 执行动作，Esc 关闭并返回触发按钮。没有全局快捷键。动效遵守 `prefers-reduced-motion`。

## 新闻互动与状态

奶龙和狸花猫对新文章、采集中、采集失败、收藏、归档、未读清零、搜索无结果、列表为空和读到文末作出反应。`NewsPetDirector.createReactor()` 提供事件去重与冷却。关闭新闻互动、安静模式、暂停或页面隐藏时停止反应。蜘蛛保留原采集动画，没有 `react()` 接口。

`PetStatusFeed` 使用同源只读 GET：

| 接口 | 常规间隔 | 用途 |
| --- | --- | --- |
| `/api/workspace/usage` | 60 秒 | 从可用额度窗口计算剩余比例 |
| `/api/workspace/observations` | 15 秒 | 读取可观察到的 Agent 实例数 |

只有需要状态的宠物启动轮询，默认蜘蛛不增加这两项请求。隐藏标签页停止计划轮询，可见时补取；失败指数退避，连续失败后清除旧值。安静模式和减少动效会停止 Studio 状态源。观察到的进程数不代表任务完成或人工验收。

## 资源与宿主装配

普通页面的源码位于 `web/workspace/`，内置项目工作台仍是独立构建单元。新增资源必须同时核对：

- 新闻资源在 `src/control_everything/http/news_reader.py` 的 `ASSETS`；Studio 专属资源在 `http/workbench.py` 的 `STUDIO_RESOURCES`。
- 所有交付资源在 `tools/packaging/build_assets.py` 的 `WEB_ASSETS` 与 `MANIFEST.in`。
- 独立 Studio 的脚本顺序在 `studio-preview.html`，内置工作台的脚本顺序在 `web/workbench-engine/src/renderer/src/web/platform-studio-surface.tsx`。
- `news-pets.js` 按自身脚本地址懒加载 `news-naidragon.js`、`news-tabbycat.js`。只有选中后才加载引擎；失败时阅读器回退蜘蛛，Studio 隐藏失败形象并提示。
- E2E 夹具的资源白名单也应包含新脚本；仅静态预览 `preview_studio.py` 不能替代集成网关验收。

产品的新闻页、Studio 及内置工作台使用同源脚本策略。3D 引擎优先通过 `adoptedStyleSheets` 把构造样式表安装到所属 `Document` 或 `ShadowRoot`；不支持该 API 时回退 `<style>`，可用 `styleNonce` 配合宿主策略。无需为宠物放宽脚本策略。详见[嵌入指南的 CSP 说明](EMBEDDING.md#内容安全策略)。

## 验证入口

从仓库根目录使用贡献指南规定的 Node、Python 和已准备的依赖：

```powershell
node --test tests/frontend/test_news_naidragon.cjs tests/frontend/test_news_tabbycat.cjs tests/frontend/test_news_pet_prefs.cjs tests/frontend/test_news_pet_dial.cjs tests/frontend/test_news_pet_director.cjs tests/frontend/test_news_pet_wheel.cjs tests/frontend/test_studio_mascot.cjs tests/frontend/test_studio_pet_settings.cjs tests/frontend/test_studio_navigation.cjs tests/frontend/test_news_reader_scheduling.cjs
python -m unittest -v tests.backend.test_packaging tests.backend.test_studio_preview_server
python tools/scripts/check_architecture.py layout
lint-imports --config tools/architecture/importlinter.ini --no-cache --no-logo
node tests/e2e/verify_pet_singleton.cjs
node tests/e2e/verify_pet_wheel.cjs
```

内置工作台还应执行 `platform-studio-surface.test.tsx` 的 Vitest，检查脚本装配。E2E 需要 Playwright 与可用浏览器；`PET_BASE` 可指向本次自有网关，额外检查真实 Studio 导航。使用隔离 profile，分别检查浅深色、窄屏、开关及连续切换、固定转盘、键盘焦点和后台暂停。合成测试不代表 WebView2、DPI、多显示器或安装包现场通过。

资源发布与来源检查按[参与开发](../../.github/CONTRIBUTING.md)执行。任务调研、验收命令、失败和截图链接保存在本机 ignored `docs/current/<feature>/` 与 `work/<feature>/`，不写入公开指南。

## 形象与嵌入限制

奶龙是第三方角色。程序化几何模型没有使用官方贴图，角色形象的使用和分发仍需由发布者核实授权。宿主可排除此形象；页面排除只阻止加载和选择，不会自动从发行包中删除脚本。

两只 3D 引擎仍各自保留独立嵌入的内置转盘代码。应用内使用共享转盘；单独嵌入的接口与行为以[嵌入指南](EMBEDDING.md)为准。
