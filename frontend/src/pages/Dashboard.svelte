<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { metricsApi, appsApi, alertsApi } from '../lib/api';
  import { formatRelative, statusColor, statusText } from '../lib/store';

  let loading = true;
  let overview: any = {};
  let apps: any[] = [];
  let recentAlerts: any[] = [];
  let unreadCount: any = { critical: 0, warning: 0, info: 0 };
  let error = '';

  onMount(async () => {
    try {
      const [ov, ap, al, uc] = await Promise.all([
        metricsApi.overview().catch(() => ({ summary: {}, timeseries: [] })),
        appsApi.list().catch(() => []),
        alertsApi.list('active', 5).catch(() => []),
        alertsApi.unreadCount().catch(() => ({ critical: 0, warning: 0, info: 0 })),
      ]);
      overview = ov;
      apps = ap || [];
      recentAlerts = al || [];
      unreadCount = uc || { critical: 0, warning: 0, info: 0 };
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  });

  function getBarWidth(value: number, max: number): string {
    if (!max) return '0%';
    return Math.min(100, (value / max) * 100) + '%';
  }

  $: maxDelivery = overview?.timeseries?.reduce((m: number, d: any) => Math.max(m, d.total || 0), 0) || 0;
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">控制台概览</h1>
    <p class="text-muted mb-0">查看租户事件投递的整体运行情况</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary btn-sm" on:click="{() => navigate('/apps')}">
      查看所有应用 →
    </button>
  </div>
</div>

{#if loading}
  <div class="card">
    <div class="card-body">
      <div class="empty-state">⏳ 加载中...</div>
    </div>
  </div>
{:else}
  {#if error}
    <div class="card mb-6">
      <div class="card-body text-danger">⚠️ {error}</div>
    </div>
  {/if}

  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-label">总投递量（24小时）</div>
      <div class="stat-value">{overview?.summary?.totalDeliveries || 0}</div>
      <div class="stat-sub">
        {overview?.summary?.successfulDeliveries || 0} 成功 · {overview?.summary?.failedDeliveries || 0} 失败
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label">投递成功率</div>
      <div class="stat-value">{overview?.summary?.successRate ?? '100.00'}%</div>
      <div class="stat-sub">
        {#if (overview?.summary?.successRate ?? 100) >= 99}
          <span class="text-success">✓ 运行良好</span>
        {:else if (overview?.summary?.successRate ?? 100) >= 95}
          <span style="color: var(--color-warning)">⚠ 需关注</span>
        {:else}
          <span class="text-danger">✗ 需要检查</span>
        {/if}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label">平均响应延迟</div>
      <div class="stat-value">{overview?.summary?.averageLatencyMs || 0}<span class="text-sm"> ms</span></div>
      <div class="stat-sub">
        重试投递: {overview?.summary?.retriedDeliveries || 0} 次
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label">活跃告警</div>
      <div class="stat-value">{unreadCount.critical + unreadCount.warning + unreadCount.info}</div>
      <div class="stat-sub">
        {#if unreadCount.critical}
          <span class="text-danger">{unreadCount.critical} 严重 </span>
        {/if}
        {#if unreadCount.warning}
          <span style="color: var(--color-warning)">{unreadCount.warning} 警告</span>
        {/if}
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label">死信队列</div>
      <div class="stat-value">{overview?.summary?.deadLetterCount || 0}</div>
      <div class="stat-sub">
        <a href="/dead-letters">查看死信队列 →</a>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label">应用数量</div>
      <div class="stat-value">{apps.length}</div>
      <div class="stat-sub">
        <a href="/apps">管理应用 →</a>
      </div>
    </div>
  </div>

  <div class="grid-2 mb-6">
    <div class="card">
      <div class="card-header">
        <h4 class="mb-0">投递趋势（按小时）</h4>
      </div>
      <div class="card-body">
        {#if overview?.timeseries?.length > 0}
          <div class="chart-bars">
            {#each overview.timeseries as d (d.timestamp)}
              <div class="bar-item">
                <div class="bar-wrapper">
                  <div
                    class="bar-success"
                    style="height: {getBarWidth(d.successful || 0, maxDelivery)}"
                    title="成功: {d.successful || 0}"
                  ></div>
                  <div
                    class="bar-failed"
                    style="height: {getBarWidth(d.failed || 0, maxDelivery)}"
                    title="失败: {d.failed || 0}"
                  ></div>
                </div>
                <div class="bar-label">
                  {new Date(d.timestamp).getHours().toString().padStart(2, '0')}:00
                </div>
              </div>
            {/each}
          </div>
          <div class="chart-legend">
            <span><span class="legend-dot legend-success"></span> 成功</span>
            <span><span class="legend-dot legend-failed"></span> 失败</span>
          </div>
        {:else}
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <div class="empty-state-title">暂无数据</div>
            <div class="empty-state-desc">发布事件后将显示投递趋势图表</div>
          </div>
        {/if}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h4 class="mb-0">最近告警</h4>
        <button class="btn btn-secondary btn-sm" on:click="{() => navigate('/alerts')}">查看全部</button>
      </div>
      <div class="card-body" style="padding: 0;">
        {#if recentAlerts.length > 0}
          <table class="table" style="margin: 0;">
            <thead>
              <tr>
                <th>级别</th>
                <th>消息</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {#each recentAlerts as alert (alert.id)}
                <tr>
                  <td>
                    <span class="badge {statusColor(alert.severity)}">{statusText(alert.severity)}</span>
                  </td>
                  <td style="max-width: 280px;">
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      {alert.message}
                    </div>
                  </td>
                  <td class="text-sm text-muted">{formatRelative(alert.createdAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="empty-state">
            <div class="empty-state-icon">✅</div>
            <div class="empty-state-title">暂无告警</div>
            <div class="empty-state-desc">系统运行一切正常</div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h4 class="mb-0">我的应用</h4>
      <button class="btn btn-primary btn-sm" on:click="{() => navigate('/apps')}">+ 新建应用</button>
    </div>
    <div class="card-body" style="padding: 0;">
      {#if apps.length > 0}
        <table class="table" style="margin: 0;">
          <thead>
            <tr>
              <th>应用名称</th>
              <th>描述</th>
              <th>端点数量</th>
              <th>状态</th>
              <th>创建时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each apps as app (app.id)}
              <tr>
                <td class="font-medium">{app.name}</td>
                <td class="text-muted">{app.description || '-'}</td>
                <td>{app.endpointCount || 0} / {app.maxEndpoints}</td>
                <td>
                  <span class="badge {app.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'}">
                    {app.isActive ? '启用' : '停用'}
                  </span>
                </td>
                <td class="text-sm text-muted">{formatRelative(app.createdAt)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" on:click="{() => navigate(`/apps/${app.id}`)}">
                    详情
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <div class="empty-state">
          <div class="empty-state-icon">📱</div>
          <div class="empty-state-title">还没有应用</div>
          <div class="empty-state-desc">创建一个应用开始发布事件</div>
          <div class="mt-4">
            <button class="btn btn-primary" on:click="{() => navigate('/apps')}">创建应用</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .chart-bars {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 200px;
    padding: 0 0.5rem;
  }
  .bar-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    height: 100%;
  }
  .bar-wrapper {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 2px;
    min-height: 4px;
  }
  .bar-success, .bar-failed {
    width: 100%;
    border-radius: 3px 3px 0 0;
    transition: height 0.3s ease;
    min-height: 2px;
  }
  .bar-success { background: var(--color-success); }
  .bar-failed { background: var(--color-danger); }
  .bar-label {
    font-size: 0.625rem;
    color: var(--color-text-muted);
    margin-top: 0.375rem;
    white-space: nowrap;
  }
  .chart-legend {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 0.75rem;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  .legend-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: middle;
  }
  .legend-success { background: var(--color-success); }
  .legend-failed { background: var(--color-danger); }
</style>
