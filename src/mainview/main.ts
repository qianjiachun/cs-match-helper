import { createApp } from 'vue';
import App from './App.vue';
import { showMainWindowAfterFirstPaint } from './native';
import { installAppGuards } from './utils/app-guards';
import { installNoTabFocus } from './utils/no-tab-focus';
import { logRuntimeDiagnostics } from './utils/runtime-diagnostics';
import { installLongTaskObserver, startupMark } from './utils/startup-metrics';
import './index.css';

startupMark('main.ts loaded');
installLongTaskObserver();

installAppGuards();
installNoTabFocus();
createApp(App).mount('#app');

startupMark('vue mount called');
void showMainWindowAfterFirstPaint();

window.setTimeout(() => {
  logRuntimeDiagnostics();
}, 3000);
