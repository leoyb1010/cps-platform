# Agent Studio iPad / iPhone 原生素材制造 App 评估稿

> 用途：给 Claude fable5 或其他模型做二次判断。  
> 评估边界：只考虑“素材制造”，不考虑自动化发布，不考虑网页套壳，不考虑依赖 Mac 端浏览器控制。

## 1. 一句话结论

如果 Agent Studio 的移动端目标从“自动发布”切换为“素材制造”，那么 iPad / iPhone 不只是可行，而且很可能比 Mac 网页版更适合做成独立产品。

推荐定位：

**Agent Studio Mobile = 随身内容素材工厂。**

它不是发布助手，不负责控制小红书、抖音、B 站等平台网页；它负责把截图、照片、录屏、文字、手写草稿、网页摘录变成可发布的图文、封面、长图、短视频分镜和素材包。

## 2. 明确不做什么

为了避免产品边界混乱，iPad / iPhone 版第一阶段不做这些：

- 不做自动发布。
- 不控制浏览器。
- 不复用 Mac 上 Chrome / Safari 的登录态。
- 不跑 Playwright / Chromium。
- 不做本地常驻 Node 服务。
- 不做 WebView 套壳。
- 不把当前 `http://127.0.0.1:48787/` 直接搬进 iPad。

换句话说，这不是“把现有网页搬到 iPad”，而是重新设计一个真正原生的移动素材生产工具。

## 3. 为什么 iPad 适合做素材制造

iPad 的优势不是自动化，而是“输入、编辑、批注、预览、导出”的完整创作闭环。

### 3.1 Apple Pencil

适合做：

- 手写选题草稿。
- 画分镜。
- 圈截图重点。
- 标箭头。
- 批注卡片。
- 手写标题候选。
- 在封面图上直接改构图。

Apple 官方的 PencilKit 本来就是给 iOS / iPadOS App 接收 Apple Pencil 或手指绘制用的画布能力。  
参考：<https://developer.apple.com/documentation/pencilkit>

### 3.2 相册、截图、录屏是天然素材库

iPad / iPhone 上素材入口比桌面更自然：

- 最近截图。
- 相册照片。
- 录屏。
- 拍照。
- Files 文件。
- Safari 分享。
- 备忘录拖拽。
- 微信/Telegram/邮件里保存的图片。

官方 PhotosPicker 可以让 SwiftUI App 选择照片和视频。  
参考：<https://developer.apple.com/documentation/photosui/photospicker>

### 3.3 摄像头和扫描

素材制造不只是“生成”，还包括把现实材料变成素材：

- 扫描纸质笔记。
- 拍白板。
- 拍手稿。
- 拍产品包装。
- 拍会议记录。
- OCR 提取文字。

VisionKit 支持文档扫描和文本/码识别。  
参考：<https://developer.apple.com/documentation/visionkit>

### 3.4 iPad 分屏和拖拽

iPad 很适合“边看资料边做素材”：

- 左边 Safari，右边 Agent Studio。
- 左边相册，右边卡片编辑器。
- 从 Files 拖图片进卡片。
- 从备忘录拖文字进项目。
- 从网页拖图或链接进素材箱。

UIKit 支持 Drag and Drop。  
参考：<https://developer.apple.com/documentation/uikit/drag-and-drop>

### 3.5 Shortcuts / App Intents

可以把素材制造做成系统级动作：

- “把最近 6 张截图做成小红书图文”
- “把这段录屏拆成视频分镜”
- “把剪贴板文字变成 5 张知识卡”
- “把当前网页生成图文素材包”

App Intents 可以把 App 能力暴露给 Shortcuts、Siri、Spotlight 和系统体验。  
参考：<https://developer.apple.com/documentation/appintents>

### 3.6 本地 AI 和云端 AI 结合

iPad / iPhone 可以使用两层 AI：

- 本地轻量能力：摘要、分类、改写、标题候选、素材标签。
- 云端重能力：复杂选题、强文案、多模态分析、批量生成。

Apple Foundation Models 提供访问设备端和 Apple Intelligence 相关模型的框架。  
参考：<https://developer.apple.com/documentation/FoundationModels>

## 4. 产品核心形态

推荐把 iPad App 做成四个核心模块。

### 4.1 素材收集箱

目标：让用户非常快地把素材放进项目。

输入来源：

- 图片
- 截图
- 录屏
- 视频
- PDF
- 文档
- 网页链接
- 剪贴板
- 手写稿
- 扫描件
- 语音备忘

素材进入后自动做：

- 识别素材类型。
- 提取文字。
- 生成摘要。
- 打标签。
- 判断适合做封面、卡片、长图还是视频分镜。
- 检查是否包含敏感信息。

### 4.2 AI 内容规划器

目标：把素材变成内容结构。

输入：

- 主题
- 素材
- 平台
- 目标人群
- 语气
- 参考案例

输出：

- 标题候选
- 封面文案
- 6-9 张图文卡片
- 正文
- 标签
- 备选开头
- 评论区引导
- 视频分镜

这里可以复用现有 Agent Studio 的内容引擎思想，但移动端输出应该更偏“可编辑素材”，而不是一次性生成最终稿。

### 4.3 原生卡片编辑器

这是 iPad 版的核心。

它不应该是表单，而应该是类似“卡片画布 + 图层面板 + 模板切换”的创作台。

能力：

- 多卡片横向浏览。
- 单卡片精修。
- 拖拽素材到卡片。
- 自动适配 3:4、1:1、9:16、16:9。
- 卡片安全区提示。
- 标题、正文、注释、贴纸、箭头、遮罩分层。
- Apple Pencil 批注。
- 一键统一字体、配色、风格。
- 一键生成不同平台尺寸。

核心原则：

**截图和素材优先，文字不能压住真实内容。**

这点非常重要。用户之前已经明确提出：不要最后的成图遮挡实际截图内容严重。

### 4.4 导出与交付

导出目标：

- 小红书图文 PNG 组图
- 封面图
- 长图
- PDF
- HTML 预览
- 视频分镜图
- 轻量 MP4
- 项目包

交付方式：

- 保存到 Photos
- 保存到 Files
- AirDrop
- Share Sheet
- 复制正文
- 复制标签
- 导出素材 ZIP

不做自动发布，但可以通过系统分享面板把素材交给小红书、微信、抖音、B站等 App。

## 5. iPad 与 iPhone 分工

### 5.1 iPad = 主创作台

iPad 适合：

- 批量整理素材。
- 编辑图文卡片。
- 手写批注。
- 调整封面构图。
- 审核多张图。
- 做较复杂的素材项目。

### 5.2 iPhone = 快速采集器 + 轻量出图器

iPhone 适合：

- 随手拍素材。
- 扫描纸张。
- 录音转选题。
- 保存灵感。
- 快速生成标题。
- 看 AI 给出的卡片草稿。
- 做轻量修改。
- 一键导出到相册或分享。

推荐做 Universal App，但体验分层：

- iPad：编辑和生产。
- iPhone：采集和审核。

## 6. 与现有 Agent Studio 的关系

现有 Agent Studio Web / Mac 端已经有：

- 内容方向
- 多平台文案
- 图文模板
- Preview Hub
- Visual Studio
- 图文导出
- 视频导出
- 模板 registry
- 隐私脱敏意识
- 素材生成流程

iOS 版不应该复制现有界面，而应该复用底层思想：

- 内容 pack
- template recipe
- visual style
- platform preset
- export target
- sensitive check
- project history

可以抽象成一个共享的数据模型：

```json
{
  "project": {
    "title": "主题",
    "platform": "xhs",
    "assets": [],
    "cards": [],
    "styleRecipe": "product-real-scene",
    "exports": []
  }
}
```

现有 Web 模板可以逐步迁移为 iOS 原生可渲染的 recipe，而不是直接搬 HTML/CSS。

## 7. 技术路线建议

### 7.1 客户端

- SwiftUI：主界面
- SwiftData：项目、素材、历史记录
- PencilKit：手写和批注
- PhotosPicker：照片/视频导入
- VisionKit：扫描和 OCR
- DocumentGroup：项目文件和导入导出
- CoreGraphics / Canvas：卡片渲染
- AVFoundation：轻量视频导出
- App Intents：Shortcuts / Siri / Spotlight
- Share Extension：从其他 App 收素材

### 7.2 AI 层

三层策略：

1. 本地规则：模板填充、尺寸适配、脱敏检查、基础排版。
2. 本地模型：轻量摘要、标题、标签、分类。
3. 云端模型：复杂选题、多图理解、强文案、成套卡片生成。

不要一开始强依赖本地大模型。第一版应该以“稳定素材制造”为主，AI 是加速器，不是唯一入口。

### 7.3 渲染层

不建议第一版追求完全复刻 Web 的 HTML/CSS 渲染。

更稳的路线：

- 卡片用原生布局模型描述。
- 每个元素有明确 frame、style、safe area。
- 渲染为 UIImage / PNG。
- 支持 3:4、9:16、1:1。
- 导出前做版式检查。

示例元素模型：

```json
{
  "type": "text",
  "role": "headline",
  "frame": { "x": 80, "y": 120, "w": 900, "h": 160 },
  "text": "我用 2 天做了个人超级中枢 1.0",
  "font": "system-bold",
  "size": 64
}
```

### 7.4 隐私和脱敏

这是 iOS 版的关键卖点。

需要内置敏感信息检查：

- IP
- 端口
- 域名
- 邮箱
- 手机号
- 地址
- 账号名
- Token / Key
- 订单号
- 设备名
- 公司名
- 二维码

交互上应该是：

1. 自动识别敏感区域。
2. 用户确认遮罩。
3. 遮罩不遮挡主体内容。
4. 导出前再次检查。

## 8. MVP 建议

第一版只做一个非常清晰的闭环：

**导入素材 -> AI 生成图文结构 -> iPad 编辑卡片 -> 脱敏 -> 导出 PNG 组图。**

MVP 功能：

1. 新建项目。
2. 从相册/Files 导入图片。
3. 输入主题和平台。
4. 生成 6 张小红书卡片草稿。
5. 卡片编辑器可修改标题、正文、图片裁切、遮罩。
6. Pencil 可批注。
7. 导出 PNG 到相册。
8. 复制正文和标签。

暂时不做：

- 视频编辑。
- 多人协作。
- 自动发布。
- 浏览器控制。
- 高级模板市场。
- 复杂数据看板。

## 9. 第二阶段

当 MVP 稳定后，再加：

- 录屏转分镜。
- 语音转选题。
- 分享扩展。
- Shortcuts 动作。
- iCloud 同步。
- 多平台尺寸批量导出。
- 模板收藏。
- 风格库。
- 本地历史素材检索。
- 轻量 MP4 导出。

## 10. 第三阶段

更长期可以做：

- Mac / iPad / iPhone 项目同步。
- 云端素材库。
- 团队协作。
- 模板商店。
- 自动品牌规范检查。
- 账号内容资产管理。
- 复用历史高表现样式。
- 与 Mac 端 Agent Studio Worker 联动，但仍不把 iOS App 变成发布自动化工具。

## 11. 关键风险

### 11.1 不是所有 Web 模板都适合原生迁移

现有 HTML/CSS 模板很灵活，但 iOS 原生渲染需要重新设计元素模型。  
如果强行把 HTML 渲染塞进 WebView，就会变成假 App。

### 11.2 视频导出不能太早做重

iPad 能做视频，但复杂视频渲染、动效模板、字幕、转码会显著增加工程复杂度。  
建议第一版先做图文和分镜图，MP4 放第二阶段。

### 11.3 AI 成本和稳定性

移动端用户会频繁试风格、试标题、试排版。  
如果每一步都走大模型，成本和延迟会不好控制。  
需要本地规则 + 小模型 + 云模型分层。

### 11.4 App Store 审核和隐私

如果涉及用户照片、剪贴板、文件、云端 AI 上传，需要非常清楚地说明：

- 上传什么
- 不上传什么
- 是否本地处理
- 是否保存历史
- 如何删除

### 11.5 产品差异化

这个产品会和 Canva、CapCut、剪映、Notion、Freeform、备忘录、各类 AI 海报工具竞争。

差异化不能是“也能做图”，而应该是：

**真实素材驱动 + AI 内容结构 + 多卡片图文生产 + 隐私脱敏 + iPad Pencil 编辑。**

## 12. 给 Claude fable5 的评审问题

请重点判断以下问题：

1. 这个定位是否成立：Agent Studio Mobile 只做素材制造，不做自动发布？
2. iPad 原生 App 相比 Web 版，最大的差异化是否应该放在 Pencil、素材导入、隐私脱敏和卡片编辑？
3. 第一版 MVP 是否应该只做“小红书图文 PNG 组图”，暂时不做视频？
4. 是否应该从一开始做 Universal App，还是先只做 iPad？
5. 原生卡片渲染模型应该如何设计，才能兼容未来模板库？
6. 现有 Agent Studio 的 template registry 是否适合迁移为 iOS recipe？
7. 本地 AI、云端 AI、规则引擎三层如何分工最合理？
8. 隐私脱敏能否成为核心卖点？
9. 这个产品和 Canva / CapCut / Freeform 的差异是否足够强？
10. 如果只能做 6 周 MVP，应该砍掉哪些功能？

## 13. 建议的 6 周 MVP 排期

### Week 1：产品骨架

- SwiftUI 项目
- 项目列表
- 素材导入
- 本地数据模型
- 基础项目文件结构

### Week 2：卡片模型

- 卡片数据结构
- 3:4 画布
- 文本层
- 图片层
- 基础模板 3 套
- PNG 导出

### Week 3：AI 生成

- 主题输入
- 素材摘要
- 标题生成
- 6 张卡片结构生成
- 正文和标签生成

### Week 4：编辑器

- 卡片列表
- 单卡编辑
- 图片裁切
- 文本修改
- 样式切换
- 安全区提示

### Week 5：Pencil 和脱敏

- Pencil 批注
- 箭头/圈画
- 敏感信息识别
- 遮罩编辑
- 导出前检查

### Week 6：打磨和导出

- 保存到相册
- 保存到 Files
- Share Sheet
- 项目预览
- 崩溃和性能修复
- TestFlight 内测

## 14. 最终判断

如果目标是“平台自动发布”，iPad / iPhone 不是主战场。

如果目标是“素材制造”，iPad / iPhone 是非常值得做的主战场。

这个产品不应该叫“移动版发布助手”，而应该是：

**Agent Studio for iPad：AI 原生素材制造台。**

第一版成败标准不是它能不能替代 Mac 端，而是：

- 能不能比 Canva 更快地把真实素材变成一组可发图文。
- 能不能比普通 AI 生成器更懂多卡片内容结构。
- 能不能比截图编辑工具更安全地处理隐私。
- 能不能让 iPad Pencil 真正参与内容生产，而不是只当装饰。

