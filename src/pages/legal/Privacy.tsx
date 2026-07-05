import { Lock } from 'lucide-react'
import { LegalShell, LegalSection } from './LegalShell'

/**
 * 隐私政策（静态文档页）。
 * 公开可达（/legal/privacy），供 C 端支付勾选与品牌入驻确认链接引用。
 * 说明性文案，非律师级；结构完整：收集范围 / 使用目的 / 共享与委托 / 存储与安全 / 用户权利 / Cookie / 联系方式。
 */
export default function Privacy() {
  return (
    <LegalShell icon={<Lock size={18} />} title="隐私政策" updated="2026-07-01">
      <p className="text-[13px] leading-relaxed text-ink-3">
        网易有道订阅增长平台（以下简称"本平台"）尊重并保护您的个人信息。本政策说明我们如何收集、使用、存储与保护您的个人信息，以及您就个人信息享有的权利。我们遵循"最小必要"原则，仅收集提供服务所必需的信息。
      </p>

      <LegalSection n={1} title="我们收集的信息">
        <ul>
          <li>账户信息：您注册或下单时提供的手机号、昵称等标识信息。</li>
          <li>交易信息：您浏览、组合、下单及支付订阅商品所产生的订单与结算记录。</li>
          <li>设备与日志信息：为保障安全与服务质量所必需的设备型号、访问日志等。</li>
        </ul>
      </LegalSection>

      <LegalSection n={2} title="信息的使用目的">
        <ul>
          <li>为您提供订阅商品的展示、下单、支付、开通与售后服务。</li>
          <li>进行交易清结算、风控识别与合规审计。</li>
          <li>在您授权范围内，改进产品体验与服务质量。</li>
        </ul>
        <p>我们不会将您的个人信息用于本政策未载明的其他目的，法律法规另有规定的除外。</p>
      </LegalSection>

      <LegalSection n={3} title="信息的共享与委托处理">
        <p>为完成交易与履约，我们可能在必要范围内向对应品牌方、持牌清结算机构及第三方支付通道提供为完成服务所必需的信息。此类共享遵循最小必要原则，并要求对方承担相应的保密与安全义务。</p>
        <p>除法律法规要求或经您另行同意外，我们不会向任何第三方出售您的个人信息。</p>
      </LegalSection>

      <LegalSection n={4} title="信息的存储与安全">
        <p>我们采用加密传输、访问控制、数据脱敏等技术与管理措施保护您的个人信息。手机号等敏感信息在展示与流转环节均做脱敏处理。个人信息的存储期限不超过实现处理目的所必需的时间。</p>
      </LegalSection>

      <LegalSection n={5} title="您的权利">
        <ul>
          <li>您有权查询、更正、补充与删除您的个人信息。</li>
          <li>您有权撤回此前作出的授权同意，并可注销账户。</li>
          <li>您可随时在「我的订阅」中管理订阅关系并退订自动续费商品。</li>
        </ul>
      </LegalSection>

      <LegalSection n={6} title="Cookie 与同类技术">
        <p>为保障基本功能与安全，我们可能使用 Cookie 或本地存储等技术。您可通过浏览器设置管理或清除，但这可能影响部分功能的正常使用。</p>
      </LegalSection>

      <LegalSection n={7} title="联系方式">
        <p>如您对本隐私政策或个人信息处理有任何疑问、投诉或需行使上述权利，可通过以下方式联系我们：</p>
        <p>邮箱：privacy@youdao-cps.example.com</p>
      </LegalSection>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-4">
        本页面为平台演示所用的说明性文本，不构成正式法律文件。正式上线前将由法务出具最终版本。
      </p>
    </LegalShell>
  )
}
