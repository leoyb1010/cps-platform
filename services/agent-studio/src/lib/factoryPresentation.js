/** Presentation only: keep the saved pack/body unchanged for exports and editing. */
export function factoryPreview(result, platform, assetTypes = []) {
  const output = result?.result;
  const pack = output?.pack;
  const title = typeof pack?.title === 'string' ? pack.title : '';
  const candidate = pack?.platformCopy?.[platform]?.body || pack?.platformCopy?.xhs?.body || output?.gateway?.output;
  const body = typeof candidate === 'string' ? candidate : '';
  const firstBreak = body.search(/\r?\n/);
  const firstLine = firstBreak < 0 ? body : body.slice(0, firstBreak);
  const visibleBody = title && firstLine.trim() === title.trim()
    ? (firstBreak < 0 ? '' : body.slice(firstBreak).replace(/^\r?\n(?:\s*\r?\n)*/, '')) : body;
  const type = typeof output?.type === 'string' ? output.type : '';
  return { title, body: visibleBody, type, label: assetTypes.find(item => item.id === type)?.label || type || '生成素材' };
}
