import { createApp } from 'vue';
import CounterStrafingAssessmentHudApp from './CounterStrafingAssessmentHudApp.vue';
import { installHudGuards } from './hud-guards';
import '../index.css';
import './hud.css';

installHudGuards();
createApp(CounterStrafingAssessmentHudApp).mount('#app');
