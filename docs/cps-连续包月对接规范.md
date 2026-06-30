# CPS 连续包月（先签约后代扣）对接规范

> 适用对象：接入本平台连续包月 CPS 推广的**品牌方**与**服务商**。
> 本文档与平台「品牌门户 → 开发者中心」页同源，接口可在 Swagger UI（`/docs`，tag `cps`）在线查阅。

---

## 1. 概述与角色

连续包月（先签约后代扣）是一种「用户一次签约、平台周期自动扣款」的订阅模式。三方角色：

| 角色 | 职责 |
|---|---|
| **用户（C 端）** | 在推广落地页签约，授权周期代扣 |
| **服务商** | 投放引流、承接权益核销与售后 |
| **品牌方** | 提供会员权益与支付能力 |
| **CPS 平台（本平台）** | 中台：提供签约/退款/解约/查询标准接口 + 状态回调 + 补扣调度 |

对接基址：`/cps/v1`（生产环境为 `https://<平台域名>/cps/v1`）。

---

## 2. 接入流程

1. **申请凭证**：在「品牌门户 → 开发者中心」生成对接凭证，获得 `appId` 与 `secret`（**明文仅显示一次**，请妥善保存）。
2. **配置回调地址**：在开发者中心填写 `callbackUrl`，用于接收订单状态变化通知（出站 webhook）。
3. **联调**：用沙箱商品走「签约 → 扣款 → 退款 → 解约」全流程，在「联调日志」核对回调投递。
4. **上线**：联调通过后切换生产凭证。

---

## 3. 鉴权与签名规范（HMAC-SHA256）

所有对外接口（签约/退款/解约/查询/回调）均需签名。算法与支付宝/微信代扣同构：

**签名步骤**

1. 取请求体中的业务字段，**剔除 `sign` 字段** 以及值为 `null`/`undefined`/空串的字段。
2. 按字段名（key）**升序**排序，拼接成 `k1=v1&k2=v2&…&kn=vn`。对象/数组类型的值先 `JSON.stringify`。
3. 末尾追加 `&key=<secret>`（secret 固定尾接，不参与排序）。
4. 计算 `sign = HMAC_SHA256(stringToSign, secret)`，结果取**小写十六进制**。

**请求需携带**：`appId`（定位密钥）、`timestamp`（秒级或毫秒级 Unix 时间戳）、`sign`。

**防重放**：服务端校验 `timestamp` 与服务端时钟偏移须 ≤ **300 秒**，超出拒绝。

**签名伪代码**

```js
function buildSign(params, secret) {
  const base = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return hmacSHA256(base + `&key=${secret}`, secret).toLowerCase() // hex
}
```

**鉴权失败返回**（HTTP 401）：`{ "code": 401, "message": "签名校验失败" }`，可能的 message：`缺少 appId` / `未注册的对接方 appId` / `请求时间戳过期或偏移过大` / `签名校验失败`。

---

## 4. 接口详情

### 4.1 签约接口

- **功能**：连续包月会员签约，用于走支付宝签约。
- **方法**：`POST /cps/v1/sign`

| 字段 | 类型 | 必传 | 含义 |
|---|---|---|---|
| sign_content | string | 是 | 签约商品 ID（品牌方提供，平台读其价格） |
| pay_channel_type | number | 是 | 1=支付宝 |
| mobile | string | 是 | 用户手机号（平台脱敏存储，不留全量 PII） |
| extra_info | string | 否 | 透传参数，回调时原样返回，JSON 串 |
| appId / timestamp / sign | - | 是 | 鉴权 |

**响应**

```json
{ "code": 0, "msg": "success", "data": { "signOrderNo": "SIGN-xxxx", "url": "签约链接" } }
```

- `signOrderNo`：**签约单号，贯穿整个订单周期**，一个签约单号对应多个交易单号。
- `url`：签约确认/收银台链接。

### 4.2 退款接口

- **功能**：指定用户某一期首订或续费订单退款。
- **方法**：`POST /cps/v1/refund`

| 字段 | 类型 | 必传 | 含义 |
|---|---|---|---|
| signOrderNo | string | 是 | 签约单号 |
| orderNo | string | 是 | 交易单号（某一期扣款的商家交易单号） |
| appId / timestamp / sign | - | 是 | 鉴权 |

**响应**：`{ "code": 0, "msg": "success", "amount": 19, "period": 0 }`

### 4.3 解约接口

- **功能**：给用户会员解约，停止后续扣款并取消补扣。
- **方法**：`POST /cps/v1/unsign`

| 字段 | 类型 | 必传 | 含义 |
|---|---|---|---|
| signOrderNo | string | 是 | 签约单号 |
| appId / timestamp / sign | - | 是 | 鉴权 |

**响应**：`{ "code": 0, "msg": "success" }`

### 4.4 查询接口

- **功能**：查询签约单及各期扣款状态（对账用）。
- **方法**：`POST /cps/v1/query`

| 字段 | 类型 | 必传 | 含义 |
|---|---|---|---|
| signOrderNo | string | 是 | 签约单号 |
| appId / timestamp / sign | - | 是 | 鉴权 |

**响应**

```json
{ "code": 0, "msg": "success", "data": {
  "signOrderNo": "SIGN-xxxx", "status": "active", "plan": "...", "amount": 19,
  "currentPeriod": 1, "nextChargeAt": "...", "mobile": "139****1234",
  "charges": [ { "orderNo": "TXN...", "type": "first", "amount": 19, "period": 0, "time": "..." } ]
} }
```

### 4.5 回调接口（平台接收）

- **功能**：品牌方调用此接口，向平台传递订单状态变化通知。
- **方法**：`POST /cps/v1/callback`

| 字段 | 类型 | 必传 | 含义 |
|---|---|---|---|
| sign_content | string | 否 | 商品 ID |
| signOrderNo | string | 是 | 签约单号（任何回调都要传） |
| orderNo | string | 否 | 交易单号（扣款/退款成功回调传，其他为空） |
| status | int | 是 | 状态：见 §5 |
| amount | number | 否 | 业务金额（扣款/退款传） |
| period | int | 否 | 扣款期数：首订 0，续期累加 |
| operateTime | string | 否 | 业务时间（用于对账，强烈建议传准确值） |
| extra_info | string | 否 | 透传 |
| appId / timestamp / sign | - | 是 | 鉴权 |

> **出站 webhook（平台 → 品牌）**：平台在签约/扣款/续费/退款/解约发生时，会以相同的 `status` 枚举与 HMAC 签名，主动 `POST` 到你在开发者中心配置的 `callbackUrl`。请按 §3 验签后处理，并以 HTTP 200 应答。

---

## 5. 订单状态机与 status 枚举

| status | 含义 | orderNo | amount | period |
|---|---|---|---|---|
| 1 | 签约成功 | 空 | 0 | 0 |
| 2 | 扣款成功 | 必传 | 必传 | 首扣 0，续期累加 |
| 3 | 解约成功 | 空 | 0 | 0 |
| 4 | 退款成功 | 必传 | 必传 | 对应期 |
| 5 | 扣款失败 | 空/对应 | 0 | 对应期 |

**关键点**

- **签约单号贯穿整个订单周期**：签约、解约用签约单号；首订、续订、退款用「签约单号 + 交易单号」。
- **period**：首次扣款传 0，续期 +1，其他类型回调传 0。
- **operateTime**：任何回调都应传，尤其扣款成功——直接影响跨天/跨月对账口径。

---

## 6. 补扣机制

扣款失败（网络异常、渠道异常、余额不足等）时，平台自动触发补扣，提升成功率、避免用户重复办理。

| 维度 | 规则 |
|---|---|
| 补扣周期 | 自扣款失败日起，持续补扣 **3 个月** |
| 补扣频率 | 当天失败当天再补 1 次；之后每周定时 1 次 |
| 执行时段 | 工作时段执行，**避开 22:00 ~ 次日 07:00** |
| 终止条件 | 满足任一即止：① 扣款成功；② 用户主动解约；③ 3 个月内均未成功 → 自动解约；④ 合约到期自动解约 |

补扣成功会照常推送 `status=2`；3 个月未果自动解约会推送 `status=3`。

---

## 7. 错误码

| code | 含义 |
|---|---|
| 0 | 成功 |
| 401 | 鉴权失败（缺 appId / 未注册 / 时间戳过期 / 签名错误） |
| 40004 | 签约商品不存在或未上架 |
| 40005 | 退款失败（原扣款单不存在或已退款） |
| 40006 | 解约失败（签约单不存在） |

---

## 8. 联调清单（FAQ）

- **签名一直 401？** 检查：① 拼接串是否剔除了 `sign` 与空值；② key 是否升序；③ 是否尾接 `&key=<secret>`；④ `timestamp` 是否在 300 秒内；⑤ 取的是 hex 小写。
- **回调收不到？** 确认开发者中心 `callbackUrl` 已保存、可公网访问、返回 HTTP 200；在「联调日志」查看投递记录与 HTTP 状态。
- **金额能否由调用方传？** 不能。金额由平台服务端按签约商品定价权威计算，调用方传金额会被忽略/拒绝。
- **同一笔重复请求会重复扣款吗？** 不会。扣款/退款接口幂等（可带 `Idempotency-Key` 头），重复请求返回首次结果。
- **手机号会泄漏吗？** 不会。平台脱敏存储（`139****1234`），回调与查询均为脱敏值。

---

## 附录 · 全链路 curl 示例（沙箱）

> `appId`/`secret` 为演示凭证；生产请用开发者中心生成的真实凭证。`商品ID` 取自品牌已上架的 live 商品。

```bash
# 1. 签约（先用脚本按 §3 计算 sign）
curl -X POST $BASE/cps/v1/sign -H 'Content-Type: application/json' \
  -d '{"sign_content":"<商品ID>","pay_channel_type":1,"mobile":"13900001234",
       "appId":"<appId>","timestamp":<ts>,"sign":"<sign>"}'
# → { code:0, data:{ signOrderNo, url } }

# 2. 查询对账
curl -X POST $BASE/cps/v1/query -H 'Content-Type: application/json' \
  -d '{"signOrderNo":"<so>","appId":"<appId>","timestamp":<ts>,"sign":"<sign>"}'

# 3. 退款某期
curl -X POST $BASE/cps/v1/refund -H 'Content-Type: application/json' \
  -d '{"signOrderNo":"<so>","orderNo":"<交易单号>","appId":"<appId>","timestamp":<ts>,"sign":"<sign>"}'

# 4. 解约
curl -X POST $BASE/cps/v1/unsign -H 'Content-Type: application/json' \
  -d '{"signOrderNo":"<so>","appId":"<appId>","timestamp":<ts>,"sign":"<sign>"}'
```
