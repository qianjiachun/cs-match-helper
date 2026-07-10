<script setup lang="ts">
import { computed } from 'vue';
import type { MatchRecord } from '@core/match/models';
import type { WatcherStatus } from '@core/types';
import type { PlatformId } from '@platforms/types';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import type { useComments } from '../composables/useComments';
import type { useP5eCdp } from '../composables/useP5eCdp';
import MatchEmptyState from '../components/MatchEmptyState.vue';
import MatchFeaturedPanel from '../components/MatchFeaturedPanel.vue';

const props = defineProps<{
  ai: ReturnType<typeof useAiAnalysis>;
  comments: ReturnType<typeof useComments>;
  matches: MatchRecord[];
  watcher: WatcherStatus;
  platform: PlatformId;
  p5e?: ReturnType<typeof useP5eCdp>;
}>();

const emit = defineEmits<{
  openSettings: [];
  back: [];
}>();

const latestMatch = computed(() => props.matches[0] ?? null);
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden">
    <div v-if="latestMatch" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MatchFeaturedPanel
        :ai="ai"
        :comments="comments"
        :match="latestMatch"
        @open-settings="emit('openSettings')"
      />
    </div>

    <MatchEmptyState
      v-else
      :watcher="watcher"
      :platform="platform"
      :p5e-phase="p5e?.status.value.phase"
      :p5e-recovering="p5e?.autoRecovering.value"
      @back="emit('back')"
    />
  </div>
</template>
