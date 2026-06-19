<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { logsApi, endpointsApi, appsApi } from '../lib/api';
  import { formatDate, formatRelative, uiStore, statusColor, statusText } from '../lib/store';

  let endpoints: any[] = [];
  let apps: any[] = [];
  let filterEndpointId = '';
  let filterAppId = '';
  let items: any[] = [];
  let total = 0;
  let loading = true;
  let selectedLog: any = null;
  let limit = 100;
  let offset = 0;

  async function loadData() {
    loading = true;
    try {
      items = [];
      total = 0;
      const targetEndpoints = filterEndpointId ? [filterEndpointId] :
        filterAppId ? endpoints.filter(e => e.appId === filterAppId).map(e => e.id) :
        endpoints.map(e => e.id);
      const results = await Promise.all(
        targetEndpoints.slice(0, 10).map(id => logsApi.endpointLogs(id, Math.ceil(limit / Math.min(targetEndpoints.length, 10))))
      );
      const merged = results.flatMap(r => r.items || []);
      merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      items = merged.slice(0, limit);
      total = items.length;
    } catch (e: any) { uiStore.error(e.message); }
    finally { loading = false; }
  }

  async function init() {
    try {
      const [aps, eps] = await Promise.all([appsApi.list().catch(() => []), endpointsApi.list().catch(() => [])]);
      apps = aps || [];
      endpoints = eps || [];
    } catch {}
    loadData();
  }

  onMount(init);
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">投递日志</h1>
    <p class="text-muted mb-0">查看所有 Webhook 投递的详细记录</p>
  </div>
  <div class="page-actions">
    <select class="form-input" style="width: 180px;" bind:value="{filterAppId}" on:change="{loadData}">
      <option value="">全部应用</option>
      {#each apps as a (a.id)}<option value="{a.id}">{a.name}</option>{/each}
    </select>
    <select class="form-input" style="width: 200px;" bind:value="{filterEndpointId}" on:change="{loadData}">
      <option value="">全部端点</option>
      {#each (filterAppId ? endpoints.filter(e => e.appId === filterAppId) : endpoints) as ep (ep.id)}
        <option value="{ep.id}">{ep.name}</option>
      {/each}
    </select>
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
              <th>时间</th>
              <th>端点</th>
              <th>事件类型</th>
              <th>状态</th>
              <th>响应码</th>
              <th>耗时</th>
              <th>尝试</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each items as log (log.id)}
              <tr class="cursor-pointer" on:click="{() => selectedLog = log}">
                <td style="white-space: nowrap;" class="text-sm">{formatDate(log.createdAt)}</td>
                <td class="font-medium">{endpoints.find(e => e.id === log.endpointId)?.name || log.endpointId.slice(0, 8)}</td>
                <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{log.eventType}</td>
                <td><span class="badge {statusColor(log.status)}" style="font-size: 0.6875rem;">{statusText(log.status)}</span></td>
                <td>
                  {#if log.responseStatus}
                    <span style="color: {log.responseStatus >= 200 && log.responseStatus < 300 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 500;">
                      {log.responseStatus}
                    </span>
                  {:else}-{/if}
                </td>
                <td style="white-space: nowrap;">{log.durationMs} ms</td>
                <td>{log.attemptNumber}/{log.maxAttempts}</td>
                <td><span class="text-xs text-muted">详情 ›</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="card-footer text-sm text-muted">
        共 {total} 条记录（最多显示最近 {limit} 条）
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">暂无投递日志</div>
        <div class="empty-state-desc">发布事件后将在此处显示投递记录</div>
      </div>
    {/if}
  </div>
</div>

{#if selectedLog}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) selectedLog = null }}">
    <div class="modal" style="max-width: 780px;">
      <div class="modal-header">
        <h3 class="mb-0">投递详情</h3>
        <button class="icon-btn" on:click="{() => selectedLog = null}">✕</button>
      </div>
      <div class="modal-body" style="max-height: 70vh; overflow: auto;">
        <div class="grid-2 mb-4">
          <div><div class="text-sm text-muted">投递ID</div><div class="font-medium text-sm">{selectedLog.id}</div></div>
          <div><div class="text-sm text-muted">状态</div><div><span class="badge {statusColor(selectedLog.status)}">{statusText(selectedLog.status)}</span></div></div>
          <div><div class="text-sm text-muted">端点</div><div class="text-sm">{endpoints.find(e => e.id === selectedLog.endpointId)?.name || '-'}</div></div>
          <div><div class="text-sm text-muted">响应码</div><div>{selectedLog.responseStatus || '-'}</div></div>
          <div><div class="text-sm text-muted">耗时</div><div>{selectedLog.durationMs} ms</div></div>
          <div><div class="text-sm text-muted">尝试次数</div><div>{selectedLog.attemptNumber} / {selectedLog.maxAttempts}</div></div>
          <div style="grid-column: span 2;"><div class="text-sm text-muted">端点URL</div><code style="word-break: break-all; font-size: 0.75rem;">{selectedLog.endpointUrl}</code></div>
          <div style="grid-column: span 2;"><div class="text-sm text-muted">时间</div><div>{formatDate(selectedLog.createdAt)}</div></div>
        </div>
        {#if selectedLog.errorMessage}
          <div style="padding:0.75rem;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:0.875rem;margin-bottom:1rem;">
            <strong>错误信息：</strong>{selectedLog.errorMessage}
          </div>
        {/if}
        <div class="mb-3"><div class="text-sm text-muted mb-1">请求头</div><div class="code-block" style="max-height: 160px;">{selectedLog.requestHeaders ? JSON.stringify(selectedLog.requestHeaders, null, 2) : '-'}</div></div>
        <div class="mb-3"><div class="text-sm text-muted mb-1">请求体</div><div class="code-block" style="max-height: 200px;">{selectedLog.requestBody || '-'}</div></div>
        <div class="mb-3"><div class="text-sm text-muted mb-1">响应体</div><div class="code-block" style="max-height: 200px;">{selectedLog.responseBody || '-'}</div></div>
      </div>
    </div>
  </div>
{/if}

<style>
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; }
  .cursor-pointer { cursor: pointer; }
</style>
