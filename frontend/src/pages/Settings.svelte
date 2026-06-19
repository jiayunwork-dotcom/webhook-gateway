<script lang="ts">
  import { onMount } from 'svelte';
  import { auth, uiStore } from '../lib/store';
  import { authApi } from '../lib/api';

  let tenant: any = null;
  let showKeys = false;
  let showRotateConfirm = false;
  let rotateResult: any = null;
  let rotating = false;

  onMount(() => {
    const unsub = auth.tenant.subscribe(t => tenant = t);
  });

  async function rotateKeys() {
    rotating = true;
    try {
      rotateResult = await authApi.rotateKeys();
      showRotateConfirm = false;
      showKeys = true;
      uiStore.success('密钥轮换成功，请保存新密钥');
      auth.fetchMe();
    } catch (e: any) {
      uiStore.error(e.message);
    } finally {
      rotating = false;
    }
  }

  function copy(text: string, label: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      uiStore.success(`${label}已复制到剪贴板`);
    }
  }
</script>

<div class="page-header">
  <div>
    <h1 class="page-title">系统设置</h1>
    <p class="text-muted mb-0">管理租户信息和 API 密钥</p>
  </div>
</div>

<div class="grid-2">
  <div class="card">
    <div class="card-header"><h4 class="mb-0">租户信息</h4></div>
    <div class="card-body">
      <div class="info-row">
        <div class="info-key">租户ID</div>
        <div class="info-val">
          <code>{tenant?.id || '-'}</code>
          <button class="btn btn-secondary btn-sm" style="margin-left: 8px;" on:click="{() => copy(tenant?.id || '', '租户ID')}">复制</button>
        </div>
      </div>
      <div class="info-row">
        <div class="info-key">租户名称</div>
        <div class="info-val font-medium">{tenant?.name || '-'}</div>
      </div>
      <div class="info-row">
        <div class="info-key">邮箱</div>
        <div class="info-val">{tenant?.email || '-'}</div>
      </div>
      <div class="info-row">
        <div class="info-key">账号状态</div>
        <div class="info-val">
          <span class="badge" style="{tenant?.isActive ? 'background:#ecfdf5;color:#065f46;border-color:#a7f3d0;' : 'background:#fef2f2;color:#991b1b;border-color:#fecaca;'}">
            {tenant?.isActive ? '✓ 正常' : '已禁用'}
          </span>
        </div>
      </div>
      <div class="info-row">
        <div class="info-key">应用配额</div>
        <div class="info-val">{tenant?.appCount || 0} / {tenant?.maxApps || 20} 个</div>
      </div>
      <div class="info-row">
        <div class="info-key">注册时间</div>
        <div class="info-val text-muted text-sm">{tenant?.createdAt ? new Date(tenant.createdAt).toLocaleString('zh-CN') : '-'}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h4 class="mb-0">API 密钥</h4>
      <div class="flex gap-2">
        <button class="btn btn-secondary btn-sm" on:click="{() => showKeys = !showKeys}">
          {showKeys ? '🙈 隐藏' : '👁 显示'}密钥
        </button>
        <button class="btn btn-primary btn-sm" on:click="{() => { rotateResult = null; showRotateConfirm = true; }}">
          🔄 轮换密钥
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="mb-4" style="padding: 0.75rem; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 0.8125rem; color: #1e40af;">
        <strong>💡 重要提示：</strong>请妥善保管您的 API 私钥，私钥丢失无法找回。轮换密钥后，旧密钥会在 <strong>72 小时</strong>的过渡期内同时生效（双签模式）。
      </div>

      <div class="form-group">
        <label class="form-label">公钥 (Publish Key) <span class="text-muted text-xs">- 用于发布事件，可放在客户端</span></label>
        <div class="flex gap-2">
          <input class="form-input" readonly type="{showKeys ? 'text' : 'password'}" value="{tenant?.apiPublicKey || ''}" />
          <button class="btn btn-secondary" on:click="{() => copy(tenant?.apiPublicKey || '', '公钥')}">复制</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">当前私钥 (Signing Key) <span class="text-danger text-xs">- 用于签名，切勿泄露</span></label>
        <div class="flex gap-2">
          <input class="form-input" readonly type="{showKeys ? 'text' : 'password'}" value="{rotateResult?.newPrivateKey || tenant ? '●●●●●●●●●●●●●●●●●●●●（重新登录后不可见）' : ''}" />
          <button class="btn btn-secondary" disabled="{!rotateResult?.newPrivateKey}" on:click="{() => copy(rotateResult?.newPrivateKey || '', '新私钥')}">复制</button>
        </div>
        {#if !rotateResult?.newPrivateKey}
          <div class="form-help text-danger">出于安全考虑，私钥创建后不再明文显示。如需更换请使用"轮换密钥"功能。</div>
        {/if}
      </div>

      {#if rotateResult}
        <div style="padding: 0.75rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; margin-top: 1rem;">
          <div class="font-medium text-success mb-2">✅ 密钥轮换成功！</div>
          <div class="text-sm mb-1">
            <strong>新公钥：</strong> <code style="word-break: break-all;">{rotateResult.newPublicKey}</code>
          </div>
          <div class="text-sm mb-1">
            <strong>新私钥：</strong> <code style="word-break: break-all; color: #dc2626;">{rotateResult.newPrivateKey}</code>
          </div>
          <div class="text-sm text-muted mt-2">
            过渡期：{rotateResult.transitionHours} 小时，此期间新旧两把密钥同时用于签名（双签模式）。
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="card" style="grid-column: span 2;">
    <div class="card-header"><h4 class="mb-0">签名验证指南</h4></div>
    <div class="card-body">
      <div class="text-sm text-muted mb-4">
        每次投递时，平台会在请求头中附带签名信息。您需要在接收端验证签名以确保请求的合法性和时效性。
      </div>

      <h5 class="mb-2">请求头说明</h5>
      <table class="table mb-6">
        <thead>
          <tr><th>请求头</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>X-Webhook-Timestamp</code></td>
            <td>签名时间戳（毫秒），与当前时间差超过 5 分钟应拒绝</td>
          </tr>
          <tr>
            <td><code>X-Webhook-Signature</code></td>
            <td>HMAC-SHA256 签名，格式：<code>sha256=&lt;hex&gt;</code></td>
          </tr>
          <tr>
            <td><code>X-Webhook-Signature-Transition</code></td>
            <td>密钥过渡期存在，使用旧密钥的签名（双签模式）</td>
          </tr>
          <tr>
            <td><code>X-Webhook-API-Key</code></td>
            <td>租户公钥</td>
          </tr>
          <tr>
            <td><code>X-Webhook-Event-Id</code></td>
            <td>唯一事件 ID，可用于去重</td>
          </tr>
          <tr>
            <td><code>X-Webhook-Event-Type</code></td>
            <td>事件类型，如 order.payment.completed</td>
          </tr>
        </tbody>
      </table>

      <h5 class="mb-2">Node.js 验证示例</h5>
      <div class="code-block">
{`import crypto from 'crypto';

function verifyWebhook(req, signingSecret, toleranceMs = 5 * 60 * 1000) {
  const timestamp = parseInt(req.headers['x-webhook-timestamp'], 10);
  const signature = req.headers['x-webhook-signature'];
  const transitionSig = req.headers['x-webhook-signature-transition'];
  
  // 1. 检查时间戳
  if (Math.abs(Date.now() - timestamp) > toleranceMs) {
    throw new Error('Request timestamp expired');
  }
  
  // 2. 构建签名内容
  const body = JSON.stringify(req.body);
  const message = \`\${timestamp}.\${body}\`;
  
  // 3. 验证签名（过渡期同时验证两个）
  const expected = 'sha256=' + crypto
    .createHmac('sha256', signingSecret)
    .update(message)
    .digest('hex');
  
  const match1 = crypto.timingSafeEqual(
    Buffer.from(signature), Buffer.from(expected)
  );
  const match2 = transitionSig ? crypto.timingSafeEqual(
    Buffer.from(transitionSig), Buffer.from(expected)
  ) : false;
  
  if (!match1 && !match2) {
    throw new Error('Invalid signature');
  }
  
  return true;
}`}
      </div>
    </div>
  </div>
</div>

{#if showRotateConfirm}
  <div class="modal-backdrop" on:click="{e => { if (e.target === e.currentTarget) showRotateConfirm = false }}">
    <div class="modal" style="max-width: 480px;">
      <div class="modal-header"><h3 class="mb-0">确认轮换 API 密钥</h3><button class="icon-btn" on:click="{() => showRotateConfirm = false}">✕</button></div>
      <div class="modal-body">
        <div style="padding: 0.75rem; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; margin-bottom: 1rem;">
          <strong>⚠️ 注意事项</strong>
          <ul style="margin: 0.5rem 0 0 1.25rem; padding: 0;">
            <li style="margin-bottom: 0.25rem;">系统会生成一对<strong>全新</strong>的密钥</li>
            <li style="margin-bottom: 0.25rem;">旧密钥会继续生效 <strong>72 小时</strong>（双签模式）</li>
            <li style="margin-bottom: 0.25rem;">请务必保存<strong>新私钥</strong>，之后不可再次查看</li>
            <li>接收端需要同步更新为新的私钥进行验证</li>
          </ul>
        </div>
        <p>确定要轮换 API 密钥吗？</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click="{() => showRotateConfirm = false}">取消</button>
        <button class="btn btn-primary" on:click="{rotateKeys}" disabled="{rotating}">
          {rotating ? '轮换中...' : '确认轮换'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .info-row { display: flex; padding: 0.75rem 0; border-bottom: 1px solid var(--color-border); align-items: flex-start; }
  .info-row:last-child { border-bottom: none; }
  .info-key { width: 120px; flex-shrink: 0; font-size: 0.8125rem; color: var(--color-text-muted); padding-top: 4px; }
  .info-val { flex: 1; font-size: 0.875rem; word-break: break-all; }
  code { background: #f1f5f9; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.8125rem; }
  table code { font-size: 0.75rem; }
  h5 { font-size: 1rem; font-weight: 600; color: var(--color-text); margin: 0 0 0.5rem; }
  .mb-6 { margin-bottom: 1.5rem; }
</style>
