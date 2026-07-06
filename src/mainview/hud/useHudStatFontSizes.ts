import { computed, type Ref } from 'vue';
import { computeHudStatFontSizes } from '@core/counter-strafing/hudDisplay';

export function useHudStatFontSizes(userScale: Ref<number>) {
  return computed(() => computeHudStatFontSizes(userScale.value));
}
