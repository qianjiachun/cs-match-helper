import { createApp } from 'vue';
import App from './App.vue';
import { installAppGuards } from './utils/app-guards';
import { installNoTabFocus } from './utils/no-tab-focus';
import './index.css';

installAppGuards();
installNoTabFocus();
createApp(App).mount('#app');
