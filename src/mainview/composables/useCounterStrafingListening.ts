import { ref } from 'vue';

/** 急停助手是否正在记录（跨视图共享，供 TitleBar 等使用） */
export const counterStrafingListening = ref(false);

export function useCounterStrafingListening() {
  return counterStrafingListening;
}
