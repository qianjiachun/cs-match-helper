import { hasKnownModelPricing, type AiTokenUsage } from './types';

export interface TokenPriceRates {
  inputCacheHitPerM: number;
  inputCacheMissPerM: number;
  outputPerM: number;
}

const RATES: Record<string, TokenPriceRates> = {
  'deepseek-v4-flash': { inputCacheHitPerM: 0.02, inputCacheMissPerM: 1, outputPerM: 2 },
  'deepseek-chat': { inputCacheHitPerM: 0.02, inputCacheMissPerM: 1, outputPerM: 2 },
  'deepseek-v4-pro': { inputCacheHitPerM: 0.025, inputCacheMissPerM: 3, outputPerM: 6 },
  'deepseek-reasoner': { inputCacheHitPerM: 0.025, inputCacheMissPerM: 3, outputPerM: 6 },
};

export function resolveModelRates(model: string): TokenPriceRates {
  return RATES[model] ?? RATES['deepseek-v4-flash'];
}

export interface PriceEstimateOptions {
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
}

/** 估算人民币成本；无缓存拆分时按全部输入未命中计 */
export function estimateTokenCostCny(
  model: string,
  usage: AiTokenUsage,
  options?: PriceEstimateOptions,
): number {
  const rates = resolveModelRates(model);
  const hit = options?.promptCacheHitTokens ?? 0;
  const miss =
    options?.promptCacheMissTokens ??
    Math.max(0, usage.promptTokens - hit);
  const output = usage.completionTokens;

  const inputCost =
    (hit / 1_000_000) * rates.inputCacheHitPerM +
    (miss / 1_000_000) * rates.inputCacheMissPerM;
  const outputCost = (output / 1_000_000) * rates.outputPerM;

  return inputCost + outputCost;
}

export function formatCostCny(amount: number): string {
  if (amount < 0.01) return `约 ¥${amount.toFixed(4)}`;
  if (amount < 1) return `约 ¥${amount.toFixed(3)}`;
  return `约 ¥${amount.toFixed(2)}`;
}

export function formatCostTooltip(
  model: string,
  usage: AiTokenUsage,
  cost: number,
): string {
  if (!hasKnownModelPricing(model)) {
    return [
      `模型 ${model}`,
      `输入 ${usage.promptTokens} · 输出 ${usage.completionTokens} · 合计 ${usage.totalTokens}`,
      '费用按服务商实际计费',
    ].join('\n');
  }
  const rates = resolveModelRates(model);
  return [
    `模型 ${model}`,
    `输入 ${usage.promptTokens} tokens × ¥${rates.inputCacheMissPerM}/M（未命中估算）`,
    `输出 ${usage.completionTokens} tokens × ¥${rates.outputPerM}/M`,
    `合计 ${formatCostCny(cost)}（估算）`,
  ].join('\n');
}

export function formatCostLabel(model: string, usage: AiTokenUsage): string {
  if (!hasKnownModelPricing(model)) return '按服务商计费';
  return formatCostCny(estimateTokenCostCny(model, usage));
}
