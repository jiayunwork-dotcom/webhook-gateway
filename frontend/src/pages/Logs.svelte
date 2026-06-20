<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { logsApi, endpointsApi, appsApi, replaysApi } from '../lib/api';
  import { formatDate, formatRelative, uiStore, statusColor, statusText } from '../lib/store';

  let endpoints: any[] = [];
  let apps: any[] = [];
  let filterEndpointId = '';
  let filterAppId = '';
  let filterStatus = '';
  let items: any[] = [];
  let total = 0;
  let loading = true;
  let selectedLog: any = null;
  let limit = 200;
  let offset = 0;
  let selectedIds = new Set<string>();
  let showCreateReplayModal = false;
  let replayTaskName = '';
  let createReplayLoading = false;
  let scheduledEnabled = false;
  let scheduledDate = '';
  let scheduledTime = '';

  const statusOptions = [
    { value: '', label: '全部状态' },
    { value: 'failed', label: '仅失败' },
    { value: 'retrying', label: '重试中' },
    { value: 'dead_letter', label: '死信' },
    { value: 'success', label: '仅成功' },
  ];

  async function loadData() {
    loading = true;
    try {
      items = [];
      total = 0;
      const targetEndpoints = filterEndpointId ? [filterEndpointId] :
        filterAppId ? endpoints.filter(e => e.appId === filterAppId).map(e => e.id) :
        endpoints.map(e => e.id);
      const results = await Promise.all(
        targetEndpoints.slice(0, 20).map(id => logsApi.endpointLogs(id, Math.ceil(limit / Math.min(targetEndpoints.length, 20))))
      );
      let merged = results.flatMap(r => r.items || []);
      if (filterStatus) {
        merged = merged.filter(l => l.status === filterStatus);
      }
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

  function toggleSelectAll() {
    if (allSelected()) {
      selectedIds.clear();
    } else {
      items.forEach(i => selectedIds.add(i.id));
    }
    selectedIds = selectedIds;
  }

  function toggleSelect(id: string) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = selectedIds;
  }

  function allSelected(): boolean {
    return items.length > 0 && items.every(i => selectedIds.has(i.id));
  }

  function viewDetail(log: any) {
    selectedLog = log;
  }

  function openCreateReplayModal() {
    if (selectedIds.size === 0) {
      uiStore.info('请先勾选需要回放的日志记录');
      return;
    }
    const failedOrTimeout = items.filter(i => selectedIds.has(i.id));
    if (failedOrTimeout.length === 0) {
      uiStore.info('请至少选择一条失败或超时的记录');
      return;
    }
    replayTaskName = '回放任务-' + new Date().toLocaleString('zh-CN');
    scheduledEnabled = false;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    scheduledDate = now.toISOString().slice(0, 10);
    scheduledTime = now.toTimeString().slice(0, 5);
    showCreateReplayModal = true;
  }

  async function createReplayTask() {
    if (!replayTaskName.trim()) {
      uiStore.error('请填写任务名称');
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length > 200) {
      uiStore.error('单次回放任务最多包含 200 条事件');
      return;
    }

    let scheduledAt: string | undefined;
    if (scheduledEnabled) {
      if (!scheduledDate || !scheduledTime) {
        uiStore.error('请选择计划执行时间');
        return;
      }
      const scheduledDt = new Date(`${scheduledDate}T${scheduledTime}`);
      if (isNaN(scheduledDt.getTime())) {
        uiStore.error('计划执行时间格式无效');
        return;
      }
      if (scheduledDt <= new Date()) {
        uiStore.error('计划执行时间必须是未来时间');
        return;
      }
      scheduledAt = scheduledDt.toISOString();
    }

    createReplayLoading = true;
    try {
      const task = await replaysApi.create({
        name: replayTaskName.trim(),
        logIds: ids,
        scheduledAt,
      });
      uiStore.success('回放任务创建成功：' + task.name);
      showCreateReplayModal = false;
      selectedIds.clear();
      selectedIds = selectedIds;
      navigate('/replays/' + task.id);
    } catch (e: any) { uiStore.error(e.message); }
    finally { createReplayLoading = false; }
  }

  function closeSelectedLog() {
    selectedLog = null;
  }

  function closeSelectedLogBackdrop() {
    selectedLog = null;
  }

  function addSelectedLogToReplay() {
    if (selectedLog) {
      selectedIds.add(selectedLog.id);
      selectedIds = selectedIds;
      selectedLog = null;
      openCreateReplayModal();
    }
  }

  function closeCreateReplayModal() {
    if (!createReplayLoading) {
      showCreateReplayModal = false;
    }
  }

  function closeCreateReplayModalBackdrop() {
    if (!createReplayLoading) {
      showCreateReplayModal = false;
    }
  }
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">投递日志</h1>
    <p class="text-muted mb-0">查看所有 Webhook 投递的详细记录</p>
  </div>
  <div class="page-actions">
    <select class="form-input" style="width: 140px;" bind:value="{filterStatus}" on:change="{loadData}">
      {#each statusOptions as opt (opt.value)}
        <option value="{opt.value}">{opt.label}</option>
      {/each}
    </select>
    <select class="form-input" style="width: 160px;" bind:value="{filterAppId}" on:change="{loadData}">
      <option value="">全部应用</option>
      {#each apps as a (a.id)}<option value="{a.id}">{a.name}</option>{/each}
    </select>
    <select class="form-input" style="width: 180px;" bind:value="{filterEndpointId}" on:change="{loadData}">
      <option value="">全部端点</option>
      {#each (filterAppId ? endpoints.filter(e => e.appId === filterAppId) : endpoints) as ep (ep.id)}
        <option value="{ep.id}">{ep.name}</option>
      {/each}
    </select>
    <button class="btn btn-secondary" on:click="{loadData}">🔄 刷新</button>
    <button class="btn btn-primary" on:click="{openCreateReplayModal}" disabled="{selectedIds.size === 0}">
      🔁 创建回放任务 {selectedIds.size > 0 ? '(' + selectedIds.size + ')' : ''}
    </button>
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
              <th style="width: 40px;">
                <input type="checkbox" checked={allSelected()} on:change="{toggleSelectAll}" />
              </th>
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
              <tr class="cursor-pointer" on:click="{e => { if (!e.target.closest('input')) viewDetail(log); }}">
                <td>
                  <input type="checkbox" checked={selectedIds.has(log.id)} on:change="{() => toggleSelect(log.id)}" />
                </td>
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
        {#if selectedIds.size > 0}
          <span style="margin-left: 1rem; color: var(--color-primary);">
            已选择 {selectedIds.size} 条
          </span>
        {/if}
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
  <div class="modal-backdrop" on:click="{closeSelectedLogBackdrop}">
    <div class="modal" style="max-width: 780px;">
      <div class="modal-header">
        <h3 class="mb-0">投递详情</h3>
        <button class="icon-btn" on:click="{closeSelectedLog}">✕</button>
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
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click="{closeSelectedLog}">关闭</button>
        <button class="btn btn-primary" on:click="{addSelectedLogToReplay}">加入回放任务</button>
      </div>
    </div>
  </div>
{/if}

{#if showCreateReplayModal}
  <div class="modal-backdrop" on:click="{closeCreateReplayModalBackdrop}">
    <div class="modal" style="max-width: 520px;">
      <div class="modal-header">
        <h3 class="mb-0">创建回放任务</h3>
        <button class="icon-btn" on:click="{closeCreateReplayModal}">✕</button>
      </div>
      <div class="modal-body">
        <div style="padding: 0.875rem; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; margin-bottom: 1.25rem; font-size: 0.875rem; color: #1e40af;">
          <div style="font-weight: 500; margin-bottom: 0.25rem;">即将创建回放任务</div>
          <div>将对 <strong>{selectedIds.size}</strong> 条日志记录进行回放，按照原始事件内容重新投递。</div>
        </div>
        <div class="mb-4">
          <label class="form-label">任务名称</label>
          <input
            class="form-input"
            type="text"
            bind:value="{replayTaskName}"
            placeholder="请输入任务名称"
            maxlength="200"
            disabled="{createReplayLoading}"
          />
          <div class="form-hint">{replayTaskName.length}/200</div>
        </div>
        <div class="mb-4">
          <label class="toggle-switch" style="display: flex; align-items: center; gap: 0.75rem;">
            <input type="checkbox" bind:checked="{scheduledEnabled}" disabled="{createReplayLoading}" />
            <span class="toggle-slider"></span>
            <span class="font-medium">定时回放</span>
          </label>
          <div class="form-hint" style="margin-left: 44px;">打开后可设置未来某个时刻自动执行回放</div>
        </div>
        {#if scheduledEnabled}
          <div class="mb-4" style="padding: 0.875rem; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px;">
            <div class="text-sm font-medium mb-2" style="color: #6b21a8;">计划执行时间</div>
            <div style="display: flex; gap: 0.75rem;">
              <input
                class="form-input"
                type="date"
                bind:value="{scheduledDate}"
                disabled="{createReplayLoading}"
                style="flex: 1;"
              />
              <input
                class="form-input"
                type="time"
                bind:value="{scheduledTime}"
                step="60"
                disabled="{createReplayLoading}"
                style="width: 140px;"
              />
            </div>
          </div>
        {/if}
        <div class="text-sm text-muted">
          <p style="margin: 0;">• 回放请求会在原始请求头基础上添加 <code>X-Webhook-Replay: true</code> 标记</p>
          <p style="margin: 0.375rem 0 0;">• 回放投递不计入端点的正式统计和告警计算</p>
          <p style="margin: 0.375rem 0 0;">• 回放受端点速率限制约束，触发限流会标记为失败</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click="{closeCreateReplayModal}" disabled="{createReplayLoading}">取消</button>
        <button class="btn btn-primary" on:click="{createReplayTask}" disabled="{createReplayLoading}">
          {createReplayLoading ? '创建中...' : '确认创建'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; }
  .cursor-pointer { cursor: pointer; }
</style>
