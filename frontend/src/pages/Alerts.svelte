<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { alertsApi, endpointsApi } from '../lib/api';
  import { formatDate, formatRelative, uiStore, statusColor, statusText } from '../lib/store';

  let items: any[] = [];
  let endpoints: any[] = [];
  let loading = true;
  let filterStatus = '';
  let unread: any = { critical: 0, warning: 0, info: 0 };

  async function loadData() {
    loading = true;
    try {
      const [r, uc, eps] = await Promise.all([
        alertsApi.list(filterStatus || undefined, 200),
        alertsApi.unreadCount(),
        endpointsApi.list().catch(() => []),
      ]);
      items = r || [];
      unread = uc || { critical: 0, warning: 0, info: 0 };
      endpoints = eps || [];
    } catch (e: any) { uiStore.error(e.message); }
    finally { loading = false; }
  }

  onMount(loadData);

  async function acknowledge(id: string) {
    try { await alertsApi.acknowledge(id); uiStore.success('已确认'); loadData(); }
    catch (e: any) { uiStore.error(e.message); }
  }

  async function resolve(id: string) {
    if (!confirm('确定标记为已解决？')) return;
    try { await alertsApi.resolve(id); uiStore.success('已解决'); loadData(); }
    catch (e: any) { uiStore.error(e.message); }
  }

  const typeText: Record<string, string> = {
    endpoint_failure_rate: '失败率过高',
    endpoint_unhealthy: '端点异常',
    delivery_delay: '投递延迟',
    queue_backlog: '队列积压',
  };
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">告警中心</h1>
    <p class="text-muted mb-0">
      活跃告警：
      {#if unread.critical}
        <span class="badge bg-red-100 text-red-800 border-red-200" style="background:#fee2e2;color:#991b1b;border-color:#fecaca;">🔴 {unread.critical} 严重</span>
      {/if}
      {#if unread.warning}
        <span class="badge" style="background:#fef3c7;color:#92400e;border-color:#fde68a;">🟡 {unread.warning} 警告</span>
      {/if}
      {#if unread.info}
        <span class="badge" style="background:#dbeafe;color:#1e40af;border-color:#bfdbfe;">🔵 {unread.info} 提示</span>
      {/if}
    </p>
  </div>
  <div class="page-actions">
    <select class="form-input" style="width: 140px;" bind:value="{filterStatus}" on:change="{loadData}">
      <option value="">全部状态</option>
      <option value="active">活跃</option>
      <option value="acknowledged">已确认</option>
      <option value="resolved">已解决</option>
    </select>
    <button class="btn btn-secondary" on:click="{() => navigate('/alert-rules')}">告警规则</button>
    <button class="btn btn-secondary" on:click="{loadData}">🔄 刷新</button>
  </div>
</div>

<div class="card">
  <div class="card-body" style="padding: 0;">
    {#if loading}
      <div class="empty-state">⏳ 加载中...</div>
    {:else if items.length > 0}
      <div class="overflow-x-auto">
        <table class="table" style="margin: 0;">
          <thead>
            <tr>
              <th>级别</th>
              <th>类型</th>
              <th>消息</th>
              <th>端点</th>
              <th>状态</th>
              <th>创建时间</th>
              <th style="width: 200px;">操作</th>
            </tr>
          </thead>
          <tbody>
            {#each items as alert (alert.id)}
              <tr style="{alert.status === 'active' ? 'background: rgba(254, 242, 242, 0.3);' : ''}">
                <td><span class="badge {statusColor(alert.severity)}">{statusText(alert.severity)}</span></td>
                <td class="text-sm">{typeText[alert.type] || alert.type}</td>
                <td style="max-width: 360px;">{alert.message}</td>
                <td>
                  {#if alert.endpointId}
                    <a href="/endpoints/{alert.endpointId}" class="text-sm">
                      {endpoints.find(e => e.id === alert.endpointId)?.name || alert.endpointId.slice(0, 8)}
                    </a>
                  {:else}-{/if}
                </td>
                <td><span class="badge {statusColor(alert.status)}">{statusText(alert.status)}</span></td>
                <td class="text-sm text-muted">{formatRelative(alert.createdAt)}</td>
                <td>
                  <div class="flex gap-2 flex-wrap">
                    {#if alert.status === 'active'}
                      <button class="btn btn-secondary btn-sm" on:click="{() => acknowledge(alert.id)}">确认</button>
                    {/if}
                    {#if alert.status !== 'resolved'}
                      <button class="btn btn-success btn-sm" on:click="{() => resolve(alert.id)}">解决</button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-state-icon">✅</div>
        <div class="empty-state-title">暂无告警</div>
        <div class="empty-state-desc">系统运行一切正常，继续保持！</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .bg-red-100 { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
</style>
