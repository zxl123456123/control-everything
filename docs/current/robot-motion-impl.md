# 机器人视角与流畅度：实施证据

2026-10-04；实施者 `/root/robot_motion_impl`；有界合同 `robot-motion-bounded.md`。仅独占改动 `web/robot3d.js`、`web/cockpit.js`，没有修改业务 API、会话证据、终端动作、vendor、app/style/HTML 或其它作者的 fixture。

## 变更及目标对齐

- `robot3d.js`：PerspectiveCamera 实际相机环绕；可见站台与网格给出空间深度；时间 delta 与指数缓动驱动水平/垂直拖动、箭头/重置和 0.75–1.8 倍滚轮缩放；默认缓慢环绕及中性微幅装饰运动。机器人 `userData.sessionId` 和 `colored` 保留，地面在 scene 独立于 robot world，Raycaster 只对当前机器人取交点。
- 页面隐藏、dispose、模式切换取消动画帧；暂停后冻结当前相机目标，停止连续帧；显式交互后只为余下缓动绘制。页面恢复的首帧 delta 为 0，随后 delta 上限为 50 ms。画布尺寸和投影只在尺寸实际变化时更新；几何与材质复用并由原 dispose 路径释放。
- `cockpit.js` 动态追加 `#robot-motion-toggle`，不与 HTML 作者双写。`aria-pressed=true` 表示动画暂停，文案为“播放动画”；false 表示动画开启，文案为“暂停动画”。减少动画偏好默认暂停，偏好变为 reduce 时立即暂停；手动播放是明确用户选择。模式切换保留暂停选择；图形不可用时按钮禁用。
- pointer enter/move/down 暂停自动装饰 8 秒，pointer down 冻结剩余缓动；拖动后不调用 `onSelect`。选择继续只向宿主返回当前完整 UUID，没有 HTTP/终端/API 访问。文案明确“动画仅装饰；活动 / 完成未知”。

目标锁检查：取景与交互流畅度改动均直接对应用户反馈。反目标检查：没有以装饰动画推断工作状态，没有新增业务权限、依赖、通用 Controls 系统或配置。作者体验：延续现有小型 Scene 生命周期和 UUID 选择接口，没有引入框架。回滚仅为这两个文件的本批差异，可直接回滚；应保留其它作者的同时改动。

## 作者实际验证

命令：`node work/verify-robot-motion-author.cjs`。2026-10-04T03:34:30.961Z 开始，03:34:31.083Z 结束，进程退出码 0。实际运行 cockpit `node --check` 和 robot3d `node --input-type=module --check`，两项退出码均为 0，完整 stdout/stderr 均为空，error 为 null。

证据：`work/robot-motion-author-verification.json`（包含完整参数、输出、退出码、精确输入哈希和未执行项）；责任人是实施者。该证据只支持 JavaScript 语法，不支持真实 WebGL、流畅度或功能验收。

完整源码差异：`work/robot-motion-author.patch`，SHA256 `96bbe0d88dc23f92bfc197608afcae451f8c11072e189bac92c934cb5a32d676`；对比 root 保存的 `work/wezterm-session-link-baseline-r1/before`。robot3d 增 104 行、删 19 行；cockpit 增 26 行、删 3 行。差异生成命令实际退出码 0，实施者完整读过输出差异。

最终源码：robot3d SHA256 `7d9e458676c9b10b15fc177fb32c058c9caf68097b3dce832f44d2d250bdce5c`；cockpit SHA256 `fa0d438d34fde6bace2b9745c5cfbc321b51710eb2f3655cf2d10c6c56149b8a`。

采集失败保留：首次合并源码输出 `7eda64` 被工具截断；随后 `281739` 和 `70912d` 分别完整重读两实现，`68ea62` 读取实际 harness 相关钩子。不存在已执行但未报告的作者测试失败。作者没有运行浏览器/HTTP/8766/GUI/SSH、没有改变真实平台状态。

## root 承接验收与风险

root 已授权唯一 harness 作者在原 fixture 加 motion 生命周期场景，不另建测试服务器。

1. 默认真实 WebGL 连续帧，以及 Perspective 相机位置和模型变换变化；多帧后站台/机器人取景在 360px 和正常宽度可见。真实帧时间 median/p95 仅作为本机采样，不承诺全部设备 60fps。
2. 真实暂停按钮使画面稳定，实际水平/垂直拖动和有限滚轮平滑响应；拖动不选择 UUID、不发隐式 API。reset 等待约 850ms 后用真实暂停按钮、逐次读取当前模型矩阵与投影再点选；不能直接调用 `onSelect`。
3. 暂停、reducedMotion 默认、隐藏、模式切换与 dispose 的连续帧停止，以及恢复首帧无大幅跳转；reducedMotion 下明确手动播放可恢复装饰动画。
4. 原完整 fixture 中模块失败、WebGL 首次/后续绘制失败、真实 context lost/restored、像素/文字回退、消息分页与 UUID 选择继续核验。实际页面刷新、截图和用户现场交互由 root 承接。

以上任一缺证据即对应项未验证；不能依据作者静态检查宣称现场症状解决。风险：透视下远近尺寸不同，狭窄布局或复杂模型数下的实际可点选和性能仍须 root 观察；小幅装饰运动不代表任务活跃。

建议英文提交信息：`feat(cockpit): add smooth perspective orbit and motion controls`。

无跨功能事实。
