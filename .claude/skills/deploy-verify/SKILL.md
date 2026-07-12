---
name: deploy-verify
description: cps-platform 改动后/上线前的全量冒烟验证清单。本项目生产在线使用中,任何代码改动宣布完成之前必须执行本清单;只跑单测不算验证完成。
---

# CPS 平台全量冒烟验证

红线:**项目正式上线使用中**。改动后必须三类角色全部走一遍,全过才能报告完成;任何一项失败都要在汇报里明说。

## 三类入口与测试账号(seed)

| 角色 | 登录入口 | 落点 | 账号 |
|---|---|---|---|
| 平台管理员 | /login | / 根仪表盘 | admin(超管)、finance、risk、ops、audit、teamadmin |
| 品牌方(scopeId=youdao) | /portal/login | /portal/brand/* | brand、brandaudit |
| 代理商(scopeId=A-2041) | /portal/login | /portal/agent/* | agent |

路由保护:RequireScope 组件按 scope 重定向;homeForScope() 决定登录后默认页。公开页:/market。

## 冒烟清单

1. **三类登录**:admin→/、brand→/portal/brand、agent→/portal/agent,各自能进且不能越权访问对方路径(手输对方 URL 应被 RequireScope 拦截)。
2. **平台侧核心页**:/brands、/agents、/orders、/settlement、/risk、/analytics 打开无报错、有数据。
3. **品牌侧**:orders、settlement、products、developer 页面正常;只读角色(brandaudit)不能做写操作。
4. **代理侧**:market、plans、payouts、credit 正常。
5. **API 层**:登录接口、订单列表、结算接口 curl 直测返回 200 且数据结构未变。
6. **回归重点**:改动涉及的模块 + 支付/签名相关(HMAC/RSA 签名接口)必须实调一次。
7. **性能感知**:cps/aso 页面首屏无明显变慢(历史上出过页面反应慢的问题)。

## 验证方式

本地:seed 后起 dev,浏览器逐项走。线上:只读接口 curl 冒烟 + 页面访问,**不得在生产做写操作测试**。汇报格式:每项 ✅/❌ 列表,失败项附截图或响应体。
