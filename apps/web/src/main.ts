import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initTheme } from './composables/useTheme';
import './assets/styles.css';

initTheme();

// 生产环境注册 Service Worker：静态资源预缓存，二次访问与弱网可用
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createApp(App).use(createPinia()).use(router).mount('#app');
