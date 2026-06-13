import { createApp } from 'vue';
import App from './App.vue';
import { installAppGuards } from './utils/app-guards';
import { installNoTabFocus } from './utils/no-tab-focus';
import { logRuntimeDiagnostics } from './utils/runtime-diagnostics';
import './index.css';

installAppGuards();
installNoTabFocus();
logRuntimeDiagnostics();
createApp(App).mount('#app');
