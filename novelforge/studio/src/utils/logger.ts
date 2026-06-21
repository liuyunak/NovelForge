/**
 * Unified logger and toast utility.
 * Replaces scattered console.error and alert() calls.
 */

/** Non-blocking toast notification */
export function showToast(message: string, type: 'info' | 'error' | 'success' = 'info'): void {
  const colors: Record<string, string> = {
    info: 'border-gray-600',
    error: 'border-red-600 text-red-200',
    success: 'border-green-600 text-green-200',
  }
  const toast = document.createElement('div')
  toast.className = `fixed top-4 right-4 bg-gray-800 text-white px-5 py-3 rounded-lg shadow-lg z-[100] border text-sm ${colors[type]}`
  toast.style.animation = 'fadeIn 0.2s ease-out'
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.2s'
    setTimeout(() => toast.remove(), 200)
  }, 3000)
}

/** Structured error logging (dev only, replace with production logger later) */
export function logError(message: string, error: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(`[NovelForge] ${message}`, error instanceof Error ? error.message : error)
  }
}

/** Structured info logging (dev only) */
export function logInfo(message: string, data?: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(`[NovelForge] ${message}`, data ?? '')
  }
}
