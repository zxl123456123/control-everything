# Three.js 0.186.0 同源渲染依赖技术补证

角色：repo_researcher；只读事实调研。获取跨越 2026-10-03/04（Asia/Shanghai）；npm 包观察为 2026-10-03 23:58:26，最新现网静态 HTTP 观察为 2026-10-04 00:04:44。机器可读证据：`work/robot-render-dependency-evidence.json`。

范围来源：本批 `clarifications.md` 的 Q8 已选「3D 机器人主视图＋像素/文字回退」，正式阶段为 readiness。父批 Q6 仍待独立客户端验收。本稿不制定方案、不变更产品、不关闭父批验收；仅核查固定依赖、服务现实和核验边界。

## A. 系统边界与现有能力

已观察到：产品为 Python 标准库 loopback HTTP 网关与原生网页。`web/index.html:8` 使用普通、带 `defer` 的 `/app.js` 脚本；`web/app.js` 当前没有 Three.js import、画布或 WebGL renderer。实际网关只提供 `/`、`/app.js`、`/style.css` 三条静态白名单（`session_panel/gateway.py:96–99`）。生产同源依赖尚未引入。

当前列表按钮按真实 `session_id` 选择，消息只在选择、刷新或分页事件读取（`web/app.js:45–51,95–99,123–136,148–151`）。元数据在可见时每 10 秒刷新；每秒更新证据年龄不会读取消息（`:154–158`）。活动/完成文字仍为「未知 / 未判断」（`:67`）。本稿不依据 renderer 或几何体推断真实会话状态。

## B. 入口与真实 ESM 依赖链

官方 npm `three@0.186.0` 的 `package.json` 已从经过 integrity 校验的 tarball 内读取：`type=module`，`module=./build/three.module.js`，`exports["."].import=./build/three.module.js`，`require` 则指向 `./build/three.cjs`。没有 runtime `dependencies` 字段；存在的 `devDependencies` 是上游开发工具，不能据此算作浏览器运行依赖。[固定 npm metadata](https://registry.npmjs.org/three/0.186.0)，[同版本原作者 package.json](https://github.com/mrdoob/three.js/blob/148ef33ecb6d2502ff796d4554abd1549c95d519/package.json)

已观察到的文件链：

1. `build/three.module.js:6` 从 `./three.core.js` import，`:7` 从相同路径 re-export。两个声明只涉及同一个文件。
2. `build/three.module.js` 还直接 export `WebGLRenderer` 等 renderer 内容；`three.core.js` 提供几何、相机、材质、Scene、Raycaster 等核心 export。
3. 两份文件均无其它静态 module specifier、无动态 `import()`；`three.core.js` 本身无 import/re-export 的外部文件路径。[固定 module 文件](https://github.com/mrdoob/three.js/blob/148ef33ecb6d2502ff796d4554abd1549c95d519/build/three.module.js#L6)，[固定 core 文件](https://github.com/mrdoob/three.js/blob/148ef33ecb6d2502ff796d4554abd1549c95d519/build/three.core.js)

因此，**限定为核心 WebGLRenderer、程序化几何和 Raycaster 使用时，库运行文件闭包是 `three.module.js`＋同目录 `three.core.js`，分发同时保留 `LICENSE`**。这个结论不包含应用自身 HTML/JS/CSS，也不包含未选择的 addon。相对路径必须保持可解析；单独复制 module 文件并不能满足其 import。`OrbitControls`、`GLTFLoader` 和官方 `WebGL` capability utility 是另外的显式 addon import，不在这两份 build 文件里。[官方安装说明](https://threejs.org/manual/pages/installation.html)

本轮 Node v22.23.1 实际导入 work 内原文件，得到 `REVISION=186`、444 个 export；WebGLRenderer、Scene、两类相机、Group、Mesh、Box/Cylinder/SphereGeometry、MeshStandard/BasicMaterial、两类 light、Raycaster、Vector2/3 均存在。另执行基础 BoxGeometry/Scene/Raycaster，命中数为 2；提前设置会抛错的 fetch/XHR 记录器，观测调用数为 0。退出码 0。该核验没有实例化 renderer，没有浏览器 DOM/WebGL context，不是产品运行验收。

## C. 关键模块与职责

| 文件 | 已核职责 / 边界 |
| --- | --- |
| `session_panel/gateway.py` | 静态白名单、固定 MIME、CSP、Host/Origin 校验；不会因磁盘存在 JS 文件自动提供它 |
| `web/index.html` | 目前载入普通 app 脚本与样式；没有 import map 或 module script |
| `web/app.js` | 单一真实 UUID 选择、元数据查询、按需消息分页和定位；目前没有渲染库链 |
| `web/style.css` | 当前 DOM 列表、按钮焦点及 800/440px 布局；不提供 3D 或像素 renderer |
| `three.module.js` / `three.core.js` | 上述固定 ESM 闭包；不提供本项目会话数据或真实状态映射 |
| `LICENSE` | MIT 分发通知；浏览器运行 import 不会读取此文件 |

## D. 固定包来源、完整性与文件体积

官方 metadata 的 repository 为 `git+https://github.com/mrdoob/three.js.git`，`gitHead=148ef33ecb6d2502ff796d4554abd1549c95d519`，license 为 MIT。`dist` 记录 fileCount=1263、unpackedSize=20,443,175 B；这些是完整 npm 包口径，不能当作浏览器最小下载量。[官方固定 metadata](https://registry.npmjs.org/three/0.186.0)

tarball 为 [three-0.186.0.tgz](https://registry.npmjs.org/three/-/three-0.186.0.tgz)，本轮下载为 4,648,491 B，实算值与 metadata 完全匹配：

- SHA-512 integrity：`sha512-cr/fIM2ddMSVbYVgkfD4jLJv7Fh/8ZTjvo+7gQeSVGUZHxpx9FDwoL5iC7hUz/LiRA8wMbqfnb90xKfm1/HHkQ==`
- SHA-1 shasum：`08f70ce80dffa9247a567b421165bec630e86f8d`
- 实算 tarball SHA-256：`61eeff9d7616005c9a481c796f52287d81fbbbc0d55eaca5565322924252c1aa`

完整包只在内存读取。写盘白名单为 `package/build/three.module.js`、`package/build/three.core.js`、`package/LICENSE`，逐项确认是普通文件、不是 link，解析后的输出严格位于 `work/robot-render-dependency-r1860/` 内。没有批量解压、npm/npx/install、上游脚本执行、产品 vendor 写入或递归删除。

| 明确文件 | 原始字节 | SHA-256 |
| --- | ---: | --- |
| `build/three.module.js` | 662,772 | `9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea` |
| `build/three.core.js` | 1,458,113 | `9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6` |
| `LICENSE` | 1,081 | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |

两份 JS 共 2,120,885 B（约 2.02 MiB），加 LICENSE 为 2,121,966 B。本稿统计未压缩原文件；当前网关 `reply()` 没有压缩逻辑，现网三条静态响应也无 `Content-Encoding`，不能拿 gzip 估算值冒充当前传输量。

已从上述固定 `gitHead` 读取原作者 build 的两文件与 LICENSE，三者 SHA-256 均与 npm tarball 对应成员一致。原作者固定 package.json 版本也确为 0.186.0。另观察到 GitHub `r186` tag 当前 package.json 为 **0.186.1**，因此本稿不把该 tag 当作 0.186.0 锚点。[本轮观察到的 r186 package.json](https://github.com/mrdoob/three.js/blob/r186/package.json)

LICENSE 版权行为 `Copyright © 2010-2026 three.js authors`；许可要求分发的软件副本或重要部分附带版权与许可通知。本稿保存原文，不仅依据 metadata 中的 MIT 标签。[固定原作者 LICENSE](https://github.com/mrdoob/three.js/blob/148ef33ecb6d2502ff796d4554abd1549c95d519/LICENSE)

npm metadata 的两条 `dist.signatures` 已留存，但本轮未进行 ECDSA signature 的密码学验证；已验证的是下载字节的 SHA-512 integrity、SHA-1 shasum 及与固定 GitHub 文件的一致性，不能把它写作完整供应链签名验证。

## E. 当前 CSP、路由、MIME 与故障核验边界

### E1. 实际 HTTP

2026-10-04 00:04:44 北京时间直接读取既有 `http://127.0.0.1:8766`，没有启动服务或请求会话 API：

| 路径 | 状态 | Content-Type | 观察 |
| --- | ---: | --- | --- |
| `/` | 200 | `text/html; charset=utf-8` | 3,337 B，与 workspace 文件逐字节一致 |
| `/app.js` | 200 | `text/javascript; charset=utf-8` | 13,957 B，与 workspace 文件逐字节一致 |
| `/style.css` | 200 | `text/css; charset=utf-8` | 5,080 B，与 workspace 文件逐字节一致 |
| `/vendor/three/three.module.js`、`/vendor/three/three.core.js`、`/three.module.js`、`/three.core.js` | 404 | `application/json; charset=utf-8` | `status=unknown`、`reason=route_not_found`；这些仅为缺失路径探测，不是已决定的生产路由 |

所有响应均有 `X-Content-Type-Options: nosniff`、`Cache-Control: no-store` 和相同 CSP。HTTP 模块要求成功状态及适当的 JavaScript MIME；JSON 404 不是可执行模块。[HTML 标准的模块获取算法](https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script)

CSP 实值为 `default-src 'self'; img-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'`（`gateway.py:55–65`）。未单独声明的脚本和连接策略回落到 default-src；外部 CDN 不匹配 self，同源 JS 可以匹配策略但仍必须有真实成功路由和 MIME。图片请求明确受 img-src none 限制。[W3C CSP default-src](https://www.w3.org/TR/CSP3/#directive-default-src)

固定 build 文件没有 `eval()` 或 `new Function()` 调用；纯几何无需取得贴图。由此**推断**，核心程序化路径没有已发现的外部资产或 unsafe-eval 需求。但 CSP 的实际浏览器加载、shader、renderer 路径未在生产中执行，本稿不声称已通过同源运行验收。core 中包含 FileLoader/ImageBitmapLoader 的 fetch 实现（`:45119,50468`）；使用这类 loader 会触发请求，不能把整库宣称成永不联网。

### E2. 未知 WebGL 与无 API：可核查的观测方法事实

固定版官方 `WebGL.isWebGL2Available()` 用新 canvas，检查 `window.WebGL2RenderingContext` 与 `getContext('webgl2')`；异常返回 false（固定 addon `:15–27`）。这仅是该时点的能力检查；无法据此证明 renderer 初始化、驱动、后续上下文或帧率必然成功。[固定官方 capability 源码](https://github.com/mrdoob/three.js/blob/148ef33ecb6d2502ff796d4554abd1549c95d519/examples/jsm/capabilities/WebGL.js#L15)

固定 renderer 只取得 `webgl2`（`:409`），创建失败可抛异常（`:417,421`），注册 lost/restored 事件（`:403–404`）。`forceContextLoss()` / `forceContextRestore()` 的文档与实现要求 `WEBGL_lose_context` extension（`:605–621`）；没有 extension 不能把“调用后没反应”当作丢失恢复测试已执行。WebGL1 不支持是官方已声明的限制。[固定 renderer](https://github.com/mrdoob/three.js/blob/148ef33ecb6d2502ff796d4554abd1549c95d519/src/renderers/WebGLRenderer.js#L403)，[官方 renderer 文档](https://threejs.org/docs/pages/WebGLRenderer.html)

由这些实际入口能分别观测：尚未得到浏览器检查结果（未知）、明确不能创建 WebGL2、初始化抛错、已创建后 context lost/restored。受控核验可记录 getContext 返回 null 或抛错、初始化错误和实际事件，再检查可见 Canvas/DOM、真实 UUID 选择与输入操作；截图本身不能证明拾取/键盘或恢复。这里列的是可测的技术入口，不制定产品状态机或回退方案。

无 API 行为必须区分两个对象：

- **预览**：冻结提案 `session-robot-cockpit.html:190,270–302` 内置固定 22:51:42 快照、通过 CDN import 0.186.0，不读取消息、定位按钮无产品操作。已读 root 先前记录：normal 为 webgl，webgl-disabled 与 renderer-failure-after-replacement 为 fallback，`serviceRequests=[]`；后者包含预期注入的 console error。证据 SHA-256 与快照记录见机器可读证据。这些是先前预览核验的记录，本 agent 没有重跑，不等同生产 API 故障验收。
- **当前产品 / 后续真实页面核验**：`query()` 使用 `/api/bootstrap`、`/api/sessions`、所选 UUID 的 `/messages` / `/focus`；当前 `refreshSessions()` 在异常时设置 connected=false、保留上次记录，`current()`/`eligible()` 随即使证据和定位无效（`app.js:29–37,78–93`）。在受控 API 拒绝/非 JSON/unknown 响应下，需要读实际请求记录、DOM unknown/上次证据和禁用按钮，再读所选 UUID 消息分页的错误/旧页标注；仅“预览零 API 请求”无法证明这些行为。旋转/渲染帧是否诱发 API 请求也应由实际网络记录区分静态模块加载与 `/api/` 请求。本轮没有对生产 API 做拒绝注入。

## F. 已阅读材料与执行留痕

本地完整材料：全局 AGENTS、codebase-research 与 verification-before-completion 技能；本批 README/clarifications；父批 research_robot_github_r3；gateway.py 与 web/index.html、app.js、style.css。补读提案相关源码、两份既有预览 JSON 的有界字段；未把它们的自报成功作为本轮产品成功断言。

外部原始材料：固定 npm metadata/tarball；其 gitHead 对应 GitHub package/build/LICENSE/capability/renderer 源码；Three 官方 installation/renderer/capability 文档；HTML/CSP 标准。所有来源就近引用；未执行上游安装或仓库脚本。仅 Node 导入明确 library module 并执行基础几何/拾取，未实例化 renderer。

本轮实际失败 / 局限保留：

- 首个文档组合输出被截断，随后分别补读 clarifications 与父研究开头，并完整读取 gateway/web 的相关范围；一次宽读预览 JSON 输出同样被截断，后改有界键/场景/hash 输出。
- web 工具无法打开 npm metadata URL；随后 urllib 直接取得同一官方 URL。错误的 Three `/manual/en/installation.html` 返回 404，改为真实 `/manual/pages/installation.html` 后读取。
- 第一次完整性脚本在已写好 work 证据/文件后，因 GBK 不能打印 LICENSE 的 ©，以 UnicodeEncodeError/退出码 1 结束；没有将该退出码算作成功。随后 ASCII 转义 JSON 重读和逐文件 hash 核验退出码 0，再进行固定 GitHub 对比与 Node 核验。
- 生产四个 module 候选路径的 404 为当前缺口，保留在证据中；没有修复。npm 签名未验证；没有本轮浏览器生产同源/WebGL/上下文/API 失效核验。

## G. 不确定点清单

| 编号 | 仍未关闭 | 已知证据 / 关闭所需观测 |
| --- | --- | --- |
| U1 | 生产浏览器的同源 module 路由、CSP、MIME、加载失败回退 | 目前路线只有三静态文件，候选模块 404；Node ESM 成功不能替代真实浏览器 HTTP import |
| U2 | 生产 WebGL2 初始化、上下文失效/恢复、负载与帧率 | 既有预览记录有本机成功和两失败注入模式；还需要最终生产代码的 actual context/事件/交互证据 |
| U3 | 最终真实页面在 API 不可用、unknown、消息读取失败时的像素/文字能力与权限 | 当前 DOM 的异常逻辑已读；最终新增 renderer 与真实 UUID 链路尚未存在，不能依据预览关闭 |
| U4 | npm ECDSA signature 的可信密钥与密码学验证 | metadata signature 已保存，未验证；本稿只确认 integrity/hash 与固定 GitHub 一致性 |

本稿没有新的用户范围待答问题；技术未知保留给 readiness/后续验证，不暗示本批 readiness 已 PASS。父 Q6 原批验收仍独立待闭合。

## H. 给 readiness reviewer 的最小可核查证据

1. 固定来源：npm metadata 的 version、gitHead、dist.integrity/shasum；同一 commit 的 package.json 版本。避免用当前 r186（0.186.1）替代 0.186.0。
2. 最小闭包：npm 原文件 module 的第 6/7 行、core 无 import；Node 444 exports/REVISION=186/基础拾取与 0 网络调用，原文件 hash 可重算。
3. 分发许可与预算：三文件表、原作者 MIT LICENSE 原文、2,120,885 B JS 口径；没有把整 npm 包或压缩估算当最小原文件下载量。
4. 服务现实：gateway.py:55–65,90–99；最新三静态 200 与磁盘相等、四候选模块 404/JSON/nosniff；路径仍未实施。
5. 独立边界：U1–U4 开放；先前预览有固定快照/CDN/零产品 API 请求，不能替代生产 API 故障与同源加载验收。

无新增跨功能事实：同源 CSP、UUID 与 unknown 约束已在现有材料中记录。本稿仅提供固定依赖的补充事实。
