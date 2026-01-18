import React from 'react'
import { useToast } from '../hooks/useToast'
import '../assets/toast.css'

interface ToastContainerProps {
  highContrast?: boolean
}

export default function ToastContainer({
  highContrast = false
}: ToastContainerProps): React.ReactElement {
  const { toasts, removeToast } = useToast()

  return (
    <div className={`toast-container${highContrast ? ' high-contrast' : ''}`}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}${highContrast ? ' high-contrast' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className={`toast-content${highContrast ? ' high-contrast' : ''}`}>
            <span
              className={`toast-icon toast-icon-${toast.type}${highContrast ? ' high-contrast' : ''}`}
            >
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'info' && 'ℹ'}
              {toast.type === 'warning' && '⚠'}
            </span>
            <span className={`toast-message${highContrast ? ' high-contrast' : ''}`}>
              {toast.message}
            </span>
          </div>
          <button
            className={`toast-close${highContrast ? ' high-contrast' : ''}`}
            onClick={() => removeToast(toast.id)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
