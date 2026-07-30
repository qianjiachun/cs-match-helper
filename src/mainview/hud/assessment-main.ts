import { createApp } from 'vue';
import CounterStrafingAssessmentHudApp from './CounterStrafingAssessmentHudApp.vue';
import { installHudGuards } from './hud-guards';
import { i18n, currentLocale, setDocumentLocale } from '../i18n';
import '../index.css';
import './hud.css';

installHudGuards();
setDocumentLocale(currentLocale());
createApp(CounterStrafingAssessmentHudApp).use(i18n).mount('#app');
