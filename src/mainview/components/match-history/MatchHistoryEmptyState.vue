<script setup lang="ts">
import { Archive } from 'lucide-vue-next';
</script>

<template>
  <div class="flex flex-col items-center justify-center py-24 text-center">
    <div class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/60">
      <Archive class="h-6 w-6 text-slate-400" />
    </div>
    <div class="text-[1rem] leading-6">
      <h3 class="font-semibold text-slate-900">还没有历史对局</h3>
    </div>
    <p class="mt-1.5 max-w-sm text-[0.875rem] leading-5 text-slate-500">
      匹配成功后会自动保存对局数据快照
    </p>
  </div>
</template>
