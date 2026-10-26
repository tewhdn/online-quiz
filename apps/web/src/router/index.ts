import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import DefaultLayout from '../layouts/DefaultLayout.vue';
import AdminLayout from '../layouts/AdminLayout.vue';
import AuthLayout from '../layouts/AuthLayout.vue';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/auth',
    component: AuthLayout,
    children: [
      { path: 'login', name: 'login', component: () => import('../views/auth/LoginView.vue'), meta: { guest: true, title: '登录' } },
      { path: 'register', name: 'register', component: () => import('../views/auth/RegisterView.vue'), meta: { guest: true, title: '注册' } },
      { path: '', redirect: '/auth/login' },
    ],
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: () => import('../views/auth/ChangePasswordView.vue'),
    meta: { requiresAuth: true, bare: true, title: '修改密码' },
  },
  {
    path: '/',
    component: DefaultLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'home', component: () => import('../views/dashboard/HomeView.vue'), meta: { title: '首页' } },
      { path: 'practice', name: 'practice', component: () => import('../views/practice/PracticeSetupView.vue'), meta: { title: '刷题' } },
      {
        path: 'practice/session/:id',
        name: 'practice-session',
        component: () => import('../views/practice/PracticeSessionView.vue'),
        meta: { title: '答题中' },
      },
      { path: 'exams', name: 'exams', component: () => import('../views/exams/ExamListView.vue'), meta: { title: '模拟考试' } },
      { path: 'exams/:id', name: 'exam-detail', component: () => import('../views/exams/ExamDetailView.vue'), meta: { title: '考试详情' } },
      { path: 'exam-attempts/:id', name: 'exam-take', component: () => import('../views/exams/ExamTakeView.vue'), meta: { title: '考试中' } },
      {
        path: 'exam-attempts/:id/result',
        name: 'exam-result',
        component: () => import('../views/exams/ExamResultView.vue'),
        meta: { title: '考试成绩' },
      },
      { path: 'mistakes', name: 'mistakes', component: () => import('../views/mistakes/MistakesView.vue'), meta: { title: '错题本' } },
      { path: 'favorites', name: 'favorites', component: () => import('../views/favorites/FavoritesView.vue'), meta: { title: '我的收藏' } },
      { path: 'profile', name: 'profile', component: () => import('../views/profile/ProfileView.vue'), meta: { title: '个人中心' } },
    ],
  },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('../views/admin/AdminDashboard.vue'), meta: { title: '仪表盘' } },
      { path: 'users', name: 'admin-users', component: () => import('../views/admin/AdminUsers.vue'), meta: { title: '用户管理' } },
      { path: 'invites', name: 'admin-invites', component: () => import('../views/admin/AdminInvites.vue'), meta: { title: '邀请码管理' } },
      { path: 'questions', name: 'admin-questions', component: () => import('../views/admin/AdminQuestions.vue'), meta: { title: '题库管理' } },
      { path: 'questions/new', name: 'admin-question-new', component: () => import('../views/admin/AdminQuestionEdit.vue'), meta: { title: '新建题目' } },
      {
        path: 'questions/:id/edit',
        name: 'admin-question-edit',
        component: () => import('../views/admin/AdminQuestionEdit.vue'),
        meta: { title: '编辑题目' },
      },
      { path: 'import', name: 'admin-import', component: () => import('../views/admin/AdminImport.vue'), meta: { title: '批量导入题库' } },
      { path: 'ai', name: 'admin-ai', component: () => import('../views/admin/AdminAiGenerate.vue'), meta: { title: 'AI 出题中心' } },
      { path: 'ai/review', name: 'admin-ai-review', component: () => import('../views/admin/AdminAiReview.vue'), meta: { title: 'AI 题目审核' } },
      { path: 'exams', name: 'admin-exams', component: () => import('../views/admin/AdminExams.vue'), meta: { title: '考试管理' } },
      { path: 'exams/new', name: 'admin-exam-new', component: () => import('../views/admin/AdminExamEdit.vue'), meta: { title: '创建考试' } },
      {
        path: 'exams/:id/edit',
        name: 'admin-exam-edit',
        component: () => import('../views/admin/AdminExamEdit.vue'),
        meta: { title: '编辑考试' },
      },
      {
        path: 'exams/:id/results',
        name: 'admin-exam-results',
        component: () => import('../views/admin/AdminExamResults.vue'),
        meta: { title: '考试成绩' },
      },
      {
        path: 'announcements',
        name: 'admin-announcements',
        component: () => import('../views/admin/AdminAnnouncements.vue'),
        meta: { title: '公告管理' },
      },
      { path: 'logs', name: 'admin-logs', component: () => import('../views/admin/AdminLogs.vue'), meta: { title: '操作日志' } },
      { path: 'settings', name: 'admin-settings', component: () => import('../views/admin/AdminSettings.vue'), meta: { title: '系统设置' } },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.initialized) await auth.init();

  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') {
    return { name: 'home' };
  }
  if (auth.user?.mustChangePassword && to.name !== 'change-password' && to.name !== 'login') {
    return { name: 'change-password' };
  }
  if (to.meta.guest && auth.user) {
    return auth.user.mustChangePassword ? { name: 'change-password' } : { name: 'home' };
  }
  return true;
});

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? '';
  document.title = title ? `${title} · 智能答题系统` : '智能答题系统';
});

export default router;
