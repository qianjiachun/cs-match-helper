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
import { computed } from 'vue';
import { localize as l } from '../../i18n';

const barLegend = computed(() => [
  {
    color: 'bg-emerald-400',
    label: l('绿色 · 稳定', 'Green · Stable'),
    desc: l('开枪瞬间移速处于准度阈值内，或处于蹲射、蹲起宽限状态。', 'Movement speed is within the accurate range when the shot is fired, including crouch and crouch-release grace states.'),
  },
  {
    color: 'bg-amber-400',
    label: l('黄色 · 微动', 'Yellow · Slight movement'),
    desc: l('存在轻微位移，准度已开始下降，尚未达到跑打判定。', 'Slight movement is reducing accuracy, but the shot is not classified as running and gunning.'),
  },
  {
    color: 'bg-rose-400',
    label: l('红色 · 跑打', 'Red · Running accuracy'),
    desc: l('明显移动中开枪，或制动未完成且估算速度仍高于跑打线。', 'The shot was fired while moving, or braking was incomplete and estimated speed remained above the running threshold.'),
  },
  {
    color: 'bg-teal-300',
    label: l('青绿 · 蹲起宽限', 'Teal · Crouch-release grace'),
    desc: l('松开蹲键后的宽限时段内，仍按稳定状态统计。', 'Shots inside the grace period after releasing crouch are still counted as stable.'),
  },
]);

const assessmentLegend = computed(() => [
  { color: 'text-violet-500', label: l('完美', 'Perfect'), desc: l('方向切换衔接紧密，时间偏差处于极小范围。', 'The opposite-key transition is exceptionally tight with minimal timing error.') },
  { color: 'text-sky-500', label: l('优秀', 'Good'), desc: l('切换速度达标，符合实战急停要求。', 'The transition meets the target timing for a practical counter-strafe.') },
  { color: 'text-amber-500', label: l('偏早', 'Early'), desc: l('反向键触发偏早，原方向键可能尚未完全释放。', 'The opposite key was pressed too early, possibly before the original key was fully released.') },
  { color: 'text-rose-500', label: l('偏晚', 'Late'), desc: l('反向键触发偏晚，切换间隙偏大，制动效果减弱。', 'The opposite key was pressed late, leaving a larger gap and weaker braking.') },
]);
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
          <h3 class="text-[15px] font-semibold text-fg">{{ l('功能概述', 'Overview') }}</h3>
          <p class="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
            {{ l('急停 HUD 监听本机方向键、蹲键与开火键输入，结合移速模型估算移动状态与按键时机，不读取游戏内存。模块包含两项独立指标：开枪稳定用于评估停稳后开火的质量；急停评估用于评估同轴方向切换的按键衔接。', 'The HUD listens to local movement, crouch, and fire inputs, then estimates movement and key timing without reading game memory. Shooting stability measures whether you are fully stopped before firing; counter-strafe assessment measures opposite-key timing on the same movement axis.') }}
          </p>
          <p class="mt-2 text-[12px] leading-relaxed text-fg-muted">
            {{ l('默认开启的 CS2 数据联动使用官方 GSI 接口过滤持刀、投掷物、无效回合阶段、死亡或观战等操作，可在高级设置中关闭并记住选择。GSI 不参与移速计算，断连时会自动回退到原有算法。', 'CS2 data integration is enabled by default and uses the official GSI interface to filter knife, grenade, invalid-round, death, and spectating inputs. It can be disabled under Advanced and remembers the choice. GSI does not calculate movement speed, and the assistant falls back automatically when disconnected.') }}
          </p>
        </div>
      </div>
    </section>

    <SettingsCard
      :title="l('开枪稳定', 'Shooting stability')"
      :description="l('记录每次开火瞬间的移动稳定程度', 'Measures movement stability when each shot is fired')"
      :icon="ChartColumn"
    >
      <div class="space-y-4">
        <p class="text-[13px] leading-relaxed text-fg-secondary">
          {{ l('系统根据移速模型计算开枪采样时刻的移动速度。速度低于准度阈值时判定为稳定；超出阈值则按程度显示黄色或红色。直方图自左向右展示最近的开火记录，柱高表示该次射击的不稳定程度。', 'The movement model estimates your speed at the shot sample. A shot inside the accurate-speed threshold is stable; yellow and red indicate increasing movement error. The histogram runs from oldest to newest, and taller bars indicate less stable shots.') }}
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
          <p class="text-[12px] font-semibold text-fg">{{ l('统计指标', 'Metrics') }}</p>
          <ul class="mt-2 space-y-2 text-[12px] leading-relaxed text-fg-secondary">
            <li>
              {{ l('平均误差：统计范围内各次射击误差的平均值，数值越低表示整体越稳定。', 'Average error: Mean movement error across the selected shots. Lower is more stable.') }}
            </li>
            <li>
              {{ l('稳定占比：判定为稳定状态（绿柱）的射击次数占总采样次数的比例。', 'Stable rate: Percentage of shots classified as stable (green bars).') }}
            </li>
            <li>
              {{ l('速度倍数：当前移速相对准度阈值的比值，1.0 及以下通常视为稳定范围。', 'Speed ratio: Current speed divided by the accurate-speed threshold. Values at or below 1.0 are normally stable.') }}
            </li>
          </ul>
        </div>

        <div
          class="flex gap-2.5 rounded-xl border border-border-subtle bg-elevated/30 px-3.5 py-3"
        >
          <Info class="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('本模块不模拟武器散布，亦不与局内弹道逐发对齐。反馈基于按键时序与移速模型计算。若与实战体感存在偏差，可在「高级设置」中调整移速参数或开火采样延迟。', 'This module does not simulate weapon spread or align feedback with individual bullet trajectories. Results come from key timing and the movement model. Adjust movement parameters or shot sampling delay under Advanced if they do not match in-game feel.') }}
          </p>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard
      :title="l('急停评估', 'Counter-strafe assessment')"
      :description="l('记录同轴方向切换时反向键的触发时机', 'Measures opposite-key timing during same-axis direction changes')"
      :icon="LineChart"
    >
      <div class="space-y-4">
        <p class="text-[13px] leading-relaxed text-fg-secondary">
          {{ l('在同一移动轴上完成方向切换时（如先释放 A 再按下 D），系统测量两次按键之间的时间差，单位为毫秒。数值越接近零表示衔接越理想。亦可对照反馈调节磁轴键盘的按下与抬起触发高度（如 Rapid Trigger 行程）。', 'For a same-axis direction change, such as releasing A before pressing D, the HUD measures the gap in milliseconds. Values closer to zero indicate a tighter counter-strafe. You can also use the feedback to tune actuation and release points on a Hall effect keyboard, including Rapid Trigger travel.') }}
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
          <p class="text-[12px] font-semibold text-fg">{{ l('统计指标', 'Metrics') }}</p>
          <ul class="mt-2 space-y-2 text-[12px] leading-relaxed text-fg-secondary">
            <li>
              <span class="font-medium text-fg">+3ms</span>
              {{ l('：反向键较理想时机延迟 3 毫秒，归类为偏晚。', ': The opposite key was pressed 3ms after the ideal timing and is graded Late.') }}
            </li>
            <li>
              <span class="font-medium text-fg">−2ms</span>
              {{ l('：反向键较理想时机提前 2 毫秒，归类为偏早。', ': The opposite key was pressed 2ms before the ideal timing and is graded Early.') }}
            </li>
            <li>
              {{ l('平均偏差：多次切换的时间差均值，越接近 0 表示整体衔接越均衡。', 'Average timing: Mean timing error across transitions. Values closer to zero are more balanced.') }}
            </li>
            <li>
              {{ l('优秀率：达到「优秀」阈值以内的切换次数占比。', 'Good rate: Percentage of transitions within the Good threshold.') }}
            </li>
            <li>
              {{ l('标准差：偏差值的离散程度，数值越大表示节奏波动越明显。', 'Standard deviation: Timing spread across transitions. Higher values indicate less consistent rhythm.') }}
            </li>
            <li>
              {{ l('整体倾向：基于历史记录归纳的偏早、偏晚或均衡趋势。', 'Overall tendency: Whether your recent transitions trend Early, Late, or Neutral.') }}
            </li>
          </ul>
        </div>

        <div
          class="flex gap-2.5 rounded-xl border border-border-subtle bg-elevated/30 px-3.5 py-3"
        >
          <Keyboard class="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <p class="text-[11px] leading-relaxed text-fg-muted">
            {{ l('仅统计先释放原方向、再按下反向的完整切换；同时按住对向键（如 AD、WS）不计入。横向（A/D）与纵向（W/S）评估可在高级设置中分别启用，「完美」「优秀」阈值亦可自定义。', 'Only complete transitions that release the original key before pressing the opposite key are counted. Overlapping opposite keys, such as AD or WS, are excluded. Horizontal and vertical assessment and the Perfect and Good thresholds can be configured under Advanced.') }}
          </p>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard :title="l('使用建议', 'Recommended workflow')" :description="l('推荐流程与查看方式', 'How to practice and review your results')" :icon="Target">
      <ul class="space-y-3 text-[12px] leading-relaxed text-fg-secondary">
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            {{ l('在控制台选择 HUD 或小组件显示方式，点击「开始记录」，即可同步查看实时反馈。', 'Choose an HUD or Game Bar Widget display mode in Console, then select Start recording for live feedback.') }}
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            {{ l('开枪稳定侧重急停后开枪；急停评估侧重方向键切换衔接。两项指标相互独立，建议分开练习与复盘。', 'Shooting stability focuses on firing after stopping; counter-strafe assessment focuses on opposite-key transitions. Practice and review them separately.') }}
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            {{ l('「数据」页提供汇总统计；HUD 与小组件提供实时图表。窗口尺寸较小时，顶部统计文字将自动隐藏以保持图表可读性。', 'Data provides summary statistics; the HUD and Widget provide live charts. Header statistics hide automatically in smaller windows to keep charts readable.') }}
          </span>
        </li>
        <li class="flex gap-2.5">
          <span class="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
          <span>
            {{ l('统计窗口条数可在高级设置中配置。条数增加会使均值更平滑，但对近期状态的响应会相应放缓。', 'Configure the history size under Advanced. A larger sample smooths averages but reacts more slowly to recent form.') }}
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
        {{ l('本功能不读取游戏内存、不注入游戏进程。可选的状态增强只创建并管理本软件专属的 CS2 GSI 配置；若系统提示需要管理员权限，系 Windows 对全局输入监听的权限要求。', 'This feature does not read game memory or inject into the game process. The optional enhancement only creates and manages this app\'s dedicated CS2 GSI configuration. Administrator access may be required by Windows for global input capture.') }}
      </p>
    </div>
  </div>
</template>
