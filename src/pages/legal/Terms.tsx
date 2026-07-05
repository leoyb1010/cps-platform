import { ScrollText } from 'lucide-react'
import { LegalShell, LegalSection } from './LegalShell'

/**
 * 用户协议（静态文档页）。
 * 公开可达（/legal/terms），供 C 端支付勾选与品牌入驻确认链接引用。
 * 说明性文案，非律师级；结构完整：服务说明 / 用户义务 / 计费与自动续费 / 免责 / 变更与终止 / 联系方式。
 */
export default function Terms() {
  return (
    <LegalShell icon={<ScrollText size={18} />} title="用户协议" updated="2026-07-01">
      <p className="text-[13px] leading-relaxed text-ink-3">
        欢迎使用网易有道订阅增长平台（以下简称"本平台"）。在使用本平台提供的订阅商品浏览、组合下单、支付及相关服务前，请您仔细阅读并充分理解本协议全部条款。您勾选同意或开始使用本平台服务，即视为您已接受本协议。
      </p>

      <LegalSection n={1} title="服务说明">
        <p>本平台为品牌方与终端用户之间提供订阅商品的展示、组合搭配、下单与支付撮合服务。商品由入驻品牌方自行上架并对其内容、价格、履约负责，本平台按约定提供交易、清结算与担保结算等技术与运营支持。</p>
        <p>本平台展示的套餐价格由平台实时计算，最终以下单时页面显示的套餐价为准。</p>
      </LegalSection>

      <LegalSection n={2} title="用户义务">
        <ul>
          <li>您应保证注册及使用过程中提供的信息真实、准确、完整，并及时更新。</li>
          <li>您不得利用本平台从事任何违法违规、侵害他人权益或干扰平台正常运行的行为。</li>
          <li>您应妥善保管账户及支付信息，因您自身原因导致的账户或资金损失由您自行承担。</li>
        </ul>
      </LegalSection>

      <LegalSection n={3} title="计费与自动续费">
        <p>部分订阅商品为连续包月（自动续费）商品。购买含连续包月的套餐时，首期优惠结束后将按各商品的续费价格自动扣费。您可随时在「我的订阅」中管理或一键退订，退订后不再产生扣费。</p>
        <p>本平台会在支付前对含自动续费的商品进行明确告知，请您确认后再行支付。</p>
      </LegalSection>

      <LegalSection n={4} title="免责声明">
        <p>因不可抗力、网络故障、第三方支付通道异常或品牌方履约问题造成的服务中断或损失，本平台在法律允许范围内不承担责任，但将积极协助处理。</p>
        <p>本平台按"现状"提供服务，不对服务绝对不中断或无差错作出保证。</p>
      </LegalSection>

      <LegalSection n={5} title="协议变更与终止">
        <p>本平台有权根据业务需要更新本协议，更新后将在本页面公示。若您继续使用服务，即视为接受变更后的协议。您如不同意变更，应停止使用相关服务。</p>
      </LegalSection>

      <LegalSection n={6} title="联系方式">
        <p>如对本协议或平台服务有任何疑问、投诉或建议，可通过平台内客服工单或以下方式联系我们：</p>
        <p>邮箱：support@youdao-cps.example.com</p>
      </LegalSection>

      <p className="mt-6 text-[12px] leading-relaxed text-ink-4">
        本页面为平台演示所用的说明性文本，不构成正式法律文件。正式上线前将由法务出具最终版本。
      </p>
    </LegalShell>
  )
}
