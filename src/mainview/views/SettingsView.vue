<script setup lang="ts">
import { History, Info, MessageCircle, ScrollText, Settings, Sparkles } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import type { useComments } from '../composables/useComments';
import type { MatchHistoryApi } from '../composables/useMatchHistory';
import AboutSettingsSection from '../components/settings/AboutSettingsSection.vue';
import AiSettingsSection from '../components/settings/AiSettingsSection.vue';
import ChangelogSettingsSection from '../components/settings/ChangelogSettingsSection.vue';
import CommentHistorySection from '../components/settings/CommentHistorySection.vue';
import MatchHistoryView from './MatchHistoryView.vue';
import { useDebugUnlock } from '../composables/useDebugUnlock';

export type SettingsTab = 'history' | 'ai' | 'comments' | 'changelog' | 'about';

const props = defineProps<{
  ai: ReturnType<typeof useAiAnalysis>;
  comments: ReturnType<typeof useComments>;
  history: MatchHistoryApi;
  initialTab?: SettingsTab;
  visible?: boolean;
}>();

const activeTab = ref<SettingsTab>(props.initialTab ?? 'history');

watch(
  () => props.initialTab,
  (tab) => {
    if (tab) activeTab.value = tab;
  },
);

const navItems = [
  { id: 'history' as const, label: '历史对局', icon: History },
  { id: 'ai' as const, label: 'AI 设置', icon: Sparkles },
  { id: 'comments' as const, label: '我的评论', icon: MessageCircle },
  { id: 'changelog' as const, label: '更新日志', icon: ScrollText },
  { id: 'about' as const, label: '关于', icon: Info },
];

const contentDesc: Record<SettingsTab, string> = {
  history: '查看本地保存的对局与 AI 分析',
  ai: 'API 与模型配置',
  comments: '查看和管理你发表过的评论',
  changelog: '版本更新记录与功能说明',
  about: '版本与作者信息',
};

const activeMeta = computed(() => navItems.find((item) => item.id === activeTab.value)!);

const matchHistoryViewRef = ref<InstanceType<typeof MatchHistoryView> | null>(null);

const { registerAboutClick } = useDebugUnlock();

function selectTab(tab: SettingsTab) {
  if (tab === 'about') {
    registerAboutClick();
  }
  activeTab.value = tab;
}

function goBack(): boolean {
  if (activeTab.value === 'history' && matchHistoryViewRef.value?.goBack?.()) {
    return true;
  }
  return false;
}

defineExpose({ goBack });
</script>

<template>
  <div class="flex h-full min-h-0 bg-base">
    <aside
      class="flex w-[220px] shrink-0 flex-col border-r border-border bg-surface"
      aria-label="设置导航"
    >
      <div class="border-b border-border px-4 py-4">
        <div class="flex items-center gap-2.5">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"
          >
            <Settings class="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 class="text-[14px] font-semibold text-fg">设置</h1>
        </div>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto p-3">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200"
          :class="
            activeTab === item.id
              ? 'bg-accent/10 text-accent'
              : 'text-fg-secondary hover:bg-elevated hover:text-fg'
          "
          :aria-current="activeTab === item.id ? 'page' : undefined"
          @click="selectTab(item.id)"
        >
          <component
            :is="item.icon"
            class="h-4 w-4 shrink-0"
            :class="activeTab === item.id ? 'text-accent' : 'text-fg-muted'"
            aria-hidden="true"
          />
          <span class="text-[13px] font-medium">{{ item.label }}</span>
        </button>
      </nav>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        v-show="activeTab !== 'history'"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <header class="sticky top-0 z-10 shrink-0 border-b border-border bg-base/90 px-6 py-5 backdrop-blur-sm">
          <h2 class="text-[18px] font-bold tracking-tight text-fg">{{ activeMeta.label }}</h2>
          <p class="mt-1 text-[13px] text-fg-muted">{{ contentDesc[activeTab] }}</p>
        </header>

        <div class="relative mx-auto w-full max-w-2xl flex-1 px-6 py-6">
          <Transition name="settings-tab" mode="out-in">
            <div v-if="activeTab === 'ai'" key="ai">
              <AiSettingsSection :ai="ai" :settings-visible="visible ?? true" />
            </div>
            <div v-else-if="activeTab === 'comments'" key="comments">
              <CommentHistorySection
                :comments="comments"
                :visible="(visible ?? true) && activeTab === 'comments'"
              />
            </div>
            <div v-else-if="activeTab === 'changelog'" key="changelog">
              <ChangelogSettingsSection />
            </div>
            <div v-else-if="activeTab === 'about'" key="about">
              <AboutSettingsSection />
            </div>
          </Transition>
        </div>
      </div>

      <div
        v-show="activeTab === 'history'"
        class="min-h-0 flex-1"
      >
        <MatchHistoryView
          ref="matchHistoryViewRef"
          class="h-full"
          :history="history"
          :comments="comments"
          :visible="activeTab === 'history'"
          @open-settings="selectTab('ai')"
        />
      </div>
    </div>
  </div>
</template>
