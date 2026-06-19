<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate, useParams } from 'svelte-routing';
  import { appsApi, endpointsApi, metricsApi, eventsApi } from '../lib/api';
  import { formatRelative, uiStore, statusColor, statusText } from '../lib/store';

  export let params = useParams();

  let app: any = null;
  let endpoints: any[] = [];
  let appMetrics: any = null;
  let loading = true;
  let showCreateEndpoint = false;
  let showPublishEvent = false;
  let submitting = false;

  let endpointForm = { name: '', description: '', url: '', subscribedEvents: '', rateLimitPerSecond: 50, customHeaders: '' };
  let endpointFormError = '';
  let availableEventTypes: string[] = [];

  let eventForm = { eventType: '', payload: '{\n  "test": true\n}', idempotencyKey: '' };
  let eventFormError = '';
  let publishResult: any = null;

  async function loadData() {
    try {
      const id = params.id;
      const [a, es, m, et] = await Promise.all([
        appsApi.get(id),
        endpointsApi.list(id),
        metricsApi.app(id).catch(() => null),
        endpointsApi.eventTypes().catch(() => ({ builtIn: [] })),
      ]);
      app = a;
      endpoints = es || [];
      appMetrics = m;
      availableEventTypes = et?.builtIn || [];
      if (app?.customEventTypes) {
        availableEventTypes = [...new Set([...availableEventTypes, ...app.customEventTypes])];
      }
    } catch (e: any) {
      uiStore.error(e.message);
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  function toggleEventType(type: string) {
    const current = endpointForm.subscribedEvents.split(',').map(s => s.trim()).filter(Boolean);
    const idx = current.indexOf(type);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(type);
    }
    endpointForm.subscribedEvents = current.join(', ');
  }

  async function submitEndpoint(e: Event) {
    e.preventDefault();
    endpointFormError = '';
    if (!endpointForm.name || !endpointForm.url) {
      endpointFormError = '请填写端点名称和接收URL';
      return;
    }
    const events = endpointForm.subscribedEvents.split(',').map(s => s.trim()).filter(Boolean);
    if (events.length === 0) {
      endpointFormError = '请至少订阅一个事件类型';
      return;
    }
    submitting = true;
    try {
      const data: any = {
        name: endpointForm.name,
        url: endpointForm.url,
        subscribedEvents: events,
        rateLimitPerSecond: endpointForm.rateLimitPerSecond || 50,
      };
      if (endpointForm.description) data.description = endpointForm.description;
      if (endpointForm.customHeaders.trim()) {
        try {
          data.customHeaders = JSON.parse(endpointForm.customHeaders);
        } catch {
          endpointFormError = '自定义请求头格式错误，应为合法 JSON';
          submitting = false;
          return;
        }
      }
      await endpointsApi.create(params.id, data);
      uiStore.success('端点创建成功');
      showCreateEndpoint = false;
      endpointForm = { name: '', description: '', url: '', subscribedEvents: '', rateLimitPerSecond: 50, customHeaders: '' };
      loadData();
    } catch (err: any) {
      endpointFormError = err.message;
    } finally {
      submitting = false;
    }
  }

  async function submitEvent(e: Event) {
    e.preventDefault();
    eventFormError = '';
    publishResult = null;
    if (!eventForm.eventType) {
      eventFormError = '请填写事件类型';
      return;
    }
    let payload: any;
    try {
      payload = JSON.parse(eventForm.payload);
    } catch {
      eventFormError = '请求体格式错误，应为合法 JSON';
      return;
    }
    submitting = true;
    try {
      const data: any = { eventType: eventForm.eventType, payload, eventSource: 'admin_panel' };
      if (eventForm.idempotencyKey) data.idempotencyKey = eventForm.idempotencyKey;
      publishResult = await eventsApi.publish(params.id, data);
      uiStore.success(`事件发布成功，匹配 ${publishResult.matchedEndpoints} 个端点`);
    } catch (err: any) {
      eventFormError = err.message;
    } finally {
      submitting = false;
    }
  }

  async function deleteEndpoint(id: string) {
    if (!confirm('确定删除该端点？此操作不可恢复。')) return;
    try {
      await endpointsApi.remove(id);
      uiStore.success('端点已删除');
      loadData();
    } catch (e: any) {
      uiStore.error(e.message);
    }
  }

  async function testEndpoint(id: string) {
    try {
      const r = await eventsApi.testDelivery(id);
      uiStore.success(`测试投递已发送：${r.endpointUrl}`);
      setTimeout(() => navigate(`/endpoints/${id}`), 800);
    } catch (e: any) {
      uiStore.error(e.message);
    }
  }
</script>

{#if loading}
  <div class="card"><div class="card-body"><div class="empty-state">⏳ 加载中...</div></div></div>
{:else if !app}
  <div class="card"><div class="card-body"><div class="empty-state">应用不存在</div></div></div>
{:else}
  <div class="page-header">
    <div>
      <div class="flex items-center gap-2 mb-1">
        <button class="icon-btn" on:click="{() => navigate('/apps')}" title="返回">←</button>
        <h1 class="page-title mb-0">{app.name}</h1>
      </div>
      <p class="text-muted mb-0 ml-10">{app.description || '无描述'} · 创建于 {formatRelative(app.createdAt)}</p>
    </div>
    <div class="page-actions">
      <button class="btn btn-secondary" on:click="{() => showPublishEvent = true}">📤 发布事件</button>
      <button class="btn btn-primary" on:click="{() => showCreateEndpoint = true}">+ 新建端点</button>
    </div>
  </div>

  {#if appMetrics?.summary}
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">总投递量</div>
        <div class="stat-value">{appMetrics.summary.totalDeliveries || 0}</div>
        <div class="stat-sub">24小时内</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">成功率</div>
        <div class="stat-value">{appMetrics.summary.successRate || '100.00'}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均延迟</div>
        <div class="stat-value">{appMetrics.summary.averageLatencyMs || 0}<span class="text-sm"> ms</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">死信数量</div>
        <div class="stat-value">{appMetrics.summary.deadLetterCount || 0}</div>
        <div class="stat-sub">
          {#if appMetrics.summary.deadLetterCount > 0}<a href="/dead-letters">查看</a>{/if}
        </div>
      </div>
    </div>
  {/if}

  <div class="card">
    <div class="card-header">
      <h4 class="mb-0">接收端点（{endpoints.length} / {app.maxEndpoints}）</h4>
    </div>
    <div class="card-body" style="padding: 0;">
      {#if endpoints.length > 0}
        <div class="overflow-x-auto">
          <table class="table" style="margin: 0;">
            <thead>
              <tr>
                <th>名称</th>
                <th>URL</th>
                <th>订阅事件</th>
                <th>速率限制</th>
                <th>状态</th>
                <th>最近投递</th>
                <th style="width: 240px;">操作</th>
              </tr>
            </thead>
            <tbody>
              {#each endpoints as ep (ep.id)}
                <tr>
                  <td class="font-medium cursor-pointer" on:click="{() => navigate(`/endpoints/${ep.id}`)}">{ep.name}</td>
                  <td>
                    <code style="font-size: 0.75rem; word-break: break-all; display: block; max-width: 320px;">{ep.url}</code>
                  </td>
                  <td>
                    {#each ep.subscribedEvents.slice(0, 3) as ev}
                      <span class="badge bg-indigo-100 text-indigo-800 border-indigo-200 mr-1 mb-1"
                        style="background:#e0e7ff;color:#3730a3;border-color:#c7d2fe;">{ev}</span>
                    {/each}
                    {#if ep.subscribedEvents.length > 3}
                      <span class="badge bg-gray-100 text-gray-800 border-gray-200">+{ep.subscribedEvents.length - 3}</span>
                    {/if}
                  </td>
                  <td>{ep.rateLimitPerSecond}/s</td>
                  <td>
                    <span class="badge {statusColor(ep.status)}">{statusText(ep.status)}</span>
                  </td>
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
          <div class="empty-state-desc">创建端点来接收此应用发布的事件</div>
          <div class="mt-4">
            <button class="btn btn-primary" on:click="{() => showCreateEndpoint = true}">创建端点</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showCreateEndpoint}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) showCreateEndpoint = false }}">
    <div class="modal" style="max-width: 640px;">
      <div class="modal-header">
        <h3 class="mb-0">新建接收端点</h3>
        <button class="icon-btn" on:click="{() => showCreateEndpoint = false}">✕</button>
      </div>
      <form on:submit="{submitEndpoint}">
        <div class="modal-body">
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">端点名称 *</label>
              <input class="form-input" bind:value="{endpointForm.name}" placeholder="例如：订单通知" maxlength="100" />
            </div>
            <div class="form-group">
              <label class="form-label">速率限制 (次/秒)</label>
              <input type="number" class="form-input" bind:value="{endpointForm.rateLimitPerSecond}" min="1" max="10000" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">接收 URL *</label>
            <input class="form-input" bind:value="{endpointForm.url}" placeholder="https://your-api.com/webhook" maxlength="2000" />
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <input class="form-input" bind:value="{endpointForm.description}" placeholder="可选" maxlength="500" />
          </div>
          <div class="form-group">
            <label class="form-label">订阅事件 *</label>
            <input class="form-input" bind:value="{endpointForm.subscribedEvents}"
              placeholder="用逗号分隔，支持通配符如 order.*" />
            <div class="form-help">支持通配符：order.* 匹配 order 域下所有事件</div>
            {#if availableEventTypes.length > 0}
              <div class="mt-2" style="display: flex; flex-wrap: wrap; gap: 0.375rem;">
                {#each availableEventTypes.slice(0, 15) as type}
                  <span
                    class="badge cursor-pointer"
                    class:active="{endpointForm.subscribedEvents.includes(type)}"
                    on:click="{() => toggleEventType(type)}"
                    style="background: {endpointForm.subscribedEvents.includes(type) ? 'rgba(99,102,241,0.1)' : '#f1f5f9'};
                           color: {endpointForm.subscribedEvents.includes(type) ? '#4f46e5' : '#64748b'};
                           border-color: {endpointForm.subscribedEvents.includes(type) ? '#c7d2fe' : '#e2e8f0'};"
                  >{type}</span>
                {/each}
              </div>
            {/if}
          </div>
          <div class="form-group">
            <label class="form-label">自定义请求头 (JSON)</label>
            <textarea class="form-textarea" bind:value="{endpointForm.customHeaders}"
              placeholder='{"Authorization": "Bearer xxx"}' style="min-height: 60px;"></textarea>
          </div>
          {#if endpointFormError}
            <div class="alert alert-error" style="padding: 0.5rem 0.75rem; font-size: 0.875rem;">{endpointFormError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click="{() => showCreateEndpoint = false}">取消</button>
          <button type="submit" class="btn btn-primary" disabled="{submitting}">
            {submitting ? '创建中...' : '创建端点'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showPublishEvent}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) showPublishEvent = false }}">
    <div class="modal" style="max-width: 600px;">
      <div class="modal-header">
        <h3 class="mb-0">手动发布测试事件</h3>
        <button class="icon-btn" on:click="{() => showPublishEvent = false}">✕</button>
      </div>
      <form on:submit="{submitEvent}">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">事件类型 *</label>
            <input class="form-input" bind:value="{eventForm.eventType}" placeholder="order.payment.completed" />
          </div>
          <div class="form-group">
            <label class="form-label">幂等键</label>
            <input class="form-input" bind:value="{eventForm.idempotencyKey}" placeholder="可选，用于去重" />
          </div>
          <div class="form-group">
            <label class="form-label">Payload (JSON) *</label>
            <textarea class="form-textarea" bind:value="{eventForm.payload}" style="min-height: 180px; font-family: monospace; font-size: 0.8125rem;"></textarea>
          </div>
          {#if eventFormError}
            <div class="alert alert-error" style="padding: 0.5rem 0.75rem; font-size: 0.875rem;">{eventFormError}</div>
          {/if}
          {#if publishResult}
            <div style="padding: 0.75rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; font-size: 0.875rem; color: #065f46;">
              ✓ 发布成功！事件 ID: <code>{publishResult.eventId}</code><br />
              匹配端点: {publishResult.matchedEndpoints} 个
            </div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click="{() => { showPublishEvent = false; publishResult = null; }}">关闭</button>
          <button type="submit" class="btn btn-primary" disabled="{submitting}">
            {submitting ? '发布中...' : '发布事件'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .bg-indigo-100 { background: #e0e7ff; color: #3730a3; border-color: #c7d2fe; }
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; }
  .cursor-pointer { cursor: pointer; }
  .ml-10 { margin-left: 2.5rem; }
  .mr-1 { margin-right: 0.25rem; }
  .mb-1 { margin-bottom: 0.25rem; }
</style>
