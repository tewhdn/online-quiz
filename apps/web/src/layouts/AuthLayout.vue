<script setup lang="ts">
import { RouterView } from 'vue-router';
import { BookOpenCheck, ClipboardCheck, LineChart } from '@lucide/vue';
import BrandMark from '../components/BrandMark.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();

const points = [
  { icon: BookOpenCheck, text: '按科目、分类、知识点逐题练习' },
  { icon: ClipboardCheck, text: '模拟考试、服务端判分与成绩分析' },
  { icon: LineChart, text: '错题本、收藏与个人学习统计' },
];
</script>

<template>
  <div class="auth-shell">
    <div class="auth-panel">
      <aside class="auth-aside">
        <div class="auth-aside-brand">
          <BrandMark />
          <span>{{ auth.siteName }}</span>
        </div>
        <div class="auth-aside-copy">
          <h1>专注练习，<br />把每一道题弄懂。</h1>
          <p class="auth-aside-desc">
            面向日常学习与模拟考试的轻量答题系统。题库、考试和用户由管理员统一维护。
          </p>
          <ul class="auth-points">
            <li v-for="point in points" :key="point.text">
              <component :is="point.icon" :size="18" :stroke-width="1.8" />
              <span>{{ point.text }}</span>
            </li>
          </ul>
        </div>
        <p class="auth-aside-foot">邀请码注册 · 无需邮箱验证 · 数据保存在云端</p>
      </aside>

      <section class="auth-card">
        <div class="auth-card-head">
          <BrandMark />
          <div>
            <strong>{{ auth.siteName }}</strong>
            <p class="tiny muted">登录后开始练习</p>
          </div>
        </div>
        <RouterView />
      </section>
    </div>
  </div>
</template>
