<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import './app.css';
  import { Router, Route, navigate } from 'svelte-routing';
  import { auth, uiStore } from './lib/store';

  import LoginPage from './pages/Login.svelte';
  import RegisterPage from './pages/Register.svelte';
  import Dashboard from './pages/Dashboard.svelte';
  import AppsPage from './pages/Apps.svelte';
  import AppDetailPage from './pages/AppDetail.svelte';
  import EndpointsPage from './pages/Endpoints.svelte';
  import EndpointDetailPage from './pages/EndpointDetail.svelte';
  import LogsPage from './pages/Logs.svelte';
  import DeadLettersPage from './pages/DeadLetters.svelte';
  import AlertsPage from './pages/Alerts.svelte';
  import AlertRulesPage from './pages/AlertRules.svelte';
  import SettingsPage from './pages/Settings.svelte';
  import Toast from './components/Toast.svelte';

  let currentPath = '/';
  let sidebarCollapsed = false;
  let mounted = false;

  onMount(() => {
    mounted = true;
    currentPath = window.location.pathname;

    const unsub = uiStore.sidebarOpen.subscribe(v => {
      sidebarCollapsed = !v;
    });

    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('pushstate', onLocationChange);
    window.addEventListener('replacestate', onLocationChange);

    const origPush = history.pushState;
    history.pushState = function(...args) {
      const ret = origPush.apply(this, args);
      setTimeout(onLocationChange, 0);
      return ret;
    };
    const origReplace = history.replaceState;
    history.replaceState = function(...args) {
      const ret = origReplace.apply(this, args);
      setTimeout(onLocationChange, 0);
      return ret;
    };

    return () => {
      unsub();
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('pushstate', onLocationChange);
      window.removeEventListener('replacestate', onLocationChange);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  });

  afterUpdate(() => {
    if (mounted && currentPath !== window.location.pathname) {
      currentPath = window.location.pathname;
    }
  });

  function onLocationChange() {
    currentPath = window.location.pathname;
  }

  $: isAuthPage = currentPath === '/login' || currentPath === '/register';
  $: hasToken = !!$auth.token;
  $: user = $auth.tenant;

  $: {
    if (!mounted) continue;
    if (!hasToken && !isAuthPage) {
      setTimeout(() => navigate('/login', { replace: true }), 0);
    }
    if (hasToken && isAuthPage) {
      setTimeout(() => navigate('/', { replace: true }), 0);
    }
  }

  const navItems = [
    { path: '/', label: '概览', icon: '📊' },
    { path: '/apps', label: '应用管理', icon: '📱' },
    { path: '/endpoints', label: '接收端点', icon: '🔗' },
    { path: '/logs', label: '投递日志', icon: '📋' },
    { path: '/dead-letters', label: '死信队列', icon: '📬' },
    { path: '/alerts', label: '告警中心', icon: '🔔' },
    { path: '/alert-rules', label: '告警规则', icon: '⚙️' },
    { path: '/settings', label: '系统设置', icon: '🛠️' },
  ];

  function toggleSidebar() {
    uiStore.sidebarOpen.update(v => {
      sidebarCollapsed = !v;
      return !v;
    });
  }

  function onLogout() {
    auth.logout();
    navigate('/login');
    uiStore.success('已退出登录');
  }

  function isActive(path: string) {
    if (path === '/') return currentPath === '/';
    return currentPath.startsWith(path);
  }

  function goTo(path: string) {
    navigate(path, { replace: false });
    setTimeout(onLocationChange, 0);
  }
</script>

<Router>
  <Route path="/login" component="{LoginPage}" />
  <Route path="/register" component="{RegisterPage}" />

  {#if !isAuthPage}
    <div class="app-shell" class:sidebar-collapsed="{sidebarCollapsed}">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <div class="logo-icon">⚡</div>
            <div class="logo-text">
              <div class="logo-title">Webhook Gateway</div>
              <div class="logo-sub">事件分发平台</div>
            </div>
          </div>
          <button class="sidebar-toggle" on:click="{toggleSidebar}" title="收起/展开">
            {sidebarCollapsed ? '▶' : '◀'}
          </button>
        </div>

        <nav class="sidebar-nav">
          {#each navItems as item}
            <a
              href="{item.path}"
              class="nav-link"
              class:active="{isActive(item.path)}"
              on:click|preventDefault="{() => goTo(item.path)}"
            >
              <span class="nav-icon">{item.icon}</span>
              <span class="nav-label">{item.label}</span>
            </a>
          {/each}
        </nav>

        {#if user}
          <div class="sidebar-footer">
            <div class="user-info">
              <div class="user-avatar">{user.name?.charAt(0)?.toUpperCase() || 'U'}</div>
              <div class="user-meta">
                <div class="user-name">{user.name}</div>
                <div class="user-email text-xs text-muted">{user.email}</div>
              </div>
            </div>
            <button class="logout-btn" on:click="{onLogout}">退出</button>
          </div>
        {/if}
      </aside>

      <main class="main-content">
        <header class="topbar">
          <div class="topbar-left">
            <button class="icon-btn" on:click="{toggleSidebar}" title="菜单">
              ☰
            </button>
            <div class="breadcrumb">
              <span>Webhook Gateway</span>
              <span class="sep">/</span>
              <span class="current">
                {navItems.find(n => currentPath === n.path || (currentPath.startsWith(n.path) && n.path !== '/'))?.label || '概览'}
              </span>
            </div>
          </div>
          <div class="topbar-right">
            <button class="icon-btn" title="告警" on:click="{() => goTo('/alerts')}">
              🔔
            </button>
          </div>
        </header>

        <div class="content-wrapper">
          <Route path="/" component="{Dashboard}" />
          <Route path="/apps" component="{AppsPage}" />
          <Route path="/apps/:id" component="{AppDetailPage}" />
          <Route path="/endpoints" component="{EndpointsPage}" />
          <Route path="/endpoints/:id" component="{EndpointDetailPage}" />
          <Route path="/logs" component="{LogsPage}" />
          <Route path="/dead-letters" component="{DeadLettersPage}" />
          <Route path="/alerts" component="{AlertsPage}" />
          <Route path="/alert-rules" component="{AlertRulesPage}" />
          <Route path="/settings" component="{SettingsPage}" />
        </div>
      </main>
    </div>
  {/if}
</Router>

<Toast />

<style>
  .app-shell {
    display: flex;
    min-height: 100vh;
    min-width: 100vw;
  }
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow: auto;
    transition: width 0.2s ease;
  }
  .app-shell.sidebar-collapsed .sidebar { width: 72px; }
  .sidebar-header {
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }
  .logo { display: flex; align-items: center; gap: 0.75rem; flex: 1; overflow: hidden; }
  .logo-icon {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    color: white;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
  }
  .logo-text { overflow: hidden; }
  .logo-title { font-weight: 700; font-size: 0.9375rem; white-space: nowrap; }
  .logo-sub { font-size: 0.6875rem; color: var(--color-text-muted); white-space: nowrap; }
  .app-shell.sidebar-collapsed .logo-text,
  .app-shell.sidebar-collapsed .nav-label,
  .app-shell.sidebar-collapsed .user-meta,
  .app-shell.sidebar-collapsed .logout-btn { display: none; }
  .sidebar-toggle {
    width: 28px; height: 28px;
    border: none; background: transparent;
    cursor: pointer; color: var(--color-text-muted);
    border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
  }
  .sidebar-toggle:hover { background: var(--color-bg); color: var(--color-text); }
  .app-shell.sidebar-collapsed .sidebar-header { justify-content: center; }
  .app-shell.sidebar-collapsed .sidebar-toggle { order: -1; }

  .sidebar-nav { padding: 0.5rem; flex: 1; }
  .nav-link {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.625rem 0.875rem;
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    font-weight: 500;
    font-size: 0.875rem;
    text-decoration: none;
    margin-bottom: 0.125rem;
    transition: all var(--transition);
  }
  .nav-link:hover { background: var(--color-bg); color: var(--color-text); }
  .nav-link.active {
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-primary);
  }
  .nav-icon { width: 20px; text-align: center; flex-shrink: 0; }
  .app-shell.sidebar-collapsed .nav-link {
    justify-content: center; padding: 0.625rem;
  }

  .sidebar-footer {
    padding: 1rem;
    border-top: 1px solid var(--color-border);
  }
  .user-info {
    display: flex; align-items: center; gap: 0.625rem;
    margin-bottom: 0.75rem;
  }
  .app-shell.sidebar-collapsed .user-info { justify-content: center; }
  .user-avatar {
    width: 36px; height: 36px;
    background: linear-gradient(135deg, #8b5cf6, #ec4899);
    color: white;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 0.875rem;
    flex-shrink: 0;
  }
  .user-name { font-weight: 500; font-size: 0.875rem; }
  .user-email { font-size: 0.75rem; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .logout-btn {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border-dark);
    background: transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    transition: all var(--transition);
  }
  .logout-btn:hover { background: #fef2f2; color: var(--color-danger); border-color: #fecaca; }

  .main-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .topbar {
    height: 56px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 0 1.5rem;
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 100;
  }
  .topbar-left { display: flex; align-items: center; gap: 0.75rem; }
  .topbar-right { display: flex; align-items: center; gap: 0.5rem; }
  .icon-btn {
    width: 36px; height: 36px;
    border: none; background: transparent;
    cursor: pointer;
    border-radius: var(--radius-sm);
    display: flex; align-items: center; justify-content: center;
    font-size: 1rem;
    color: var(--color-text-muted);
    transition: all var(--transition);
  }
  .icon-btn:hover { background: var(--color-bg); color: var(--color-text); }
  .breadcrumb {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.875rem; color: var(--color-text-muted);
  }
  .breadcrumb .sep { opacity: 0.5; }
  .breadcrumb .current { color: var(--color-text); font-weight: 500; }

  .content-wrapper {
    padding: 1.5rem 2rem;
    flex: 1;
    max-width: 1600px;
    width: 100%;
    margin: 0 auto;
  }

  @media (max-width: 1024px) {
    .sidebar { position: fixed; z-index: 200; transform: translateX(-100%); }
    .app-shell:not(.sidebar-collapsed) .sidebar { transform: translateX(0); }
    .content-wrapper { padding: 1rem; }
    .topbar { padding: 0 1rem; }
  }
</style>
