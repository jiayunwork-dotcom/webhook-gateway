import { writable, derived } from 'svelte/store';
import { ApiClient, authApi } from './api';

export interface Tenant {
  id: string;
  name: string;
  email: string;
  apiPublicKey: string;
  appCount: number;
  maxApps: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function createAuthStore() {
  const initialTenant = null;
  const initialToken = localStorage.getItem('auth_token');

  const token = writable<string | null>(initialToken);
  const tenant = writable<Tenant | null>(initialTenant);
  const loading = writable(false);
  const error = writable<string | null>(null);

  const isAuthenticated = derived([token, tenant], ([$t, $ten]) => !!$t && !!$ten);

  async function fetchMe() {
    if (!ApiClient.isAuthenticated()) return;
    try {
      loading.set(true);
      const data = await authApi.me();
      tenant.set(data);
    } catch (err: any) {
      console.error('Failed to fetch me:', err);
      ApiClient.logout();
      token.set(null);
      tenant.set(null);
    } finally {
      loading.set(false);
    }
  }

  async function login(email: string, password: string) {
    loading.set(true);
    error.set(null);
    try {
      const data = await authApi.login({ email, password });
      ApiClient.setAuth(data.accessToken);
      token.set(data.accessToken);
      tenant.set(data.tenant);
      return data;
    } catch (err: any) {
      error.set(err.message);
      throw err;
    } finally {
      loading.set(false);
    }
  }

  async function register(name: string, email: string, password: string) {
    loading.set(true);
    error.set(null);
    try {
      const data = await authApi.register({ name, email, password });
      ApiClient.setAuth(data.accessToken);
      token.set(data.accessToken);
      tenant.set(data.tenant);
      return data;
    } catch (err: any) {
      error.set(err.message);
      throw err;
    } finally {
      loading.set(false);
    }
  }

  function logout() {
    ApiClient.logout();
    token.set(null);
    tenant.set(null);
    error.set(null);
  }

  if (initialToken) {
    fetchMe();
  }

  return {
    token,
    tenant,
    loading,
    error,
    isAuthenticated,
    login,
    register,
    logout,
    fetchMe,
  };
}

export const auth = createAuthStore();

export const uiStore = (() => {
  const sidebarOpen = writable(true);
  const toast = writable<{ type: 'success' | 'error' | 'info'; message: string; id: number } | null>(null);
  let toastId = 0;

  function showToast(type: 'success' | 'error' | 'info', message: string) {
    toastId++;
    const id = toastId;
    toast.set({ type, message, id });
    setTimeout(() => {
      toast.update(t => (t && t.id === id ? null : t));
    }, 3500);
  }

  return {
    sidebarOpen,
    toast,
    showToast,
    success: (msg: string) => showToast('success', msg),
    error: (msg: string) => showToast('error', msg),
    info: (msg: string) => showToast('info', msg),
  };
})();

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelative(date: string | Date | undefined | null): string {
  if (!date) return '-';
  const d = new Date(date).getTime();
  const now = Date.now();
  const diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function statusColor(status: string): string {
  switch (status) {
    case 'healthy':
    case 'success':
    case 'delivered':
    case 'resolved':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'unhealthy':
    case 'failed':
    case 'dead_letter':
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'paused':
    case 'retrying':
    case 'processing':
    case 'pending':
    case 'warning':
    case 'acknowledged':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'active':
    case 'info':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

export function statusText(status: string): string {
  const map: Record<string, string> = {
    healthy: '健康',
    unhealthy: '异常',
    paused: '已暂停',
    success: '成功',
    failed: '失败',
    retrying: '重试中',
    dead_letter: '死信',
    delivered: '已投递',
    pending: '待处理',
    processing: '处理中',
    critical: '严重',
    warning: '警告',
    info: '提示',
    active: '活跃',
    acknowledged: '已确认',
    resolved: '已解决',
  };
  return map[status] || status;
}
