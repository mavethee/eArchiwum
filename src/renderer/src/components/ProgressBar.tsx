import React from 'react'
import '../assets/toast.css'

interface ProgressBarProps {
  progress: number // 0-100
  status?: 'loading' | 'complete' | 'error'
  visible?: boolean
  highContrast?: boolean
}

export function ProgressBar({
  progress,
  status = 'loading',
  visible = true,
  highContrast = false
}: ProgressBarProps): React.ReactElement | null {
  if (!visible || progress === 0) return null

  return (
    <div className={`progress-bar-container${highContrast ? ' high-contrast' : ''}`}>
      <div
        className={`progress-bar-fill ${status === 'complete' ? 'complete' : ''} ${status === 'error' ? 'error' : ''}${highContrast ? ' high-contrast' : ''}`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  )
}

interface UploadProgressProps {
  filename: string
  progress: number // 0-100
  speed?: string
  timeRemaining?: string
  highContrast?: boolean
}

export function UploadProgress({
  filename,
  progress,
  speed = '0 B/s',
  timeRemaining = 'calculating...',
  highContrast = false
}: UploadProgressProps): React.ReactElement {
  return (
    <div className={`upload-progress${highContrast ? ' high-contrast' : ''}`}>
      <div className={`upload-progress-filename${highContrast ? ' high-contrast' : ''}`}>
        {filename}
      </div>
      <div className={`upload-progress-bar${highContrast ? ' high-contrast' : ''}`}>
        <div
          className={`upload-progress-fill${highContrast ? ' high-contrast' : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className={`upload-progress-text${highContrast ? ' high-contrast' : ''}`}>
        <span>{progress}%</span>
        <span>
          {speed} • {timeRemaining} remaining
        </span>
      </div>
    </div>
  )
}
