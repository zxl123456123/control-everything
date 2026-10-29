# Keycloak 预构建镜像：构建期固定数据库/缓存/特性，运行期 `start --optimized`，
# 避免每次启动重新 augment（省启动内存与时间）。本文件只属于 idp-keycloak.yml。
ARG KC_BASE=quay.io/keycloak/keycloak:26.8.1
FROM ${KC_BASE} AS builder
# 关闭本部署用不到的特性（26.8.1 上实测 `kc.sh build` 通过；依赖关系已处理）。
# 保留：device-flow（桌面端设备授权）、admin-api（hub 读成员目录）、account-api、login、
# par、client-policies 等默认特性。
ARG KC_FEATURES_DISABLED=authorization,admin-fine-grained-authz,ciba,kerberos,impersonation,docker,organization,token-exchange,token-exchange-standard,token-exchange-delegation,dpop,step-up-authentication,step-up-authentication-saml,recovery-codes,web-authn,passkeys,opentelemetry,scripts,workflows,scim-api,ssf,spiffe,kubernetes-service-accounts,oid4vc-vci,oid4vc-vp,oid4vc-mdoc,cimd
ENV KC_DB=postgres \
    KC_CACHE=local \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false
COPY themes/ /opt/keycloak/themes/
RUN /opt/keycloak/bin/kc.sh build --features-disabled="${KC_FEATURES_DISABLED}"

FROM ${KC_BASE}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENV KC_DB=postgres KC_CACHE=local KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=false
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
