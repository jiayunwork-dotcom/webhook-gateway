<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { alertsApi, appsApi, endpointsApi } from '../lib/api';
  import { formatRelative, uiStore } from '../lib/store';

  let rules: any[] = [];
  let apps: any[] = [];
  let endpoints: any[] = [];
  let loading = true;
  let showCreate = false;
  let submitting = false;
  let createError = '';

  let form = {
    name: '',
    type: 'endpoint_failure_rate' as const,
    appId: '',
    endpointId: '',
    failureRateThreshold: 30,
    windowMinutes: 5,
    minEvents: 10,
    severity: 'warning' as const,
  };

  async function loadData() {
    loading = true;
    try {
      const [r, aps, eps] = await Promise.all([
        alertsApi.listRules(),
        appsApi.list().catch(() => []),
        endpointsApi.list().catch(() => []),
      ]);
      rules = r || [];
      apps = aps || [];
      endpoints = eps || [];
    } catch (e: any) { uiStore.error(e.message); }
    finally { loading = false; }
  }

  onMount(loadData);

  async function createRule(e: Event) {
    e.preventDefault();
    createError = '';
    if (!form.name) { createError = '请输入规则名称'; return; }
    submitting = true;
    try {
      const conditions: any = {};
      if (form.type === 'endpoint_failure_rate') {
        conditions.failureRateThreshold = form.failureRateThreshold / 100;
        conditions.windowMinutes = form.windowMinutes;
        conditions.minEvents = form.minEvents;
      }
      conditions.severity = form.severity;
      const data: any = { name: form.name, type: form.type, conditions };
      if (form.appId) data.appId = form.appId;
      if (form.endpointId) data.endpointId = form.endpointId;
      await alertsApi.createRule(data);
      uiStore.success('规则创建成功');
      showCreate = false;
      form = { name: '', type: 'endpoint_failure_rate', appId: '', endpointId: '', failureRateThreshold: 30, windowMinutes: 5, minEvents: 10, severity: 'warning' };
      loadData();
    } catch (err: any) { createError = err.message; }
    finally { submitting = false; }
  }

  async function toggleActive(rule: any) {
    try {
      await alertsApi.updateRule(rule.id, { isActive: !rule.isActive });
      rule.isActive = !rule.isActive;
      uiStore.success(rule.isActive ? '已启用' : '已停用');
    } catch (e: any) { uiStore.error(e.message); }
  }

  async function deleteRule(id: string) {
    if (!confirm('确定删除该规则？')) return;
    try { await alertsApi.deleteRule(id); uiStore.success('已删除'); loadData(); }
    catch (e: any) { uiStore.error(e.message); }
  }

  const typeText: Record<string, string> = {
    endpoint_failure_rate: '失败率过高',
    endpoint_unhealthy: '端点异常',
    delivery_delay: '投递延迟',
    queue_backlog: '队列积压',
  };

  $: filteredEndpoints = form.appId ? endpoints.filter(e => e.appId === form.appId) : endpoints;
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">告警规则</h1>
    <p class="text-muted mb-0">配置告警规则，及时发现投递问题</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary" on:click="{() => navigate('/alerts')}">返回告警中心</button>
    <button class="btn btn-primary" on:click="{() => showCreate = true}">+ 新建规则</button>
  </div>
</div>

<div class="card">
  <div class="card-body" style="padding: 0;">
    {#if loading}
      <div class="empty-state">⏳ 加载中...</div>
    {:else if rules.length > 0}
      <table class="table" style="margin: 0;">
        <thead>
          <tr>
            <th>规则名称</th>
            <th>类型</th>
            <th>条件</th>
            <th>适用范围</th>
            <th>级别</th>
            <th>状态</th>
            <th>上次触发</th>
            <th style="width: 160px;">操作</th>
          </tr>
        </thead>
        <tbody>
          {#each rules as rule (rule.id)}
            <tr>
              <td class="font-medium">{rule.name}</td>
              <td class="text-sm">{typeText[rule.type] || rule.type}</td>
              <td class="text-sm text-muted">
                {#if rule.type === 'endpoint_failure_rate'}
                  失败率 ≥ {Math.round((rule.conditions?.failureRateThreshold || 0) * 100)}% ({rule.conditions?.windowMinutes || 5}分钟内 ≥ {rule.conditions?.minEvents || 10}次)
                {:else if rule.type === 'queue_backlog'}
                  队列深度 ≥ {rule.conditions?.queueDepthThreshold || 100}
                {:else}
                  默认条件
                {/if}
              </td>
              <td class="text-sm">
                {#if rule.endpointId}
                  端点: {endpoints.find(e => e.id === rule.endpointId)?.name || rule.endpointId.slice(0, 8)}
                {:else if rule.appId}
                  应用: {apps.find(a => a.id === rule.appId)?.name || rule.appId.slice(0, 8)}
                {:else}
                  <span class="text-muted">全部</span>
                {/if}
              </td>
              <td>
                <span class="badge"
                  style="background: {rule.conditions?.severity === 'critical' ? '#fee2e2' : rule.conditions?.severity === 'warning' ? '#fef3c7' : '#dbeafe'};
                         color: {rule.conditions?.severity === 'critical' ? '#991b1b' : rule.conditions?.severity === 'warning' ? '#92400e' : '#1e40af'};
                         border-color: {rule.conditions?.severity === 'critical' ? '#fecaca' : rule.conditions?.severity === 'warning' ? '#fde68a' : '#bfdbfe'};">
                  {rule.conditions?.severity === 'critical' ? '严重' : rule.conditions?.severity === 'warning' ? '警告' : '提示'}
                </span>
              </td>
              <td>
                <button class="badge cursor-pointer"
                  style="background: {rule.isActive ? '#ecfdf5' : '#f1f5f9'}; color: {rule.isActive ? '#065f46' : '#64748b'}; border-color: {rule.isActive ? '#a7f3d0' : '#e2e8f0'};"
                  on:click="{() => toggleActive(rule)}">
                  {rule.isActive ? '✓ 启用' : '停用'}
                </button>
              </td>
              <td class="text-sm text-muted">{formatRelative(rule.lastTriggeredAt)}</td>
              <td>
                <button class="btn btn-danger btn-sm" on:click="{() => deleteRule(rule.id)}">删除</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="empty-state">
        <div class="empty-state-icon">⚙️</div>
        <div class="empty-state-title">还没有告警规则</div>
        <div class="empty-state-desc">创建规则在异常发生时及时收到通知</div>
        <div class="mt-4">
          <button class="btn btn-primary" on:click="{() => showCreate = true}">创建规则</button>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showCreate}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) showCreate = false }}">
    <div class="modal" style="max-width: 560px;">
      <div class="modal-header"><h3 class="mb-0">新建告警规则</h3><button class="icon-btn" on:click="{() => showCreate = false}">✕</button></div>
      <form on:submit="{createRule}">
        <div class="modal-body">
          <div class="form-group"><label class="form-label">规则名称 *</label><input class="form-input" bind:value="{form.name}" placeholder="例如：高失败率告警" /></div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">告警类型</label>
              <select class="form-input" bind:value="{form.type}">
                <option value="endpoint_failure_rate">端点失败率过高</option>
                <option value="endpoint_unhealthy">端点不健康</option>
                <option value="queue_backlog">队列深度积压</option>
                <option value="delivery_delay">投递延迟过高</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">严重级别</label>
              <select class="form-input" bind:value="{form.severity}">
                <option value="info">提示</option>
                <option value="warning">警告</option>
                <option value="critical">严重</option>
              </select>
            </div>
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">适用应用</label>
              <select class="form-input" bind:value="{form.appId}">
                <option value="">全部应用</option>
                {#each apps as a (a.id)}<option value="{a.id}">{a.name}</option>{/each}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">适用端点</label>
              <select class="form-input" bind:value="{form.endpointId}">
                <option value="">全部端点</option>
                {#each filteredEndpoints as ep (ep.id)}<option value="{ep.id}">{ep.name}</option>{/each}
              </select>
            </div>
          </div>
          {#if form.type === 'endpoint_failure_rate'}
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">失败率阈值 (%)</label>
                <input type="number" class="form-input" bind:value="{form.failureRateThreshold}" min="1" max="100" />
              </div>
              <div class="form-group">
                <label class="form-label">统计窗口 (分钟)</label>
                <input type="number" class="form-input" bind:value="{form.windowMinutes}" min="1" max="1440" />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">最小事件数</label>
              <input type="number" class="form-input" bind:value="{form.minEvents}" min="1" />
              <div class="form-help">窗口内事件数低于此值时不触发告警（避免误报）</div>
            </div>
          {/if}
          {#if createError}
            <div style="padding:0.5rem;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:6px;font-size:0.875rem;">{createError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click="{() => showCreate = false}">取消</button>
          <button type="submit" class="btn btn-primary" disabled="{submitting}">{submitting ? '创建中...' : '创建规则'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .cursor-pointer { cursor: pointer; }
</style>
