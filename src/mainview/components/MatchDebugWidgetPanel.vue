<script setup lang="ts">
import { Download, Loader2 } from 'lucide-vue-next';
import { onMounted } from 'vue';
import GameBarWidgetInstallSection from './gamebar-widget/GameBarWidgetInstallSection.vue';
import { useDebugGameBarWidget } from '../composables/useGameBarWidget';

const {
  widget,
  widgetZipPath,
  actionError,
  useRealInstall,
  simulationOutcome,
  busy,
  checkingUpdate,
  pickWidgetZip,
  installSelectedZip,
  uninstallWidget,
  refreshStatus,
  copyDiagnostics,
  fetchRealDownloadUrls,
  applyMockDownloadUrls,
  presetSimulationOutcome,
  cancelSimulation,
  init,
} = useDebugGameBarWidget();

onMounted(() => {
  void init();
});
</script>

<template>
  <div class="space-y-4">
    <section class="space-y-2 rounded-lg border border-dashed border-accent/30 bg-accent/4 px-3 py-2.5">
      <p class="text-[12px] font-semibold text-fg">在线安装模拟</p>
      <p class="text-[11px] leading-relaxed text-fg-muted">
        下方是与急停控制台完全一致的小组件安装 UI。默认走模拟流程（不真正下载/安装）；勾选「真实安装」后才会执行真实逻辑。
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-base px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy || checkingUpdate"
          @click="fetchRealDownloadUrls()"
        >
          <Loader2 v-if="checkingUpdate" class="h-3.5 w-3.5 animate-spin" />
          拉取真实下载地址
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-border bg-base px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="applyMockDownloadUrls()"
        >
          使用模拟地址
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 transition-colors duration-200 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="presetSimulationOutcome('download-fail')"
        >
          预置：下载失败
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-[11px] font-medium text-danger transition-colors duration-200 hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="presetSimulationOutcome('install-fail')"
        >
          预置：安装失败
        </button>
        <button
          v-if="busy"
          type="button"
          class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated"
          @click="cancelSimulation()"
        >
          停止模拟
        </button>
      </div>
      <label class="inline-flex cursor-pointer items-center gap-2 text-[11px] text-fg-secondary">
        <input
          v-model="useRealInstall"
          type="checkbox"
          class="rounded border-border"
          :disabled="busy"
        />
        真实安装（取消勾选则仅模拟进度与结果）
      </label>
      <p v-if="simulationOutcome !== 'success' && !useRealInstall" class="text-[10px] text-warning">
        已预置「{{ simulationOutcome === 'download-fail' ? '下载失败' : '安装失败' }}」，下次点击安装按钮将按此结果模拟。
      </p>
      <p v-if="actionError" class="text-[10px] text-danger">{{ actionError }}</p>
    </section>

    <GameBarWidgetInstallSection
      :widget="widget"
      :show-step-number="false"
      :show-redetect="false"
      default-install-panel-open
      game-bar-installed-assumed
    />

    <section class="space-y-3 border-t border-border-subtle pt-3">
      <p class="text-[12px] font-semibold text-fg">本地 zip 安装</p>
      <p class="text-[11px] leading-relaxed text-fg-muted">
        选择本地 Widget zip 进行真实安装测试（会弹出 UAC）。
      </p>
      <div class="space-y-1.5">
        <label class="text-[11px] font-medium text-fg-secondary" for="widget-zip-path">
          Widget zip 路径
        </label>
        <input
          id="widget-zip-path"
          v-model="widgetZipPath"
          type="text"
          readonly
          class="w-full rounded-md border border-border bg-base px-3 py-2 font-mono text-[11px] text-fg outline-none"
          placeholder="点击「选择 zip」"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="installSelectedZip()"
        >
          <Download class="h-3.5 w-3.5" />
          安装本地 zip
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="pickWidgetZip()"
        >
          选择 zip
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-danger/30 px-2.5 py-1.5 text-[11px] font-medium text-danger transition-colors duration-200 hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="busy"
          @click="uninstallWidget()"
        >
          卸载
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
          @click="refreshStatus()"
        >
          刷新状态
        </button>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors duration-200 hover:bg-elevated hover:text-fg"
          @click="copyDiagnostics()"
        >
          复制诊断
        </button>
      </div>
    </section>
  </div>
</template>
