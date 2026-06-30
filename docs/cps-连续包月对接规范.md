# 有道会员续费对接规范（RSA）

> 适用对象：接入有道会员续费支付的**合作方**（产品 / 开发 / 测试）。
> 本文档与平台「品牌门户 → 开发者中心」同源，接口可在 Swagger UI（`/docs`，tag `youdao`）查阅。

---

## 1. 概述与角色

| 角色 | 职责 |
|---|---|
| **用户（C 端）** | 在推广落地页签约，授权周期代扣 |
| **合作方** | 投放引流、调用有道续费接口、接收状态回调 |
| **有道（本平台）** | 提供签约/退款/解约/查询标准接口 + 状态回调 + 补扣调度 |

**域名**
- 测试：`https://dict-paycenter-test.youdao.com/client`
- 正式：`https://dict-paycenter.youdao.com/client`
- 本系统（模拟）：`/pay/outside`、`/order/outside` 前缀。

---

## 2. 鉴权与签名（RSA · SHA256withRSA）

### 2.1 密钥交换
合作方生成一对 **RSA 2048** 公私钥（PKCS8 私钥**自留**，SPKI 公钥发给有道）。可在「开发者中心」一键生成（私钥仅下载一次），或自行用 openssl：

```bash
openssl genpkey -out private.pem -algorithm RSA -pkeyopt rsa_keygen_bits:2048
openssl rsa -in private.pem -out public.pem -pubout
```

### 2.2 签名规则
1. 业务参数按字段名 **key 字母序**排列，以 `key=value` 形式用 `&` 连接，得待签名串。**空值与 `sign` 不参与签名**。例：`a=a1&b=b1&c=c1`。
2. 用私钥 `SHA256withRSA` 对待签名串签名，得 signvalue。
3. `sign = base64(signvalue)`。验签时规则一致（有道用合作方公钥验）。

**防重放**：携带 `timestamp`（秒/毫秒级 Unix），服务端校验偏移 ≤ **300 秒**。
**签名错误**返回 `code:403`（HTTP 200 + body code）。

### 2.3 签名代码参考（Java）
```java
Signature signature = Signature.getInstance("SHA256withRSA");
signature.initSign(privateKey); // PKCS8 私钥
signature.update(source.getBytes(StandardCharsets.UTF_8));
String sign = Base64.getEncoder().encodeToString(signature.sign());
```
> Node / Python / curl 模板见「开发者中心 → SDK / 代码」一键生成。

---

## 3. 接口详情

### 3.1 续费下单 `POST [baseUrl]/pay/outside/order`（form-data）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| custId | String | Y | 业务方 id（联系开发获取） |
| merchantId | String | Y | 商户 id（联系开发获取） |
| goodsId | String | Y | 商品 id（定价权威来源） |
| custOrderId | String | Y | 合作方订单号（≤64，唯一，作本次签约唯一标志） |
| phone | String | Y | 下单手机号 |
| payType | String | Y | WEIXIN / ALIPAY |
| platform | String | Y | android / web / native / wechatmp |
| signType | String | Y | payAfterSigning（签约后扣款） |
| deviceId | String | Y | 设备唯一标志 |
| source | String | N | 下单来源 |
| passbackParams | String | N | 额外信息（json，回调原样返回） |
| sign | — | Y | 见签名算法 |

**响应**：`{ "code":0, "msg":"OK", "data":{ "isAuto":true, "payInfo":{ "orderId":"...", "orderParam":"..." } } }`
- `orderId`：有道订单号（= 签约单号，后续解约/查询用）；`orderParam`：支付宝/微信下单参数。

### 3.2 退款 `POST [baseUrl]/order/outside/refund`（form-data）
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| custId / merchantId | String | Y | 同上 |
| orderId | String | Y | 词典订单号（退款订单 / 交易单号） |
| sign | — | Y | 签名 |

**响应**：`{ "code":0, "msg":"OK" }`

### 3.3 解约 `POST [baseUrl]/order/outside/unsign`（form-data）
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| custId / merchantId | String | Y | 同上 |
| orderId | String | Y | 签约下单时有道返回的 orderId |
| sign | — | Y | 签名 |

### 3.4 订单状态查询 `GET [baseUrl]/order/outside/orderQuery`
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| merchantId | String | Y | 商户 id |
| orderId | String | Y | 有道返回的订单号 |
| sign | — | Y | 签名 |

**响应**：`{ "code":0, "msg":"OK", "data":{ "orderStatus":0 } }`
`orderStatus`：**0 创建 / 1 已支付 / 2 已通知 / 3 已退款**。

### 3.5 续费状态回调（合作方提供 url，有道 POST）`application/json`
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| custOrderId | String | Y | 合作方订单号 |
| orderId | String | Y | 词典侧订单号（语义随 status，见下） |
| status | Integer | Y | 见 §4 |
| subMsg | String | Y | 状态相关信息（status=4/5 为失败原因） |
| effectiveTime | Long | Y | 13 位毫秒级时间戳（状态生效时间） |
| price | Long | Y | 金额（**单位：分**，代扣/退款） |
| sign | — | Y | 平台用有道私钥签名，合作方用有道公钥验 |

合作方应答 `{ "code":0, "msg":"OK" }`。

---

## 4. 回调 status 枚举

| status | 含义 | orderId 语义 |
|---|---|---|
| 0 | 已解约 | 首笔签约订单 |
| 1 | 签约中（签约成功） | 首笔签约订单 |
| 2 | 代扣（扣款成功） | 本次代扣生成订单 |
| 3 | 退款 | 具体某笔退款的订单 |
| 4 | 代扣失败 | 本次代扣生成订单 |
| 5 | 退款失败 | 具体某笔退款的订单 |

---

## 5. 补扣机制

扣款失败（网络异常、渠道异常、余额不足等）时，平台自动触发补扣：

| 维度 | 规则 |
|---|---|
| 补扣周期 | 自失败日起持续 **3 个月** |
| 补扣频率 | 当天失败当天再补 1 次；之后每周 1 次 |
| 执行时段 | 工作时段，**避开 22:00 ~ 次日 07:00** |
| 终止条件 | 扣款成功 / 主动解约 / 3 个月未成功自动解约 / 合约到期解约 |

补扣成功推 `status=2`；3 个月未果自动解约推 `status=0`。

---

## 6. 返回码

| code | message | 说明 |
|---|---|---|
| 0 | ok | 成功 |
| -1 | fail | 失败 |
| 107 | 下单频率过高 | |
| 121 | 手机号非法 | |
| 122 | 手机号注册账号失败 | |
| 123 | 合作方不存在 | merchantId 未注册 |
| 124 | 商品不可用 | |
| 125 | 合作方订单重复 | custOrderId 重复 |
| 126 | 订单不存在 | |
| 127 | 订单退款失败 | |
| 403 | 签名错误 | |
| 500 | 服务器错误 | |

---

## 7. 接入流程与自动化（开发者中心）

「品牌门户 → 开发者中心」提供全套自助能力：
1. **凭证密钥**：一键生成 RSA 密钥对（私钥仅下载一次）或上传公钥；配置回调地址。
2. **在线联调**：填参数 → 浏览器本地用私钥签名（私钥绝不上传）→ 看待签名串与请求/响应。
3. **SDK / 代码**：按当前凭证与参数一键生成 curl / Node / Java / Python 签名+请求代码（私钥占位符）。
4. **接入健康分**：一键沙箱全链路自检（公钥/验签/回调可达/投递成功率），给出 0-100 就绪分。
5. **联调日志**：回调投递记录（状态/HTTP/结果/时间）。

---

## 附录 · curl 全链路示例（沙箱）

> 演示凭证 `merchantId=mch_youdao`、`custId=cust_youdao`，私钥见开发者中心生成；`goodsId` 取品牌已上架 live 商品。

```bash
# 待签名串（key 升序、剔空值与 sign）→ 私钥 SHA256withRSA → base64
STR='custId=cust_youdao&custOrderId=CO-123&deviceId=d1&goodsId=<商品ID>&merchantId=mch_youdao&payType=ALIPAY&phone=13900000000&platform=android&signType=payAfterSigning&timestamp=<ts>'
SIGN=$(printf '%s' "$STR" | openssl dgst -sha256 -sign private.pem | openssl base64 -A)
curl -X POST $BASE/pay/outside/order \
  -d 'custId=cust_youdao' -d 'merchantId=mch_youdao' -d 'goodsId=<商品ID>' \
  -d 'custOrderId=CO-123' -d 'phone=13900000000' -d 'payType=ALIPAY' \
  -d 'platform=android' -d 'signType=payAfterSigning' -d 'deviceId=d1' \
  -d "timestamp=<ts>" -d "sign=$SIGN"
# → { code:0, data:{ payInfo:{ orderId } } }
```
