import { api, http } from './http'

// AIGC 素材引擎客户端：调 cps 后端的 /aigc 代理（再转发到 agent-studio 微服务）。
// 仅在真实 API 模式可用；mock 模式下素材引擎不可用（见 Aigc 页空态提示）。

export interface AssetTypeOption {
  id: string
  label: string
  modality: string
  description: string
  defaultPlatform?: string
}
export interface StyleOption {
  id: string
  label: string
}
export interface ModelPresetOption {
  id: string
  label: string
  description?: string
}
export interface FactoryConfig {
  ok: boolean
  assetTypes: AssetTypeOption[]
  styles?: StyleOption[]
  modelPresets?: ModelPresetOption[]
  credits?: { availableCredits?: number; balance?: number }
}
export interface EstimateResult {
  ok: boolean
  creditsEstimated: number
}
export interface FactoryOutput {
  type?: string
  imagePrompt?: string
  images?: unknown[]
  storyboard?: Array<{ time?: string; shot?: string; visual?: string; voice?: string }>

  copy?: { title?: string; body: string }
  pack?: { platformCopy?: Record<string, { title?: string; body: string }> }
  assets?: { files?: string[] }
  motionPreview?: { files?: string[] }
}
export interface FactoryJob {
  id: string
  asset_type: string
  prompt: string
  status: string
  credits_charged: number
  output_json?: FactoryOutput
}
export interface GenerateResult {
  ok: boolean
  job?: { id: string; assetType?: string; status?: string; credits_charged?: number }
  result?: FactoryOutput
  usage?: unknown
  credits?: { availableCredits?: number; balance?: number }
}

export interface GeneratePayload {
  assetType: string
  platform: string
  intent: string
  prompt: string
  modelPreset: string
  style?: string
}

export const aigcApi = {
  image: (jobId: string, index: number) => api<Blob>(`/aigc/factory/jobs/${encodeURIComponent(jobId)}/assets/${index}`, {}, 'blob'),
  jobs: () => http.get<{ ok: boolean; jobs: FactoryJob[] }>('/aigc/factory/jobs'),
  config: () => http.get<FactoryConfig>('/aigc/factory/config'),
  estimate: (p: GeneratePayload) => http.post<EstimateResult>('/aigc/factory/estimate', p),
  generate: (p: GeneratePayload) => http.post<GenerateResult>('/aigc/factory/generate', p),
  credits: () => http.get<{ ok: boolean; credits?: { availableCredits?: number; balance?: number } }>('/aigc/billing/credits'),
}
