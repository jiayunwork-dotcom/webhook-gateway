<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { io, Socket } from 'socket.io-client';
  import { auth } from '../lib/store';

  interface DeliveryNotification {
    eventType: string;
    endpointName: string;
    status: 'success' | 'failed' | 'timeout';
    responseStatus?: number;
    durationMs: number;
    timestamp: string;
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
        socket.removeAllListeners();
        socket.disconnect(true);
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
    <span class="badge notification-count" style="background: var(--color-primary); color: white;">
      {notificationCount} 条通知
    </span>
  </div>
</div>

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
    <button class="btn btn-secondary btn-block" on:click="{clearNotifications}" disabled="{notifications.length === 0}">
      🗑️ 清空通知
    </button>
  </div>
</div>

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
    animation: fadeIn 0.3s ease;
    transition: border-color 0.15s ease;
  }
  .notification-item:hover {
    border-color: var(--color-border-dark);
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
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
  }

  .notification-count {
    font-size: 0.75rem;
  }
</style>
