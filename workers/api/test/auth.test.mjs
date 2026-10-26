import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnv,
  createClient,
  expectOk,
  expectStatus,
  setupAdmin,
  createInvite,
  registerUser,
  ADMIN,
} from './harness.mjs';

test('邀请码注册：正确邀请码成功，错误邀请码失败', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin, { maxUses: 1 });

  const okClient = createClient(env);
  const registered = await okClient.post('/api/v1/auth/register', {
    username: 'alice_001',
    password: 'AlicePass123',
    confirmPassword: 'AlicePass123',
    inviteCode: code,
  });
  const data = expectOk(registered, '注册');
  assert.equal(data.user.username, 'alice_001');
  assert.equal(data.user.role, 'user');
  assert.equal(typeof data.csrfToken, 'string');

  const setCookie = registered.headers.getSetCookie().join(';');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);

  const badClient = createClient(env);
  const bad = await badClient.post('/api/v1/auth/register', {
    username: 'bob_002',
    password: 'BobPass12345',
    confirmPassword: 'BobPass12345',
    inviteCode: 'QZ-0000-0000-0000',
  });
  expectStatus(bad, 400);
});

test('邀请码次数用尽后不能再次注册', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin, { maxUses: 1 });
  await registerUser(env, code, 'first_user');

  const second = createClient(env);
  const result = await second.post('/api/v1/auth/register', {
    username: 'second_user',
    password: 'SecondPass123',
    confirmPassword: 'SecondPass123',
    inviteCode: code,
  });
  const error = expectStatus(result, 400);
  assert.match(error.message, /邀请码/);
});

test('并发注册不会突破邀请码使用次数', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin, { maxUses: 2 });

  const attempts = Array.from({ length: 5 }, (_, index) => {
    const client = createClient(env);
    return client.post('/api/v1/auth/register', {
      username: `concurrent_${index}`,
      password: 'Concurrent123',
      confirmPassword: 'Concurrent123',
      inviteCode: code,
    });
  });
  const results = await Promise.all(attempts);
  const success = results.filter((item) => item.status === 201 || item.status === 200);
  assert.equal(success.length, 2, '邀请码 maxUses=2 时只能成功注册 2 人');

  const used = await env.DB.prepare('SELECT used_count, max_uses FROM invitations').first();
  assert.equal(used.used_count, 2);
  assert.equal(used.max_uses, 2);
});

test('重复用户名注册失败且不会消耗邀请码', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin, { maxUses: 5 });
  await registerUser(env, code, 'duplicate_user');

  const client = createClient(env);
  const result = await client.post('/api/v1/auth/register', {
    username: 'duplicate_user',
    password: 'AnotherPass123',
    confirmPassword: 'AnotherPass123',
    inviteCode: code,
  });
  expectStatus(result, 409);
  const invitation = await env.DB.prepare('SELECT used_count FROM invitations').first();
  assert.equal(invitation.used_count, 1, '失败注册不应占用邀请码名额');
});

test('登录：正确密码成功，错误密码失败；退出后会话失效', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client } = await registerUser(env, code, 'login_user', 'LoginPass123');

  const loginClient = createClient(env);
  const login = await loginClient.post('/api/v1/auth/login', { username: 'login_user', password: 'LoginPass123' });
  expectOk(login, '登录');

  const wrongClient = createClient(env);
  const wrong = await wrongClient.post('/api/v1/auth/login', { username: 'login_user', password: 'WrongPass123' });
  const error = expectStatus(wrong, 401);
  assert.match(error.message, /用户名或密码/);

  const me = await loginClient.get('/api/v1/auth/me');
  expectOk(me, '登录后可访问 /me');

  const logout = await loginClient.post('/api/v1/auth/logout', {});
  expectOk(logout, '退出');

  expectStatus(await loginClient.get('/api/v1/users/me'), 401);
  expectStatus(await loginClient.get('/api/v1/auth/me'), 401);
});

test('不存在的用户名与错误密码返回相同提示，减少枚举', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  await registerUser(env, code, 'enum_user', 'EnumPass123');

  const a = createClient(env);
  const unknown = await a.post('/api/v1/auth/login', { username: 'not_exists_user', password: 'SomePass123' });
  const b = createClient(env);
  const wrong = await b.post('/api/v1/auth/login', { username: 'enum_user', password: 'SomePass123' });
  expectStatus(unknown, 401);
  expectStatus(wrong, 401);
  assert.equal(unknown.data.error.message, wrong.data.error.message);
});

test('禁用账号后立即阻止受保护请求，且旧会话失效', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'disabled_user', 'Disabled123');

  expectOk(await user.get('/api/v1/users/me'), '禁用前可访问');
  const users = expectOk(await admin.get('/api/v1/admin/users?q=disabled_user'));
  const target = users.find((item) => item.username === 'disabled_user');
  assert.ok(target);
  expectOk(await admin.post(`/api/v1/admin/users/${target.id}/disable`, {}), '禁用');

  expectStatus(await user.get('/api/v1/users/me'), 401);
  const login = createClient(env);
  expectStatus(await login.post('/api/v1/auth/login', { username: 'disabled_user', password: 'Disabled123' }), 401);
});

test('CSRF：缺少令牌的写请求被拒绝，读请求不受影响', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'csrf_user', 'CsrfPass123');

  expectOk(await user.get('/api/v1/users/me'), 'GET 不要求 CSRF');
  const blocked = await user.post('/api/v1/favorites/some_question', {}, { csrf: false });
  const error = expectStatus(blocked, 403);
  assert.equal(error.code, 'CSRF_FAILED');
});

test('管理员初始化只能执行一次且必须带令牌', async () => {
  const env = buildEnv();
  const client = createClient(env);
  const noToken = await client.post('/api/v1/admin/bootstrap', { username: 'admin_x', password: 'AdminPass123' });
  expectStatus(noToken, 403);

  const withToken = await client.post(
    '/api/v1/admin/bootstrap',
    { username: 'admin_x', password: 'AdminPass123' },
    { headers: { 'x-setup-token': env.ADMIN_SETUP_TOKEN } },
  );
  expectOk(withToken, '初始化管理员');

  const again = await client.post(
    '/api/v1/admin/bootstrap',
    { username: 'admin_y', password: 'AdminPass123' },
    { headers: { 'x-setup-token': env.ADMIN_SETUP_TOKEN } },
  );
  expectStatus(again, 409);
});

test('密码重置：旧会话失效，首次登录必须先改密码', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  const { client: user } = await registerUser(env, code, 'reset_user', 'ResetPass123');
  const users = expectOk(await admin.get('/api/v1/admin/users?q=reset_user'));
  const target = users.find((item) => item.username === 'reset_user');

  const reset = expectOk(await admin.post(`/api/v1/admin/users/${target.id}/reset-password`, {}), '重置密码');
  assert.ok(reset.initialPassword.length >= 12);
  assert.equal(JSON.stringify(reset).includes('ResetPass123'), false);

  expectStatus(await user.get('/api/v1/users/me'), 401);

  const fresh = createClient(env);
  const login = await fresh.post('/api/v1/auth/login', { username: 'reset_user', password: reset.initialPassword });
  const session = expectOk(login, '使用初始密码登录');
  assert.equal(session.user.mustChangePassword, true);

  const blocked = await fresh.get('/api/v1/users/me');
  const blockedError = expectStatus(blocked, 403);
  assert.equal(blockedError.code, 'PASSWORD_CHANGE_REQUIRED');

  const changed = await fresh.post('/api/v1/auth/change-password', {
    currentPassword: reset.initialPassword,
    newPassword: 'BrandNewPass123',
    confirmPassword: 'BrandNewPass123',
  });
  expectOk(changed, '修改密码');
  expectOk(await fresh.get('/api/v1/users/me'), '改密后可正常访问');

  const oldPassword = createClient(env);
  expectStatus(await oldPassword.post('/api/v1/auth/login', { username: 'reset_user', password: reset.initialPassword }), 401);
  expectOk(await createClient(env).post('/api/v1/auth/login', { username: 'reset_user', password: 'BrandNewPass123' }), '新密码登录');
});

test('登录频率限制：短时间内多次失败返回 429', async () => {
  const env = buildEnv();
  const admin = await setupAdmin(env);
  const code = await createInvite(admin);
  await registerUser(env, code, 'limit_user', 'LimitPass123');

  const client = createClient(env);
  let lastStatus = 0;
  for (let i = 0; i < 12; i += 1) {
    const result = await client.post('/api/v1/auth/login', { username: 'limit_user', password: 'bad-password' });
    lastStatus = result.status;
  }
  assert.equal(lastStatus, 429, `连续失败应触发限流，最后状态 ${lastStatus}`);
});
