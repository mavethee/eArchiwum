import React from 'react'
import '../assets/toast.css'

interface ModalProps {
  isOpen: boolean
  title: string
  children: React.ReactNode
  onClose: () => void
  buttons?: Array<{
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary' | 'danger'
    disabled?: boolean
  }>
  highContrast?: boolean
}

export function Modal({
  isOpen,
  title,
  children,
  onClose,
  buttons = [],
  highContrast = false
}: ModalProps): React.ReactElement | null {
  if (!isOpen) return null
  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className={`modal-overlay${highContrast ? ' high-contrast' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`modal-content${highContrast ? ' high-contrast' : ''}`}>
        <div className={`modal-header${highContrast ? ' high-contrast' : ''}`}>
          <h2 className={`modal-title${highContrast ? ' high-contrast' : ''}`}>{title}</h2>
          <button
            className={`modal-close-btn${highContrast ? ' high-contrast' : ''}`}
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        <div className={`modal-body${highContrast ? ' high-contrast' : ''}`}>{children}</div>
        {buttons.length > 0 && (
          <div className={`modal-footer${highContrast ? ' high-contrast' : ''}`}>
            {buttons.map((btn, idx) => (
              <button
                key={idx}
                className={`modal-btn modal-btn-${btn.variant || 'primary'}${highContrast ? ' high-contrast' : ''}`}
                onClick={btn.onClick}
                disabled={btn.disabled}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
