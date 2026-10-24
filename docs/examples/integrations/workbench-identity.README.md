# 自建账号与独立设备 SSH 配置样例

这些文件只含占位值，不代表已经部署或验收。hub 只管理成员、设备和准入，不保存本机项目数据。浏览器和桌面分别使用 `workbench-web`、`workbench-desktop`，固定资源 audience 为 `workbench-hub`。身份来源参见 [Keycloak OIDC 官方文档](https://www.keycloak.org/securing-apps/oidc-layers)。

## 身份与 hub

1. 在专用 Keycloak realm 核对注册、密码策略、暴力尝试保护和两个客户端；已有 realm 应逐项应用配置，不能整体覆盖真实用户。没有 SMTP 时不启用邮件验证或邮件找回。
2. 为浏览器与 hub 两个 confidential client 单独设置秘密。将 hub 配置保存为仅服务账号可读的私有文件；不要提交实际配置。管理员列表必须是部署者核对过的精确 `sub`，不是用户名或首个注册者。
3. 专用系统账号 `ce-remote-hub` 运行 hub，`/var/lib/ce-remote-hub` 权限为 0700。在已安装本包的环境执行 `python tools/scripts/remote_hub_admin.py --config /etc/ce-remote-hub/config.json bootstrap-admin`。此操作仅为配置中的管理员激活成员资格。
4. `workbench-identity.hub.service.example` 安装为独立服务。hub 只监听 `127.0.0.1:18869`；oauth2-proxy 样例的身份头与 access token 仅允许在受信服务器链路流转。Caddy 必须先清除公网伪造头，再注入内部 proof，不能公开 `/internal/authorize`。
5. `static_paths` 必须由实际版本资源清单生成；空列表不豁免任何资产。业务 document 缺 hub session 时由边缘返回账号页；只有 `/remote/api/session` 会发送 session cookie。业务 API 缺 context 时拒绝。

## 独立 SSH 实例

设备转发使用单独的 TCP 2223，不修改既有 22 端口。参数依据 [OpenSSH sshd_config](https://man.openbsd.org/sshd_config)；真实主机仍须验证有效配置和 PAM 账号策略。

1. 将 SSH 配置放入 `/etc/ce-device-sshd.conf`，为 `/etc/ce-device-ssh/ssh_host_ed25519_key` 单独生成并保管 host key。把核对过的公钥写入私有 hub 配置。
2. 将对应实例安装为 **`ce-device-sshd.service`**。进程检查固定其统一 cgroup v2 路径和 `/run/ce-device-sshd.pid`；不能改名后绕过归属检查。
3. 将 socket/service 样例分别安装为 **`ce-device-provisioner.socket`**、**`ce-device-provisioner.service`**。root 拥有 Unix socket，模式 0660，仅 hub 专属组可连接；服务再次通过 `SO_PEERCRED` 检查调用 uid。
4. provisioner 仅接受四种固定操作，不接收 shell、路径、UID 或 PID。它创建 `ced_<device-id>` 的独立禁交互系统账号；每把 root 控制的公钥只允许两条精确 loopback `permitlisten`。账号文件、注册记录与 key 文件不得由 hub 用户写入。
5. root 部署前分别运行 `sshd -t -f /etc/ce-device-sshd.conf` 和 `sshd -T -f /etc/ce-device-sshd.conf -C user=<已登记设备账号>,host=localhost,addr=127.0.0.1`，并用两个实际隧道验证 PTY、shell、本地转发、非 loopback、他人端口均拒绝。

撤销先拒绝路由并失效控制 token，再禁 key、以 pidfd 结束已证明归属的连接子树。无法证明 root monitor 归属、进程身份改变或监听残留时，设备停在 `revoking`，端口保留。`reconcile` 命令和服务重启会重试清理；不杀整套 sshd，不删除其他系统账号。

## 健康与上线验收

hub 只从目录中的两个端口调用 `/__ce_remote_health`，每次独立 nonce，校验 proof、公开 Host/Origin、设备/代次/本平台安装身份、channel 与 ready。单请求绝对截止 2 秒、JSON 上限 4096 字节，不跟随重定向。公网 Caddy 必须在认证和 fallback 前拒绝该路径及子路径。

这些样例须在 HTTP 健康路由、Caddy 信任链和浏览器 context 全部接入后才能部署。必须另外记录真实双账号、双隧道、禁用失效时间、撤 A 保 B、5 秒存量断连和安装包证据；源码单测不能替代这些验收。
