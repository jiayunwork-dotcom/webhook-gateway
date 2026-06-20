<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { replaysApi } from '../lib/api';
  import { formatDate, uiStore, statusColor, statusText } from '../lib/store';

  export let params: { id: string };

  let task: any = null;
  let items: any[] = [];
  let loading = true;
  let retryLoading = false;
  let pollTimer: any = null;
  let selectedItem: any = null;
  let comparisonOpen = false;
  let comparisonLoading = false;
  let comparisonData: any = null;
  let selectedComparisonItem: any = null;

  async function loadData() {
    try {
      const data = await replaysApi.get(params.id);
      task = data;
      items = data?.items || [];
    } catch (e: any) { uiStore.error(e.message); }
    finally { loading = false; }
  }

  function isRunning(): boolean {
    return task?.status === 'queued' || task?.status === 'running' || task?.status === 'waiting';
  }

  function canRetry(): boolean {
    if (!task) return false;
    if (isRunning()) return false;
    const failedCount = items.filter(i => i.status === 'failed' || i.status === 'rate_limited').length;
    return failedCount > 0 && !retryLoading;
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (isRunning()) {
        loadData();
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  onMount(() => {
    loadData().then(() => {
      startPolling();
    });
  });

  onDestroy(() => {
    stopPolling();
  });

  $: {
    if (task && !isRunning()) {
      stopPolling();
    } else if (task && isRunning() && !pollTimer) {
      startPolling();
    }
  }

  async function onRetryFailed() {
    if (!canRetry()) return;
    if (!confirm('确定重试该任务中所有失败的条目？')) return;

    retryLoading = true;
    try {
      const r = await replaysApi.retryFailed(params.id);
      if (r.success) {
        uiStore.success(`已提交 ${r.retryCount} 条失败项重新执行`);
        await loadData();
      }
    } catch (e: any) { uiStore.error(e.message); }
    finally { retryLoading = false; }
  }

  async function onToggleComparison() {
    if (!comparisonOpen) {
      comparisonOpen = true;
      if (!comparisonData) {
        await loadComparison();
      }
    } else {
      comparisonOpen = false;
    }
  }

  async function loadComparison() {
    comparisonLoading = true;
    try {
      comparisonData = await replaysApi.getComparison(params.id);
    } catch (e: any) { uiStore.error(e.message); }
    finally { comparisonLoading = false; }
  }

  function getComparisonItem(replayItemId: string): any | undefined {
    if (!comparisonData?.items) return undefined;
    return comparisonData.items.find((c: any) => c.replayItemId === replayItemId);
  }

  function progressPercent(): number {
    if (!task || task.totalCount === 0) return 0;
    return Math.round(task.processedCount / task.totalCount * 100);
  }

  function successPercent(): number {
    if (!task || task.processedCount === 0) return 0;
    return Math.round(task.successCount / task.processedCount * 100);
  }

  function durationChangeText(diff: any): string {
    if (diff.durationChangePercent === null || diff.durationChangePercent === undefined) return '-';
    const sign = diff.durationFaster ? '' : '+';
    return `${sign}${diff.durationChangePercent}%`;
  }

  function durationChangeColor(diff: any): string {
    if (diff.durationChangePercent === null || diff.durationChangePercent === undefined) return '';
    if (diff.durationChangePercent === 0) return '';
    return diff.durationFaster ? 'var(--color-success)' : 'var(--color-danger)';
  }

  function getMaxStatusCount(): number {
    if (!comparisonData?.summary) return 1;
    const orig = Object.values(comparisonData.summary.originalStatusDistribution || {}) as number[];
    const rep = Object.values(comparisonData.summary.replayStatusDistribution || {}) as number[];
    return Math.max(1, ...orig, ...rep);
  }
</script>

{#if loading && !task}
  <div class="empty-state">⏳ 加载中...</div>
{:else if task}
  <div class="page-header">
    <div>
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem;">
        <button class="icon-btn" style="width: 32px; height: 32px; padding: 0;" on:click="{() => navigate('/replays')}">
          ←
        </button>
        <h1 class="page-title" style="margin: 0;">{task.name}</h1>
        <span class="badge {statusColor(task.status)}">{statusText(task.status)}</span>
      </div>
      <p class="text-muted mb-0">创建于 {formatDate(task.createdAt)}</p>
    </div>
    <div class="page-actions">
      <button
        class="btn btn-primary"
        disabled="{!canRetry()}"
        on:click="{onRetryFailed}"
      >
        {retryLoading ? '提交中...' : '🔄 重试失败项'}
      </button>
      <button class="btn btn-secondary" on:click="{loadData}">🔄 刷新</button>
    </div>
  </div>

  <div class="card mb-4">
    <div class="card-body">
      <div class="grid-4" style="margin-bottom: 1.5rem;">
        <div>
          <div class="text-sm text-muted">事件总数</div>
          <div class="text-2xl font-bold mt-1">{task.totalCount}</div>
        </div>
        <div>
          <div class="text-sm text-muted">已处理</div>
          <div class="text-2xl font-bold mt-1" style="color: var(--color-primary);">{task.processedCount}</div>
        </div>
        <div>
          <div class="text-sm text-muted">成功</div>
          <div class="text-2xl font-bold mt-1" style="color: var(--color-success);">{task.successCount}</div>
        </div>
        <div>
          <div class="text-sm text-muted">失败</div>
          <div class="text-2xl font-bold mt-1" style="color: var(--color-danger);">{task.failedCount}</div>
        </div>
      </div>

      <div class="text-sm text-muted mb-2">
        执行进度：{progressPercent()}%（{task.processedCount}/{task.totalCount}）
        {#if task.processedCount > 0}
          <span style="margin-left: 1rem;">成功率：{successPercent()}%</span>
        {/if}
        {#if isRunning()}
          <span style="margin-left: 1rem; color: var(--color-primary);">⚡ 执行中...</span>
        {/if}
      </div>
      <div class="progress-bar-wrap-large">
        <div
          class="progress-bar-large {isRunning() ? 'progress-animated' : ''}"
          style="width: {progressPercent()}%;"
        ></div>
      </div>
      {#if task.startedAt || task.scheduledAt}
        <div class="grid-2 mt-4 text-sm">
          <div><span class="text-muted">开始时间：</span>{formatDate(task.startedAt)}</div>
          <div><span class="text-muted">完成时间：</span>{formatDate(task.finishedAt)}</div>
          {#if task.scheduledAt}
            <div style="grid-column: span 2;"><span class="text-muted">计划执行时间：</span>{formatDate(task.scheduledAt)}</div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="card mb-4">
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
      <h3 class="mb-0">🔍 与原始投递对比</h3>
      <button class="btn btn-secondary btn-sm" on:click="{onToggleComparison}">
        {comparisonOpen ? '收起对比' : '展开对比'}
      </button>
    </div>
    {#if comparisonOpen}
      <div class="card-body">
        {#if comparisonLoading && !comparisonData}
          <div class="empty-state" style="padding: 2rem;">⏳ 加载对比数据中...</div>
        {:else if comparisonData}
          <div class="grid-3 mb-4" style="gap: 1rem;">
            <div style="padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div class="text-sm text-muted mb-2">成功率变化</div>
              <div style="display: flex; align-items: baseline; gap: 0.75rem;">
                <div>
                  <div class="text-xs text-muted">原始</div>
                  <div class="text-xl font-bold" style="color: #64748b;">{comparisonData.summary.originalSuccessRate}%</div>
                </div>
                <div style="font-size: 1.25rem; color: #94a3b8;">→</div>
                <div>
                  <div class="text-xs text-muted">回放</div>
                  <div class="text-xl font-bold" style="color: var(--color-primary);">{comparisonData.summary.replaySuccessRate}%</div>
                </div>
              </div>
              {#if comparisonData.summary.replaySuccessRate !== comparisonData.summary.originalSuccessRate}
                <div class="text-xs mt-2" style="color: {comparisonData.summary.replaySuccessRate > comparisonData.summary.originalSuccessRate ? 'var(--color-success)' : 'var(--color-danger)'};">
                  {comparisonData.summary.replaySuccessRate > comparisonData.summary.originalSuccessRate ? '↑' : '↓'} 
                  变化 {Math.abs(comparisonData.summary.replaySuccessRate - comparisonData.summary.originalSuccessRate)}%
                </div>
              {/if}
            </div>
            <div style="padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div class="text-sm text-muted mb-2">平均耗时变化</div>
              <div style="display: flex; align-items: baseline; gap: 0.75rem;">
                <div>
                  <div class="text-xs text-muted">原始</div>
                  <div class="text-xl font-bold" style="color: #64748b;">{comparisonData.summary.originalAvgDurationMs} ms</div>
                </div>
                <div style="font-size: 1.25rem; color: #94a3b8;">→</div>
                <div>
                  <div class="text-xs text-muted">回放</div>
                  <div class="text-xl font-bold" style="color: var(--color-primary);">{comparisonData.summary.replayAvgDurationMs} ms</div>
                </div>
              </div>
              {#if comparisonData.summary.originalAvgDurationMs > 0}
                {@const durDiff = Math.round(((comparisonData.summary.replayAvgDurationMs - comparisonData.summary.originalAvgDurationMs) / comparisonData.summary.originalAvgDurationMs) * 100)}
                <div class="text-xs mt-2" style="color: {durDiff < 0 ? 'var(--color-success)' : durDiff > 0 ? 'var(--color-danger)' : '#64748b'};">
                  {durDiff < 0 ? '↓ 快了' : durDiff > 0 ? '↑ 慢了' : '持平'} 
                  {durDiff !== 0 ? `${Math.abs(durDiff)}%` : ''}
                </div>
              {/if}
            </div>
            <div style="padding: 1rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div class="text-sm text-muted mb-2">响应码分布</div>
              <div class="bar-chart" style="height: 100px;">
                {#each Object.entries(comparisonData.summary.originalStatusDistribution || {}) as [code, count] (code)}
                  <div class="bar-chart-item">
                    <div class="text-xs font-medium">#{code}</div>
                    <div style="display: flex; gap: 2px; align-items: flex-end; height: 60px;">
                      <div 
                        class="bar-chart-bar" 
                        style="background: #94a3b8; height: {((count as number) / getMaxStatusCount()) * 100}%;"
                        title="原始: {count}"
                      ></div>
                      {@const repCount = comparisonData.summary.replayStatusDistribution?.[code] || 0}
                      <div 
                        class="bar-chart-bar" 
                        style="background: var(--color-primary); height: {(repCount / getMaxStatusCount()) * 100}%;"
                        title="回放: {repCount}"
                      ></div>
                    </div>
                    <div class="text-xs" style="color: var(--color-text-muted);">{count} → {repCount}</div>
                  </div>
                {/each}
                {#each Object.entries(comparisonData.summary.replayStatusDistribution || {}) as [code, count] (code)}
                  {#if comparisonData.summary.originalStatusDistribution === undefined || comparisonData.summary.originalStatusDistribution[code] === undefined}
                    <div class="bar-chart-item">
                      <div class="text-xs font-medium">#{code}</div>
                      <div style="display: flex; gap: 2px; align-items: flex-end; height: 60px;">
                        <div 
                          class="bar-chart-bar" 
                          style="background: #94a3b8; height: 4px;"
                          title="原始: 0"
                        ></div>
                        <div 
                          class="bar-chart-bar" 
                          style="background: var(--color-primary); height: {((count as number) / getMaxStatusCount()) * 100}%;"
                          title="回放: {count}"
                        ></div>
                      </div>
                      <div class="text-xs" style="color: var(--color-text-muted);">0 → {count}</div>
                    </div>
                  {/if}
                {/each}
              </div>
              <div class="text-xs text-center" style="color: var(--color-text-muted);">
                <span style="display: inline-block; width: 12px; height: 12px; background: #94a3b8; border-radius: 2px; vertical-align: middle; margin-right: 4px;"></span> 原始
                <span style="display: inline-block; width: 12px; height: 12px; background: var(--color-primary); border-radius: 2px; vertical-align: middle; margin: 0 4px 0 12px;"></span> 回放
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="card">
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
      <h3 class="mb-0">回放明细（{items.length} 条）</h3>
    </div>
    <div class="card-body" style="padding: 0;">
      {#if items.length > 0}
        <div class="overflow-x-auto">
          <table class="table" style="margin: 0;">
            <thead>
              <tr>
                <th>#</th>
                <th>事件类型</th>
                <th>目标端点</th>
                <th>状态</th>
                {#if comparisonOpen && comparisonData}
                  <th>原始状态码</th>
                  <th>回放状态码</th>
                  <th>耗时变化</th>
                  <th>响应体差异</th>
                {:else}
                  <th>响应码</th>
                  <th>耗时</th>
                {/if}
                <th>失败原因</th>
                <th>执行时间</th>
              </tr>
            </thead>
            <tbody>
              {#each items as item, idx (item.id)}
                <tr class="cursor-pointer" on:click="{() => { selectedItem = item; if (comparisonOpen && comparisonData) selectedComparisonItem = getComparisonItem(item.id); }}">
                  <td class="text-sm text-muted">{idx + 1}</td>
                  <td><code style="font-size: 0.75rem;">{item.eventType}</code></td>
                  <td class="font-medium">{item.endpointName}</td>
                  <td>
                    <span class="badge {statusColor(item.status)}" style="font-size: 0.6875rem;">
                      {statusText(item.status)}
                    </span>
                  </td>
                  {#if comparisonOpen && comparisonData}
                    {@const comp = getComparisonItem(item.id)}
                    <td>
                      {#if comp}
                        {#if !comp.originalAvailable}
                          <span class="text-muted text-xs">原始数据不可用</span>
                        {:else if comp.original?.responseStatus}
                          <span style="color: {comp.original.responseStatus >= 200 && comp.original.responseStatus < 300 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 500;">
                            {comp.original.responseStatus}
                          </span>
                        {:else}
                          -
                        {/if}
                      {:else}
                        -
                      {/if}
                    </td>
                    <td>
                      {#if comp}
                        {#if item.responseStatus}
                          <span style="color: {item.responseStatus >= 200 && item.responseStatus < 300 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 500;">
                            {item.responseStatus}
                          </span>
                          {#if comp.diff?.statusChanged}
                            <span class="text-xs" style="color: var(--color-warning); margin-left: 4px;">变化</span>
                          {/if}
                        {:else}
                          -
                        {/if}
                      {:else}
                        -
                      {/if}
                    </td>
                    <td>
                      {#if comp && comp.originalAvailable}
                        <span style="color: {durationChangeColor(comp.diff)}; font-weight: 500;">
                          {durationChangeText(comp.diff)}
                        </span>
                        <div class="text-xs text-muted">
                          {comp.original?.durationMs || 0} ms → {item.durationMs} ms
                        </div>
                      {:else if comp}
                        <span class="text-muted text-xs">-</span>
                      {:else}
                        -
                      {/if}
                    </td>
                    <td>
                      {#if comp && comp.originalAvailable}
                        {#if comp.diff?.responseBodyDiff && comp.diff.responseBodyDiff.length > 0}
                          <span class="text-xs" style="color: var(--color-warning);">
                            {comp.diff.responseBodyDiff.length > 20 ? '20+' : comp.diff.responseBodyDiff.length} 处差异
                          </span>
                        {:else}
                          <span class="text-xs text-muted">无差异</span>
                        {/if}
                      {:else if comp}
                        <span class="text-muted text-xs">-</span>
                      {:else}
                        -
                      {/if}
                    </td>
                  {:else}
                    <td>
                      {#if item.responseStatus}
                        <span style="color: {item.responseStatus >= 200 && item.responseStatus < 300 ? 'var(--color-success)' : 'var(--color-danger)'}; font-weight: 500;">
                          {item.responseStatus}
                        </span>
                      {:else}-{/if}
                    </td>
                    <td style="white-space: nowrap;">{item.durationMs} ms</td>
                  {/if}
                  <td style="max-width: 280px;">
                    {#if item.errorMessage}
                      <span class="text-danger text-sm" title="{item.errorMessage}">
                        {item.errorMessage.length > 50 ? item.errorMessage.slice(0, 50) + '...' : item.errorMessage}
                      </span>
                    {:else}-{/if}
                  </td>
                  <td style="white-space: nowrap;" class="text-sm">{formatDate(item.executedAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty-state">
          <div class="empty-state-title">暂无明细数据</div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="empty-state">
    <div class="empty-state-icon">⚠️</div>
    <div class="empty-state-title">任务不存在</div>
    <div class="empty-state-desc">
      <button class="btn btn-secondary mt-4" on:click="{() => navigate('/replays')}">返回列表</button>
    </div>
  </div>
{/if}

{#if selectedItem}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) { selectedItem = null; selectedComparisonItem = null; } }}">
    <div class="modal" style="max-width: 880px;">
      <div class="modal-header">
        <h3 class="mb-0">回放条目详情</h3>
        <button class="icon-btn" on:click="{() => { selectedItem = null; selectedComparisonItem = null; }}">✕</button>
      </div>
      <div class="modal-body" style="max-height: 70vh; overflow: auto;">
        {#if selectedComparisonItem}
          {#if !selectedComparisonItem.originalAvailable}
            <div style="padding: 0.75rem; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; color: #92400e; font-size: 0.875rem; margin-bottom: 1rem;">
              ⚠️ 原始投递数据不可用（可能已被清理），无法进行对比
            </div>
          {/if}
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div style="padding: 0.875rem; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <div class="text-sm font-medium mb-2" style="color: #64748b;">原始投递</div>
              {#if selectedComparisonItem.originalAvailable}
                <div class="grid-2" style="gap: 0.75rem;">
                  <div><div class="text-xs text-muted">状态码</div><div class="font-medium">{selectedComparisonItem.original?.responseStatus || '-'}</div></div>
                  <div><div class="text-xs text-muted">耗时</div><div class="font-medium">{selectedComparisonItem.original?.durationMs || 0} ms</div></div>
                </div>
              {:else}
                <div class="text-sm text-muted">数据不可用</div>
              {/if}
            </div>
            <div style="padding: 0.875rem; background: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe;">
              <div class="text-sm font-medium mb-2" style="color: var(--color-primary);">本次回放</div>
              <div class="grid-2" style="gap: 0.75rem;">
                <div><div class="text-xs text-muted">状态码</div><div class="font-medium">{selectedComparisonItem.replay.responseStatus || '-'}</div></div>
                <div><div class="text-xs text-muted">耗时</div><div class="font-medium">{selectedComparisonItem.replay.durationMs || 0} ms</div></div>
              </div>
              {#if selectedComparisonItem.diff?.statusChanged}
                <div class="text-xs mt-2" style="color: var(--color-warning);">⚠️ 状态码发生变化</div>
              {/if}
              {#if selectedComparisonItem.diff?.durationChangePercent !== null && selectedComparisonItem.diff?.durationChangePercent !== undefined}
                <div class="text-xs mt-1" style="color: {durationChangeColor(selectedComparisonItem.diff)};">
                  {selectedComparisonItem.diff.durationFaster ? '⏱️ 更快' : '⏱️ 更慢'} ({durationChangeText(selectedComparisonItem.diff)})
                </div>
              {/if}
            </div>
          </div>
          {#if selectedComparisonItem.originalAvailable && selectedComparisonItem.diff?.responseBodyDiff && selectedComparisonItem.diff.responseBodyDiff.length > 0}
            <div class="mb-4">
              <div class="text-sm font-medium mb-2">响应体差异</div>
              <div class="code-block" style="max-height: 280px; font-size: 0.8125rem;">
                {#each selectedComparisonItem.diff.responseBodyDiff as line (line)}
                  <div class="{line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : ''}" style="padding: 2px 4px; white-space: pre-wrap;">
                    {line}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
        <div class="grid-2 mb-4">
          <div><div class="text-sm text-muted">原始日志ID</div><div class="text-sm font-mono" style="word-break: break-all;">{selectedItem.originalLogId}</div></div>
          <div><div class="text-sm text-muted">状态</div><div><span class="badge {statusColor(selectedItem.status)}">{statusText(selectedItem.status)}</span></div></div>
          <div><div class="text-sm text-muted">端点</div><div class="text-sm">{selectedItem.endpointName}</div></div>
          <div><div class="text-sm text-muted">事件类型</div><div><code>{selectedItem.eventType}</code></div></div>
          <div><div class="text-sm text-muted">响应码</div><div>{selectedItem.responseStatus || '-'}</div></div>
          <div><div class="text-sm text-muted">耗时</div><div>{selectedItem.durationMs} ms</div></div>
          <div style="grid-column: span 2;"><div class="text-sm text-muted">端点URL</div><code style="word-break: break-all; font-size: 0.75rem;">{selectedItem.endpointUrl}</code></div>
          <div style="grid-column: span 2;"><div class="text-sm text-muted">执行时间</div><div>{formatDate(selectedItem.executedAt)}</div></div>
        </div>
        {#if selectedItem.errorMessage}
          <div style="padding:0.75rem;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:0.875rem;margin-bottom:1rem;">
            <strong>错误信息：</strong>{selectedItem.errorMessage}
          </div>
        {/if}
        <div class="mb-3"><div class="text-sm text-muted mb-1">请求头</div><div class="code-block" style="max-height: 180px;">{selectedItem.requestHeaders ? JSON.stringify(selectedItem.requestHeaders, null, 2) : '-'}</div></div>
        <div class="mb-3"><div class="text-sm text-muted mb-1">请求体</div><div class="code-block" style="max-height: 240px;">{selectedItem.requestBody || '-'}</div></div>
        {#if selectedComparisonItem?.replay.responseBody}
          <div class="mb-3"><div class="text-sm text-muted mb-1">回放响应体</div><div class="code-block" style="max-height: 240px;">{selectedComparisonItem.replay.responseBody}</div></div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .cursor-pointer { cursor: pointer; }
  .progress-bar-wrap-large {
    height: 16px;
    background: #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }
  .progress-bar-large {
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary), #60a5fa);
    border-radius: 8px;
    transition: width 0.4s ease;
  }
  .progress-animated {
    background: linear-gradient(
      90deg,
      var(--color-primary) 0%,
      #60a5fa 25%,
      var(--color-primary) 50%,
      #60a5fa 75%,
      var(--color-primary) 100%
    );
    background-size: 400% 100%;
    animation: progressStripes 2s linear infinite;
  }
  @keyframes progressStripes {
    0% { background-position: 400% 0; }
    100% { background-position: -400% 0; }
  }
  .mb-4 { margin-bottom: 1.5rem; }
  .mt-1 { margin-top: 0.25rem; }
  .mt-4 { margin-top: 1rem; }
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; }
</style>
