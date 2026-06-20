const API_BASE = import.meta.env.VITE_API_BASE || '';

interface RequestOptions extends RequestInit {
  auth?: boolean;
  headers?: Record<string, string>;
}

export class ApiClient {
  private static getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  private static saveToken(token: string) {
    localStorage.setItem('auth_token', token);
  }

  private static clearToken() {
    localStorage.removeItem('auth_token');
  }

  static async request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
    const { auth = true, headers = {}, ...rest } = options;
    const finalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (auth) {
      const token = this.getToken();
      if (token) {
        finalHeaders['Authorization'] = `Bearer ${token}`;
      }
    }
    const url = `${API_BASE}${path}`;
    try {
      const response = await fetch(url, {
        ...rest,
        headers: finalHeaders,
      });
      if (response.status === 401) {
        this.clearToken();
        if (typeof window !== 'undefined' && !path.includes('/api/auth/login')) {
          window.location.href = '/login';
        }
        throw new Error('Unauthorized');
      }
      let data: any = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      if (!response.ok) {
        const message = data?.message || data?.error || `HTTP ${response.status}`;
        throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
      }
      return data as T;
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('网络连接失败，请检查后端服务是否启动');
      }
      throw err;
    }
  }

  static get<T = any>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  static post<T = any>(path: string, body?: any, options?: RequestOptions) {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static put<T = any>(path: string, body?: any, options?: RequestOptions) {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  static delete<T = any>(path: string, options?: RequestOptions) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  static setAuth(token: string) {
    this.saveToken(token);
  }

  static logout() {
    this.clearToken();
  }

  static isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    ApiClient.post('/api/auth/register', data, { auth: false }),
  login: (data: { email: string; password: string }) =>
    ApiClient.post('/api/auth/login', data, { auth: false }),
  me: () => ApiClient.get('/api/auth/me'),
  rotateKeys: () => ApiClient.put('/api/auth/rotate-keys'),
};

export const appsApi = {
  list: () => ApiClient.get('/api/apps'),
  create: (data: any) => ApiClient.post('/api/apps', data),
  get: (id: string) => ApiClient.get(`/api/apps/${id}`),
  getStats: (id: string) => ApiClient.get(`/api/apps/${id}/stats`),
  update: (id: string, data: any) => ApiClient.put(`/api/apps/${id}`, data),
  remove: (id: string) => ApiClient.delete(`/api/apps/${id}`),
};

export const endpointsApi = {
  list: (appId?: string) =>
    ApiClient.get(`/api/endpoints${appId ? `?appId=${appId}` : ''}`),
  eventTypes: () => ApiClient.get('/api/endpoints/event-types'),
  create: (appId: string, data: any) =>
    ApiClient.post(`/api/endpoints/app/${appId}`, data),
  get: (id: string) => ApiClient.get(`/api/endpoints/${id}`),
  update: (id: string, data: any) => ApiClient.put(`/api/endpoints/${id}`, data),
  remove: (id: string) => ApiClient.delete(`/api/endpoints/${id}`),
};

export const eventsApi = {
  publish: (appId: string, data: any) =>
    ApiClient.post(`/api/events/app/${appId}/publish`, data),
  list: (appId: string, limit = 100, offset = 0) =>
    ApiClient.get(`/api/events/app/${appId}?limit=${limit}&offset=${offset}`),
  get: (id: string) => ApiClient.get(`/api/events/${id}`),
  testDelivery: (endpointId: string) =>
    ApiClient.post(`/api/events/test/${endpointId}`),
  manualTestDelivery: (endpointId: string, data: { eventType: string; payload: any }) =>
    ApiClient.post(`/api/events/test/${endpointId}/manual`, data),
};

export const metricsApi = {
  overview: (granularity = 'hour', startDate?: string, endDate?: string) => {
    let q = `granularity=${granularity}`;
    if (startDate) q += `&startDate=${startDate}`;
    if (endDate) q += `&endDate=${endDate}`;
    return ApiClient.get(`/api/metrics/overview?${q}`);
  },
  app: (appId: string, granularity = 'hour', startDate?: string, endDate?: string) => {
    let q = `granularity=${granularity}`;
    if (startDate) q += `&startDate=${startDate}`;
    if (endDate) q += `&endDate=${endDate}`;
    return ApiClient.get(`/api/metrics/app/${appId}?${q}`);
  },
  endpoint: (endpointId: string, granularity = 'hour', startDate?: string, endDate?: string) => {
    let q = `granularity=${granularity}`;
    if (startDate) q += `&startDate=${startDate}`;
    if (endDate) q += `&endDate=${endDate}`;
    return ApiClient.get(`/api/metrics/endpoint/${endpointId}?${q}`);
  },
};

export const logsApi = {
  endpointLogs: (endpointId: string, limit = 50) =>
    ApiClient.get(`/api/logs/endpoint/${endpointId}?limit=${limit}`),
  logDetail: (logId: string) => ApiClient.get(`/api/logs/${logId}`),
  listDeadLetters: (params?: any) => {
    const qs = new URLSearchParams(params || {}).toString();
    return ApiClient.get(`/api/dead-letters${qs ? '?' + qs : ''}`);
  },
  getDeadLetter: (id: string) => ApiClient.get(`/api/dead-letters/${id}`),
  resendDeadLetter: (id: string) =>
    ApiClient.post(`/api/dead-letters/${id}/resend`),
  bulkResendDeadLetters: (ids: string[]) =>
    ApiClient.post('/api/dead-letters/bulk-resend', { ids }),
  discardDeadLetter: (id: string) =>
    ApiClient.post(`/api/dead-letters/${id}/discard`),
  bulkDiscardDeadLetters: (ids: string[]) =>
    ApiClient.post('/api/dead-letters/bulk-discard', { ids }),
};

export const alertsApi = {
  list: (status?: string, limit = 100) =>
    ApiClient.get(`/api/alerts${status ? `?status=${status}` : ''}`),
  unreadCount: () => ApiClient.get('/api/alerts/unread-count'),
  acknowledge: (id: string) => ApiClient.put(`/api/alerts/${id}/acknowledge`),
  resolve: (id: string) => ApiClient.put(`/api/alerts/${id}/resolve`),
  listRules: () => ApiClient.get('/api/alerts/rules'),
  createRule: (data: any) => ApiClient.post('/api/alerts/rules', data),
  updateRule: (id: string, data: any) => ApiClient.put(`/api/alerts/rules/${id}`, data),
  deleteRule: (id: string) => ApiClient.delete(`/api/alerts/rules/${id}`),
};

export const replaysApi = {
  create: (data: { name: string; logIds: string[] }) =>
    ApiClient.post('/api/replays', data),
  list: (status?: string, limit = 100, offset = 0) => {
    let qs = `limit=${limit}&offset=${offset}`;
    if (status) qs += `&status=${status}`;
    return ApiClient.get(`/api/replays?${qs}`);
  },
  get: (id: string) => ApiClient.get(`/api/replays/${id}`),
  retryFailed: (id: string) =>
    ApiClient.post(`/api/replays/${id}/retry-failed`),
};
