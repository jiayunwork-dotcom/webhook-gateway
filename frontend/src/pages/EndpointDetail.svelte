<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { endpointsApi, logsApi, metricsApi, eventsApi } from '../lib/api';
  import { formatDate, formatRelative, formatBytes, uiStore, statusColor, statusText } from '../lib/store';

  export let id = '';

  let endpoint: any = null;
  let logs: any[] = [];
  let metrics: any = null;
  let loading = true;
  let selectedLog: any = null;
  let showEditModal = false;
  let showTestResult: any = null;
  let submitting = false;
  let editError = '';
  let editForm: any = {};

  async function loadData() {
    try {
      const [ep, lg, mt] = await Promise.all([
        endpointsApi.get(id),
        logsApi.endpointLogs(id, 50),
        metricsApi.endpoint(id).catch(() => null),
      ]);
      endpoint = ep;
      logs = lg?.items || [];
      metrics = mt;
      editForm = {
        name: ep.name,
        description: ep.description || '',
        url: ep.url,
        subscribedEvents: ep.subscribedEvents?.join(', ') || '',
        rateLimitPerSecond: ep.rateLimitPerSecond,
        customHeaders: ep.customHeaders ? JSON.stringify(ep.customHeaders, null, 2) : '',
        isActive: ep.isActive,
      };
    } catch (e: any) { uiStore.error(e.message); }
    finally { loading = false; }
  }

  onMount(loadData);

  async function testDelivery() {
    showTestResult = null;
    try {
      const r = await eventsApi.testDelivery(id);
      uiStore.success('测试投递已发送');
      setTimeout(() => loadData(), 2000);
    } catch (e: any) {
      uiStore.error(e.message);
    }
  }

  async function saveEdit(e: Event) {
    e.preventDefault();
    editError = '';
    const events = editForm.subscribedEvents.split(',').map(s => s.trim()).filter(Boolean);
    if (!editForm.name || !editForm.url || events.length === 0) {
      editError = '请填写名称、URL和至少一个订阅事件';
      return;
    }
    const data: any = {
      name: editForm.name,
      description: editForm.description || undefined,
      url: editForm.url,
      subscribedEvents: events,
      rateLimitPerSecond: editForm.rateLimitPerSecond,
      isActive: editForm.isActive,
    };
    if (editForm.customHeaders.trim()) {
      try { data.customHeaders = JSON.parse(editForm.customHeaders); }
      catch { editError = '自定义请求头 JSON 格式错误'; return; }
    } else {
      data.customHeaders = undefined;
    }
    submitting = true;
    try {
      await endpointsApi.update(id, data);
      uiStore.success('已保存');
      showEditModal = false;
      loadData();
    } catch (err: any) { editError = err.message; }
    finally { submitting = false; }
  }

  function truncate(s: string, n = 100) {
    if (!s) return '-';
    if (s.length <= n) return s;
    return s.slice(0, n) + '...';
  }
</script>

{#if loading}
  <div class="card"><div class="card-body"><div class="empty-state">⏳ 加载中...</div></div></div>
{:else if !endpoint}
  <div class="card"><div class="card-body"><div class="empty-state">端点不存在</div></div></div>
{:else}
  <div class="page-header">
    <div>
      <div class="flex items-center gap-2 mb-1">
        <button class="icon-btn" on:click="{() => navigate('/endpoints')}">←</button>
        <h1 class="page-title mb-0">{endpoint.name}</h1>
        <span class="badge {statusColor(endpoint.status)}">{statusText(endpoint.status)}</span>
      </div>
      <p class="text-muted mb-0 ml-10">创建于 {formatRelative(endpoint.createdAt)}</p>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" on:click="{testDelivery}">📤 测试投递</button>
      <button class="btn btn-primary" on:click="{() => showEditModal = true}">编辑配置</button>
    </div>
  </div>

  {#if metrics?.summary}
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">总投递量(24h)</div>
        <div class="stat-value">{metrics.summary.totalDeliveries || 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">成功率</div>
        <div class="stat-value">{metrics.summary.successRate || '100.00'}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均延迟</div>
        <div class="stat-value">{metrics.summary.averageLatencyMs || 0}<span class="text-sm"> ms</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">死信数量</div>
        <div class="stat-value">{metrics.summary.deadLetterCount || 0}</div>
      </div>
    </div>
  {/if}

  <div class="grid-2 mb-6">
    <div class="card">
      <div class="card-header"><h4 class="mb-0">端点配置</h4></div>
      <div class="card-body">
        <div class="info-row">
          <div class="info-key">接收 URL</div>
          <div class="info-val"><code style="word-break: break-all;">{endpoint.url}</code></div>
        </div>
        <div class="info-row">
          <div class="info-key">速率限制</div>
          <div class="info-val">{endpoint.rateLimitPerSecond} 次/秒</div>
        </div>
        <div class="info-row">
          <div class="info-key">连续失败</div>
          <div class="info-val">{endpoint.consecutiveFailures || 0} 次</div>
        </div>
        <div class="info-row">
          <div class="info-key">上次投递</div>
          <div class="info-val">{formatRelative(endpoint.lastDeliveryAt)}</div>
        </div>
        <div class="info-row">
          <div class="info-key">暂停状态</div>
          <div class="info-val">
            {#if endpoint.status === 'unhealthy'}
              <span class="text-danger">⚠ 自动暂停中（连续失败超过阈值）</span>
              {#if endpoint.lastProbeAt}<div class="text-xs text-muted">最近探测: {formatRelative(endpoint.lastProbeAt)}</div>{/if}
              <div class="text-xs text-muted">
                成功探测 {endpoint.consecutiveProbeSuccesses || 0}/3 次后自动恢复
              </div>
            {:else if endpoint.status === 'paused'}
              <span>手动暂停</span>
            {:else}
              <span class="text-success">正常运行</span>
            {/if}
          </div>
        </div>
        <div class="info-row">
          <div class="info-key">订阅事件</div>
          <div class="info-val">
            {#each endpoint.subscribedEvents as ev}
              <span class="badge mr-1 mb-1" style="background:#e0e7ff;color:#3730a3;border-color:#c7d2fe;">{ev}</span>
            {/each}
          </div>
        </div>
        {#if endpoint.customHeaders}
          <div class="info-row">
            <div class="info-key">自定义请求头</div>
            <div class="info-val">
              <div class="code-block" style="margin-top:0.25rem; max-height: 160px;">{JSON.stringify(endpoint.customHeaders, null, 2)}</div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h4 class="mb-0">投递日志（最近 {logs.length} 条）</h4>
      </div>
      <div class="card-body" style="padding: 0; max-height: 500px; overflow: auto;">
        {#if logs.length > 0}
          <table class="table" style="margin: 0;">
            <thead style="position: sticky; top: 0; z-index: 1;">
              <tr>
                <th>时间</th>
                <th>事件类型</th>
                <th>状态</th>
                <th>响应</th>
                <th>耗时</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each logs as log (log.id)}
                <tr class="cursor-pointer" on:click="{() => selectedLog = log}">
                  <td class="text-xs text-muted" style="white-space: nowrap;">{formatRelative(log.createdAt)}</td>
                  <td style="max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{log.eventType}</td>
                  <td><span class="badge {statusColor(log.status)}" style="font-size: 0.6875rem;">{statusText(log.status)}</span></td>
                  <td>{log.responseStatus || '-'}</td>
                  <td style="white-space: nowrap;">{log.durationMs} ms</td>
                  <td><span class="text-xs text-muted">详情 ›</span></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">暂无投递记录</div>
            <div class="empty-state-desc">点击"测试投递"发送第一条事件</div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if selectedLog}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) selectedLog = null }}">
    <div class="modal" style="max-width: 780px;">
      <div class="modal-header">
        <h3 class="mb-0">投递详情</h3>
        <button class="icon-btn" on:click="{() => selectedLog = null}">✕</button>
      </div>
      <div class="modal-body" style="max-height: 70vh; overflow: auto;">
        <div class="grid-2 mb-4">
          <div><div class="text-sm text-muted">投递ID</div><div class="font-medium">{selectedLog.id}</div></div>
          <div><div class="text-sm text-muted">状态</div><div><span class="badge {statusColor(selectedLog.status)}">{statusText(selectedLog.status)}</span></div></div>
          <div><div class="text-sm text-muted">事件类型</div><div class="font-medium">{selectedLog.eventType}</div></div>
          <div><div class="text-sm text-muted">响应码</div><div>{selectedLog.responseStatus || '-'}</div></div>
          <div><div class="text-sm text-muted">尝试次数</div><div>{selectedLog.attemptNumber} / {selectedLog.maxAttempts}</div></div>
          <div><div class="text-sm text-muted">耗时</div><div>{selectedLog.durationMs} ms</div></div>
          <div style="grid-column: span 2;"><div class="text-sm text-muted">创建时间</div><div>{formatDate(selectedLog.createdAt)}</div></div>
        </div>
        {#if selectedLog.errorMessage}
          <div style="padding:0.75rem;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:0.875rem;margin-bottom:1rem;">
            <strong>错误信息：</strong>{selectedLog.errorMessage}
          </div>
        {/if}
        <div class="mb-3">
          <div class="text-sm text-muted mb-1">请求头</div>
          <div class="code-block" style="max-height: 160px;">{selectedLog.requestHeaders ? JSON.stringify(selectedLog.requestHeaders, null, 2) : '-'}</div>
        </div>
        <div class="mb-3">
          <div class="text-sm text-muted mb-1">请求体</div>
          <div class="code-block" style="max-height: 200px;">{selectedLog.requestBody || '-'}</div>
        </div>
        <div class="mb-3">
          <div class="text-sm text-muted mb-1">响应体</div>
          <div class="code-block" style="max-height: 200px;">{selectedLog.responseBody || '-'}</div>
        </div>
      </div>
    </div>
  </div>
{/if}

{#if showEditModal}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) showEditModal = false }}">
    <div class="modal" style="max-width: 640px;">
      <div class="modal-header"><h3 class="mb-0">编辑端点</h3><button class="icon-btn" on:click="{() => showEditModal = false}">✕</button></div>
      <form on:submit="{saveEdit}">
        <div class="modal-body">
          <div class="grid-2">
            <div class="form-group"><label class="form-label">名称</label><input class="form-input" bind:value="{editForm.name}" /></div>
            <div class="form-group"><label class="form-label">速率限制</label><input type="number" class="form-input" bind:value="{editForm.rateLimitPerSecond}" /></div>
          </div>
          <div class="form-group"><label class="form-label">URL</label><input class="form-input" bind:value="{editForm.url}" /></div>
          <div class="form-group"><label class="form-label">描述</label><input class="form-input" bind:value="{editForm.description}" /></div>
          <div class="form-group"><label class="form-label">订阅事件（逗号分隔）</label><input class="form-input" bind:value="{editForm.subscribedEvents}" /></div>
          <div class="form-group"><label class="form-label">自定义请求头(JSON)</label><textarea class="form-textarea" bind:value="{editForm.customHeaders}" style="min-height: 80px;"></textarea></div>
          <div class="form-group">
            <label class="form-label">启用状态</label>
            <select class="form-input" bind:value="{editForm.isActive}">
              <option value="{true}">启用</option>
              <option value="{false}">停用</option>
            </select>
          </div>
          {#if editError}
            <div style="padding:0.5rem;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:6px;font-size:0.875rem;">{editError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click="{() => showEditModal = false}">取消</button>
          <button type="submit" class="btn btn-primary" disabled="{submitting}">{submitting ? '保存中...' : '保存'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .info-row { display: flex; padding: 0.625rem 0; border-bottom: 1px solid var(--color-border); }
  .info-row:last-child { border-bottom: none; }
  .info-key { width: 120px; flex-shrink: 0; font-size: 0.8125rem; color: var(--color-text-muted); }
  .info-val { flex: 1; font-size: 0.875rem; }
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.8125rem; }
  .cursor-pointer { cursor: pointer; }
  .ml-10 { margin-left: 2.5rem; }
  .mr-1 { margin-right: 0.25rem; }
  .mb-1 { margin-bottom: 0.25rem; }
</style>
