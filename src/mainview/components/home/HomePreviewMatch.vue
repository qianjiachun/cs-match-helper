<script setup lang="ts">
/** Match prep preview — dual roster + center VS (EN only). */
</script>

<template>
  <svg
    class="home-svg home-svg--match h-full w-full"
    viewBox="0 0 320 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="mBg" x1="0" y1="0" x2="0" y2="200" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FAFBFC" />
        <stop offset="1" stop-color="#F1F5F9" />
      </linearGradient>
      <linearGradient id="mTeamA" x1="0" y1="0" x2="1" y2="0">
        <stop stop-color="#72A9E7" />
        <stop offset="1" stop-color="#3B7DD8" />
      </linearGradient>
      <linearGradient id="mTeamB" x1="0" y1="0" x2="1" y2="0">
        <stop stop-color="#F8C766" />
        <stop offset="1" stop-color="#F5A623" />
      </linearGradient>
    </defs>

    <rect width="320" height="200" rx="12" fill="url(#mBg)" />

    <rect x="16" y="14" width="288" height="26" rx="8" fill="#FFF" stroke="#E4E4E7" />
    <rect x="24" y="19" width="52" height="16" rx="5" fill="#FFFBEB" stroke="#F5A623" stroke-opacity="0.38" />
    <text x="50" y="30" text-anchor="middle" fill="#B86B00" font-size="8" font-family="Segoe UI,sans-serif" font-weight="700">DUST II</text>
    <rect x="88" y="22" width="100" height="10" rx="5" fill="#E4E4E7" />
    <rect class="m-timer" x="88" y="22" width="68" height="10" rx="5" fill="url(#mTeamB)" />
    <circle class="m-live" cx="288" cy="27" r="3.5" fill="#52C41A" />
    <circle class="m-live-ring" cx="288" cy="27" r="6" stroke="#52C41A" stroke-width="1" />

    <!-- Team A -->
    <rect x="16" y="52" width="128" height="132" rx="10" fill="#FFF" stroke="#E4E4E7" />
    <circle cx="36" cy="72" r="8" fill="#DBEAFE" stroke="#4A90E2" stroke-opacity="0.5" />
    <text x="50" y="76" fill="#3B7DD8" font-size="9" font-family="Segoe UI,sans-serif" font-weight="700">TEAM A</text>
    <rect class="m-scan m-scan--a" x="18" y="84" width="124" height="16" rx="5" fill="#4A90E2" />
    <g
      v-for="i in 5"
      :key="'a' + i"
      class="m-row m-row--a"
      :style="{ animationDelay: `${(i - 1) * 90}ms` }"
    >
      <circle :cx="34" :cy="94 + (i - 1) * 17" r="5" fill="#DBEAFE" />
      <rect :x="46" :y="90 + (i - 1) * 17" width="34" height="4" rx="2" fill="#E4E4E7" />
      <rect
        class="m-bar"
        :x="46"
        :y="97 + (i - 1) * 17"
        :width="30 + ((i * 13) % 40)"
        height="4"
        rx="2"
        fill="url(#mTeamA)"
        :style="{ animationDelay: `${(i - 1) * 100}ms` }"
      />
    </g>

    <!-- Center VS: single-stroke half-rings (no stacked borders / drop-shadow filter) -->
    <g class="m-vs">
      <g class="m-vs__plate">
        <ellipse cx="160" cy="122" rx="15" ry="5.5" fill="#0F172A" opacity="0.08" />
        <circle cx="160" cy="118" r="13" fill="#FFFFFF" />
        <path
          class="m-vs__ring"
          d="M160 104.5 A13.5 13.5 0 0 1 160 131.5"
          stroke="#4A90E2"
          stroke-width="2.25"
          stroke-linecap="round"
          fill="none"
        />
        <path
          class="m-vs__ring"
          d="M160 131.5 A13.5 13.5 0 0 1 160 104.5"
          stroke="#F5A623"
          stroke-width="2.25"
          stroke-linecap="round"
          fill="none"
        />
      </g>
      <text
        x="160"
        y="121.5"
        text-anchor="middle"
        fill="#334155"
        font-size="9.5"
        font-family="Segoe UI,sans-serif"
        font-weight="900"
        font-style="italic"
        letter-spacing="0"
      >VS</text>
    </g>

    <!-- Team B -->
    <rect x="176" y="52" width="128" height="132" rx="10" fill="#FFF" stroke="#E4E4E7" />
    <circle cx="196" cy="72" r="8" fill="#FEF3C7" stroke="#F5A623" stroke-opacity="0.52" />
    <text x="210" y="76" fill="#D9840C" font-size="9" font-family="Segoe UI,sans-serif" font-weight="700">TEAM B</text>
    <rect class="m-scan m-scan--b" x="178" y="84" width="124" height="16" rx="5" fill="#F5A623" />
    <g
      v-for="i in 5"
      :key="'b' + i"
      class="m-row m-row--b"
      :style="{ animationDelay: `${60 + (i - 1) * 90}ms` }"
    >
      <circle :cx="194" :cy="94 + (i - 1) * 17" r="5" fill="#FEF3C7" />
      <rect :x="206" :y="90 + (i - 1) * 17" width="34" height="4" rx="2" fill="#E4E4E7" />
      <rect
        class="m-bar"
        :x="206"
        :y="97 + (i - 1) * 17"
        :width="26 + ((i * 17) % 44)"
        height="4"
        rx="2"
        fill="url(#mTeamB)"
        :style="{ animationDelay: `${60 + (i - 1) * 100}ms` }"
      />
    </g>
  </svg>
</template>

<style scoped>
.m-bar {
  transform-box: fill-box;
  transform-origin: left center;
  animation: mBar 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.m-timer {
  transform-box: fill-box;
  transform-origin: left center;
  animation: mTimer 4.8s cubic-bezier(0.2, 0, 0, 1) infinite;
}
.m-live {
  animation: mPulse 2s ease-in-out infinite;
}
.m-live-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: mLiveRing 2s ease-out infinite;
}
.m-vs__ring {
  transform-box: fill-box;
  transform-origin: center;
  stroke-dasharray: 44;
  stroke-dashoffset: 44;
  animation: mVsRing 4.8s cubic-bezier(0.2, 0, 0, 1) infinite;
}
.m-vs__plate {
  transform-box: fill-box;
  transform-origin: center;
  animation: mVsFocus 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.m-row {
  transform-box: fill-box;
  opacity: 0;
  animation: mRow 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}
.m-row--a {
  transform-origin: left center;
}
.m-row--b {
  transform-origin: right center;
}
.m-scan {
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0;
  animation: mScan 4.8s cubic-bezier(0.2, 0, 0, 1) infinite;
}
.m-scan--b {
  animation-delay: 120ms;
}

@keyframes mBar {
  0%,
  4% {
    transform: scaleX(0.24);
    opacity: 0.3;
  }
  24%,
  86% {
    transform: scaleX(1);
    opacity: 1;
  }
  96%,
  100% {
    transform: scaleX(1);
    opacity: 0;
  }
}
@keyframes mTimer {
  0%,
  6% {
    transform: scaleX(0.14);
  }
  82% {
    transform: scaleX(1);
  }
  100% {
    transform: scaleX(0.14);
  }
}
@keyframes mPulse {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 1;
  }
}
@keyframes mLiveRing {
  0% {
    opacity: 0.55;
    transform: scale(0.55);
  }
  70%,
  100% {
    opacity: 0;
    transform: scale(1.4);
  }
}
@keyframes mVsRing {
  0%,
  28% {
    stroke-dashoffset: 44;
    opacity: 0.35;
  }
  52%,
  88% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  100% {
    stroke-dashoffset: -44;
    opacity: 0;
  }
}
@keyframes mVsFocus {
  0%,
  24% {
    opacity: 0.62;
    transform: scale(0.92);
  }
  50%,
  88% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0.62;
    transform: scale(0.92);
  }
}
@keyframes mRow {
  0%,
  4% {
    opacity: 0.25;
    transform: translateX(-4px);
  }
  16%,
  88% {
    opacity: 1;
    transform: translateX(0);
  }
  98%,
  100% {
    opacity: 0;
    transform: translateX(0);
  }
}
.m-row--b {
  animation-name: mRowB;
}
@keyframes mRowB {
  0%,
  4% {
    opacity: 0.25;
    transform: translateX(4px);
  }
  16%,
  88% {
    opacity: 1;
    transform: translateX(0);
  }
  98%,
  100% {
    opacity: 0;
    transform: translateX(0);
  }
}
@keyframes mScan {
  0%,
  10% {
    opacity: 0;
    transform: translateY(0);
  }
  18% {
    opacity: 0.1;
  }
  62% {
    opacity: 0.05;
    transform: translateY(68px);
  }
  68%,
  100% {
    opacity: 0;
    transform: translateY(68px);
  }
}

</style>
