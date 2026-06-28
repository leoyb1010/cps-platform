import { useMemo, useState } from "react";
import { Copy, Download, FileJson, Globe, Image as ImageIcon, LayoutDashboard, Send } from "lucide-react";
import { platformMeta } from "../lib/catalog.js";
import { collectPreviewImageUrls } from "../lib/exportUrl.js";
import { PlatformIcon } from "../components/PlatformIcon.jsx";
import { DeviceFrame } from "../components/DeviceFrame.jsx";

const previewPlatforms = ["xhs", "douyin"];

export function PreviewHub(props) {
  const {
    pack,
    platform,
    setPlatform,
    currentCopy,
    cleanTitle,
    activeFrame,
    setActiveFrame,
    frame,
    exportSvg,
    exportJson,
    openPublish,
    copyText,
    smokeResult,
    previewImageUrls = [],
    streamSource = "local",
    activeRecipe = null
  } = props;

  const [previewMode, setPreviewMode] = useState("safe-area");

  const meta = platformMeta[platform] || platformMeta.xhs;
  const ratio = platform === "douyin" ? "9:16" : "3:4";

  const previewImages = useMemo(
    () => collectPreviewImageUrls(previewImageUrls, smokeResult?.assets?.files),
    [previewImageUrls, smokeResult]
  );

  return (
    <div className="previewHub">
      <div className="previewHub__side">
        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><Globe size={14} /><span>平台与文案</span></div>
            <button type="button" className="microBtn" onClick={() => copyText(currentCopy?.body, `${meta.name} 文案`)}>
              <Copy size={12} /> 复制
            </button>
          </div>
          <div className="previewHub__platformTabs">
            {previewPlatforms.map((id) => (
              <button
                key={id}
                type="button"
                className={id === platform ? "previewHub__pTab on" : "previewHub__pTab"}
                onClick={() => setPlatform(id)}
              >
                <PlatformIcon platform={id} />
                <span>{platformMeta[id]?.name || id}</span>
              </button>
            ))}
          </div>
          <p className="previewHub__sourceHint">
            内容来源：<b>{streamSource === "bff" ? "BFF 模型" : streamSource === "local-fallback" ? "本地回退" : streamSource}</b>
          </p>
          {activeRecipe && (
            <p className="previewHub__recipeHint">
              模板：<b>{activeRecipe.label}</b>
              <span className="muted"> · {activeRecipe.pickMode || "recommend"}</span>
            </p>
          )}
          <div className="previewHub__copyBlock">
            <strong>{cleanTitle}</strong>
            <pre>{currentCopy?.body}</pre>
            <div className="tagRow">
              {(currentCopy?.tags || []).map((t) => <span key={t}>#{t}</span>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHead">
            <div className="hLeft"><LayoutDashboard size={14} /><span>分镜时间线</span></div>
          </div>
          <div className="previewHub__frames">
            {(pack.videoFrames || []).map((f, i) => (
              <button
                key={`${f.time}-${i}`}
                type="button"
                className={i === activeFrame ? "previewHub__frame on" : "previewHub__frame"}
                onClick={() => setActiveFrame(i)}
              >
                <b>{f.time}</b>
                <span>{f.shot}</span>
              </button>
            ))}
          </div>
        </div>

        {previewImages.length > 0 && (
          <div className="card">
            <div className="cardHead">
              <div className="hLeft"><ImageIcon size={14} /><span>导出资产</span></div>
              <span className="cardHint">{previewImages.length} 张</span>
            </div>
            <div className="previewHub__thumbRow">
              {previewImages.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="previewHub__thumb">
                  <img src={url} alt="" loading="lazy" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="previewHub__stage">
        <div className="previewHub__modeBar">
          {[
            ["original", "原图"],
            ["crop", "平台裁切"],
            ["safe-area", "安全区"]
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={previewMode === id ? "on" : ""}
              onClick={() => setPreviewMode(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <DeviceFrame platform={platform} ratio={ratio}>
          {previewImages.length > 0 ? (
            <div className="previewHub__carousel">
              {previewImages.map((url, i) => (
                <img key={`${url}-${i}`} src={url} alt={`导出预览 ${i + 1}`} className="previewHub__slide" />
              ))}
            </div>
          ) : (
            <div className={`previewHub__wireframe ${previewMode === "safe-area" ? "previewHub__wireframe--safe" : ""}`}>
              <h2>{cleanTitle}</h2>
              <p>{frame?.visual}</p>
              <div className="previewHub__vo">
                <span>VO</span>
                <em>{frame?.voice}</em>
              </div>
              {!previewImages.length && (
                <p className="previewHub__emptyHint">在 Visual Studio 导出 PNG，或运行「一键图文测试」后此处显示真实成品图。</p>
              )}
            </div>
          )}
        </DeviceFrame>

        <div className="previewHub__actions">
          <button type="button" className="microBtn" onClick={exportSvg}><Download size={12} /> SVG</button>
          <button type="button" className="microBtn" onClick={exportJson}><FileJson size={12} /> JSON</button>
          <button type="button" className="primaryBtn previewHub__publishBtn" onClick={openPublish}>
            <Send size={14} /> 排队发布
          </button>
        </div>
      </div>
    </div>
  );
}