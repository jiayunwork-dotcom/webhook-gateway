<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { logsApi, appsApi, endpointsApi } from '../lib/api';
  import { formatDate, formatRelative, uiStore } from '../lib/store';

  let apps: any[] = [];
  let endpoints: any[] = [];
  let items: any[] = [];
  let total = 0;
  let loading = true;
  let selectedDl: any = null;
  let selectedIds = new Set<string>();
  let filterAppId = '';
  let filterEndpointId = '';
  let bulkAction = '';
  let bulkLoading = false;
  let limit = 100;

  async function loadData() {
    loading = true;
    try {
      const params: any = { limit };
      if (filterAppId) params.appId = filterAppId;
      if (filterEndpointId) params.endpointId = filterEndpointId;
      const r = await logsApi.listDeadLetters(params);
      items = r.items || [];
      total = r.total || items.length;
      selectedIds.clear();
    } catch (e: any) { uiStore.error(e.message); }
    finally { loading = false; }
  }

  onMount(async () => {
    try {
      const [aps, eps] = await Promise.all([appsApi.list().catch(() => []), endpointsApi.list().catch(() => [])]);
      apps = aps || [];
      endpoints = eps || [];
    } catch {}
    loadData();
  });

  const allSelected = () => items.length > 0 && items.every(i => selectedIds.has(i.id));

  function toggleAll() {
    if (allSelected()) items.forEach(i => selectedIds.delete(i.id));
    else items.forEach(i => selectedIds.add(i.id));
    selectedIds = selectedIds;
  }

  function toggle(id: string) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    selectedIds = selectedIds;
  }

  async function resendSingle(id: string) {
    if (!confirm('确定重发此死信？')) return;
    try {
      await logsApi.resendDeadLetter(id);
      uiStore.success('重发成功');
      loadData();
    } catch (e: any) { uiStore.error(e.message); }
  }

  async function discardSingle(id: string) {
    if (!confirm('确定丢弃此死信？此操作不可恢复。')) return;
    try {
      await logsApi.discardDeadLetter(id);
      uiStore.success('已丢弃');
      loadData();
    } catch (e: any) { uiStore.error(e.message); }
  }

  async function runBulk(action: string) {
    if (selectedIds.size === 0) { uiStore.info('请先选择死信'); return; }
    const ids = Array.from(selectedIds);
    const msg = action === 'resend'
      ? `确定重发 ${ids.length} 条死信？`
      : `确定丢弃 ${ids.length} 条死信？此操作不可恢复。`;
    if (!confirm(msg)) return;
    bulkLoading = true;
    try {
      const r = action === 'resend'
        ? await logsApi.bulkResendDeadLetters(ids)
        : await logsApi.bulkDiscardDeadLetters(ids);
      uiStore.success(action === 'resend' ? `成功重发 ${r.count} 条` : `成功丢弃 ${r.count} 条`);
      loadData();
    } catch (e: any) { uiStore.error(e.message); }
    finally { bulkLoading = false; bulkAction = ''; }
  }
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">死信队列</h1>
    <p class="text-muted mb-0">投递重试耗尽后进入此队列，可人工重发或丢弃（共 {total} 条）</p>
  </div>
  <div class="page-actions">
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
    <div style="position: relative;">
      <button class="btn btn-primary" disabled="{selectedIds.size === 0}"
        on:click="{() => bulkAction = bulkAction ? '' : 'menu'}">
        批量操作 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} ▾
      </button>
      {#if bulkAction === 'menu'}
        <div style="position: absolute; right: 0; top: 100%; margin-top: 4px; background: white;
                    border: 1px solid var(--color-border); border-radius: 6px; box-shadow: var(--shadow-md);
                    z-index: 50; min-width: 140px; overflow: hidden;">
          <button style="display:block;width:100%;padding:0.5rem 0.875rem;border:none;background:transparent;
                         text-align:left;cursor:pointer;font-size:0.875rem;"
                  on:click="{() => runBulk('resend')}" disabled="{bulkLoading}">
            {bulkLoading ? '处理中...' : '✓ 批量重发'}
          </button>
          <button style="display:block;width:100%;padding:0.5rem 0.875rem;border:none;background:transparent;
                         text-align:left;cursor:pointer;font-size:0.875rem;color:var(--color-danger);"
                  on:click="{() => runBulk('discard')}" disabled="{bulkLoading}">
            {bulkLoading ? '处理中...' : '✕ 批量丢弃'}
          </button>
        </div>
      {/if}
    </div>
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
                <input type="checkbox" checked="{allSelected()}" on:change="{toggleAll}" />
              </th>
              <th>时间</th>
              <th>端点</th>
              <th>事件类型</th>
              <th>重试次数</th>
              <th>最后错误</th>
              <th style="width: 200px;">操作</th>
            </tr>
          </thead>
          <tbody>
            {#each items as dl (dl.id)}
              <tr>
                <td><input type="checkbox" checked="{selectedIds.has(dl.id)}" on:change="{() => toggle(dl.id)}" /></td>
                <td class="text-sm" style="white-space: nowrap;">{formatRelative(dl.createdAt)}</td>
                <td class="font-medium cursor-pointer" on:click="{() => navigate(`/endpoints/${dl.endpointId}`)}">
                  {endpoints.find(e => e.id === dl.endpointId)?.name || dl.endpointId.slice(0, 8)}
                </td>
                <td><code style="font-size: 0.75rem;">{dl.eventType}</code></td>
                <td>{dl.retryCount} 次</td>
                <td style="max-width: 240px;" class="text-sm text-danger"
                    title="{dl.lastErrorMessage || ''}">
                  {dl.lastErrorMessage ? (dl.lastErrorMessage.length > 60 ? dl.lastErrorMessage.slice(0, 60) + '...' : dl.lastErrorMessage) : '-'}
                </td>
                <td>
                  <div class="flex gap-2">
                    <button class="btn btn-secondary btn-sm" on:click="{() => selectedDl = dl}">详情</button>
                    <button class="btn btn-success btn-sm" on:click="{() => resendSingle(dl.id)}">重发</button>
                    <button class="btn btn-danger btn-sm" on:click="{() => discardSingle(dl.id)}">丢弃</button>
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
        <div class="empty-state-title">死信队列为空</div>
        <div class="empty-state-desc">所有事件投递都成功了，真棒！</div>
      </div>
    {/if}
  </div>
</div>

{#if selectedDl}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) selectedDl = null }}">
    <div class="modal" style="max-width: 680px;">
      <div class="modal-header">
        <h3 class="mb-0">死信详情</h3>
        <button class="icon-btn" on:click="{() => selectedDl = null}">✕</button>
      </div>
      <div class="modal-body" style="max-height: 70vh; overflow: auto;">
        <div class="grid-2 mb-4">
          <div><div class="text-sm text-muted">ID</div><div class="font-medium text-sm">{selectedDl.id}</div></div>
          <div><div class="text-sm text-muted">重试次数</div><div>{selectedDl.retryCount} 次</div></div>
          <div><div class="text-sm text-muted">端点</div><div>{endpoints.find(e => e.id === selectedDl.endpointId)?.name || '-'}</div></div>
          <div><div class="text-sm text-muted">事件类型</div><div><code>{selectedDl.eventType}</code></div></div>
          <div style="grid-column: span 2;"><div class="text-sm text-muted">端点URL</div><code style="word-break: break-all; font-size: 0.75rem;">{selectedDl.endpointUrl}</code></div>
          <div style="grid-column: span 2;"><div class="text-sm text-muted">创建时间</div><div>{formatDate(selectedDl.createdAt)}</div></div>
        </div>
        {#if selectedDl.lastErrorMessage}
          <div style="padding:0.75rem;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:0.875rem;margin-bottom:1rem;">
            <strong>最后错误：</strong>{selectedDl.lastErrorMessage}
          </div>
        {/if}
        <div class="mb-3"><div class="text-sm text-muted mb-1">请求头</div><div class="code-block" style="max-height: 140px;">{selectedDl.requestHeaders ? JSON.stringify(selectedDl.requestHeaders, null, 2) : '-'}</div></div>
        <div class="mb-3"><div class="text-sm text-muted mb-1">Payload</div><div class="code-block" style="max-height: 240px;">{JSON.stringify(selectedDl.payload, null, 2)}</div></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click="{() => selectedDl = null}">关闭</button>
        <button class="btn btn-danger" on:click="{() => { if (confirm('确定丢弃？')) { discardSingle(selectedDl.id); selectedDl = null; } }}">丢弃</button>
        <button class="btn btn-success" on:click="{() => { resendSingle(selectedDl.id); selectedDl = null; }}">重发</button>
      </div>
    </div>
  </div>
{/if}

<style>
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; }
  .cursor-pointer { cursor: pointer; }
</style>
