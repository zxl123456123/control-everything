# 奶龙宠物：嵌入指南

本文面向要把奶龙宠物嵌进本地工作台（Python 网关 + 静态资源 + WebView2/Edge 外壳）的开发者。奶龙是一个**单文件、纯 JavaScript、自带轻量 WebGL 渲染器**的 3D 宠物，不依赖 three.js、不加载图片或字体、不联网，只读取同源的两个只读接口（可关闭）。

可运行的示例见 `docs/examples/pets/naidragon-embed.html`：160 px 浮动挂件、整页覆盖层、侧栏插槽三种模式，以及选项面板和生命周期按钮。

## 1. 最小接入

页面里只需要同源的外部脚本，没有内联脚本：

```html
<script src="/news-pets.js" defer></script>
<script src="/news-pet-status.js" defer></script> <!-- 可选：状态条数据源 -->
```

```js
const stage = document.getElementById('pet-stage');   // 一个有尺寸的容器（见第 3 节）
const pet = window.NewsPets.mount('naidragon', {
  root: stage,
  canvas: stage.querySelector('canvas'),
  depot: stage.querySelector('.depot'),   // 宠物回巢、搬运的位置，必须与 canvas 在同一个 root 里
  options: {size: 96, dock: 'br', margin: 12, status: true, dial: true, theme: 'auto'},
});
```

`mount` 是同步的。`news-naidragon.js` 在第一次挂载奶龙时才按需加载（见第 6 节），加载期间的调用会被排队，脚本到达后按顺序重放。

## 2. API

`mount({root, canvas, depot, onCapture, onDelivered, onCancel, actions, onAction, dock, followPointer, options, styleNonce})`
与蜘蛛、螳螂完全相同，返回：

| 方法 | 作用 |
| --- | --- |
| `pointAt(element, label)` | 宠物走到某个元素旁并指一下，`element` 必须在 `root` 内 |
| `capture({id, element, label})` | 扑向元素、叼走并送回仓库；完成时调用 `onDelivered`，取消时调用 `onCancel` |
| `cancel(id)` | 取消一个采集 |
| `setCollecting(flag)` | 采集中会在仓库附近巡逻 |
| `pause()` / `resume()` | 暂停与恢复动画循环；暂停期间不绘制，也不占用定时器 |
| `setOptions(options)` | 运行中修改选项（第 4 节） |
| `setStatus({quotaLeftPercent, agentsRunning, agentCount})` | 状态条和情绪的数据入口 |
| `setActions(list)` / `openMenu()` / `closeMenu()` | 点击宠物展开的操作转盘；`list` 为 `[{id, label, icon?, run}]`，最多两页、每页 6 个 |
| `inspect()` | 只读诊断：渲染器（`webgl` 或 `canvas2d-fallback`）、三角形数、位置、画布大小与 DPR、帧耗时 |
| `destroy()` | 幂等；移除全部监听、定时器、rAF、样式、私有画布，并释放 WebGL 上下文 |

选择一个操作后，会依次调用该项的 `run(detail)`、`onAction(detail)`，并在 `root` 上派发 `news-pet-action` 事件，`detail` 为 `{id, label, index}`。

注册方式：奶龙通过 `window.NewsPets.register('naidragon', ...)` 注册，`window.NewsNaidragon` 是脚本加载后唯一的全局对象，没有其它全局泄漏。`NewsPets.list()` 返回已注册的宠物 `{name, label}`。

## 3. 容器与宿主界面安全

- **容器**：`root` 需要是定位元素。如果它是 `position: static`，宠物会临时设为 `relative`，销毁时还原。
- **鼠标穿透**：`root` 和宠物的画布都是 `pointer-events: none`。宠物只在**自己身体的轮廓**上拦截点击；其余区域的点击、选中文字、滚动都属于宿主页面。指针事件挂在 `document` 的捕获阶段，所以整页覆盖层也不会挡住宿主按钮。
- **层级**：所有层叠用 CSS 变量 `--nd-z`（默认 5）：画布层为 `var(--nd-z)`，气泡、状态条、转盘依次加 1 到 3，仓库层减 1。宿主只需要在容器上改一个变量。
- **主题**：用 CSS 变量 `--nd-paper`、`--nd-fg`、`--nd-edge`、`--nd-accent` 覆盖颜色；也可以设置 `options.theme` 或 `data-nd-theme="light|dark|auto"`，`auto` 时跟随宿主的变量。
- **样式**：宠物只创建一个 `<style>` 元素放在 `root` 内，所有规则以 `.nd-root` 限定作用域，销毁时一起移除。
- **无内联脚本、无 `eval`、无 `innerHTML`**：源码里没有这些调用，单元测试会检查。

### CSP

网关当前的内容安全策略可以直接使用：

```
default-src 'self'; img-src 'self' https: blob:; style-src 'self' 'unsafe-inline';
script-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'
```

- `script-src 'self'`：脚本都是同源外部文件；懒加载用 `<script src>` 注入同源文件，不需要放宽。
- 样式：`style-src` 需要 `'unsafe-inline'`，**或者**给 `mount` 传 `styleNonce`，宠物会把 nonce 写到它的 `<style>` 上，配合 `style-src 'nonce-...'` 使用。宠物用到的少量元素内联样式（位置、透明度）在严格策略下由 CSSOM 设置，不受 `style-src` 限制。
- `connect-src 'self'`：只有状态条数据源会请求，且仅为同源 GET；`options.status` 设为 `false` 并且不加载 `news-pet-status.js` 就没有任何请求。
- WebGL 不需要额外的 CSP 指令。

## 4. 选项

选项有三个来源，后者覆盖前者：`mount` 的 `options` → `root` 上的 `data-nd-*` 属性 → `setOptions()`。所有值都会被限制在安全范围内，非法值被忽略。

| 选项 | `data-*` 属性 | 取值 | 说明 |
| --- | --- | --- | --- |
| `size` | `data-nd-size` | 42–151（像素） | 宠物身高，约 84 为基准；`scale` 为同义的倍数（0.5–1.8） |
| `dock` | `data-nd-dock` | `auto`、`tl`、`tr`、`bl`、`br` | 停靠角；`auto` 沿用仓库位置，或宿主传入的 `dock()` 回调 |
| `margin` | `data-nd-margin` | 0–120（像素） | 离停靠角的边距 |
| `status` | `data-nd-status` | `true` / `false` | 状态条（用量环、运行中的 Agent 数）开关；关闭后 `setStatus` 只影响情绪 |
| `dial` | `data-nd-dial` | `true` / `false` | 操作转盘开关；关闭后点击宠物只有互动反应 |
| `speed` | `data-nd-speed` | 0.5–3 | 动作速度倍数 |
| `tilt` | `data-nd-tilt` | `true` / `false` | 指针靠近时，身体与镜头轻微朝向指针 |
| `theme` | `data-nd-theme` | `auto`、`light`、`dark` | 配色 |
| `sleepAfter` | | 3–600（秒） | 安静多久后打盹 |

运行中修改 `dock`、`size` 时，休息中的宠物会平滑回到新的位置；容器尺寸变化（窗口缩放、搬到别的容器）时，休息的宠物跟随停靠角，其它姿态只被约束在容器内。

## 5. 状态条数据源（可选）

`news-pet-status.js` 提供 `window.PetStatusFeed`，只做同源、只读的 GET 轮询，带 `X-Session-Client: panel` 请求头：

| 接口 | 间隔 | 映射 |
| --- | --- | --- |
| `/api/workspace/usage` | 60 秒 | 额度剩余 = 100 − 各窗口 `used_percent` 的最大值 → `quotaLeftPercent` |
| `/api/workspace/observations` | 15 秒 | 正在运行的 Agent 实例数 → `agentsRunning` |

页面隐藏时暂停，重新可见时立即补一次；失败时指数退避（上限 5 分钟），连续 3 次失败后忘掉旧值；全程静默，不打印日志。

```js
const feed = window.PetStatusFeed.start({apply: s => pet.setStatus(s)});
// 销毁时：feed.stop()
```

接口形状不同的宿主可以不加载这个脚本，自己调用 `pet.setStatus({quotaLeftPercent, agentsRunning, agentCount})`。

## 6. 资源打包与懒加载

奶龙一共两个运行时文件，加注册表共三个：

| 文件 | 体积（原始 / gzip） |
| --- | --- |
| `news-pets.js`（注册表与懒加载器） | 4.9 KB / 2.0 KB |
| `news-pet-status.js`（可选状态数据源） | 4.0 KB / 1.6 KB |
| `news-naidragon.js`（宠物本体，含渲染器） | 116.6 KB / 39.8 KB |

- 本仓库的位置：`web/workspace/`；`src/control_everything/http/news_reader.py` 的 `ASSETS`、`tools/packaging/build_assets.py`、`MANIFEST.in` 已登记；换到别的外壳时，把这三个文件放到同一个目录即可。
- **懒加载**：`news-pets.js` 在第一次 `mount('naidragon')` 时才注入 `news-naidragon.js`。脚本地址相对 `news-pets.js` 自己的位置解析（用 `document.currentScript`），所以放在子路径或 WebView2 虚拟主机下也能工作；取不到当前脚本时退回根路径 `/`。如果加载失败，会改为挂载已注册的备用宠物（蜘蛛）。
- 不想要懒加载的宿主，可以直接在页面里加 `<script src="news-naidragon.js" defer>`，`NewsPets` 会优先使用已存在的全局对象。

## 7. WebView2 / Edge 外壳

- 使用 WebView2 的虚拟主机映射（`SetVirtualHostNameToFolderMapping`）或网关同源提供静态文件均可；不需要 `file://`。
- 渲染器是自带的 WebGL1，不需要 WebGL2、扩展或 `OffscreenCanvas`。WebView2 在没有 GPU 的环境会走软件渲染，`inspect().renderer` 仍然是 `webgl`，只是更慢。
- **丢失上下文**：浏览器回收 GPU 上下文（`webglcontextlost`）时，宠物会立即切到 2D 画笔继续运行，上下文恢复后（`webglcontextrestored`）自动切回 WebGL，不需要宿主介入。
- **DPR 变化**（把窗口拖到另一块屏幕）和**尺寸变化**会在下一帧被发现并重设画布；画布像素比最高按 2 计算。
- **隐藏或脱离文档**：标签页隐藏、容器被移出文档时停止绘制，只保留一个 500 毫秒的唤醒计时器；重新接回后恢复。
- **减少动效**：`prefers-reduced-motion: reduce` 时，宠物以约 2 fps 静止呼吸，转盘与状态条没有过渡动画。
- 重新挂到另一个容器：先 `destroy()` 再 `mount()` 最稳；也可以直接把 `root` 搬到新位置，宠物会按新的尺寸重新定位。
- 同一个 `root` 上重复 `mount`，会先销毁上一个实例，不会叠加。

## 8. 性能

无头 Chromium（软件渲染）下的实测，CPU 侧每帧 JS 耗时：

| 状态 | 平均 ms/帧 | 帧率 |
| --- | --- | --- |
| 安静待机 | 约 0.2 | 约 34 fps（自动降频） |
| 挥手、跳跃 | 约 0.26 | 约 59 fps |
| 巡逻搬运 | 约 0.21 | 约 59 fps |
| 睡眠 | 约 0.21 | 约 25 fps |
| 深度睡眠 | 约 0.27 | 12 fps |

- 网格约 1 万个三角形（上限 1.2 万，单元测试检查），画布约 130–210 CSS 像素见方，不是整页大小。
- 一个实例有三个画布：宿主传入的、私有的 WebGL 画布、仓库的 2D 画布。
- 挂载与销毁 20 次的泄漏测试：文档与窗口监听 0、rAF 0、定时器 0、样式元素 0、画布 0，WebGL 上下文全部释放。

## 9. 移除演示

演示相关的东西与宠物本体分开发布，移除只需要**一步**：

```bash
git apply -R naidragon-demo-extras.patch
```

它会删掉 `/news-demo` 路由、`naidragon-demo-panel.js` 及其在 `ASSETS`、`MANIFEST.in`、`build_assets.py` 里的登记、阅读室里注入演示面板的那一行，以及演示面板的测试。生产补丁 `naidragon-pet-final.patch` 不依赖这些内容。

## 10. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 看不到宠物 | 检查 `root` 是否有尺寸、是否被 `overflow:hidden` 的祖先裁掉；`inspect().renderer` 为 `none` 说明 WebGL 与 2D 都不可用 |
| 点击宿主按钮被挡住 | 不应发生：只有宠物身体轮廓会拦截。确认没有给 `root` 手动设置 `pointer-events:auto` |
| 宠物被其它元素盖住 | 提高 `--nd-z`，并确认容器没有创建新的层叠上下文 |
| 样式没有生效 | 严格的 `style-src` 下需要 `styleNonce` 或 `'unsafe-inline'` |
| 懒加载 404 | 把 `news-naidragon.js` 放在 `news-pets.js` 同一个目录；`document.currentScript` 取不到时脚本地址是根路径 |
| 状态条一直不出现 | 额度充足且没有运行中的 Agent 时不显示；确认 `options.status` 不是 `false`，两个接口返回 200 |
| 开启了转盘但点击没有反应 | 需要先 `setActions(list)`，或在 `mount` 时传入 `actions`；`options.dial` 不能是 `false` |
| 窗口拖到另一块屏幕后发糊 | 每帧会检查 `devicePixelRatio`；若自行缓存了画布尺寸，请不要覆盖宠物设置的 `width/height` |
| 控制台出现 WebGL 警告 | 软件渲染或上下文被回收时的正常提示；宠物会自动降级为 2D，之后自动恢复 |

## 狸花猫（第二只 3D 宠物）

`news-tabbycat.js` 是与奶龙并列注册的第二只宠物：id 为 `tabbycat`，全局对象 `NewsTabbycat`，通过 `window.NewsPets` 注册并懒加载。挂载接口、实例接口（`setStatus`、`destroy`、`inspect()` 等）、选项、转盘（点击宠物展开，没有键盘快捷方式）、状态反应（额度低担心、额度 0 难过、Agent 运行中东张西望、Agent 数量下降庆祝）和 WebGL 丢失后的 2D 回退都与奶龙相同，用法见上文，只需把 `'naidragon'` 换成 `'tabbycat'`。

- 体积：约 136.0 KB 原始 / 45.9 KB gzip（奶龙约 116.6 / 39.8 KB）；打包位置和登记方式与奶龙相同（`ASSETS`、`MANIFEST.in`、`build_assets.py`）。
- 待机时网格约 8200 个三角形（上限 1.2 万，`tests/frontend/test_news_tabbycat.cjs` 逐动作检查）。
- 想让页面在没有这只宠物时也能工作：不加载 `news-tabbycat.js` 即可，`NewsPets.list()` 里仍会有狸花猫，挂载失败时回退到蜘蛛。
