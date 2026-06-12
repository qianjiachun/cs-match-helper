<script setup lang="ts">
import { Lightbulb, ShieldAlert } from 'lucide-vue-next';
import type { MatchInsights } from '@core/match/models';

defineProps<{
  insights?: MatchInsights;
}>();
</script>

<template>
  <section v-if="insights" class="rounded-lg border border-border bg-elevated p-3">
    <div class="mb-2 flex items-center gap-2">
      <Lightbulb class="h-3.5 w-3.5 text-accent" />
      <h3 class="text-[12px] font-semibold text-fg">关键判断</h3>
      <span
        v-if="insights.strongerSide"
        class="ml-auto rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
      >
        优势方: 队伍 {{ insights.strongerSide }}
      </span>
    </div>

    <ul v-if="insights.highlights.length > 0" class="mb-2 space-y-1">
      <li
        v-for="(tip, i) in insights.highlights"
        :key="'h-' + i"
        class="text-[11px] leading-relaxed text-fg-secondary"
      >
        · {{ tip }}
      </li>
    </ul>

    <ul v-if="insights.risks.length > 0" class="space-y-1">
      <li
        v-for="(tip, i) in insights.risks"
        :key="'r-' + i"
        class="flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-secondary"
      >
        <ShieldAlert class="mt-0.5 h-3 w-3 shrink-0 text-warning" />
        <span>{{ tip }}</span>
      </li>
    </ul>

    <p
      v-if="insights.highlights.length === 0 && insights.risks.length === 0"
      class="text-[11px] text-fg-muted"
    >
      双方数据接近，暂无显著差异提示
    </p>
  </section>
</template>
