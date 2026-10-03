import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getFactoryJob } from './factory.js';
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const factoryExportsRoot = () => process.env.AGENT_STUDIO_EXPORTS_DIR ? path.resolve(process.env.AGENT_STUDIO_EXPORTS_DIR) : path.join(serverRoot, 'exports');
// Resolve a numbered PNG from an owned job, never a client-supplied file path or HTML.
export async function readFactoryPng(ctx, jobId, index) {
  if (!/^\d{1,2}$/.test(String(index))) return null;
  const result = getFactoryJob(ctx, jobId);
  if (!result.ok || result.job.status !== 'completed') return null;
  const output = result.job.output_json;
  const files = output?.assets?.files || output?.motionPreview?.files || [];
  const file = files[Number(index)];
  if (typeof file !== 'string' || path.extname(file).toLowerCase() !== '.png') return null;
  try {
    const [root, real] = await Promise.all([fs.realpath(factoryExportsRoot()), fs.realpath(file)]);
    if (!real.startsWith(root + path.sep)) return null;
    const bytes = await fs.readFile(real);
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
    return bytes;
  } catch { return null; }
}
