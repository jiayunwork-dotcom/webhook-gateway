<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { replaysApi } from '../lib/api';
  import { formatDate, uiStore, statusColor, statusText } from '../lib/store';

  let items: any[] = [];
  let total = 0;
  let loading = true;
  let filterStatus = '';
  let pollTimer: any = null;
  let lastFilterStatus = '';

  const statusOptions = [
    { value: '', label: '全部状态' },
    { value: 'queued', label: '排队中' },
    { value: 'running', label: '执行中' },
    { value: 'completed', label: '已完成' },
    { value: 'partially_failed', label: '部分失败' },
    { value: 'failed', label: '全部失败' },
  ];

  async function loadData() {
    try {
      const r = await replaysApi.list(filterStatus || undefined);
      items = r.items || [];
      total = r.total || items.length;
    } catch (e: any) { uiStore.error(e.message); }
    finally { loading = false; }
  }

  function hasActiveTasks(): boolean {
    return items.some(t => t.status === 'queued' || t.status === 'running');
  }

  function updatePolling() {
    const needPoll = hasActiveTasks();
    if (needPoll && !pollTimer) {
      pollTimer = setInterval(() => {
        loadData();
      }, 3000);
    } else if (!needPoll && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function onFilterChange() {
    if (filterStatus !== lastFilterStatus) {
      lastFilterStatus = filterStatus;
      loading = true;
      loadData();
    }
  }

  function onRefreshClick() {
    loading = true;
    loadData();
  }

  $: {
    if (items && items.length >= 0) {
      updatePolling();
    }
  }

  onMount(() => {
    lastFilterStatus = filterStatus;
    loadData();
  });

  onDestroy(() => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  function progressPercent(task: any): number {
    if (task.totalCount === 0) return 0;
    return Math.round(task.processedCount / task.totalCount * 100);
  }
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">事件回放</h1>
    <p class="text-muted mb-0">管理历史投递的批量回放任务（共 {total} 个）</p>
  </div>
  <div class="page-actions">
    <select class="form-input" style="width: 160px;" bind:value="{filterStatus}" on:change="{onFilterChange}">
      {#each statusOptions as opt (opt.value)}
        <option value="{opt.value}">{opt.label}</option>
      {/each}
    </select>
    <button class="btn btn-secondary" on:click="{onRefreshClick}">🔄 刷新</button>
  </div>
</div>

<div class="card">
  <div class="card-body" style="padding: 0;">
    {#if loading && items.length === 0}
      <div class="empty-state">⏳ 加载中...</div>
    {:else if items.length > 0}
      <div class="overflow-x-auto">
        <table class="table" style="margin: 0;">
          <thead>
            <tr>
              <th>任务名称</th>
              <th>创建时间</th>
              <th>事件条数</th>
              <th>进度</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each items as task (task.id)}
              <tr class="cursor-pointer" on:click="{() => navigate('/replays/' + task.id)}">
                <td class="font-medium">{task.name}</td>
                <td style="white-space: nowrap;" class="text-sm">{formatDate(task.createdAt)}</td>
                <td>{task.totalCount} 条</td>
                <td style="min-width: 220px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="progress-bar-wrap">
                      <div
                        class="progress-bar {task.status === 'running' || task.status === 'queued' ? 'progress-animated' : ''}"
                        style="width: {progressPercent(task)}%;"
                      ></div>
                    </div>
                    <span class="text-sm text-muted" style="min-width: 60px;">
                      {task.processedCount}/{task.totalCount}
                    </span>
                  </div>
                </td>
                <td>
                  <span class="badge {statusColor(task.status)}" style="font-size: 0.6875rem;">
                    {statusText(task.status)}
                  </span>
                </td>
                <td><span class="text-xs text-muted">详情 ›</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-state-icon">🔁</div>
        <div class="empty-state-title">暂无回放任务</div>
        <div class="empty-state-desc">在「投递日志」中勾选失败或超时的记录，创建回放任务</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .cursor-pointer { cursor: pointer; }
  .progress-bar-wrap {
    flex: 1;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary), #60a5fa);
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .progress-animated {
    background: linear-gradient(
      90deg,
      var(--color-primary) 0%,
      #60a5fa 50%,
      var(--color-primary) 100%
    );
    background-size: 200% 100%;
    animation: progressStripes 1.5s linear infinite;
  }
  @keyframes progressStripes {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
