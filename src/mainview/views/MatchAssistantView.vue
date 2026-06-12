<script setup lang="ts">
import { computed } from 'vue';
import type { MatchRecord } from '@core/match/models';
import type { WatcherStatus } from '@core/types';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import MatchEmptyState from '../components/MatchEmptyState.vue';
import MatchFeaturedPanel from '../components/MatchFeaturedPanel.vue';

const props = defineProps<{
  ai: ReturnType<typeof useAiAnalysis>;
  matches: MatchRecord[];
  watcher: WatcherStatus;
}>();

const emit = defineEmits<{
  openSettings: [];
}>();

const latestMatch = computed(() => props.matches[0] ?? null);
</script>

<template>
  <div class="relative flex h-full flex-col overflow-hidden">
    <div v-if="latestMatch" class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <MatchFeaturedPanel :ai="ai" :match="latestMatch" @open-settings="emit('openSettings')" />
    </div>

    <MatchEmptyState v-else :watcher="watcher" />
  </div>
</template>
