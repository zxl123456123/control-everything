# 机器人视角与流畅度：有界展示增量

2026-10-04。用户新增明确反馈：“目前的这个工作台，首先不是3d动图视角，也不丝滑”。沿用自动实施授权；这是独立的可逆本地展示修正，不恢复或改写旧机器人冻结方案/报告，不更改当前WezTerm联动基线。按coordinator有界合同路由，默认再次确认步骤由已有自动实施授权覆盖；仍须fresh验证与未参与实施的review。

实际代码：robot3d使用OrthographicCamera、一次性requestAnimationFrame、只修改world.yaw；draw每次setSize/projection。实际IAB先为pixel模式，切3D后可见WebGL模型，但没有持续运动。cockpit保留自动降级、手动重试、UUID-only选择。已完整读两实现。

业界参考：[Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)明确环绕、damping和autoRotate需在动画循环更新，delta时间可避免刷新率影响。采用这些已有交互原则，在当前少量相机状态中扩展缓动；不引入新的完整Controls依赖、框架、渲染器或改vendor。首次旧hash docs跳到目录、两个旧manual网址404保留为调研采集失败。

范围仅web/robot3d.js、web/cockpit.js（作者独占）；可新增独立本地浏览器fixture脚本tests/verify_robot_motion.cjs，测试执行由root承担。旧harness由WezUI作者独占，必要兼容点由root传递，不能双写。snapshot来自work/wezterm-session-link-baseline-r1/before对应文件，外部服务/来源/消息/API/终端权限不变。

目标：透视相机和可见地面/站台提供深度；默认缓慢环绕及轻微装饰性机器人运动，交互时暂停自动环绕以稳定点选；水平/垂直拖动、有限缩放、箭头/重置平滑响应。增加可访问的暂停/播放动画入口，尊重prefers-reduced-motion。连续requestAnimationFrame只有页面可见且3D存活时运行；resize只在尺寸变化时setSize，复用资源不每帧重建。模型运动不表示任务正在工作，文案保持活动/完成未知。

验收：真实WebGL连续多帧及模型/相机变化；拖动后不误点UUID；点击仅选择真实UUID，无implicit focus/connect；暂停/减少动画/隐藏/模式切换/dispose停止连续帧、恢复不跳跃；宽/360px取景、现有模块/绘制/context丢失与像素/文字回退仍成立。root执行原完整fixture及新增有意义的帧/控制fixture，保存完整stdout/stderr/exit与截图，独立review最终diff及证据。性能只报告本机实际采样，不保证所有设备60fps。

实施者仅本地静态/语法，不运行browser/HTTP/8766/GUI/SSH，不递归。root承接真实浏览器、正常加载、性能和独立审查。增量约150–250行，若出现外部依赖/公开API/不可逆动作/持续未知，保留diff与证据并升级流程。回滚只撤该增量源码，不关闭任何进程、不覆盖其它工作。当前无Git，不创建仓库。
