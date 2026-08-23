<script setup lang="ts">
import { History, Info, KeyRound, MessageCircle, ScrollText, Settings, Sparkles } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { useAiAnalysis } from '../composables/useAiAnalysis';
import type { useComments } from '../composables/useComments';
import type { MatchHistoryApi } from '../composables/useMatchHistory';
import type { PerfectAuthApi } from '../composables/usePerfectAuth';
import AboutSettingsSection from '../components/settings/AboutSettingsSection.vue';
import AiSettingsSection from '../components/settings/AiSettingsSection.vue';
import ChangelogSettingsSection from '../components/settings/ChangelogSettingsSection.vue';
import CommentHistorySection from '../components/settings/CommentHistorySection.vue';
import PerfectAccountSettingsSection from '../components/settings/PerfectAccountSettingsSection.vue';
import SettingsLanguageMenu from '../components/settings/SettingsLanguageMenu.vue';
import MatchHistoryView from './MatchHistoryView.vue';
import { useDebugUnlock } from '../composables/useDebugUnlock';

export type SettingsTab = 'history' | 'login-management' | 'ai' | 'comments' | 'changelog' | 'about';

const { t } = useI18n();

const props = defineProps<{
  ai: ReturnType<typeof useAiAnalysis>;
  comments: ReturnType<typeof useComments>;
  history: MatchHistoryApi;
  perfectAuth: PerfectAuthApi;
  viewerSteamId?: string;
  initialTab?: SettingsTab;
  visible?: boolean;
}>();

const emit = defineEmits<{ openPerfectLogin: [method: 'qr' | 'steam'] }>();

const activeTab = ref<SettingsTab>(props.initialTab ?? 'history');

watch(
  () => props.initialTab,
  (tab) => {
    if (tab) activeTab.value = tab;
  },
);

const navItems = computed(() => [
  { id: 'history' as const, label: t('settings.history'), desc: t('settings.historyDesc'), icon: History },
  { id: 'login-management' as const, label: t('settings.loginManagement'), desc: t('settings.loginManagementDesc'), icon: KeyRound },
  { id: 'ai' as const, label: t('settings.ai'), desc: t('settings.aiDesc'), icon: Sparkles },
  { id: 'comments' as const, label: t('settings.comments'), desc: t('settings.commentsDesc'), icon: MessageCircle },
  { id: 'changelog' as const, label: t('settings.changelog'), desc: t('settings.changelogDesc'), icon: ScrollText },
  { id: 'about' as const, label: t('settings.about'), desc: t('settings.aboutDesc'), icon: Info },
]);

const activeMeta = computed(() => navItems.value.find((item) => item.id === activeTab.value)!);

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
      :aria-label="t('settings.nav')"
    >
      <div class="px-4 py-4 shadow-[0_1px_0_var(--color-border)]">
        <div class="flex items-center gap-2.5">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-md bg-accent/10 text-accent"
          >
            <Settings class="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 class="text-[14px] font-semibold text-fg">{{ t('settings.title') }}</h1>
        </div>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto p-3">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="relative flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-[color,background-color,scale] duration-200 active:scale-[0.96]"
          :class="
            activeTab === item.id
              ? 'bg-accent/10 text-accent'
              : 'text-fg-secondary hover:bg-elevated hover:text-fg'
          "
          :aria-current="activeTab === item.id ? 'page' : undefined"
          @click="selectTab(item.id)"
        >
          <span
            class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent transition-[opacity,scale] duration-200"
            :class="activeTab === item.id ? 'scale-y-100 opacity-100' : 'scale-y-50 opacity-0'"
            aria-hidden="true"
          />
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[color,background-color,box-shadow] duration-200"
            :class="activeTab === item.id ? 'bg-surface text-accent shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-fg-muted'"
          >
            <component :is="item.icon" class="h-4 w-4" aria-hidden="true" />
          </span>
          <span class="text-[13px] font-medium">{{ item.label }}</span>
        </button>
      </nav>

      <div class="shrink-0 px-3 pb-3 pt-2 shadow-[0_-1px_0_var(--color-border)]">
        <SettingsLanguageMenu />
      </div>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        v-show="activeTab !== 'history'"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <header class="sticky top-0 z-10 shrink-0 border-b border-border bg-base/90 px-6 py-5 backdrop-blur-sm">
          <h2 class="text-[18px] font-bold text-fg [text-wrap:balance]">{{ activeMeta.label }}</h2>
          <p class="mt-1 text-[13px] text-fg-muted [text-wrap:pretty]">{{ activeMeta.desc }}</p>
        </header>

        <div class="relative mx-auto w-full max-w-3xl flex-1 px-6 py-6">
          <Transition name="settings-tab" mode="out-in">
            <div v-if="activeTab === 'ai'" key="ai">
              <AiSettingsSection :ai="ai" :settings-visible="visible ?? true" />
            </div>
            <div v-else-if="activeTab === 'login-management'" key="login-management">
              <PerfectAccountSettingsSection
                :auth="perfectAuth"
                :visible="(visible ?? true) && activeTab === 'login-management'"
                @login="emit('openPerfectLogin', $event)"
              />
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
          :viewer-steam-id="viewerSteamId"
          :visible="activeTab === 'history'"
          @open-settings="selectTab('ai')"
        />
      </div>
    </div>
  </div>
</template>
