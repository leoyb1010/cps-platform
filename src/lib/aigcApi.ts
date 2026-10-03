import { api, http, ApiError, getPrincipalId } from './http'
import { beginGeneration, finishGeneration, rejectGeneration, ensureGenerationPersisted, type GenerationOperation } from './generationOperations'

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
  gateway?: { provider?: string }
  imagePrompt?: string
  images?: unknown[]
  storyboard?: Array<{ time?: string; shot?: string; visual?: string; voice?: string }>

  copy?: { title?: string; body: string }
  pack?: { platformCopy?: Record<string, { title?: string; body: string }> }
  assets?: { files?: string[] }
  motionPreview?: { files?: string[] }
}
export interface FactoryJob {
  assetRegistration?: string
  id: string
  asset_type: string
  prompt: string
  status: string
  credits_charged: number
  output_json?: FactoryOutput
}
export interface GenerateResult {
  ok: boolean
  pending?: boolean
  assetRegistration?: string
  message?: string
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
  generate: async (p: GeneratePayload, original?: GenerationOperation) => {
    const operation = original ?? beginGeneration(p)
    ensureGenerationPersisted(operation)
    if (operation.owner !== getPrincipalId()) throw new Error('登录账户已变更，请在当前账户重新操作')
    try {
      const result = await http.post<GenerateResult>('/aigc/factory/generate', p, { 'Idempotency-Key': operation.key })
      finishGeneration(operation, result)
      return result
    } catch (error) {
      const result = error instanceof ApiError ? error.details as GenerateResult | undefined : undefined
      if (result?.job?.status === 'failed') finishGeneration(operation, result)
      else if (error instanceof ApiError && [400, 422].includes(error.status)) rejectGeneration(operation)
      throw error
    }
  },
  operation: async (operation: GenerationOperation) => {
    if (operation.owner !== getPrincipalId()) throw new Error('登录账户已变更，请在当前账户重新操作')
    const result = await http.get<GenerateResult>(`/aigc/factory/operations/${encodeURIComponent(operation.key)}`)
    finishGeneration(operation, result)
    return result
  },
  credits: () => http.get<{ ok: boolean; credits?: { availableCredits?: number; balance?: number } }>('/aigc/billing/credits'),
}

export function generationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.startsWith('浏览器无法保存重试标识')) return error.message
  const result = error instanceof ApiError ? error.details as GenerateResult | undefined : undefined
  if (result?.job?.status === 'failed') return '本次任务已失败，预留积分已释放。可以再次提交一个新任务。'
  if (error instanceof ApiError && [400, 422].includes(error.status)) return error.message
  return '提交结果尚未确认，请在待确认请求中查询原任务，或保留相同内容后重试。关闭页面不代表取消生成。'
}
