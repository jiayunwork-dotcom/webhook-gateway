<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { appsApi, endpointsApi } from '../lib/api';
  import { formatRelative, uiStore, auth } from '../lib/store';

  let apps: any[] = [];
  let loading = true;
  let showCreateModal = false;
  let submitting = false;

  let form = { name: '', description: '', customEventTypes: '' };
  let formError = '';

  async function loadData() {
    try {
      apps = await appsApi.list();
    } catch (e: any) {
      uiStore.error(e.message);
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  async function onSubmit(e: Event) {
    e.preventDefault();
    formError = '';
    if (!form.name || form.name.length < 2) {
      formError = '应用名称至少 2 个字符';
      return;
    }
    submitting = true;
    try {
      const data: any = { name: form.name };
      if (form.description) data.description = form.description;
      if (form.customEventTypes.trim()) {
        data.customEventTypes = form.customEventTypes.split(',').map(s => s.trim()).filter(Boolean);
      }
      await appsApi.create(data);
      uiStore.success('应用创建成功');
      showCreateModal = false;
      form = { name: '', description: '', customEventTypes: '' };
      loadData();
    } catch (err: any) {
      formError = err.message;
    } finally {
      submitting = false;
    }
  }

  async function deleteApp(id: string) {
    if (!confirm('确定删除该应用？其下的所有端点和配置将被永久删除，此操作不可恢复。')) return;
    try {
      await appsApi.remove(id);
      uiStore.success('应用已删除');
      loadData();
    } catch (e: any) {
      uiStore.error(e.message);
    }
  }

  async function toggleActive(app: any) {
    try {
      await appsApi.update(app.id, { isActive: !app.isActive });
      app.isActive = !app.isActive;
      uiStore.success(app.isActive ? '应用已启用' : '应用已停用');
    } catch (e: any) {
      uiStore.error(e.message);
    }
  }

  $: maxApps = $auth.tenant?.maxApps || 20;
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">应用管理</h1>
    <p class="text-muted mb-0">管理您的应用及其下的端点配置（{apps.length} / {maxApps}）</p>
  </div>
  <div class="page-actions">
    <button class="btn btn-primary" on:click="{() => showCreateModal = true}">
      + 新建应用
    </button>
  </div>
</div>

{#if loading}
  <div class="card"><div class="card-body"><div class="empty-state">⏳ 加载中...</div></div></div>
{:else}
  <div class="card">
    <div class="card-body" style="padding: 0;">
      {#if apps.length > 0}
        <div class="overflow-x-auto">
          <table class="table" style="margin: 0;">
            <thead>
              <tr>
                <th>应用名称</th>
                <th>描述</th>
                <th>端点数量</th>
                <th>自定义事件</th>
                <th>状态</th>
                <th>创建时间</th>
                <th style="width: 200px;">操作</th>
              </tr>
            </thead>
            <tbody>
              {#each apps as app (app.id)}
                <tr>
                  <td class="font-medium cursor-pointer" on:click="{() => navigate(`/apps/${app.id}`)}">
                    {app.name}
                  </td>
                  <td class="text-muted">{app.description || '-'}</td>
                  <td>{app.endpointCount || 0} / {app.maxEndpoints}</td>
                  <td>
                    {#if app.customEventTypes?.length}
                      <span class="badge bg-indigo-100 text-indigo-800 border-indigo-200">
                        {app.customEventTypes.length} 个
                      </span>
                    {:else}
                      <span class="text-muted text-sm">-</span>
                    {/if}
                  </td>
                  <td>
                    <button
                      class="badge {app.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'} cursor-pointer"
                      on:click="{() => toggleActive(app)}"
                      title="点击切换状态"
                    >
                      {app.isActive ? '✓ 启用' : '停用'}
                    </button>
                  </td>
                  <td class="text-sm text-muted">{formatRelative(app.createdAt)}</td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn-secondary btn-sm" on:click="{() => navigate(`/apps/${app.id}`)}">详情</button>
                      <button class="btn btn-secondary btn-sm" on:click="{() => navigate(`/endpoints?appId=${app.id}`)}">端点</button>
                      <button class="btn btn-danger btn-sm" on:click="{() => deleteApp(app.id)}">删除</button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="empty-state">
          <div class="empty-state-icon">📱</div>
          <div class="empty-state-title">还没有应用</div>
          <div class="empty-state-desc">创建您的第一个应用以开始发布事件</div>
          <div class="mt-4">
            <button class="btn btn-primary" on:click="{() => showCreateModal = true}">创建应用</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showCreateModal}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) showCreateModal = false }}">
    <div class="modal">
      <div class="modal-header">
        <h3 class="mb-0">新建应用</h3>
        <button class="icon-btn" on:click="{() => showCreateModal = false}">✕</button>
      </div>
      <form on:submit="{onSubmit}">
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">应用名称 *</label>
            <input class="form-input" bind:value="{form.name}" placeholder="例如：订单系统" maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea class="form-textarea" bind:value="{form.description}" placeholder="应用用途描述（可选）" maxlength="500"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">自定义事件类型</label>
            <textarea class="form-textarea" bind:value="{form.customEventTypes}"
              placeholder="用逗号分隔，例如：order.payment.completed,refund.requested"
              style="min-height: 80px;"></textarea>
            <div class="form-help">
              事件类型采用三段式命名：domain.entity.action，例如 order.payment.completed
            </div>
          </div>
          {#if formError}
            <div class="alert alert-error" style="padding: 0.5rem 0.75rem; font-size: 0.875rem;">{formError}</div>
          {/if}
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" on:click="{() => showCreateModal = false}">取消</button>
          <button type="submit" class="btn btn-primary" disabled="{submitting}">
            {submitting ? '创建中...' : '创建应用'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .bg-indigo-100 { background: #e0e7ff; color: #3730a3; border-color: #c7d2fe; }
  .cursor-pointer { cursor: pointer; }
</style>
