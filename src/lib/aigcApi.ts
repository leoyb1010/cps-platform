import { http } from './http'

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
export interface GenerateResult {
  ok: boolean
  job?: { id: string; assetType?: string; status?: string }
  result?: unknown
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
  config: () => http.get<FactoryConfig>('/aigc/factory/config'),
  estimate: (p: GeneratePayload) => http.post<EstimateResult>('/aigc/factory/estimate', p),
  generate: (p: GeneratePayload) => http.post<GenerateResult>('/aigc/factory/generate', p),
  credits: () => http.get<{ ok: boolean; credits?: { availableCredits?: number; balance?: number } }>('/aigc/billing/credits'),
}
