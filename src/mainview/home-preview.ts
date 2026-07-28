import { createApp, h } from 'vue';
import HomeView from './views/HomeView.vue';
import './index.css';

createApp({
  render: () =>
    h(HomeView, {
      version: 'v3.2.0',
      onOpenModule: () => undefined,
    }),
}).mount('#app');
