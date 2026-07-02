import { createApp } from 'vue';
import CounterStrafingHudApp from './CounterStrafingHudApp.vue';
import { installHudGuards } from './hud-guards';
import '../index.css';
import './hud.css';

installHudGuards();
createApp(CounterStrafingHudApp).mount('#app');
