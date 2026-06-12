<script setup lang="ts">
import appIcon from '@app-icon';
import iconBilibili from '@/assets/icons/bilibili.svg';
import iconGithub from '@/assets/icons/github.svg';
import { ExternalLink } from 'lucide-vue-next';
import { useCopyFeedback } from '../../composables/useCopyFeedback';
import { useUpdateCheck } from '../../composables/useUpdateCheck';
import { openExternalUrl } from '../../native';
import UpdateBadge from '../UpdateBadge.vue';

const appName = 'CS 匹配助手';
const { state, formattedVersion, openDialog } = useUpdateCheck();
const author = '小淳';
const authorGithubUrl = 'https://github.com/qianjiachun/';
const authorBilibiliUrl = 'https://space.bilibili.com/193482';
const repoUrl = 'https://github.com/qianjiachun/cs-match-helper';

const { copyText } = useCopyFeedback();

function openRepo() {
  void openExternalUrl(repoUrl);
}

async function copyRepo() {
  await copyText(repoUrl, '已复制开源地址');
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
      <span class="text-[13px] text-fg-muted">版本</span>
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-semibold text-fg">{{ formattedVersion }}</span>
        <UpdateBadge v-if="state.hasUpdate" @click="openDialog" />
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
