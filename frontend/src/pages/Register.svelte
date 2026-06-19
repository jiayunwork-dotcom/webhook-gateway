<script lang="ts">
  import { navigate, Link } from 'svelte-routing';
  import { auth, uiStore } from '../lib/store';

  let name = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let loading = false;
  let error = '';

  async function onSubmit(e: Event) {
    e.preventDefault();
    error = '';
    if (!name || name.length < 2) {
      error = '租户名称至少 2 个字符';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      error = '请输入有效的邮箱地址';
      return;
    }
    if (password.length < 8) {
      error = '密码至少 8 位字符';
      return;
    }
    if (password !== confirmPassword) {
      error = '两次输入的密码不一致';
      return;
    }
    loading = true;
    try {
      await auth.register(name.trim(), email.trim(), password);
      uiStore.success('注册成功');
      navigate('/', { replace: true });
    } catch (err: any) {
      error = err.message || '注册失败';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-bg"></div>
  <div class="auth-card card">
    <div class="auth-logo">
      <div class="logo-icon-lg">⚡</div>
      <h1 class="auth-title">创建租户</h1>
      <p class="auth-subtitle">注册以开始使用 Webhook Gateway</p>
    </div>

    <form on:submit="{onSubmit}">
      <div class="form-group">
        <label class="form-label" for="name">租户名称</label>
        <input id="name" type="text" class="form-input" bind:value="{name}" placeholder="您的公司或团队名称" />
      </div>
      <div class="form-group">
        <label class="form-label" for="email">邮箱地址</label>
        <input id="email" type="email" class="form-input" bind:value="{email}" placeholder="your@company.com" />
      </div>
      <div class="form-group">
        <label class="form-label" for="password">设置密码</label>
        <input id="password" type="password" class="form-input" bind:value="{password}" placeholder="至少 8 位字符" />
      </div>
      <div class="form-group">
        <label class="form-label" for="confirm">确认密码</label>
        <input id="confirm" type="password" class="form-input" bind:value="{confirmPassword}" placeholder="再次输入密码" />
      </div>

      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}

      <button type="submit" class="btn btn-primary btn-block btn-lg" disabled="{loading}">
        {loading ? '注册中...' : '创建租户'}
      </button>
    </form>

    <div class="auth-footer">
      已有账号？
      <Link to="/login">立即登录</Link>
    </div>
  </div>
</div>

<style>
  .auth-page {
    min-height: 100vh;
    min-width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    position: relative;
    overflow: hidden;
  }
  .auth-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 20% 20%, rgba(99, 102, 241, 0.15), transparent 40%),
      radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.15), transparent 40%),
      linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
  }
  .auth-card {
    position: relative;
    width: 100%;
    max-width: 440px;
    padding: 2.5rem;
  }
  .auth-logo { text-align: center; margin-bottom: 2rem; }
  .logo-icon-lg {
    width: 64px; height: 64px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    color: white;
    border-radius: 16px;
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem;
    margin: 0 auto 1rem;
    box-shadow: 0 10px 25px rgba(99, 102, 241, 0.3);
  }
  .auth-title { font-size: 1.5rem; margin: 0; font-weight: 700; }
  .auth-subtitle { color: var(--color-text-muted); margin: 0.25rem 0 0; font-size: 0.9375rem; }
  .alert-error {
    padding: 0.625rem 0.875rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
    border-radius: var(--radius-sm);
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  .auth-footer {
    text-align: center;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }
</style>
