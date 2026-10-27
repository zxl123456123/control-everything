# 3D 宠物嵌入指南

奶龙 `news-naidragon.js` 与狸花猫 `news-tabbycat.js` 是纯 JavaScript、程序化 WebGL 宠物，提供 2D 回退，不依赖外部模型、贴图、字体或渲染库。应用内设置与共享转盘见[宠物使用与集成](PETS_INTEGRATION.md)。

## 最小接入

由宿主同源提供 `news-pets.js` 与选中宠物的引擎脚本，并提供一个有实际尺寸的容器、画布和仓库元素。将下面的初始化代码放进外部脚本；页面只引用同源外部脚本：

```html
<script src="/news-pets.js" defer></script>
<script src="/pet-host.js" defer></script>
```

```js
const stage = document.getElementById('pet-stage');
const pet = window.NewsPets.mount('naidragon', {
  root: stage,
  canvas: stage.querySelector('canvas'),
  depot: stage.querySelector('.depot'),
  options: {size: 96, dock: 'br', margin: 12, status: false, dial: false},
});
```

`mount()` 同步返回代理。首次选择时，注册表按自身脚本目录懒加载 `news-naidragon.js` 或 `news-tabbycat.js`，加载期间的方法调用排队执行。`react()` 是即时反馈，加载期间返回 `false`，不会排队。宿主可提前加载引擎以跳过懒加载。

`docs/examples/pets/naidragon-embed.{html,css,js}` 提供浮动挂件、覆盖层和侧栏插槽示例。它们是接入源文件，产品网关不提供示例页路由；需由自有宿主显式提供示例静态资源，并保留其中的同源脚本 URL。

## API

`NewsPets.mount(name, {root, canvas, depot, onCapture, onDelivered, onCancel, onAction, actions, dock, followPointer, options, styleNonce})` 支持 `naidragon` 和 `tabbycat`，返回：

| 方法 | 用途 |
| --- | --- |
| `pointAt(element, label)` | 指向容器内的可见元素 |
| `capture({id, element, label})` | 搬运容器内元素，完成或取消时调用宿主回调 |
| `cancel(id)` | 取消指定搬运 |
| `setCollecting(flag)` | 切换采集巡逻状态 |
| `pause()` / `resume()` | 暂停或恢复动画 |
| `setOptions(options)` | 更新运行选项 |
| `setStatus({quotaLeftPercent, agentsRunning, agentCount})` | 更新状态与情绪 |
| `react(kind, text)` | 发起即时动作与提示 |
| `setActions(list)` / `openMenu()` / `closeMenu()` | 配置和控制独立嵌入的内置转盘 |
| `inspect()` | 读取渲染器、位置、尺寸、帧耗时等诊断 |
| `destroy()` | 幂等销毁，释放监听、定时器、画布与 WebGL 资源 |

先 `destroy()` 再挂到另一个容器；同一引擎重复使用同一 canvas 挂载会替换旧实例。只有注册表与引擎不发网络状态请求，可选状态源见下文。

独立转盘动作格式为 `[{id, label, icon?, run}]`。执行后调用动作 `run(detail)`、宿主 `onAction(detail)`，并派发 `news-pet-action`，`detail` 包含 `id`、`label`、`index`。应用内的阅读器和 Studio 以 `dial: false` 且不传 `actions` 使用共享 `NewsPetWheel`；内置转盘只用于独立嵌入。

## 容器、输入与主题

`root` 必须包含 `canvas` 与 `depot` 并有尺寸。引擎发现静态定位的 root 时临时设为 `position: relative`，销毁时还原。指向或搬运目标须在同一个 root 内。

宠物画布使用鼠标穿透，引擎在文档捕获阶段按身体轮廓命中点击，普通区域仍由宿主处理。宿主应实际检查与按钮、表单、菜单和对话框的交叠，不能用画布的 `pointer-events: none` 代替交互验收。

主题可通过 `options.theme` 或宿主数据属性指定。奶龙使用 `--nd-paper`、`--nd-fg`、`--nd-edge`、`--nd-accent` 与 `--nd-z`；狸花猫使用对应的 `--tc-*` 变量。设定层级时同时核对祖先的层叠上下文。

引擎样式限定在自身类名下，并安装到 root 所属的 `Document` 或 `ShadowRoot`。因此可以嵌入 Studio 的 Shadow DOM；宿主的其他样式仍须按自己的边界提供。

## 内容安全策略

当前产品新闻页与 Studio 使用同源外部脚本，样式策略包含 `style-src 'self' 'unsafe-inline'`；内置工作台保留其自身运行所需策略。无需为宠物增加 `unsafe-eval`、外部脚本来源或网络白名单。

- 3D 引擎优先通过 `CSSStyleSheet.replaceSync()` 和所属文档或 ShadowRoot 的 `adoptedStyleSheets` 安装样式，不依赖插入内联 `<style>`。
- 不支持构造样式表或安装失败时回退 `<style>`。严格策略的宿主可传 `styleNonce`，并在响应中提供匹配的 `style-src 'nonce-…'`；提供 nonce 时引擎直接采用该 `<style>` 路径。
- 位置和透明度等由 CSSOM 设置。应在实际宿主策略下检查违规事件和计算样式。
- 懒加载是同源 `<script src>`；`script-src 'self'` 可覆盖这一操作。
- 只有可选状态源请求同源 API，使用时需允许对应的 `connect-src`。

`adoptedStyleSheets` 只能采用同一文档创建的构造样式表，相关边界见 [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets)。`style-src` 缺省时回退 `default-src`，内联 `<style>` 的 nonce 规则见 [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src)。共享 `NewsPetWheel` 使用自身 `<style>`，不能把引擎的构造样式表支持直接视为整个宿主都兼容严格样式策略。

## 选项

选项来源按顺序覆盖：root 上的 `data-nd-*` / `data-tc-*` 属性、`mount` 的 `options`、运行时 `setOptions()`。非法值被忽略或限制在引擎范围内。

| 选项 | 取值 |
| --- | --- |
| `size` | 42～151 像素；`scale` 为倍数形式，0.5～1.8 |
| `dock` | `auto`、`tl`、`tr`、`bl`、`br` |
| `margin` | 0～120 像素 |
| `status` | 是否显示状态条 |
| `dial` | 是否使用引擎内置转盘 |
| `speed` | 0.5～3 |
| `tilt` | 是否随指针轻微转向 |
| `theme` | `auto`、`light`、`dark` |
| `sleepAfter` | 3～600 秒 |

容器或 DPI 改变后，引擎按后续帧重设画布，DPR 上限为 2。休息状态会跟随停靠角调整；其他姿态约束在容器内。

## 可选状态源

加载 `news-pet-status.js` 后可使用 `window.PetStatusFeed.start()`：

```js
const feed = window.PetStatusFeed.start({apply: status => pet.setStatus(status)});
// Call both when the host unmounts.
feed.stop();
pet.destroy();
```

默认按 60 秒读取 `/api/workspace/usage`，按 15 秒读取 `/api/workspace/observations`，带 `X-Session-Client: panel` 请求头。页面隐藏时暂停计划轮询，可见时补取；请求失败指数退避，连续三次失败后清除旧状态。`stop()` 停止后续调度和回调。

独立宿主若没有这些 API，不加载状态源即可；也可自己调用 `pet.setStatus()`。远程上下文需要传入自有 `fetchJson`，沿用宿主认证与设备上下文，不用默认全局 fetch 替代它。

## 浏览器与外壳验收

引擎使用 WebGL1，WebGL 不可用或上下文丢失时尝试 2D 回退；上下文恢复后恢复 WebGL。`inspect().renderer` 可区分渲染路径，软件渲染仍可能报告 `webgl`。用 WebView2 虚拟主机映射或同源网关提供文件，避免依赖 `file://`。

窗口隐藏或容器脱离文档后，引擎停止常规绘制；仍保留有界唤醒检查。`prefers-reduced-motion` 下减少绘制与过渡，`pause()` 可显式暂停。宿主销毁时应同时停止自己的状态源。

实际交付前检查浅深色、窄屏、DPI、多显示器、懒加载路径、WebGL 丢失与恢复、重复挂载销毁、表单点击和键盘焦点。Node 合同和无头浏览器不能替代 Windows WebView2 或安装包现场验证。

## 排查

| 现象 | 检查方法 |
| --- | --- |
| 宠物不可见 | 检查容器尺寸、祖先裁剪、`inspect().renderer` 和宿主是否已关闭或排除形象 |
| 样式未生效 | 检查所属文档或 ShadowRoot 的样式表、CSP 违规及回退 `<style>` 的 nonce |
| 懒加载失败 | 确认引擎与 `news-pets.js` 的同目录地址可访问；取不到当前脚本地址时回退根路径 |
| 状态条没有内容 | 检查 `options.status`、状态源是否启动以及 API 实际数据；未配置状态接口时不要开启轮询 |
| 点击不展开内置转盘 | 独立嵌入须传 `actions` 或调用 `setActions()`，并启用 `dial`；应用内应检查共享转盘 |
| 画面模糊或被裁剪 | 检查画布尺寸、DPR 和祖先布局，不覆盖引擎管理的画布宽高 |

奶龙角色的使用和分发授权由发布者核实；注册表支持排除此形象。许可与公开发布要求见[宠物集成指南](PETS_INTEGRATION.md#形象与嵌入限制)。
