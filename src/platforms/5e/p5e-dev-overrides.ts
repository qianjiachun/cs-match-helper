import { ref } from 'vue';
import type { P5eProbeResult } from './types';

/** 开发环境：模拟 5E 启动页「找不到客户端」状态 */
export const p5eSimulateClientNotFound = ref(false);

export function getP5eSimulatedProbeResult(): P5eProbeResult | null {
  if (!import.meta.env.DEV || !p5eSimulateClientNotFound.value) {
    return null;
  }

  return {
    externalRunning: false,
    fiveEProcessRunning: false,
    installed: false,
    message: '【调试模拟】未检测到 5E 安装',
  };
}

export function toggleP5eSimulateClientNotFound(): boolean {
  if (!import.meta.env.DEV) return false;
  p5eSimulateClientNotFound.value = !p5eSimulateClientNotFound.value;
  return p5eSimulateClientNotFound.value;
}
