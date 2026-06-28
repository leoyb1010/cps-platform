import { Battery, Signal, Wifi } from "lucide-react";
import { PlatformIcon } from "./PlatformIcon.jsx";

export function DeviceFrame({ platform = "xhs", children, ratio = "3:4" }) {
  const ratioClass = ratio === "9:16" ? "deviceFrame--916" : "deviceFrame--34";

  return (
    <div className={`deviceFrame ${ratioClass}`} data-platform={platform}>
      <div className="deviceFrame__rail deviceFrame__rail--left" aria-hidden />
      <div className="deviceFrame__rail deviceFrame__rail--right" aria-hidden />
      <div className="deviceFrame__lensCluster" aria-label="iPhone 17 Pro Max 原型展示">
        <span />
        <span />
        <span />
      </div>
      <div className="deviceFrame__screenGlass">
        <div className="deviceFrame__island" aria-hidden>
          <i />
          <b />
        </div>
        <div className="deviceFrame__status">
          <span>12:00</span>
          <div className="deviceFrame__statusIcons">
            <Signal size={12} />
            <Wifi size={12} />
            <Battery size={15} />
          </div>
        </div>
        <div className="deviceFrame__screen">{children}</div>
        <DeviceChrome platform={platform} />
        <div className="deviceFrame__homeIndicator" aria-hidden />
      </div>
    </div>
  );
}

function DeviceChrome({ platform }) {
  if (platform === "xhs") {
    return (
      <nav className="deviceFrame__nav deviceFrame__nav--xhs" aria-label="小红书导航示意">
        <span className="on">首页</span>
        <span>视频</span>
        <span className="deviceFrame__fab" aria-hidden><PlatformIcon platform="xhs" /></span>
        <span>消息</span>
        <span>我</span>
      </nav>
    );
  }
  if (platform === "douyin") {
    return (
      <nav className="deviceFrame__nav deviceFrame__nav--douyin" aria-label="抖音导航示意">
        <span className="on">首页</span>
        <span>朋友</span>
        <span className="deviceFrame__fab deviceFrame__fab--douyin">+</span>
        <span>消息</span>
        <span>我</span>
      </nav>
    );
  }
  return null;
}
