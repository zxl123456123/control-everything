# 远程账号部署包（单台轻量服务器，无域名）

> **状态：未在真实服务器上验证。** 这里的每个文件都做过静态检查（见文末“验证状态”），
> 但没有在你的腾讯云服务器上跑过。请先 `--preflight-only`，再正式安装。

目标：在一台已经跑着 n8n 等服务的 Tencent Lighthouse（Ubuntu，约 7 GB 内存）上，
用**最小改动**部署统一账号：Keycloak（账号）+ oauth2-proxy + Caddy（HTTPS 入口）+ Python hub +
专用 sshd(2223)。没有域名，所以入口是 `https://<公网 IPv4>`。

## 1. 无域名 HTTPS：推荐做法与依据

**做法**：Caddy 直接为公网 IP 申请 Let's Encrypt 的 **IP 地址证书**。

| 事实 | 状态 | 来源 |
| --- | --- | --- |
| Let's Encrypt 自 2026-01-15 起正式签发 IP 地址证书；只能用 `shortlived` profile，有效期 160 小时；只支持 http-01 / tls-alpn-01，不支持 DNS-01 | 已核实 | [Let's Encrypt 公告](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)、[首张 IP 证书说明](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate) |
| Caddyfile 用 `tls { issuer acme { profile shortlived } }` 加全局 `default_sni <IP>`（客户端用 IP 访问没有 SNI） | 已核实（文档）；本包的 Caddyfile 已用 Caddy 2.11.7 的 `caddy validate` 通过 | [Caddy tls 指令](https://caddyserver.com/docs/caddyfile/directives/tls)、[全局选项](https://caddyserver.com/docs/caddyfile/options)、[Caddy issue #7118](https://github.com/caddyserver/caddy/issues/7118) |
| 需要 Caddy ≥ 2.11.1（含 tls-alpn-01 对 IP 的修复），本包固定 2.11.7 | 部分核实（来自 issue 讨论和发布记录） | [Caddy issue #7399](https://github.com/caddyserver/caddy/issues/7399) |
| 腾讯云的备案拦截以**域名**为准：域名解析到大陆轻量服务器必须备案，不论端口；只用公网 IP 直接访问、不解析域名，腾讯云文档说“可暂不备案” | 已核实（腾讯云文档） | [是否需要备案](https://cloud.tencent.com/document/product/243/19630)、[备案概述](https://cloud.tencent.com/document/product/243/18907) |
| sslip.io / nip.io 之类“把 IP 变成域名”的服务会落入上面的域名备案拦截 | 推断（未实测），所以不采用 | 同上 |

**为什么证书是公共信任的很重要**：手机 App、桌面端、hub 自己（Python `urllib`）都不需要安装自定义 CA。

**已知注意事项（务必读）**

1. 证书每约 6 天自动续期（Caddy 自动完成）。续期失败（80/443 不通、被其它进程占用）约 6 天后站点会变成证书过期。
2. 公网 IP 变化（轻量服务器换 IP、重建）后必须重装/改 `CE_PUBLIC_IP`——IP 就是身份。建议在腾讯云控制台把该 IP 保留/绑定。
3. Lighthouse 公网 IP 经 NAT，本机直接访问自己的公网 IP 可能不通（回环）。本包默认在 `lo` 上加 `IP/32` 别名解决，可 `--no-lo-alias` 关闭。**回环是否真的需要，未在真实机验证。**
4. Cookie `__Host-ce_remote`（Secure、无 Domain）在 https IP 主机上按规范应当有效，但**没有在真实浏览器里测过**。
5. 法律层面：腾讯云文档的“暂不备案”只描述其阻断机制；向大陆用户公开提供网站服务的备案义务（见[备案概述](https://cloud.tencent.com/document/product/243/18907)）以主管部门要求为准，本包不做判断。自用工具请自行评估。

被否决的做法：Caddy 内部 CA / 自签证书（手机和桌面要装根证书）；sslip.io（域名，大概率被拦）；换 8443 端口（不解决证书，且防火墙没放行）；腾讯云免费 SSL（需要域名）。

## 2. 结构与端口

```
公网 80/443 ── Caddy(容器, host 网络) ──┬─ /realms/<realm>…  → 127.0.0.1:18080 ── IdP 容器 + Postgres（idp-keycloak.yml）
                                        ├─ /oauth2/*         → oauth2-proxy 127.0.0.1:18868（容器, host 网络）
                                        ├─ /remote/api/*, /remote/desktop/*, 业务页 → hub 127.0.0.1:18869（systemd, Python）
                                        └─ /remote 账号页静态文件 /srv/control-everything/remote-ui
公网 2223 ── 专用 sshd（systemd, 设备反向隧道，回环端口 20000-20999）
```

* 公网只多出 80/443/2223（防火墙里本来就开了 22/80/443/2223）。其它全是 127.0.0.1。
* Caddy 和 oauth2-proxy 用 host 网络，是因为 hub 和设备隧道在宿主机回环地址上。
* 手机端：realm 里已有公开 PKCE 客户端 `workbench-mobile`（自定义 scheme 回调 `<scheme>:/oauth/callback`，仅 S256，无直接密码授权）。已用真实 Keycloak 26.8.1 验证：缺 `code_challenge_method` 被拒、未登记的回调被拒、密码直接授权被拒。**hub 目前只接受 `azp` 为 `workbench-web` / `workbench-desktop` 的令牌，手机端 hub 接口是下一步（单独的变更），本 PR 不实现。**

## 3. 轻量与低耦合

### 3.1 IdP 是可替换单元

* IdP 相关的东西只在三处：`idp-keycloak.yml`、`keycloak/`（Dockerfile）、`realm/workbench-realm.json`，以及 env 模板里的 **“IdP 区块”**（issuer、client id、登出地址、公开路径白名单、provider 名）。
* `docker-compose.yml`（Caddy + oauth2-proxy）、`caddy/Caddyfile`、`systemd/*`、hub 配置生成逻辑里没有任何 IdP 专有字样，只读通用变量（`CE_OIDC_ISSUER`、`CE_IDP_UPSTREAM`、`CE_IDP_PUBLIC_PATHS` 等）。
* 叠加方式：`docker compose -f docker-compose.yml -f idp-keycloak.yml up -d`。

### 3.2 内存预算（硬上限）

| 组件 | 上限 | 做法 |
| --- | --- | --- |
| Keycloak | 容器 `mem_limit=768m`，禁用 swap | 堆 `-Xms128m -Xmx288m`；元空间 ≤192m；直接内存 ≤48m；代码缓存 ≤48m；`-Xss512k`；Serial GC；`start --optimized`；DB 连接池 ≤10、HTTP 线程 ≤50；`cache=local`、不开 metrics；`--features-disabled` 关掉授权服务、CIBA、Kerberos、模拟、组织、token-exchange、DPoP、WebAuthn/Passkeys、脚本、workflows 等（26.8.1 上 `kc.sh build` 通过） |
| Postgres（仅 Keycloak 用） | 160m | `shared_buffers=24MB`、`max_connections=30` |
| Caddy | 128m | |
| oauth2-proxy | 96m | |
| hub（systemd） | `MemoryMax=192M` | 纯标准库 Python |
| 合计上限 | 约 1.35 GiB（稳态预计约 0.8–0.9 GiB） | n8n 与现有服务不受 cgroup 影响 |

**在构建机上的实测**（Keycloak 26.8.1，JDK 21，使用以上 JVM 参数、optimized 启动、H2 数据库代替 Postgres，导入本包的 realm，并反复做管理员取令牌、目录服务账号取令牌、手机 PKCE 授权请求）：
首次启动含 realm 导入后进程 RSS ≈ 527 MB；重启（不含导入）后 ≈ 468 MB。**元空间 128m 在 realm 导入时会 `OutOfMemoryError: Metaspace`，所以定为 192m。** Keycloak 官方建议的最小内存比这个预算大，所以 768m 属于“紧”预算：如果出现 OOM 重启，把 `KC_MEM_LIMIT` 提到 `1024m`、`KC_JAVA_HEAP` 的 `-Xmx` 提到 `384m`。容器内（Postgres + 容器 cgroup）的实测**还没做**。

### 3.3 install.sh 的行为

* 预检（`--preflight-only` 只做这个）：系统、Python ≥ 3.12、`free -m`、可用内存（< 1400 MiB 报失败）、磁盘、端口 80/443/2223/18868/18869/18080 谁在监听、n8n(5678) 是否在、`docker ps`、`docker stats`。端口被别的进程占用时直接拒绝安装。
* 只改“影响范围”里列出的东西（见 `install.sh` 头部注释）：新目录、`ce-remote-hub` 系统用户、5 个 systemd 单元、compose 项目 `ce-remote`、`lo` 别名。**不改** n8n、渲染/发布栈、22 端口的 sshd、`/etc/docker/daemon.json`，**不重启 dockerd**（重启会连带重启 n8n 容器）。
* 安装后：等待 Keycloak 健康，等待受信任证书（无 `-k` 访问发现文档），再打印 `free -m` 与 `docker stats`。
* 幂等：重复运行不会重新生成秘密，也不会覆盖 hub 里的 `admin_subjects`。

## 4. 安装步骤

```bash
git clone https://github.com/zxl123456123/control-everything.git && cd control-everything
git checkout develop        # 合并本 PR 之后；合并前用 feature/remote-deploy-kit
sudo bash deploy/remote/install.sh --preflight-only      # 先看报告
sudo bash deploy/remote/install.sh --mobile-scheme com.yourname.workbench   # 正式安装
```

装好后：
1. 打开 `https://<公网 IP>/remote` 注册第一个账号（realm 允许自助注册；没有 SMTP，所以不要求邮箱验证、不提供邮件找回）。
2. `sudo bash /opt/ce-remote/deploy/scripts/promote-admin.sh <用户名>`：脚本读出该用户的精确 `sub`，请你核对后写入 hub 配置并执行 `bootstrap-admin`。
3. `sudo bash /opt/ce-remote/deploy/scripts/check.sh`：自检。
4. 卸载：`sudo bash /opt/ce-remote/deploy/uninstall.sh`（保留数据）或加 `--purge`。

Keycloak 管理控制台不对公网开放（Caddy 只转发白名单路径）。管理员密码在 `/etc/ce-remote/ce-remote.env`。需要管理时用 SSH 隧道：`ssh -L 18080:127.0.0.1:18080 <服务器>`，再访问 `http://127.0.0.1:18080`（因为固定了 `KC_HOSTNAME`，控制台页面的跳转可能指向公网地址；这条路径**未验证**，日常用 `promote-admin.sh` 和 `docker exec ce-remote-idp /opt/keycloak/bin/kcadm.sh` 即可）。

## 5. 与现有服务共存的风险

| 风险 | 说明 / 缓解 |
| --- | --- |
| 内存 | n8n、渲染/发布栈、systemd 服务（`MemoryMax=3G`）已占一部分。预检要求可用内存 ≥ 1400 MiB。所有新容器都有 `mem_limit` 且不使用 swap，超限只会杀新容器。 |
| 80/443 冲突 | 渲染/发布栈用 host 网络，可能占 80/443。预检会列出占用者并拒绝安装。 |
| 回环别名 | `lo` 上多一个公网 IP/32。本机进程访问自己的公网 IP 会走本机而不是 NAT 外绕；卸载时删除。 |
| Docker | 不改 `daemon.json`、不重启 dockerd。拉镜像慢时用 env 里的镜像前缀。 |
| 磁盘 | 镜像约 1.5 GiB，构建缓存另算；预检要求根分区 ≥ 6 GiB 可用。 |
| ACME 限速 | 反复重装会触发 Let's Encrypt 限速；Caddy 数据卷 `ce_caddy_data` 保留证书，重装不会重签。 |

## 6. Docker 镜像加速

* 腾讯云内网镜像只代理 Docker Hub，且只在腾讯云内网可用（已核实）；`quay.io`（Keycloak、oauth2-proxy）不在其内。
* 本包用**逐镜像前缀**：`CE_REGISTRY_DOCKERHUB`（Caddy、Postgres）和 `CE_REGISTRY_QUAY`（Keycloak、oauth2-proxy）。留空即官方源。
* 第三方镜像站（如 `docker.1ms.run/`、`quay.1ms.run/`）网上有人列出，**未在你的服务器上验证**，且第三方镜像有供应链风险；建议先官方源试拉，慢再换。

## 7. 更换 IdP（例如更轻量的 Casdoor）

**重要事实**：当前 hub 的代码把 Keycloak 的接口形状写死了，所以“换 IdP”不只是改配置：

* `identity.py`：令牌自省地址固定为 `<issuer>/protocol/openid-connect/token/introspect`，要求响应含 `active`、`sub`、`exp`、`aud ∋ workbench-hub`、`azp ∈ {workbench-web, workbench-desktop}`。
* `directory.py`：issuer 必须形如 `https://host/realms/<realm>`，成员目录读 `<base>/admin/realms/<realm>/users[/count]`，用 client credentials 取令牌。
* oauth2-proxy 需要标准 OIDC discovery、`sub` 声明，以及 `CE_OIDC_LOGOUT_URL` 里对应的退出端点。

换 IdP 的步骤：
1. 新增 `idp-<name>.yml`（只暴露 `127.0.0.1:18080` 给 Caddy，同样设 `mem_limit`），删除 `idp-keycloak.yml` 与 `keycloak/`、`realm/`；改 `scripts/common.sh` 里 `compose()` 引用的文件名。
2. 只改 env 模板的 “IdP 区块”：`CE_OIDC_ISSUER`、`CE_OIDC_PROVIDER`（oauth2-proxy 的 provider 名）、各 client id、`CE_OIDC_LOGOUT_URL`、`CE_IDP_PUBLIC_PATHS`。
3. 目标 IdP 要么提供与上面一致的 Keycloak 形状接口，要么先改 hub 的自省/目录适配（单独的变更）。Casdoor 的自省和用户目录接口与 Keycloak 不同，所以**本 PR 没有提供 `idp-casdoor.yml`——一个没验证过且 hub 也接不上的存根只会误导**。

## 8. 镜像里的 Keycloak 配置

* `keycloak/Dockerfile`：两阶段，构建期 `kc.sh build --features-disabled=…`（`db=postgres`、`cache=local`、`health-enabled=true`、`metrics-enabled=false`），运行期 `start --optimized --import-realm`。
* realm 通过 `${ENV}` 占位符导入（`CE_PUBLIC_ORIGIN`、`CE_MOBILE_SCHEME`、三个 client secret）；realm 已存在时导入会被跳过，所以之后改秘密要用 `kcadm.sh` 或管理控制台，不能只改 env。
* 已在真实 Keycloak 26.8.1 上验证（H2 库）：realm 导入成功；发现文档的 issuer 是 `https://<IP>/realms/workbench`；`workbench-user-directory` 取到服务账号令牌、能列用户、创建用户返回 403；`workbench-mobile` 的 PKCE/回调/密码授权约束如上。

## 9. 验证状态

**已验证**
* 真实 Caddy 2.11.7：`caddy validate`（含 `profile shortlived`、`default_sni`）通过。
* 真实 Docker Compose v5.6.1：`config` 渲染两份 compose 文件通过。
* 真实 Keycloak 26.8.1（JDK 21，非容器）：build 带 `--features-disabled`、optimized 启动、realm 导入、各客户端行为、内存实测（见 3.2）。
* `shellcheck`（所有脚本）、`bash -n`、YAML/JSON 解析、realm 与部署包静态测试（`tests/backend/test_remote_deploy_kit.py`）、仓库架构/隐私检查。

**未验证**
* 任何在真实服务器上的步骤：Docker 镜像拉取/构建、容器内内存、Let's Encrypt IP 证书实际签发、NAT 回环、与 n8n/渲染栈的端口与内存共存、sshd 2223 的真实公钥隧道、Cookie 在真实浏览器中的行为。
* Keycloak 在 Postgres 上的运行；healthcheck 里的 `/dev/tcp` 写法（依赖镜像里的 bash）。
* `promote-admin.sh` 的完整流程、`check.sh`、`uninstall.sh --purge`。
* 手机端完整登录：hub 尚未接受 `workbench-mobile` 令牌。
* 这不能替代 `docs/examples/integrations/workbench-identity.README.md` 要求的真实双账号、双隧道、撤销与手机验收。

## 10. 来源

* Let's Encrypt：[IP 与 6 天证书正式可用](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)、[首张 IP 证书](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate)
* Caddy：[tls 指令](https://caddyserver.com/docs/caddyfile/directives/tls)、[全局选项](https://caddyserver.com/docs/caddyfile/options)、[#7118](https://github.com/caddyserver/caddy/issues/7118)、[#7399](https://github.com/caddyserver/caddy/issues/7399)
* 腾讯云备案：[是否需要备案](https://cloud.tencent.com/document/product/243/19630)、[备案概述](https://cloud.tencent.com/document/product/243/18907)
* Keycloak：[容器与 optimized 构建](https://www.keycloak.org/server/containers)、[主机名 v2](https://www.keycloak.org/server/hostname)、[反向代理](https://www.keycloak.org/server/reverseproxy)、[realm 导入](https://www.keycloak.org/server/importExport)
* oauth2-proxy：[配置总览](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview)
* 本仓库：`docs/examples/integrations/workbench-identity.README.md` 及同目录示例（本包由其改编）
