# 工作台 UI 优化（有界改动）

日期：2026-10-14；受众：共享；状态：UI 已验证并通过独立审查，仅本有界范围。
用户原话：“可以开始编码了，你可以新启动一个session，然后也归到这个侧边栏，然后来实施代码，对了还有ui界面的优化展示，这个也要做一下”。授权包括必要 UI 规划、评审、编码、验证；本短方案在此授权内执行。

实际页面是原生 workspace.html/css/js：侧导航、三个统计、项目/任务主栏及待办/额度/资讯副栏，六个视图共用样式。大量辅助文本仅9–11px，卡片视觉层级接近；保留语义与业务逻辑，提升可扫读性。

## 范围与验收

1. 保留深色工作台，调整配色、文字尺度、间距、边框和状态视觉；提升项目任务主体层级、导航当前位置、表单/按钮反馈。让桌面主内容更充分使用空间，中窄屏自然堆叠，不遮挡操作。
2. 项目/任务、Agent 能力、额度来源/未知状态和资讯卡片沿用现有数据。只可增加必要展示类、标签、语义属性；不改变API、存储、执行准入或刷新策略。不把未发现/未查询/未知改写为零或实时成功。
3. 修改限 web/workspace.html/css/js；必要增量 fixture 检查独立于 P1-A。基线副本 work/implementation-20261014-originals，修改可由逐文件对照撤回；禁止覆盖未知改动。
4. 协调者运行既有 tests/verify_workspace.cjs --fixture、tests/test_execution_ui.cjs 与隔离截图检查，覆盖1440桌面、768平板、375及320窄屏、六个视图、键盘焦点/表单、原有错误和来源语义。全部网络请求拦截，使用合成fixture，无真实API或私人正文。保存改前/后截图及JSON证据，fresh reviewer 对照原文件审最终改动。缺浏览器/审查证据保持未验证。

## 采用的既有做法与取舍

参考 [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)：采用小屏单栏与长文本折行，按320 CSS px检查。参考 [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)：采用更清楚的正文/辅助文字对比并检查常用组合，不能据此宣称全站无障碍认证。若加入短过渡，按 [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) 尊重减少动态效果偏好。

不增加图表框架/主题配置/动画大屏：本次目标是已有工作台的日常扫读与操作清晰度，源码现有布局足够支持。本UI改动与Orca离线预检分别审查；没有安装/启动Orca、FastAPI/React迁移、模型派发或像素嵌入。

## 协调者改前证据

原有 tests/verify_workspace.cjs --fixture：101项，失败0，exit0。独立增量 capture.cjs 对四个视口/六个视图截图和溢出检查：125项，失败0，exit0。改前JSON：work/workspace-ui-20261014/before/ui-fixture-2026-10-14T11-19-30-229Z.json。已肉眼查看桌面总览截图，文字偏小和主次层级改善方向有实际依据。截图为固定合成数据，不代表本机实时数据。另执行 tests/test_execution_ui.cjs：24项纯Node合同，exit0。

最终验收 capture.cjs 增加320px完整表单/来源回归；改前125记录保留为原始结果，不反写为新脚本覆盖。

## 本次交付（2026-10-14）

源文件只改 workspace.css/js，HTML与原版相同。协调者独立跑原版101项与最终增量158项浏览器fixture，均exit0；纯Node24项/语法exit0。48张指定视口/视图前后截图齐备，最终证据见 work/workspace-ui-20261014/coordinator-check.md。初始125、首轮149与最终158报告分别保存，不覆写历史。

独立 [review.md](review.md) PASS，审查固定CSS/JS当前hash；实际差异与代表截图已审，业务/API/来源及未知状态语义保持。非预期失败0，注入的HTTP503/409及探查失败记录仍保留。真实API、账号/模型、Orca、全站无障碍均没有本次结论。

前后可切换预览：work/workspace-ui-20261014/preview.html；改后桌面：work/workspace-ui-20261014/after/overview-1440.png。两者使用合成数据。目录无Git，不提交/推送。英文提交建议：style(workspace): improve dashboard readability and responsive layout。
