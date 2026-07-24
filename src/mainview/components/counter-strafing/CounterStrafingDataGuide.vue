<script setup lang="ts">
import SettingsCard from '../settings/SettingsCard.vue';
import {
  AlertCircle,
  ChartColumn,
  CircleHelp,
  Info,
  Keyboard,
  LineChart,
  Target,
} from 'lucide-vue-next';

const barLegend = [
  {
    color: 'bg-emerald-400',
    label: '绿色 · 稳定',
    desc: '开枪瞬间移速处于准度阈值内，或处于蹲射、蹲起宽限状态。',
  },
  {
    color: 'bg-amber-400',
    label: '黄色 · 微动',
    desc: '存在轻微位移，准度已开始下降，尚未达到跑打判定。',
  },
  {
    color: 'bg-rose-400',
    label: '红色 · 跑打',
    desc: '明显移动中开枪、方向键冲突，或制动未完成即开火。',
  },
  {
    color: 'bg-teal-300',
    label: '青绿 · 蹲起宽限',
    desc: '松开蹲键后的宽限时段内，仍按稳定状态统计。',
  },
];

const assessmentLegend = [
  { color: 'text-violet-500', label: '完美', desc: '方向切换衔接紧密，时间偏差处于极小范围。' },
  { color: 'text-sky-500', label: '优秀', desc: '切换速度达标，符合实战急停要求。' },
  { color: 'text-amber-500', label: '偏早', desc: '反向键触发偏早，原方向键可能尚未完全释放。' },
  { color: 'text-rose-500', label: '偏晚', desc: '反向键触发偏晚，切换间隙偏大，制动效果减弱。' },
];
</script>

<template>
  <div class="space-y-5">
    <section
      class="overflow-hidden rounded-2xl border border-accent/20 bg-linear-to-br from-accent/6 via-surface to-surface px-5 py-5"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent"
        >
          <CircleHelp class="h-5 w-5" aria-hidden="true" />
        </div>
        <div class="min-w-0">
          <h3 class="text-[15px] font-semibold text-fg">功能概述</h3>
          <p class="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
            急停助手通过监听本机
            <span class="font-medium text-fg">方向键、蹲键与开火键</span>
            输入，结合移速模型估算移动状态与按键时机，不读取游戏内存。模块分为两项独立指标：
            <span class="font-medium text-fg">开枪稳定</span>
            用于评估停稳后开火的质量；
            <span class="font-medium text-fg">急停评估</span>
            用于评估同轴方向切换的按键衔接。
          </p>
        </div>
      </div>
    </section>

    <SettingsCard
      title="开枪稳定"
      description="记录每次开火瞬间的移动稳定程度"
      :icon="ChartColumn"
    >
      <div class="space-y-4">
        <p class="text-[13px] leading-relaxed text-fg-secondary">
          系统根据移速模型计算开枪采样时刻的移动速度。速度低于准度阈值时判定为
          <span class="font-medium text-fg">稳定</span>
          ；超出阈值则按程度显示黄色或红色。直方图自左向右展示最近的开火记录，柱高表示该次射击的不稳定程度。
        </p>

        <div class="grid gap-2 sm:grid-cols-2">
          <div
            v-for="item in barLegend"
            :key="item.label"
            class="flex gap-3 rounded-xl border border-border-subtle bg-elevated/40 px-3.5 py-3"
          >
            <span
              class="mt-1 h-8 w-2 shrink-0 rounded-full"
              :class="item.color"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <p class="text-[12px] font-semibold text-fg">{{ item.label }}</p>
              <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{{ item.desc }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-border-subtle bg-surface px-4 py-3.5">
          <p class="text-[12px] font-semibold text-fg">统计指标</p>
          <ul class="mt-2 space-y-2 text-[12px] leading-relaxed text-fg-secondary">
            <li>
              <span class="font-medium text-fg">平均误差</span>
              ：统计范围内各次射击误差的平均值，数值越低表示整体越稳定。
            </li>
            <li>
              <span class="font-medium text-fg">稳定占比</span>
              ：判定为稳定状态（绿柱）的射击次数占总采样次数的比例。
            </li>
            <li>
              <span class="font-medium text-fg">速度倍数</span>
              ：当前移速相对准度阈值的比值，1.0 及以下通常视为稳定范围。
            </li>
          </ul>
        </div>

        <div
          class="flex gap-2.5 rounded-xl border border-border-subtle bg-elevated/30 px-3.5 py-3"
        >
          <Info class="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <p class="text-[11px] leading-relaxed text-fg-muted">
            本模块不模拟武器散布，亦不与局内弹道逐发对齐。反馈基于
            <span class="text-fg-secondary">按键时序与移速模型</span>
            计算。若与实战体感存在偏差，可在「高级设置」中调整移速参数或开火采样延迟。
          </p>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard
      title="急停评估"
      description="记录同轴方向切换时反向键的触发时机"
      :icon="LineChart"
    >
      <div class="space-y-4">
        <p class="text-[13px] leading-relaxed text-fg-secondary">
          在同一移动轴上完成方向切换时（如先释放 A 再按下 D），系统测量两次按键之间的时间差，单位为毫秒。图表纵轴表示该次切换的时间偏差，数值越接近零表示衔接越理想。亦可对照反馈调节
          <span class="font-medium text-fg">磁轴键盘的按下与抬起触发高度</span>
          （如 RT 行程），找到更顺手的急停节奏。
        </p>

        <div class="grid gap-2 sm:grid-cols-2">
          <div
            v-for="item in assessmentLegend"
            :key="item.label"
            class="rounded-xl border border-border-subtle bg-elevated/40 px-3.5 py-3"
          >
            <p class="text-[12px] font-semibold" :class="item.color">{{ item.label }}</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{{ item.desc }}</p>
          </div>
        </div>

        <div class="rounded-xl border border-border-subtle bg-surface px-4 py-3.5">
          <p class="text-[12px] font-semibold text-fg">统计指标</p>
          <ul class="mt-2 space-y-2 text-[12px] leading-relaxed text-fg-secondary">
            <li>
              <span class="font-medium text-fg">+3ms</span>
              ：反向键较理想时机延迟 3 毫秒，归类为偏晚。
            </li>
            <li>
              <span class="font-medium text-fg">−2ms</span>
              ：反向键较理想时机提前 2 毫秒，归类为偏早。
            </li>
            <li>
              <span class="font-medium text-fg">平均偏差</span>
              ：多次切换的时间差均值，越接近 0 表示整体衔接越均衡。
            </li>
            <li>
              <span class="font-medium text-fg">优秀率</span>
              ：达到「优秀」阈值以内的切换次数占比。
            </li>
            <li>
              <span class="font-medium text-fg">标准差</span>
              ：偏差值的离散程度，数值越大表示节奏波动越明显。
            </li>
            <li>
              <span class="font-medium text-fg">整体倾向</span>
              ：基于历史记录归纳的偏早、偏晚或均衡趋势。
            </li>
          </ul>
        </div>

        <div
          class="flex gap-2.5 rounded-xl border border-border-subtle bg-elevated/30 px-3.5 py-3"
        >
          <Keyboard class="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <p class="text-[11px] leading-relaxed text-fg-muted">
            仅统计
            <span class="text-fg-secondary">先释放原方向、再按下反向</span>
            的完整切换；同时按住对向键（如 AD、WS）不计入。横向（A/D）与纵向（W/S）评估可在高级设置中分别启用，「完美」「优秀」阈值亦可自定义。
          </p>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard title="使用建议" description="推荐流程与查看方式" :icon="Target">
      <ul class="space-y-3 text-[12px] leading-relaxed text-fg-secondary">
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            在控制台选择 HUD 或小组件显示方式，点击
            <span class="font-medium text-fg">开始记录</span>
            ，即可同步查看实时反馈。
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            开枪稳定侧重
            <span class="font-medium text-fg">急停后开枪</span>
            ；急停评估侧重
            <span class="font-medium text-fg">方向键切换衔接</span>
            。两项指标相互独立，建议分开练习与复盘。
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            「数据」页提供汇总统计；HUD 与小组件提供实时图表。窗口尺寸较小时，顶部统计文字将自动隐藏以保持图表可读性。
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            统计窗口条数可在高级设置中配置。条数增加会使均值更平滑，但对近期状态的响应会相应放缓。
          </span>
        </li>
      </ul>
    </SettingsCard>

    <div
      class="flex gap-2.5 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3.5"
      role="note"
    >
      <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p class="text-[11px] leading-relaxed text-fg-secondary">
        本功能仅监听本机键盘与鼠标输入，用于个人练习分析，不修改游戏文件、不注入游戏进程。若系统提示需要管理员权限，系 Windows 对全局输入监听的权限要求，与第三方作弊工具无关。
      </p>
    </div>
  </div>
</template>
