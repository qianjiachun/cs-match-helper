<script setup lang="ts">
import appIcon from '@app-icon';
import iconBilibili from '@/assets/icons/bilibili.svg';
import iconGithub from '@/assets/icons/github.svg';
import iconQq from '@/assets/icons/qq.svg';
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-vue-next';
import { computed, useTemplateRef } from 'vue';
import { useCopyFeedback } from '../../composables/useCopyFeedback';
import { useCopySuccessAnimation } from '../../composables/useCopySuccessAnimation';
import { useUpdateCheck } from '../../composables/useUpdateCheck';
import { openExternalUrl } from '../../native';
import UpdateBadge from '../UpdateBadge.vue';

const appName = 'CS 匹配助手';
const { state, formattedVersion, isBusy, checkManual, openDialog } = useUpdateCheck();
const author = '小淳';
const authorGithubUrl = 'https://github.com/qianjiachun/';
const authorBilibiliUrl = 'https://space.bilibili.com/193482';
const repoUrl = 'https://github.com/qianjiachun/cs-match-helper';
const repoIssuesUrl = `${repoUrl}/issues`;
const qqGroupNumber = '1050732555';

const { copyText } = useCopyFeedback();
const copyWrapRef = useTemplateRef<HTMLElement | null>('copyWrapRef');
const copyIconRef = useTemplateRef<HTMLElement | null>('copyIconRef');
const copyCheckTemplateRef = useTemplateRef<HTMLElement | null>('copyCheckTemplateRef');
const { copyIconHighlighted, playCopySuccessAnimation } = useCopySuccessAnimation({
  copyWrapRef,
  copyIconRef,
  copyCheckTemplateRef,
});

const updateActionLabel = computed(() => (state.checking ? '检查中…' : '检查更新'));

function openRepo() {
  void openExternalUrl(repoUrl);
}

function openIssues() {
  void openExternalUrl(repoIssuesUrl);
}

async function copyRepo() {
  await copyText(repoUrl, '已复制开源地址');
}

async function copyQqGroup() {
  const ok = await copyText(qqGroupNumber, { showToast: false });
  if (ok) {
    playCopySuccessAnimation();
  }
}
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
    <div
      class="flex flex-col items-center gap-3 border-b border-border-subtle bg-elevated/30 px-5 py-6 text-center"
    >
      <img
        :src="appIcon"
        :alt="appName"
        class="h-16 w-16 rounded-2xl object-cover"
      />
      <div>
        <h3 class="text-[16px] font-semibold tracking-tight text-fg">{{ appName }}</h3>
        <p class="mt-1 text-[12px] text-fg-muted">By {{ author }}</p>
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <span class="shrink-0 text-[13px] text-fg-muted">版本</span>
      <div class="min-w-0 text-right">
        <div class="flex items-center justify-end gap-2">
          <span class="text-[13px] font-semibold tabular-nums text-fg">{{ formattedVersion }}</span>
          <UpdateBadge v-if="state.hasUpdate" @click="openDialog" />
        </div>
        <button
          v-if="!state.hasUpdate"
          type="button"
          class="group mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md py-0.5 text-[12px] font-medium leading-none text-accent transition-colors duration-200 hover:bg-accent/10 hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="state.checking || isBusy"
          :aria-label="updateActionLabel"
          @click="checkManual()"
        >
          <span>{{ updateActionLabel }}</span>
          <Loader2
            v-if="state.checking"
            class="h-3.5 w-3.5 shrink-0 animate-spin text-accent"
            aria-hidden="true"
          />
          <RefreshCw
            v-else
            class="h-3.5 w-3.5 shrink-0 text-accent/75 transition-colors duration-200 group-hover:text-accent"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <span class="text-[13px] text-fg-muted">作者</span>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-0.5">
          <a
            href="#"
            class="group inline-flex cursor-pointer rounded-md p-1 transition-colors duration-200 hover:bg-elevated"
            aria-label="作者 GitHub"
            @click.prevent="openExternalUrl(authorGithubUrl)"
          >
            <img
              :src="iconGithub"
              alt=""
              class="h-4 w-4 opacity-50 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden="true"
            />
          </a>
          <a
            href="#"
            class="group inline-flex cursor-pointer rounded-md p-1 transition-colors duration-200 hover:bg-elevated"
            aria-label="作者 Bilibili"
            @click.prevent="openExternalUrl(authorBilibiliUrl)"
          >
            <img
              :src="iconBilibili"
              alt=""
              class="h-4 w-4 opacity-90 transition-opacity duration-200 group-hover:opacity-100"
              aria-hidden="true"
            />
          </a>
        </div>
        <span class="text-[13px] font-semibold text-fg">{{ author }}</span>
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <span class="text-[13px] text-fg-muted">反馈</span>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="group inline-flex cursor-pointer rounded-md p-1 transition-colors duration-200 hover:bg-elevated"
          aria-label="GitHub Issues 反馈"
          :title="repoIssuesUrl"
          @click="openIssues"
        >
          <img
            :src="iconGithub"
            alt=""
            class="h-4 w-4 opacity-50 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="group/copy relative inline-flex cursor-pointer items-center gap-1.5 overflow-visible rounded-md py-px transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          title="点击复制 QQ 群号"
          @click="copyQqGroup"
        >
          <img
            :src="iconQq"
            alt=""
            class="h-4 w-4"
            aria-hidden="true"
          />
          <span class="text-[13px] font-medium text-accent transition-colors duration-200 group-hover/copy:text-accent-hover">
            QQ群
          </span>
          <span ref="copyWrapRef" class="relative inline-flex shrink-0 overflow-visible">
            <span ref="copyIconRef" class="inline-flex origin-center">
              <Copy
                class="h-3.5 w-3.5 text-accent/50 transition-[opacity,color] duration-200 group-hover/copy:text-accent/80 group-hover/copy:opacity-100"
                :class="copyIconHighlighted ? 'text-emerald-500 opacity-100' : 'text-accent/60'"
                aria-hidden="true"
              />
            </span>
          </span>
          <span ref="copyCheckTemplateRef" class="sr-only" aria-hidden="true">
            <Check class="h-3 w-3" />
          </span>
        </button>
      </div>
    </div>

    <div class="flex items-center justify-between gap-4 px-5 py-4">
      <span class="shrink-0 text-[13px] text-fg-muted">开源地址</span>
      <button
        type="button"
        class="group flex min-w-0 cursor-pointer items-center gap-1.5 text-right transition-colors duration-200"
        :title="repoUrl"
        @click="openRepo"
        @contextmenu.prevent="copyRepo"
      >
        <span class="truncate text-[13px] font-medium text-accent group-hover:text-accent-hover">
          github.com/qianjiachun/cs-match-helper
        </span>
        <ExternalLink
          class="h-3.5 w-3.5 shrink-0 text-accent/70 transition-colors duration-200 group-hover:text-accent"
          aria-hidden="true"
        />
      </button>
    </div>
  </section>
</template>
