import { useContext } from 'react'
import { ToastContext, type ToastContextType } from '../components/ToastContext'

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }

  return context
}
