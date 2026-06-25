<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { User } from 'lucide-vue-next';
import { drawPixelAvatar, generateAvatarFromColor } from '@core/comments/pixel-avatar';

const props = withDefaults(
  defineProps<{
    color?: string;
    /** 显示边长（像素），须为 8 的整数倍 */
    size?: number;
  }>(),
  {
    size: 24,
  },
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hasAvatar = ref(false);

function paint() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const pixelSize = props.size / 8;
  canvas.width = props.size;
  canvas.height = props.size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const avatar = generateAvatarFromColor(props.color ?? '');
  hasAvatar.value = avatar !== null;

  if (!avatar) {
    ctx.clearRect(0, 0, props.size, props.size);
    return;
  }

  drawPixelAvatar(ctx, avatar, 0, 0, pixelSize);
}

watch(() => [props.color, props.size] as const, paint);
onMounted(paint);
</script>

<template>
  <div
    class="comment-pixel-avatar relative shrink-0 overflow-hidden rounded-md bg-slate-100 ring-1 ring-slate-200/70"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    aria-label="匿名评论者头像"
  >
    <canvas
      ref="canvasRef"
      class="pixel-avatar absolute inset-0 h-full w-full"
      :class="hasAvatar ? 'opacity-100' : 'opacity-0'"
      :width="size"
      :height="size"
      aria-hidden="true"
    />
    <div
      v-if="!hasAvatar"
      class="absolute inset-0 flex items-center justify-center text-slate-400"
      aria-hidden="true"
    >
      <User class="h-3 w-3" />
    </div>
  </div>
</template>

<style scoped>
.pixel-avatar {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
