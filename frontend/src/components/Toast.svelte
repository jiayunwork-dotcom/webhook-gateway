<script lang="ts">
  import { uiStore } from '../lib/store';

  let toast: any;
  let unsubscribe = uiStore.toast.subscribe(v => toast = v);
</script>

{#if toast}
  <div class="toast-container">
    <div class="toast toast-{toast.type}">
      <span class="toast-icon">
        {#if toast.type === 'success'}✅
        {:else if toast.type === 'error'}❌
        {:else}ℹ️{/if}
      </span>
      <span class="toast-message">{toast.message}</span>
    </div>
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 2000;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .toast {
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 280px;
    max-width: 400px;
    animation: slideIn 0.2s ease;
  }
  .toast-success { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .toast-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .toast-info { background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
</style>
