<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { io, Socket } from 'socket.io-client';
  import { auth } from '../lib/store';
  import { notificationsApi, endpointsApi } from '../lib/api';

  interface DeliveryNotification {
    eventType: string;
    endpointName: string;
    status: 'success' | 'failed' | 'timeout';
    responseStatus?: number;
    durationMs: number;
    timestamp: string;
  }

  interface HistoryItem {
    id: string;
    eventType: string;
    endpointName: string;
    status: 'success' | 'failed' | 'timeout';
    responseStatus: number | null;
    durationMs: number;
    endpointId: string | null;
    createdAt: string;
  }

  interface EndpointOption {
    id: string;
    name: string;
    url: string;
  }

  type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

  let notifications: DeliveryNotification[] = [];
  let connectionStatus: ConnectionStatus = 'disconnected';
  let socket: Socket | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let missedPongs = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let maxReconnectDelay = 60000;
  let listContainer: HTMLElement;
  let notificationCount = 0;
  let destroyed = false;

  let showRulePanel = false;
  let ruleLoading = false;
  let ruleSaving = false;
  let endpointOptions: EndpointOption[] = [];
  let selectedEndpointIds: Set<string> = new Set();
  let selectedStatusFilters: Set<'success' | 'failed' | 'timeout'> = new Set();

  let showHistory = false;
  let historyLoading = false;
  let historyItems: HistoryItem[] = [];
  let historyTotal = 0;
  let historyPage = 1;
  let historyPageSize = 20;
  let historyTotalPages = 1;
  let historyTimeRange: 'today' | '3days' | '7days' = '7days';
  let historyStatusFilter: '' | 'success' | 'failed' | 'timeout' = '';

  const MAX_NOTIFICATIONS = 200;
  const PING_INTERVAL = 30000;
  const MAX_MISSED_PONGS = 3;

  function getWsUrl(): string {
    const base = window.location.origin;
    return base;
  }

  function cleanupAll() {
    destroyed = true;
    stopHeartbeat();
    clearReconnect();
    if (socket) {
      try {
        socket.removeAllListeners('connect');
        socket.removeAllListeners('welcome');
        socket.removeAllListeners('delivery_notification');
        socket.removeAllListeners('pong');
        socket.removeAllListeners('error');
        socket.removeAllListeners('disconnect');
        socket.removeAllListeners('connect_error');
        socket.disconnect();
      } catch (e) {
        console.error('Error disconnecting socket:', e);
      }
      socket = null;
    }
  }

  function connect() {
    if (destroyed) return;
    if (socket && socket.connected) return;

    connectionStatus = 'connecting';
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    socket = io(getWsUrl(), {
      path: '/ws',
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
      forceNew: true,
    });

    socket.on('connect', () => {
      if (destroyed) return;
      connectionStatus = 'connected';
      missedPongs = 0;
      reconnectAttempts = 0;
      startHeartbeat();
    });

    socket.on('welcome', (data: any) => {
      if (destroyed) return;
      console.log('WebSocket welcome:', data);
    });

    socket.on('delivery_notification', (notification: DeliveryNotification) => {
      if (destroyed) return;
      notifications = [notification, ...notifications];
      if (notifications.length > MAX_NOTIFICATIONS) {
        notifications = notifications.slice(0, MAX_NOTIFICATIONS);
      }
      notificationCount++;
      requestAnimationFrame(() => {
        if (listContainer) {
          listContainer.scrollTop = 0;
        }
      });
    });

    socket.on('pong', () => {
      if (destroyed) return;
      missedPongs = 0;
    });

    socket.on('error', (err: any) => {
      if (destroyed) return;
      console.error('WebSocket error:', err);
    });

    socket.on('disconnect', (reason: string) => {
      if (destroyed) return;
      connectionStatus = 'disconnected';
      stopHeartbeat();
      scheduleReconnect();
    });

    socket.on('connect_error', (err: any) => {
      if (destroyed) return;
      console.error('WebSocket connect error:', err);
      connectionStatus = 'disconnected';
      scheduleReconnect();
    });
  }

  function startHeartbeat() {
    stopHeartbeat();
    missedPongs = 0;
    pingInterval = setInterval(() => {
      if (destroyed) return;
      if (socket && socket.connected) {
        missedPongs++;
        if (missedPongs >= MAX_MISSED_PONGS) {
          console.warn('Max missed pongs reached, disconnecting');
          connectionStatus = 'disconnected';
          stopHeartbeat();
          try {
            socket.disconnect();
          } catch (e) { /* ignore */ }
          scheduleReconnect();
          return;
        }
        socket.emit('ping');
      }
    }, PING_INTERVAL);
  }

  function stopHeartbeat() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function scheduleReconnect() {
    if (destroyed) return;
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (destroyed) return;
      reconnectAttempts++;
      connect();
    }, delay);
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function clearNotifications() {
    notifications = [];
    notificationCount = 0;
  }

  function statusBackgroundColor(status: string): string {
    switch (status) {
      case 'success': return 'rgba(16, 185, 129, 0.1)';
      case 'failed': return 'rgba(239, 68, 68, 0.1)';
      case 'timeout': return 'rgba(245, 158, 11, 0.1)';
      default: return 'transparent';
    }
  }

  function statusBorderColor(status: string): string {
    switch (status) {
      case 'success': return 'rgba(16, 185, 129, 0.3)';
      case 'failed': return 'rgba(239, 68, 68, 0.3)';
      case 'timeout': return 'rgba(245, 158, 11, 0.3)';
      default: return 'var(--color-border)';
    }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'success': return '成功';
      case 'failed': return '失败';
      case 'timeout': return '超时';
      default: return status;
    }
  }

  function statusDotColor(status: string): string {
    switch (status) {
      case 'success': return '#10b981';
      case 'failed': return '#ef4444';
      case 'timeout': return '#f59e0b';
      default: return '#64748b';
    }
  }

  function formatTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatDate(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    });
  }

  function formatDateTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  async function loadRulePanel() {
    showRulePanel = !showRulePanel;
    if (!showRulePanel) return;

    ruleLoading = true;
    try {
      const [rules, endpoints] = await Promise.all([
        notificationsApi.getRules(),
        endpointsApi.list(),
      ]);

      endpointOptions = (endpoints || []).map((e: any) => ({
        id: e.id,
        name: e.name,
        url: e.url,
      }));

      selectedEndpointIds = new Set(rules.endpointIds || []);
      selectedStatusFilters = new Set(rules.statusFilters || []);
    } catch (err: any) {
      console.error('Failed to load rule settings:', err);
    } finally {
      ruleLoading = false;
    }
  }

  function toggleEndpoint(endpointId: string) {
    if (selectedEndpointIds.has(endpointId)) {
      selectedEndpointIds.delete(endpointId);
    } else {
      selectedEndpointIds.add(endpointId);
    }
    selectedEndpointIds = new Set(selectedEndpointIds);
  }

  function toggleStatusFilter(status: 'success' | 'failed' | 'timeout') {
    if (selectedStatusFilters.has(status)) {
      selectedStatusFilters.delete(status);
    } else {
      selectedStatusFilters.add(status);
    }
    selectedStatusFilters = new Set(selectedStatusFilters);
  }

  async function saveRules() {
    ruleSaving = true;
    try {
      await notificationsApi.saveRules({
        endpointIds: selectedEndpointIds.size > 0 ? Array.from(selectedEndpointIds) : null,
        statusFilters: selectedStatusFilters.size > 0 ? Array.from(selectedStatusFilters) : null,
      });
      showRulePanel = false;
    } catch (err: any) {
      console.error('Failed to save rules:', err);
    } finally {
      ruleSaving = false;
    }
  }

  function getDateRange(range: 'today' | '3days' | '7days'): { startDate: string; endDate: string } {
    const now = new Date();
    const endDate = now.toISOString();
    const startDate = new Date();
    switch (range) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case '3days':
        startDate.setDate(startDate.getDate() - 3);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '7days':
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
    }
    return { startDate: startDate.toISOString(), endDate };
  }

  async function loadHistory() {
    historyLoading = true;
    try {
      const { startDate, endDate } = getDateRange(historyTimeRange);
      const result = await notificationsApi.getHistory({
        startDate,
        endDate,
        status: historyStatusFilter || undefined,
        page: historyPage,
        pageSize: historyPageSize,
      });
      historyItems = result.items || [];
      historyTotal = result.total;
      historyTotalPages = result.totalPages;
    } catch (err: any) {
      console.error('Failed to load history:', err);
      historyItems = [];
    } finally {
      historyLoading = false;
    }
  }

  function toggleHistory() {
    showHistory = !showHistory;
    if (showHistory) {
      historyPage = 1;
      loadHistory();
    }
  }

  function onTimeRangeChange(range: 'today' | '3days' | '7days') {
    historyTimeRange = range;
    historyPage = 1;
    loadHistory();
  }

  function onStatusFilterChange(status: '' | 'success' | 'failed' | 'timeout') {
    historyStatusFilter = status;
    historyPage = 1;
    loadHistory();
  }

  function onPrevPage() {
    if (historyPage > 1) {
      historyPage--;
      loadHistory();
    }
  }

  function onNextPage() {
    if (historyPage < historyTotalPages) {
      historyPage++;
      loadHistory();
    }
  }

  onMount(() => {
    destroyed = false;
    connect();
  });

  onDestroy(() => {
    cleanupAll();
  });
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">实时通知中心</h1>
    <p class="text-muted mb-0">实时查看投递事件结果推送</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary" on:click={loadRulePanel}>
      ⚙️ 规则设置
    </button>
    <span class="badge notification-count" style="background: var(--color-primary); color: white;">
      {notificationCount} 条通知
    </span>
  </div>
</div>

{#if showRulePanel}
  <div class="rule-panel">
    <div class="rule-panel-header">
      <h3 class="rule-panel-title">通知规则设置</h3>
      <button class="btn btn-ghost btn-sm" on:click={() => showRulePanel = false}>✕</button>
    </div>

    {#if ruleLoading}
      <div class="rule-panel-loading">加载中...</div>
    {:else}
      <div class="rule-panel-body">
        <div class="rule-section">
          <div class="rule-section-title">按端点过滤</div>
          <div class="rule-section-desc">选择只接收指定端点的通知，不选则全部接收</div>
          <div class="endpoint-checkboxes">
            {#if endpointOptions.length === 0}
              <div class="no-endpoints">暂无端点</div>
            {:else}
              {#each endpointOptions as endpoint (endpoint.id)}
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedEndpointIds.has(endpoint.id)}
                    on:change={() => toggleEndpoint(endpoint.id)}
                  />
                  <span class="checkbox-text">{endpoint.name}</span>
                  <span class="checkbox-url">{endpoint.url}</span>
                </label>
              {/each}
            {/if}
          </div>
        </div>

        <div class="rule-section">
          <div class="rule-section-title">按状态过滤</div>
          <div class="rule-section-desc">选择只接收指定状态的投递通知，不选则全部接收</div>
          <div class="status-checkboxes">
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={selectedStatusFilters.has('success')}
                on:change={() => toggleStatusFilter('success')}
              />
              <span class="status-indicator-sm" style="background: #10b981;"></span>
              <span class="checkbox-text">成功</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={selectedStatusFilters.has('failed')}
                on:change={() => toggleStatusFilter('failed')}
              />
              <span class="status-indicator-sm" style="background: #ef4444;"></span>
              <span class="checkbox-text">失败</span>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={selectedStatusFilters.has('timeout')}
                on:change={() => toggleStatusFilter('timeout')}
              />
              <span class="status-indicator-sm" style="background: #f59e0b;"></span>
              <span class="checkbox-text">超时</span>
            </label>
          </div>
        </div>

        <div class="rule-panel-footer">
          <button class="btn btn-secondary" on:click={() => showRulePanel = false}>取消</button>
          <button class="btn btn-primary" on:click={saveRules} disabled={ruleSaving}>
            {ruleSaving ? '保存中...' : '保存规则'}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<div class="notification-center">
  <div class="connection-status-bar" class:status-connected="{connectionStatus === 'connected'}" class:status-disconnected="{connectionStatus === 'disconnected'}" class:status-connecting="{connectionStatus === 'connecting'}">
    <span class="status-dot"></span>
    <span class="status-text">
      {#if connectionStatus === 'connected'}
        已连接
      {:else if connectionStatus === 'connecting'}
        连接中...
      {:else}
        已断开 {#if reconnectAttempts > 0}(重连第{reconnectAttempts}次){/if}
      {/if}
    </span>
  </div>

  <div class="notification-list" bind:this="{listContainer}">
    {#if notifications.length === 0}
      <div class="empty-state">
        <div class="empty-state-icon">📡</div>
        <div class="empty-state-title">等待通知</div>
        <div class="empty-state-desc">当投递事件完成时，结果将实时推送至此处</div>
      </div>
    {:else}
      {#each notifications as notification, i (i)}
        <div class="notification-item" style="background: {statusBackgroundColor(notification.status)}; border-color: {statusBorderColor(notification.status)};">
          <div class="notification-header">
            <div class="notification-type">
              <span class="status-indicator" style="background: {statusDotColor(notification.status)};"></span>
              <span class="event-type-badge">{notification.eventType}</span>
              <span class="status-badge" style="background: {statusBackgroundColor(notification.status)}; color: {statusDotColor(notification.status)}; border: 1px solid {statusBorderColor(notification.status)};">
                {statusLabel(notification.status)}
              </span>
            </div>
            <div class="notification-time">
              {formatDate(notification.timestamp)} {formatTime(notification.timestamp)}
            </div>
          </div>
          <div class="notification-body">
            <div class="notification-field">
              <span class="field-label">端点</span>
              <span class="field-value">{notification.endpointName}</span>
            </div>
            {#if notification.responseStatus}
              <div class="notification-field">
                <span class="field-label">响应码</span>
                <span class="field-value" class:status-success="{notification.responseStatus >= 200 && notification.responseStatus < 300}" class:status-failed="{notification.responseStatus >= 400 || notification.responseStatus === 0}">
                  {notification.responseStatus}
                </span>
              </div>
            {/if}
            <div class="notification-field">
              <span class="field-label">耗时</span>
              <span class="field-value">{notification.durationMs}ms</span>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="notification-footer">
    <button class="btn btn-secondary" on:click={toggleHistory}>
      {showHistory ? '📂 收起历史' : '📜 查看历史'}
    </button>
    <button class="btn btn-secondary" on:click="{clearNotifications}" disabled="{notifications.length === 0}">
      🗑️ 清空通知
    </button>
  </div>
</div>

{#if showHistory}
  <div class="history-panel">
    <div class="history-panel-header">
      <h3 class="history-panel-title">通知历史</h3>
      <div class="history-filters">
        <div class="filter-group">
          <button class="filter-btn" class:active={historyTimeRange === 'today'} on:click={() => onTimeRangeChange('today')}>今天</button>
          <button class="filter-btn" class:active={historyTimeRange === '3days'} on:click={() => onTimeRangeChange('3days')}>近3天</button>
          <button class="filter-btn" class:active={historyTimeRange === '7days'} on:click={() => onTimeRangeChange('7days')}>近7天</button>
        </div>
        <div class="filter-group">
          <button class="filter-btn" class:active={historyStatusFilter === ''} on:click={() => onStatusFilterChange('')}>全部</button>
          <button class="filter-btn" class:active={historyStatusFilter === 'success'} on:click={() => onStatusFilterChange('success')}>成功</button>
          <button class="filter-btn" class:active={historyStatusFilter === 'failed'} on:click={() => onStatusFilterChange('failed')}>失败</button>
          <button class="filter-btn" class:active={historyStatusFilter === 'timeout'} on:click={() => onStatusFilterChange('timeout')}>超时</button>
        </div>
      </div>
    </div>

    <div class="history-list">
      {#if historyLoading}
        <div class="history-loading">加载中...</div>
      {:else if historyItems.length === 0}
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">暂无历史记录</div>
          <div class="empty-state-desc">推送过的通知将记录在此处</div>
        </div>
      {:else}
        {#each historyItems as item (item.id)}
          <div class="notification-item" style="background: {statusBackgroundColor(item.status)}; border-color: {statusBorderColor(item.status)};">
            <div class="notification-header">
              <div class="notification-type">
                <span class="status-indicator" style="background: {statusDotColor(item.status)};"></span>
                <span class="event-type-badge">{item.eventType}</span>
                <span class="status-badge" style="background: {statusBackgroundColor(item.status)}; color: {statusDotColor(item.status)}; border: 1px solid {statusBorderColor(item.status)};">
                  {statusLabel(item.status)}
                </span>
              </div>
              <div class="notification-time">
                {formatDateTime(item.createdAt)}
              </div>
            </div>
            <div class="notification-body">
              <div class="notification-field">
                <span class="field-label">端点</span>
                <span class="field-value">{item.endpointName}</span>
              </div>
              {#if item.responseStatus}
                <div class="notification-field">
                  <span class="field-label">响应码</span>
                  <span class="field-value" class:status-success="{item.responseStatus >= 200 && item.responseStatus < 300}" class:status-failed="{item.responseStatus >= 400 || item.responseStatus === 0}">
                    {item.responseStatus}
                  </span>
                </div>
              {/if}
              <div class="notification-field">
                <span class="field-label">耗时</span>
                <span class="field-value">{item.durationMs}ms</span>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if historyTotalPages > 0}
      <div class="history-pagination">
        <span class="pagination-info">第 {historyPage}/{historyTotalPages} 页，共 {historyTotal} 条</span>
        <div class="pagination-buttons">
          <button class="btn btn-secondary btn-sm" on:click={onPrevPage} disabled={historyPage <= 1}>上一页</button>
          <button class="btn btn-secondary btn-sm" on:click={onNextPage} disabled={historyPage >= historyTotalPages}>下一页</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .notification-center {
    display: flex;
    flex-direction: column;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    height: calc(100vh - 200px);
    min-height: 500px;
  }

  .connection-status-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-connected .status-dot {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
  }
  .status-connected { color: #065f46; background: rgba(16, 185, 129, 0.05); }

  .status-disconnected .status-dot {
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  }
  .status-disconnected { color: #991b1b; background: rgba(239, 68, 68, 0.05); }

  .status-connecting .status-dot {
    background: #f59e0b;
    box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
    animation: pulse 1.5s ease-in-out infinite;
  }
  .status-connecting { color: #92400e; background: rgba(245, 158, 11, 0.05); }

  .status-text { font-size: 0.8125rem; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .notification-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .notification-item {
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: 0.875rem 1rem;
    margin-bottom: 0.5rem;
    transition: border-color 0.15s ease;
  }
  .notification-item:hover {
    border-color: var(--color-border-dark);
  }

  .notification-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
  }

  .notification-type {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .event-type-badge {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .status-badge {
    font-size: 0.6875rem;
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  .notification-time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  .notification-body {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
  }

  .notification-field {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .field-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .field-value {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }

  .field-value.status-success { color: #10b981; }
  .field-value.status-failed { color: #ef4444; }

  .notification-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--color-border);
    display: flex;
    gap: 0.5rem;
  }

  .notification-count {
    font-size: 0.75rem;
  }

  .rule-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    margin-bottom: 1rem;
    overflow: hidden;
  }

  .rule-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
  }

  .rule-panel-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }

  .rule-panel-loading {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted);
  }

  .rule-panel-body {
    padding: 1.25rem;
  }

  .rule-section {
    margin-bottom: 1.5rem;
  }

  .rule-section:last-of-type {
    margin-bottom: 0;
  }

  .rule-section-title {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  .rule-section-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 0.75rem;
  }

  .endpoint-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.8125rem;
  }

  .checkbox-label:hover {
    background: var(--color-bg-hover, rgba(0, 0, 0, 0.03));
  }

  .checkbox-text {
    font-weight: 500;
  }

  .checkbox-url {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
  }

  .status-indicator-sm {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-checkboxes {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .no-endpoints {
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    padding: 0.5rem 0;
  }

  .rule-panel-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
    margin-top: 1rem;
  }

  .history-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    margin-top: 1rem;
    overflow: hidden;
  }

  .history-panel-header {
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border);
  }

  .history-panel-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
  }

  .history-filters {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .filter-group {
    display: flex;
    gap: 0.25rem;
  }

  .filter-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-btn:hover {
    border-color: var(--color-border-dark);
    color: var(--color-text);
  }

  .filter-btn.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .history-list {
    max-height: 500px;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .history-loading {
    padding: 2rem;
    text-align: center;
    color: var(--color-text-muted);
  }

  .history-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--color-border);
  }

  .pagination-info {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .pagination-buttons {
    display: flex;
    gap: 0.5rem;
  }
</style>
