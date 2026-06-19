<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate, useLocation } from 'svelte-routing';
  import { endpointsApi, appsApi, eventsApi } from '../lib/api';
  import { formatRelative, uiStore, statusColor, statusText } from '../lib/store';

  const location = useLocation();

  let endpoints: any[] = [];
  let apps: any[] = [];
  let loading = true;
  let filterAppId: string = '';
  let showCreateModal = false;
  let submitting = false;

  let form = { appId: '', name: '', description: '', url: '', subscribedEvents: '', rateLimitPerSecond: 50, customHeaders: '' };
  let formError = '';
  let availableEventTypes: string[] = [];

  async function loadData() {
    const qs = new URLSearchParams($location.search || '');
    filterAppId = qs.get('appId') || '';
    try {
      const [aps, et] = await Promise.all([
        appsApi.list(),
        endpointsApi.eventTypes().catch(() => ({ builtIn: [] })),
      ]);
      apps = aps || [];
      availableEventTypes = et?.builtIn || [];
      if (filterAppId) {
        endpoints = await endpointsApi.list(filterAppId);
      } else {
        endpoints = await endpointsApi.list();
      }
    } catch (e: any) {
      uiStore.error(e.message);
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  function toggleEventType(type: string) {
    const current = form.subscribedEvents.split(',').map(s => s.trim()).filter(Boolean);
    const idx = current.indexOf(type);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(type);
    form.subscribedEvents = current.join(', ');
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    formError = '';
    if (!form.appId || !form.name || !form.url) {
      formError = '请选择应用、填写名称和URL';
      return;
    }
    const events = form.subscribedEvents.split(',').map(s => s.trim()).filter(Boolean);
    if (events.length === 0) {
      formError = '请至少订阅一个事件';
      return;
    }
    submitting = true;
    try {
      const data: any = {
        name: form.name,
        url: form.url,
        subscribedEvents: events,
        rateLimitPerSecond: form.rateLimitPerSecond || 50,
      };
      if (form.description) data.description = form.description;
      if (form.customHeaders.trim()) {
        try { data.customHeaders = JSON.parse(form.customHeaders); }
        catch { formError = '自定义请求头格式错误'; submitting = false; return; }
      }
      await endpointsApi.create(form.appId, data);
      uiStore.success('端点创建成功');
      showCreateModal = false;
      form = { appId: filterAppId || apps[0]?.id || '', name: '', description: '', url: '', subscribedEvents: '', rateLimitPerSecond: 50, customHeaders: '' };
      loadData();
    } catch (err: any) { formError = err.message; }
    finally { submitting = false; }
  }

  async function testEndpoint(id: string) {
    try {
      const r = await eventsApi.testDelivery(id);
      uiStore.success(`测试投递已发送`);
    } catch (e: any) { uiStore.error(e.message); }
  }

  async function deleteEndpoint(id: string) {
    if (!confirm('确定删除？')) return;
    try { await endpointsApi.remove(id); uiStore.success('已删除'); loadData(); }
    catch (e: any) { uiStore.error(e.message); }
  }
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">接收端点</h1>
    <p class="text-muted mb-0">管理所有应用的 Webhook 接收端点</p>
  </div>
  <div class="page-actions">
    <select class="form-input" style="width: 200px;" bind:value="{filterAppId}" on:change="{loadData}">
      <option value="">全部应用</option>
      {#each apps as a (a.id)}
        <option value="{a.id}">{a.name}</option>
      {/each}
    </select>
    <button class="btn btn-primary" on:click="{() => { form.appId = filterAppId || apps[0]?.id || ''; showCreateModal = true; }}">
      + 新建端点
    </button>
  </div>
</div>

{#if loading}
  <div class="card"><div class="card-body"><div class="empty-state">⏳ 加载中...</div></div></div>
{:else}
  <div class="card">
    <div class="card-body" style="padding: 0;">
      {#if endpoints.length > 0}
        <div class="overflow-x-auto">
          <table class="table" style="margin: 0;">
            <thead>
              <tr>
                <th>名称</th>
                <th>所属应用</th>
                <th>URL</th>
                <th>订阅</th>
                <th>状态</th>
                <th>连续失败</th>
                <th>最近投递</th>
                <th style="width: 260px;">操作</th>
              </tr>
            </thead>
            <tbody>
              {#each endpoints as ep (ep.id)}
                <tr>
                  <td class="font-medium cursor-pointer" on:click="{() => navigate(`/endpoints/${ep.id}`)}">{ep.name}</td>
                  <td>{apps.find(a => a.id === ep.appId)?.name || '-'}</td>
                  <td>
                    <code style="font-size: 0.75rem; word-break: break-all; display: block; max-width: 280px;">{ep.url}</code>
                  </td>
                  <td>
                    {#each ep.subscribedEvents.slice(0, 2) as ev}
                      <span class="badge" style="background:#e0e7ff;color:#3730a3;border-color:#c7d2fe;margin-right:4px;">{ev}</span>
                    {/each}
                    {#if ep.subscribedEvents.length > 2}
                      <span class="badge bg-gray-100 text-gray-800 border-gray-200">+{ep.subscribedEvents.length - 2}</span>
                    {/if}
                  </td>
                  <td><span class="badge {statusColor(ep.status)}">{statusText(ep.status)}</span></td>
                  <td>{ep.consecutiveFailures || 0}</td>
                  <td class="text-sm text-muted">{formatRelative(ep.lastDeliveryAt)}</td>
                  <td>
                    <div class="flex gap-2 flex-wrap">
                      <button class="btn btn-secondary btn-sm" on:click="{() => navigate(`/endpoints/${ep.id}`)}">详情</button>
                      <button class="btn btn-secondary btn-sm" on:click="{() => testEndpoint(ep.id)}">测试</button>
                      <button class="btn btn-danger btn-sm" on:click="{() => deleteEndpoint(ep.id)}">删除</button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty-state">
          <div class="empty-state-icon">🔗</div>
          <div class="empty-state-title">还没有接收端点</div>
          <div class="empty-state-desc">创建端点以开始接收 Webhook 事件</div>
          <div class="mt-4">
            <button class="btn btn-primary" on:click="{() => showCreateModal = true}">创建端点</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showCreateModal}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) showCreateModal = false }}">
    <div class="modal" style="max-width: 640px;">
      <div class="modal-header"><h3 class="mb-0">新建接收端点</h3><button class="icon-btn" on:click="{() => showCreateModal = false}">✕</button></div>
      <form on:submit="{onSubmit}">
        <div class="modal-body">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">所属应用 *</label>
              <select class="form-input" bind:value="{form.appId}">
                <option value="">请选择...</option>
                {#each apps as a (a.id)}<option value="{a.id}">{a.name}</option>{/each}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">速率限制(次/秒)</label>
              <input type="number" class="form-input" bind:value="{form.rateLimitPerSecond}" min="1" max="10000" />
            </div>
          </div>
          <div class="form-group"><label class="form-label">端点名称 *</label><input class="form-input" bind:value="{form.name}" maxlength="100" /></div>
          <div class="form-group"><label class="form-label">接收 URL *</label><input class="form-input" bind:value="{form.url}" placeholder="https://example.com/webhook" /></div>
          <div class="form-group"><label class="form-label">描述</label><input class="form-input" bind:value="{form.description}" /></div>
          <div class="form-group">
            <label class="form-label">订阅事件 *</label>
            <input class="form-input" bind:value="{form.subscribedEvents}" placeholder="逗号分隔，如 order.*, payment.refunded" />
            {#if availableEventTypes.length > 0}
              <div class="mt-2" style="display: flex; flex-wrap: wrap; gap: 0.375rem;">
                {#each availableEventTypes.slice(0, 12) as type}
                  <span
                    class="badge cursor-pointer"
                    on:click="{() => toggleEventType(type)}"
                    style="background: {form.subscribedEvents.includes(type) ? 'rgba(99,102,241,0.1)' : '#f1f5f9'};
                           color: {form.subscribedEvents.includes(type) ? '#4f46e5' : '#64748b'};
                           border-color: {form.subscribedEvents.includes(type) ? '#c7d2fe' : '#e2e8f0'};">{type}</span>
                {/each}
              </div>
            {/if}
          </div>
          <div class="form-group">
            <label class="form-label">自定义请求头(JSON)</label>
            <textarea class="form-textarea" bind:value="{form.customHeaders}" placeholder='{"X-Token": "xxx"}' style="min-height: 60px;"></textarea>
          </div>
          {#if formError}
            <div style="padding:0.5rem 0.75rem;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:6px;font-size:0.875rem;">{formError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click="{() => showCreateModal = false}">取消</button>
          <button type="submit" class="btn btn-primary" disabled="{submitting}">{submitting ? '创建中...' : '创建'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; }
  .cursor-pointer { cursor: pointer; }
</style>
