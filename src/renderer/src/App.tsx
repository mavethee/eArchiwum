/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import apiClient, { setAuthToken } from './utils/api'
import { useToast } from './hooks/useToast'
import { Modal } from './components/Modal'
import ToastContainer from './components/Toast'
import {
  Library,
  Film,
  Disc,
  Music,
  FileText,
  Image as ImageIcon,
  Volume2,
  Search,
  Play,
  Loader2,
  Star,
  MessageSquare,
  Send,
  Eye,
  Activity,
  Accessibility,
  Check,
  X,
  Type,
  Pause,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  Cpu
} from 'lucide-react'

// Ustawienie workera dla pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

// Deklaracja typów API
declare global {
  interface Window {
    api: {
      scanFolder: () => Promise<ArchiveItem[]>
      loadDemoData: () => Promise<ArchiveItem[]>
      openFile: (path: string) => Promise<boolean>
      login: (username: string) => Promise<User | null>
      getCurrentUser: () => Promise<User | null>
      getComments: (fileId: string) => Promise<Comment[]>
      addComment: (fileId: string, text: string, user: string) => Promise<Comment[]>
      setRating: (fileId: string, rating: number) => Promise<number>
      getRating: (fileId: string) => Promise<number>
      fetchRemoteFile: (url: string) => Promise<Buffer>
      clearPdfCache: () => Promise<{ cleared: number; error?: string }>
    }
  }
}

type MediaType = 'filmy' | 'oprogramowanie' | 'audio' | 'teksty' | 'obrazy' | 'kolekcje' | 'inne'

interface PlaylistTrack {
  id: string
  title: string
  url: string
  duration: string
}

interface ArchiveItem {
  id: string
  title: string
  filePath: string
  mediaType: MediaType
  coverColor: string
  description: string
  a11yDescription: string
  meta?: string
  rating?: number
  playlist?: PlaylistTrack[]
  currentTrackIndex?: number
}

interface User {
  name: string
  avatar: string
}

interface Comment {
  id: string
  user: string
  text: string
  date: string
}

const AudioPlayer = ({
  url,
  title,
  aacMode,
  speak,
  onPlayChange,
  item,
  onTrackChange,
  highContrast = false
}: {
  url: string
  title: string
  aacMode: boolean
  speak: (text: string, force?: boolean) => void
  onPlayChange?: (isPlaying: boolean) => void
  item?: ArchiveItem
  onTrackChange?: (newIndex: number) => void
  highContrast?: boolean
}): React.ReactElement => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Update audio source when URL changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !url) return

    console.log('[AudioPlayer] Loading:', { url })

    const handleLoadStart = () => setIsLoading(true)
    const handleCanPlay = () => {
      setIsLoading(false)
      setError(null)
      setIsPlaying(!audio.paused)
    }
    const handleError = () => {
      setIsLoading(false)
      setError('Nie można załadować audio')
      console.error('Audio load error:', audio.error)
    }
    const handlePlay = () => {
      setIsPlaying(true)
      onPlayChange?.(true)
    }
    const handlePause = () => {
      setIsPlaying(false)
      onPlayChange?.(false)
    }
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleLoadedMetadata = () => setDuration(audio.duration)

    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('error', handleError)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    // Force reload
    audio.src = url
    audio.load()

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [url, onPlayChange])

  const togglePlay = () => {
    if (audioRef.current?.paused) {
      audioRef.current.play()
      speak('Odtwarzanie')
    } else {
      audioRef.current?.pause()
      speak('Zatrzymano')
    }
  }

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  return (
    <div
      className={`w-full rounded-lg border-2 shadow-2xl ${aacMode ? 'p-6 space-y-6' : 'p-4 space-y-4'} ${highContrast ? 'bg-white text-black border-black' : 'bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900 backdrop-blur-md border-cyan-500/50 shadow-cyan-500/30'}`}
    >
      <audio ref={audioRef} crossOrigin="anonymous" />


      {error && (
        <div className={highContrast ? 'bg-white text-red-600 border border-black p-3 rounded text-center text-sm' : 'bg-red-500/20 border border-red-500 text-red-300 p-3 rounded text-center text-sm'}>
          {error}
        </div>
      )}

      {isLoading && (
        <div className={highContrast ? 'bg-white text-cyan-600 border border-black p-3 rounded text-center text-sm' : 'bg-cyan-500/20 border border-cyan-500 text-cyan-300 p-3 rounded text-center text-sm'}>
          Ładowanie audio...
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative">
          <div
            className={highContrast ? 'absolute inset-0 bg-black/10 rounded-full opacity-40' : 'absolute inset-0 bg-gradient-to-r from-cyan-500 to-pink-500 blur-2xl rounded-full animate-pulse opacity-40'}
          ></div>
          <Music
            size={aacMode ? 80 : 56}
            className={highContrast ? 'text-black relative z-10' : 'text-cyan-400 relative z-10 drop-shadow-[0_0_20px_rgba(34,211,238,0.9)]'}
            style={highContrast ? { color: '#000' } : {}}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={`${aacMode ? 'text-2xl' : 'text-lg'} font-black mb-1 truncate uppercase tracking-wider`} 
            style={highContrast ? { color: '#000' } : {}}
          >
            {title}
          </h3>
          <p
            className={`${aacMode ? 'text-base' : 'text-xs'} font-bold uppercase tracking-widest`}
            style={highContrast ? { color: '#000' } : {}}
          >
            {item?.playlist ? `▶ ${item.playlist.length} TRACKS` : '▶ AUDIO PLAYBACK'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className={`${aacMode ? 'text-lg w-16' : 'text-xs w-12'} font-mono text-right`}
            style={highContrast ? { color: '#000' } : {}}
          >
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className={`no-aac-click flex-1 h-2 rounded-full appearance-none cursor-pointer ${highContrast ? 'bg-black accent-black' : 'bg-slate-800 accent-cyan-500'}`}
            aria-label="Pasek postępu utworu"
          />
          <span
            className={`${aacMode ? 'text-lg w-16' : 'text-xs w-12'} font-mono`}
            style={highContrast ? { color: '#000' } : {}}
          >
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex justify-center items-center gap-4">
          <button
            onClick={() => {
              if (item?.playlist && onTrackChange) {
                const currentIdx = item.currentTrackIndex ?? 0
                const newIdx = currentIdx > 0 ? currentIdx - 1 : item.playlist.length - 1
                onTrackChange(newIdx)
                speak(`Poprzedni utwór: ${item.playlist[newIdx].title}`)
              } else {
                if (audioRef.current) audioRef.current.currentTime -= 10
                speak('Cofnij 10 sekund')
              }
            }}
            disabled={!item?.playlist || !item.playlist.length}
            className={`flex items-center justify-center rounded transition-transform active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed ${aacMode ? 'size-14' : 'size-10'} ${highContrast ? 'bg-black text-black border border-black' : 'bg-slate-800 border border-cyan-500/30 text-cyan-400'}`}
            aria-label={item?.playlist ? 'Poprzedni utwór' : 'Cofnij 10 sekund'}
          >
            <SkipBack size={aacMode ? 24 : 18} />
          </button>

          <button
            onClick={togglePlay}
            className={`flex items-center justify-center rounded-full transition-transform active:scale-95 ${aacMode ? 'size-16' : 'size-12'} ${highContrast ? 'bg-black text-black border border-black' : 'bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white shadow-[0_0_25px_rgba(34,211,238,0.6)]'}`}
            aria-label={isPlaying ? 'Pauza' : 'Graj'}
          >
            {isPlaying ? (
              <Pause size={aacMode ? 32 : 24} fill="currentColor" />
            ) : (
              <Play size={aacMode ? 32 : 24} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button
            onClick={() => {
              if (item?.playlist && onTrackChange) {
                const currentIdx = item.currentTrackIndex ?? 0
                const newIdx = (currentIdx + 1) % item.playlist.length
                onTrackChange(newIdx)
                speak(`Następny utwór: ${item.playlist[newIdx].title}`)
              } else {
                if (audioRef.current) audioRef.current.currentTime += 10
                speak('Dalej 10 sekund')
              }
            }}
            disabled={!item?.playlist || !item.playlist.length}
            className={`flex items-center justify-center rounded transition-transform active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed ${aacMode ? 'size-14' : 'size-10'} ${highContrast ? 'bg-black text-black border border-black' : 'bg-slate-800 border border-cyan-500/30 text-cyan-400'}`}
            aria-label={item?.playlist ? 'Następny utwór' : 'Dalej 10 sekund'}
          >
            <SkipForward size={aacMode ? 24 : 18} />
          </button>
        </div>

        <div
          className={`flex items-center gap-3 max-w-xs mx-auto ${highContrast ? 'text-black' : ''}`}
        >
          <Volume2 size={aacMode ? 24 : 18} className={highContrast ? 'text-black' : 'text-cyan-500'} style={highContrast ? { color: '#000' } : {}} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              setVolume(val)
              if (audioRef.current) audioRef.current.volume = val
            }}
            className={`no-aac-click flex-1 h-1.5 rounded-full appearance-none cursor-pointer ${highContrast ? 'bg-black accent-black' : 'bg-slate-800 accent-cyan-500'}`}
            aria-label="Głośność"
          />
        </div>
      </div>
    </div>
  )
}

const VideoPlayer = ({
  url,
  title,
  aacMode,
  speak,
  onPlayChange,
  highContrast = false
}: {
  url: string
  title: string
  aacMode: boolean
  speak: (text: string, force?: boolean) => void
  onPlayChange?: (isPlaying: boolean) => void
  highContrast?: boolean
}): React.ReactElement => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update video source when URL changes
  useEffect(() => {
    const video = videoRef.current

    if (!video || !url) return

    console.log('[VideoPlayer] Loading:', { url })

    const handleLoadStart = () => setIsLoading(true)
    const handleCanPlay = () => {
      setIsLoading(false)
      setError(null)
      setIsPlaying(!video.paused)
    }
    const handleError = () => {
      setIsLoading(false)
      setError('Nie można załadować wideo')
      console.error('Video load error:', video.error)
    }
    const handlePlay = () => {
      setIsPlaying(true)
      onPlayChange?.(true)
    }
    const handlePause = () => {
      setIsPlaying(false)
      onPlayChange?.(false)
    }
    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleLoadedMetadata = () => setDuration(video.duration)

    video.addEventListener('loadstart', handleLoadStart)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('error', handleError)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    // Force reload
    video.src = url
    video.load()

    return () => {
      video.removeEventListener('loadstart', handleLoadStart)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('error', handleError)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [url, onPlayChange])

  const togglePlay = () => {
    if (videoRef.current?.paused) {
      videoRef.current.play()
      speak('Odtwarzanie wideo')
    } else {
      videoRef.current?.pause()
      speak('Zatrzymano wideo')
    }
  }

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
      speak('Pełny ekran włączony')
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
      speak('Pełny ekran wyłączony')
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (isPlaying && !aacMode) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative w-full aspect-video rounded-3xl overflow-hidden group border-2 shadow-2xl transition-all ${highContrast ? 'bg-white text-black border-black' : 'bg-gradient-to-b from-slate-900 to-black border-slate-600/50'} ${isFullscreen ? 'rounded-none border-0' : ''}`}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        onClick={togglePlay}
        crossOrigin="anonymous"
        style={highContrast ? { background: '#fff', color: '#000' } : {}}
      />

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="bg-red-500/20 border border-red-500 text-red-300 p-6 rounded-lg text-center max-w-sm">
            {error}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="bg-blue-500/20 border border-blue-500 text-blue-300 p-6 rounded-lg text-center">
            Ładowanie wideo...
          </div>
        </div>
      )}

      {/* Overlay controls */}
      <div
        className={`absolute inset-0 flex flex-col justify-between p-6 transition-opacity duration-500 ${showControls || aacMode || !isPlaying ? 'opacity-100' : 'opacity-0'} ${highContrast ? 'bg-black/10' : 'bg-gradient-to-t from-black/80 via-transparent to-black/40'}`}
      >
        <div className="flex justify-between items-start">
          <h3
            className={`${aacMode ? 'text-3xl' : 'text-xl'} font-black truncate drop-shadow-lg`}
            style={highContrast ? { color: '#000' } : {}}
          >
            {title}
          </h3>
          <button
            onClick={toggleFullscreen}
            className={`p-3 rounded-xl bg-white/10 text-white backdrop-blur-md transition-transform active:scale-90 ${aacMode ? 'size-20' : 'size-12'}`}
            aria-label={isFullscreen ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'}
          >
            {isFullscreen ? (
              <Minimize size={aacMode ? 40 : 24} />
            ) : (
              <Maximize size={aacMode ? 40 : 24} />
            )}
          </button>
        </div>

        <div className={`space-y-4 md:space-y-6 ${aacMode ? 'mb-2 md:mb-6' : ''}`}>
          <div className="flex items-center gap-3 md:gap-6">
            <span
              className={`${aacMode ? 'text-2xl w-24' : 'text-xs w-12'} font-mono drop-shadow-md text-right`}
              style={highContrast ? { color: '#000' } : {}}
            >
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
              className="no-aac-click flex-1 h-2 bg-white/30 rounded-full appearance-none cursor-pointer accent-yellow-500"
              aria-label="Pasek postępu filmu"
            />
            <span
              className={`${aacMode ? 'text-2xl w-24' : 'text-xs w-12'} font-mono drop-shadow-md`}
              style={highContrast ? { color: '#000' } : {}}
            >
              {formatTime(duration)}
            </span>
          </div>

          <div
            className={`flex justify-center items-center ${aacMode ? 'gap-6 md:gap-10' : 'gap-4 md:gap-10'}`}
          >
            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime -= 10
                speak('Cofnij 10 sekund')
              }}
              className={`flex items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-transform active:scale-90 ${aacMode ? 'size-20 md:size-24' : 'size-12 md:size-14'}`}
              aria-label="Cofnij 10 sekund"
            >
              <ChevronLeft size={aacMode ? 40 : 32} />
            </button>

            <button
              onClick={togglePlay}
              className={`flex items-center justify-center rounded-full bg-gradient-to-r from-red-600 to-pink-600 text-white transition-transform active:scale-95 shadow-[0_0_30px_rgba(239,68,68,0.4)] ${aacMode ? 'size-24 md:size-28' : 'size-16 md:size-20'}`}
              aria-label={isPlaying ? 'Pauza' : 'Graj'}
            >
              {isPlaying ? (
                <Pause size={aacMode ? 48 : 40} fill="currentColor" />
              ) : (
                <Play size={aacMode ? 48 : 40} fill="currentColor" />
              )}
            </button>

            <button
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime += 10
                speak('Dalej 10 sekund')
              }}
              className={`flex items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-transform active:scale-90 ${aacMode ? 'size-20 md:size-24' : 'size-12 md:size-14'}`}
              aria-label="Dalej 10 sekund"
            >
              <ChevronRight size={aacMode ? 40 : 32} />
            </button>
          </div>

          <div
            className={`flex items-center gap-4 ${aacMode ? 'max-w-md' : 'max-w-xs'} mx-auto pb-1 md:pb-2`}
          >
            <Volume2 size={aacMode ? 32 : 20} className={highContrast ? 'text-black drop-shadow-md' : 'text-white drop-shadow-md'} style={highContrast ? { color: '#000' } : {}} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                setVolume(val)
                if (videoRef.current) videoRef.current.volume = val
              }}
              className={`no-aac-click flex-1 h-1.5 rounded-full appearance-none cursor-pointer ${highContrast ? 'bg-black accent-black' : 'bg-white/30 accent-white'}`}
              aria-label="Głośność"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const SidebarItem = ({
  icon: Icon,
  label,
  active,
  onClick,
  aacMode,
  highContrast
}: {
  icon: React.ElementType
  label: string
  active: boolean
  onClick: () => void
  aacMode: boolean
  highContrast?: boolean
}): React.ReactElement => (
  <button
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`w-full flex items-center ${aacMode ? 'space-x-4 px-4 py-5 border-4' : 'space-x-3 px-4 py-4 md:py-3'} rounded-2xl transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-yellow-400 ${
      active
        ? highContrast ? 'bg-black text-white shadow-xl border-black scale-[1.02]' : 'bg-slate-800 text-white shadow-xl border-yellow-500 scale-[1.02]'
        : highContrast ? 'bg-white text-black border-black hover:bg-black/10 hover:text-black' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white border-transparent'
    }`}
  >
    <Icon
      size={aacMode ? 40 : 24}
      className={`${active ? 'text-yellow-500' : ''}`}
      aria-hidden="true"
    />
    <span
      className={`${aacMode ? 'text-2xl font-black uppercase' : 'text-base font-bold uppercase tracking-wide'}`}
    >
      {label}
    </span>
  </button>
)

const PdfViewer = ({
  url,
  aacMode,
  speak,
  highContrast = false
}: {
  url: string
  aacMode: boolean
  speak: (text: string, force?: boolean) => void
  highContrast?: boolean
}): React.ReactElement => {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [isOcrLoading, setIsOcrLoading] = useState(false)

  useEffect(() => {
    const loadPdf = async (): Promise<void> => {
      setLoading(true)
      setLoadProgress(0)
      setError(null)
      try {
        let data: ArrayBuffer
        const isRemote = url.startsWith('http')

        if (isRemote) {
          // Pobieramy zdalny plik przez proces główny (bezpieczniejsze)
          speak('Sprawdzam czy dokument jest w pamięci...', false)
          const startTime = Date.now()
          const buffer = await window.api.fetchRemoteFile(url)
          const loadTime = Date.now() - startTime

          // Jeśli załadował się bardzo szybko (<500ms), prawdopodobnie był w cache
          if (loadTime < 500) {
            speak('Dokument załadowany z pamięci lokalnej!', false)
          } else {
            speak('Pobrano z internetu i zapisano w pamięci.', false)
          }

          // Konwertujemy Buffer (z IPC) na ArrayBuffer
          data = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          ) as ArrayBuffer
          setLoadProgress(50)
        } else {
          // Pobieramy plik lokalny bezpośrednio
          const response = await fetch(url)
          if (!response.ok) throw new Error(`Błąd sieci: ${response.statusText}`)
          data = await response.arrayBuffer()
          setLoadProgress(50)
        }

        speak('Przygotowuję dokument do wyświetlenia...', false)
        const loadingTask = pdfjs.getDocument({
          data,
          // Optymalizacje dla szybszego ładowania
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true
        })

        // Śledzenie postępu ładowania
        loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
          if (progress.total > 0) {
            const percent = 50 + Math.round((progress.loaded / progress.total) * 50)
            setLoadProgress(percent)
          }
        }

        const pdfDoc = await loadingTask.promise
        setPdf(pdfDoc)
        setNumPages(pdfDoc.numPages)
        setPageNumber(1)
        setLoadProgress(100)
        speak(`Dokument gotowy. ${pdfDoc.numPages} stron.`, false)
      } catch (err) {
        console.error('Błąd ładowania PDF:', err)
        setError('Nie udało się załadować pliku PDF.')
        speak('Nie udało się załadować dokumentu.', true)
      } finally {
        setLoading(false)
      }
    }
    loadPdf()
  }, [url])

  useEffect(() => {
    let renderTask: any = null

    const renderPage = async (): Promise<void> => {
      if (!pdf || !canvasRef.current) return

      try {
        // Anuluj poprzednie renderowanie jeśli istnieje
        if (renderTask) {
          renderTask.cancel()
        }

        const page = await pdf.getPage(pageNumber)
        const canvas = canvasRef.current
        const context = canvas.getContext('2d', { alpha: false }) // Optymalizacja
        if (!context) return

        // Pobierz wymiary z zewnętrznego kontenera (nie z parentElement canvas - zapobiega feedback loop)
        const container = containerRef.current
        if (!container) return

        const containerWidth = container.clientWidth - 32 // -padding (p-2 md:p-4)
        const containerHeight = container.clientHeight - 32

        const viewport = page.getViewport({ scale: 1, rotation: 0 }) // Wymuszamy rotation: 0

        // Oblicz skalę aby PDF zmieścił się w kontenerze
        const scaleWidth = containerWidth / viewport.width
        const scaleHeight = containerHeight / viewport.height
        const scale = Math.min(scaleWidth, scaleHeight, 1.5) // Max 1.5x zoom

        const scaledViewport = page.getViewport({ scale, rotation: 0 })

        canvas.height = scaledViewport.height
        canvas.width = scaledViewport.width

        // Wyczyść canvas przed renderowaniem
        context.clearRect(0, 0, canvas.width, canvas.height)

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport
        }
        renderTask = page.render(renderContext)
        await renderTask.promise

        // Wyciąganie tekstu dla lektora - tylko w trybie AAC
        if (aacMode) {
          const textContent = await page.getTextContent()
          const textItems = textContent.items
            .filter((item: any) => typeof item.str === 'string')
            .map((item: any) => item.str)
            .join(' ')

          if (textItems.trim()) {
            speak(`Strona ${pageNumber}.`, false)
          }
        }
      } catch (err: any) {
        // Ignoruj błąd anulowania - to jest oczekiwane zachowanie
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Błąd renderowania strony:', err)
        }
      }
    }

    renderPage()

    // Cleanup: anuluj renderowanie przy unmount lub zmianie zależności
    return () => {
      if (renderTask) {
        renderTask.cancel()
      }
    }
  }, [pdf, pageNumber, aacMode])

  const readPage = async (): Promise<void> => {
    if (!pdf) return
    try {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      let textItems = textContent.items
        .filter((item: any) => typeof item.str === 'string')
        .map((item: any) => item.str)
        .join(' ')

      if (!textItems.trim() && canvasRef.current) {
        // Jeśli nie ma tekstu w PDF, spróbujmy OCR
        setIsOcrLoading(true)
        // OCR to świadoma akcja użytkownika (kliknięcie przycisku "CZYTAJ STRONĘ")
        speak(
          'To zdjęcie lub skan. Uruchamiam inteligentne rozpoznawanie tekstu OCR. Proszę czekać...',
          true
        )
        try {
          // Preprocessing obrazu dla lepszego OCR z kompresją dla limitu API (1024 KB)
          const canvas = canvasRef.current
          const preprocessCanvas = document.createElement('canvas')
          const ctx = preprocessCanvas.getContext('2d')
          if (!ctx) throw new Error('Canvas context not available')

          // Inteligentne skalowanie - zachowaj jakość ale zmieść w limicie
          let scale = 1.5 // Zmniejszone z 2x
          const maxDimension = 2000 // Max szerokość/wysokość
          
          if (canvas.width > maxDimension || canvas.height > maxDimension) {
            scale = maxDimension / Math.max(canvas.width, canvas.height)
          }
          
          preprocessCanvas.width = canvas.width * scale
          preprocessCanvas.height = canvas.height * scale

          // Rysuj z lepszą jakością
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(canvas, 0, 0, preprocessCanvas.width, preprocessCanvas.height)

          // Konwersja do grayscale i zwiększenie kontrastu
          const imageData = ctx.getImageData(0, 0, preprocessCanvas.width, preprocessCanvas.height)
          const pixelData = imageData.data
          for (let i = 0; i < pixelData.length; i += 4) {
            // Grayscale
            const gray = pixelData[i] * 0.299 + pixelData[i + 1] * 0.587 + pixelData[i + 2] * 0.114
            // Zwiększ kontrast (simple threshold)
            const enhanced = gray < 128 ? Math.max(0, gray - 20) : Math.min(255, gray + 20)
            pixelData[i] = pixelData[i + 1] = pixelData[i + 2] = enhanced
          }
          ctx.putImageData(imageData, 0, 0)

          // Używamy OCR.space API
          console.log('🤖 Sending OCR.space API request...')

          try {
            // Kompresja JPEG z automatycznym zmniejszaniem jakości jeśli za duży
            let quality = 0.8
            let base64Image = preprocessCanvas.toDataURL('image/jpeg', quality)
            let attempts = 0
            
            // Zmniejszaj jakość dopóki nie zmieści się w 1 MB
            while (base64Image.length > 1.3 * 1024 * 1024 && attempts < 5) { // 1.3 MB w base64 ≈ 1 MB
              quality -= 0.15
              base64Image = preprocessCanvas.toDataURL('image/jpeg', quality)
              attempts++
              console.log(`🔄 Zmniejszam jakość do ${(quality * 100).toFixed(0)}% (próba ${attempts})`)
            }
            
            if (base64Image.length > 1.3 * 1024 * 1024) {
              throw new Error('Obraz jest za duży nawet po kompresji. Spróbuj mniejszej strony.')
            }
            
            console.log(`📦 Rozmiar obrazu: ${(base64Image.length / 1024).toFixed(0)} KB, jakość: ${(quality * 100).toFixed(0)}%`)
            
            const formData = new FormData()
            formData.append('base64Image', base64Image)
            formData.append('language', 'pol')
            formData.append('isOverlayRequired', 'false')
            formData.append('detectOrientation', 'true')
            formData.append('scale', 'true')
            formData.append('OCREngine', '2')

            const ocrSpaceResponse = await fetch('https://api.ocr.space/parse/image', {
              method: 'POST',
              headers: {
                apikey: 'K87899142388957'
              },
              body: formData
            })

            if (!ocrSpaceResponse.ok) {
              throw new Error(`OCR.space API error: ${ocrSpaceResponse.status}`)
            }

            const ocrSpaceData = await ocrSpaceResponse.json()
            console.log('✅ OCR.space success!', ocrSpaceData)

            if (ocrSpaceData.IsErroredOnProcessing) {
              throw new Error(`OCR.space processing error: ${ocrSpaceData.ErrorMessage}`)
            }

            if (
              !ocrSpaceData.ParsedResults ||
              ocrSpaceData.ParsedResults.length === 0 ||
              !ocrSpaceData.ParsedResults[0].ParsedText
            ) {
              throw new Error('OCR.space zwrócił pusty wynik')
            }

            textItems = ocrSpaceData.ParsedResults[0].ParsedText
            console.log('✅ OCR.space text length:', textItems.length)
          } catch (ocrSpaceErr) {
            console.error('❌ OCR.space error:', ocrSpaceErr)
            speak('Nie udało się rozpoznać tekstu z API OCR.space', false)
            textItems = ''
          }

          if (!textItems || !textItems.trim()) {
            speak('Nie znaleziono tekstu na tej stronie', false)
            setIsOcrLoading(false)
            return
          }
        } catch (ocrErr) {
          console.error('Błąd OCR szczegóły:', ocrErr)
          const errorMsg = ocrErr instanceof Error ? ocrErr.message : 'Nieznany błąd'
          speak(`Nie udało się rozpoznać tekstu. ${errorMsg}`, true)
          setIsOcrLoading(false)
          return
        } finally {
          setIsOcrLoading(false)
        }
      }

      if (textItems && textItems.trim()) {
        // Czyścimy tekst z nadmiarowych spacji, zachowujemy nowe linie
        const cleanedText = textItems
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        // Czyścimy tekst dla syntezy mowy (usuwamy szum)
        const speakText = cleanedText
          // Usuwamy ISBN-y (np. ISBN 978-3-16-148410-0)
          .replace(/ISBN[-\s]?(?:\d[-\s]?){9}[\dXx]/gi, '')
          // Usuwamy ISSN-y (np. ISSN 1234-5678)
          .replace(/ISSN[\s-]?(?:\d{4}[\s-]?\d{4})/gi, '')
          // Usuwamy symbole handlowe
          .replace(/[™®©℠]/g, '')
          // Usuwamy długie ciągi samych cyfr (kody EAN/UPC) - ale zachowujemy rozsądne liczby
          .replace(/(?<![0-9])\d{13,}(?![0-9])/g, '')
          // Usuwamy dziwne znaki, normalizujemy cudzysłowy
          .replace(/[«»„"‟]/g, '"')
          .trim()
        // Używamy force=true, bo użytkownik kliknął przycisk
        speak(`Strona ${pageNumber}. ${speakText}`, true)
      } else {
        speak(
          `Strona ${pageNumber} nie zawiera tekstu do przeczytania. Spróbuj lepszego skanu lub sprawdź jakość obrazu.`,
          true
        )
      }
    } catch (err) {
      console.error('Błąd czytania strony PDF:', err)
      speak('Błąd podczas próby odczytania strony.', true)
    }
  }

  return (
    <div className={`flex flex-col w-full h-full gap-2 md:gap-3 p-2 md:p-4 relative${highContrast ? ' bg-white text-black border-4 border-black shadow-[0_0_0_4px_#fff,0_0_0_8px_#000]' : ''}`} style={highContrast ? { background: '#fff', color: '#000', border: '4px solid #000', boxShadow: '0 0 0 4px #fff, 0 0 0 8px #000' } : {}}>
      <div className={`flex flex-wrap items-center justify-center gap-2 md:gap-3 border p-2 md:p-3 rounded-xl w-full shrink-0 z-20 relative${highContrast ? ' bg-white text-black border-2 border-black shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]' : ' bg-gradient-to-r from-yellow-900/40 to-slate-800/40 border-yellow-700/50'}`} style={highContrast ? { background: '#fff', color: '#000', border: '2px solid #000', boxShadow: '0 0 0 2px #fff, 0 0 0 4px #000' } : {}}>
        <button
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={pageNumber <= 1 || loading}
          className={`${aacMode ? 'p-3 md:p-4' : 'p-2'} bg-slate-700 rounded-lg disabled:opacity-30 active:scale-90 transition-transform`}
          aria-label="Poprzednia strona"
        >
          <ChevronLeft size={aacMode ? 36 : 24} />
        </button>
        <span
          className={`${aacMode ? 'text-xl md:text-2xl px-4' : 'text-sm px-3'} font-bold whitespace-nowrap`}
          style={highContrast ? { color: '#000' } : {}}
        >
          Strona {pageNumber} / {numPages}
        </span>
        <button
          onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          disabled={pageNumber >= numPages || loading}
          className={`${aacMode ? 'p-3 md:p-4' : 'p-2'} bg-slate-700 rounded-lg disabled:opacity-30 active:scale-90 transition-transform`}
          aria-label="Następna strona"
        >
          <ChevronRight size={aacMode ? 36 : 24} />
        </button>
        <button
          onClick={readPage}
          disabled={loading || isOcrLoading}
          aria-label="Odsłuchaj treść tej strony"
          className={`${aacMode ? 'px-6 py-3 text-lg md:text-xl' : 'px-4 py-2 text-sm'} font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-transform active:scale-95 whitespace-nowrap`}
          style={highContrast ? { background: '#fff', color: '#000', border: '1px solid #000' } : { background: 'linear-gradient(to right, #f59e42, #fbbf24)', color: '#000' }}
        >
          {isOcrLoading && <Loader2 className="animate-spin" size={aacMode ? 24 : 16} />}
          {isOcrLoading ? 'ROZPOZNAWANIE...' : 'CZYTAJ STRONĘ'}
        </button>
      </div>

      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden w-full flex items-center justify-center rounded-xl p-2 md:p-4 relative min-h-0 z-0${highContrast ? ' bg-white text-black border-2 border-black shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]' : ' bg-slate-950'}`}
        style={highContrast ? { background: '#fff', color: '#000', border: '2px solid #000', boxShadow: '0 0 0 2px #fff, 0 0 0 4px #000' } : {}}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-yellow-500" size={48} />
            <p className={highContrast ? 'text-black font-bold uppercase animate-pulse' : 'text-slate-400 font-bold uppercase animate-pulse'}>
              Wczytywanie dokumentu...
            </p>
            {loadProgress > 0 && (
              <div className="w-64 bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-yellow-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
            )}
            {loadProgress > 0 && (
              <p className="text-slate-500 text-sm font-bold">{loadProgress}%</p>
            )}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center text-center p-8">
            <X size={64} className="text-red-500 mb-4" />
            <p className={highContrast ? 'text-xl font-bold text-black mb-2' : 'text-xl font-bold text-white mb-2'}>{error}</p>
            <p className={highContrast ? 'text-black' : 'text-slate-400'}>Upewnij się, że plik nie jest uszkodzony.</p>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className={`shadow-2xl transition-opacity duration-300 select-text ${isOcrLoading ? 'opacity-30 blur-sm' : 'opacity-100'}${highContrast ? ' bg-white' : ''}`}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />
            {isOcrLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/40 backdrop-blur-sm rounded-xl">
                <Loader2 className="animate-spin text-yellow-500" size={64} />
                <p className={highContrast ? 'text-black text-xl font-black uppercase tracking-widest animate-pulse drop-shadow-lg' : 'text-white text-xl font-black uppercase tracking-widest animate-pulse drop-shadow-lg'}>
                  Inteligentne rozpoznawanie tekstu...
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const MediaCard = ({
  item,
  onClick,
  onSpeak,
  aacMode,
  highContrast = false
}: {
  item: ArchiveItem
  onClick: () => void
  onSpeak: (e: React.MouseEvent, text: string) => void
  aacMode: boolean
  highContrast?: boolean
}): React.ReactElement => {
  return (
    <div
      onClick={onClick}
      className={`group relative rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] cursor-pointer focus:outline-none focus:ring-4 focus:ring-cyan-400 focus:z-10 ${aacMode ? 'border-2' : ''} ${highContrast ? 'bg-white text-black border-4 border-black shadow-[0_0_0_4px_#fff,0_0_0_8px_#000] !outline-black' : 'bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-md border-slate-700/50 hover:border-cyan-500/50 hover:shadow-cyan-500/20'}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      aria-label={`${item.title}, ${item.mediaType}. ${item.rating ? `Ocena: ${item.rating}` : ''}`}
      style={highContrast ? { boxShadow: '0 0 0 4px #fff, 0 0 0 8px #000', outline: '2px solid #000' } : {}}
    >
      <div
        className={`${aacMode ? 'h-56' : 'h-40 md:h-48'} w-full flex items-center justify-center relative overflow-hidden group-hover:scale-110 transition-transform duration-500`}
        style={highContrast ? { background: '#fff', color: '#000', filter: 'grayscale(1) contrast(1.5)' } : {}}
      >
        <div className={highContrast ? 'absolute inset-0 bg-black/10' : 'absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent group-hover:from-black/40 transition-all'} />
        {item.mediaType === 'audio' && (
          <Music
            size={aacMode ? 80 : 56}
            className={highContrast ? 'text-black drop-shadow-lg' : 'text-white drop-shadow-lg'}
            aria-hidden="true"
            style={highContrast ? { color: '#000' } : {}}
          />
        )}
        {item.mediaType === 'teksty' && (
          <FileText
            size={aacMode ? 80 : 56}
            className={highContrast ? 'text-black drop-shadow-lg' : 'text-white drop-shadow-lg'}
            aria-hidden="true"
            style={highContrast ? { color: '#000' } : {}}
          />
        )}
        {item.mediaType === 'filmy' && (
          <Film size={aacMode ? 80 : 56} className={highContrast ? 'text-black drop-shadow-lg' : 'text-white drop-shadow-lg'} aria-hidden="true" style={highContrast ? { color: '#000' } : {}} />
        )}
        {item.mediaType === 'oprogramowanie' && (
          <Cpu size={aacMode ? 80 : 48} className={highContrast ? 'text-black drop-shadow-lg' : 'text-white drop-shadow-lg'} aria-hidden="true" style={highContrast ? { color: '#000' } : {}} />
        )}
        {item.mediaType === 'obrazy' && (
          <ImageIcon
            size={aacMode ? 80 : 56}
            className={highContrast ? 'text-black drop-shadow-lg' : 'text-white drop-shadow-lg'}
            aria-hidden="true"
            style={highContrast ? { color: '#000' } : {}}
          />
        )}

        <button
          onClick={(e) => {
            e.stopPropagation()
            onSpeak(e, `Element: ${item.title}. ${item.a11yDescription}`)
          }}
          aria-label={`Odsłuchaj opis dla ${item.title}`}
          className={`absolute top-4 right-4 ${aacMode ? 'p-4 bg-yellow-500 text-black scale-110' : highContrast ? 'p-3 bg-white text-black border-2 border-black shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]' : 'p-3 bg-white/20 hover:bg-white/40 text-white backdrop-blur-md'} rounded-2xl opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shadow-xl`}
          style={highContrast ? { background: '#fff', color: '#000', border: '2px solid #000', boxShadow: '0 0 0 2px #fff, 0 0 0 4px #000' } : {}}
        >
          <Volume2 size={aacMode ? 28 : 20} aria-hidden="true" />
        </button>
      </div>
      <div className={`${aacMode ? 'p-6' : 'p-5 md:p-8'}`}> {/* zachowaj padding, kolory wyżej */}
        <div className="flex items-center gap-3 mb-2">
          <span
            className={`font-black uppercase tracking-widest ${highContrast ? 'text-black bg-black/10 border-black/20' : 'text-white bg-white/10 border-white/20'} px-2 py-0.5 rounded-lg ${aacMode ? 'text-sm' : 'text-[10px] md:text-xs'}`}
          >
            {item.mediaType}
          </span>
          <span
            className={`${aacMode ? 'text-sm' : 'text-[10px] md:text-xs'} font-bold ${highContrast ? 'text-black' : 'text-slate-500'} uppercase tracking-widest`}
          >
            {item.meta}
          </span>
        </div>
        <h3
          className={`${aacMode ? 'text-2xl mt-2 mb-2' : 'text-xl mt-2 mb-2'} font-black leading-tight line-clamp-2 drop-shadow-sm`}
          title={item.title}
          style={highContrast ? { color: '#000' } : {}}
        >
          {item.title}
        </h3>
        <div className="flex justify-between items-center mt-3">
          {item.rating !== undefined && item.rating > 0 ? (
            <div
              className={`flex text-yellow-400 gap-2 items-center px-3 py-1 ${highContrast ? 'bg-black/10 border-black/20' : 'bg-yellow-400/10 border-yellow-400/20'} rounded-full ${aacMode ? 'text-xl' : 'text-sm font-black'}`}
              aria-label={`Ocena: ${item.rating}`}
            >
              <Star size={aacMode ? 24 : 16} fill="currentColor" aria-hidden="true" /> {item.rating}
            </div>
          ) : (
            <div />
          )}
          <div className={`p-2 rounded-lg transition-colors ${highContrast ? 'bg-white text-black border-2 border-black shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]' : 'bg-slate-700/50 group-hover:bg-yellow-500 group-hover:text-black'}`} style={highContrast ? { background: '#fff', color: '#000', border: '2px solid #000', boxShadow: '0 0 0 2px #fff, 0 0 0 4px #000' } : {}}>
            <ChevronRight size={aacMode ? 28 : 20} style={highContrast ? { color: '#000' } : {}} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App(): React.ReactElement {
  const [archiveItems, setArchiveItems] = useState<ArchiveItem[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('wszystkie')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState<ArchiveItem | null>(null)
  const [highContrast, setHighContrast] = useState(false)
  const [colorBlindMode, setColorBlindMode] = useState<
    'none' | 'protanopia' | 'deuteranopia' | 'tritanopia'
  >('none')
  const [aacMode, setAacMode] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1.0) // Default standard for accessibility
  const [showA11yMenu, setShowA11yMenu] = useState(false)
  const [scanSpeed, setScanSpeed] = useState(3500)
  // Loading state removed - not used in current implementation
  const [isPaused, setIsPaused] = useState(false)
  const [scanDirection, setScanDirection] = useState<'forward' | 'backward'>('forward')
  const [scanProgress, setScanProgress] = useState(0)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    document.documentElement.style.fontSize = `${zoomLevel * 100}%`
    document.documentElement.style.transition = 'font-size 0.3s ease-in-out'
  }, [zoomLevel])

  const [user, setUser] = useState<User | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [rating, setRating] = useState(0)
  const [showLogin, setShowLogin] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [loginInput, setLoginInput] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')

  // Zoom styles managed via direct DOM manipulation for better performance
  // Zoom handled by root font-size

  const loadInitialData = async (): Promise<void> => {
    try {
      // 1. Fetch magazines from GitHub
      await loadPlaystationMagazines()

      // 2. Add other demo items
      const demoItems: ArchiveItem[] = [
        {
          id: 'demo-1',
          title: 'Przykładowy Dokument PDF',
          filePath: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          mediaType: 'teksty',
          coverColor: 'bg-blue-600',
          description: 'Przykładowy dokument testowy PDF',
          a11yDescription: 'Plik PDF - dokument testowy w formacie przenośnym',
          meta: 'PDF',
          rating: 4
        },
        // WipeOut 2097 Soundtrack - Pełna Playlista
        {
          id: 'wipeout-ost',
          title: 'WipeOut 2097 - Complete Soundtrack',
          filePath:
            'https://archive.org/download/wipeout2097_soundtrack/01-The%20Future%20Sound%20of%20London-We%20Have%20Explosive.mp3',
          mediaType: 'audio',
          coverColor: 'bg-purple-600',
          description: 'Pełny soundtrack z legendarne gry WipeOut 2097',
          a11yDescription:
            'Pełna playlista soundtracku WipeOut 2097. Zawiera 11 utworów od artystów takich jak: The Future Sound of London, Fluke, The Chemical Brothers, Photek, Underworld, The Prodigy i CoLD SToRAGE. Łącznie ponad godziny elektronicznej muzyki z lat 90. Cztery główne ścieżki: Firestarter (The Prodigy), Dust up Beats (The Chemical Brothers), Landmass (The Future Sound of London) i Body in Motion (CoLD SToRAGE).',
          meta: 'PLAYLIST',
          rating: 5,
          currentTrackIndex: 0,
          playlist: [
            {
              id: 'wipeout-01',
              title: 'The Future Sound of London: We Have Explosive',
              url: 'https://archive.org/download/wipeout2097_soundtrack/01-The%20Future%20Sound%20of%20London-We%20Have%20Explosive.mp3',
              duration: '5:53'
            },
            {
              id: 'wipeout-02',
              title: 'The Future Sound of London: Landmass',
              url: 'https://archive.org/download/wipeout2097_soundtrack/02-The%20Future%20Sound%20of%20LondonLandmass.mp3',
              duration: '4:30'
            },
            {
              id: 'wipeout-03',
              title: 'Fluke: Atom Bomb',
              url: 'https://archive.org/download/wipeout2097_soundtrack/03-Fluke-Atom%20Bomb.mp3',
              duration: '5:34'
            },
            {
              id: 'wipeout-04',
              title: 'Fluke: V Six',
              url: 'https://archive.org/download/wipeout2097_soundtrack/04-Fluke-V%20Six.mp3',
              duration: '5:22'
            },
            {
              id: 'wipeout-05',
              title: 'The Chemical Brothers: Dust up Beats',
              url: 'https://archive.org/download/wipeout2097_soundtrack/05-The%20Chemical%20Brothers-Dust%20up%20Beats.mp3',
              duration: '6:07'
            },
            {
              id: 'wipeout-06',
              title: 'The Chemical Brothers: Loops of Fury',
              url: 'https://archive.org/download/wipeout2097_soundtrack/06-The%20Chemical%20Brothers-Loops%20of%20Fury.mp3',
              duration: '4:42'
            },
            {
              id: 'wipeout-07',
              title: 'Photek: The Third Sequence',
              url: 'https://archive.org/download/wipeout2097_soundtrack/07-Photec-The%20Third%20Sequence.mp3',
              duration: '4:51'
            },
            {
              id: 'wipeout-08',
              title: 'Underworld: Tin There (Underworld Edit)',
              url: 'https://archive.org/download/wipeout2097_soundtrack/08-Underworld-Tin%20There%20(Underworld%20Edit).mp3',
              duration: '6:08'
            },
            {
              id: 'wipeout-09',
              title: 'The Prodigy: Firestarter (Instrumental)',
              url: 'https://archive.org/download/wipeout2097_soundtrack/09-The%20Prodigy-Firestarter%20(Instrumental).mp3',
              duration: '4:41'
            },
            {
              id: 'wipeout-10',
              title: 'CoLD SToRAGE: Canada',
              url: 'https://archive.org/download/wipeout2097_soundtrack/10-Cold%20Storage-Canada.mp3',
              duration: '6:15'
            },
            {
              id: 'wipeout-11',
              title: 'CoLD SToRAGE: Body in Motion',
              url: 'https://archive.org/download/wipeout2097_soundtrack/11-Cold%20Storage-Body%20in%20Motion.mp3',
              duration: '5:15'
            }
          ]
        },
        {
          id: 'demo-3',
          title: 'Destruction Derby - Press Demo Video',
          filePath:
            'https://archive.org/download/destruction-derby-press/Destruction%20Derby%20%28E%29%20%5BSCES-00007%5D.mp4',
          mediaType: 'filmy',
          coverColor: 'bg-red-600',
          description: 'Materiał prasowy z kultowej gry wyścigowej Destruction Derby na PlayStation',
          a11yDescription:
            'Wideo MP4 - materiał prasowy gry Destruction Derby. Klasyczna gra wyścigowa z elementami destrukcji z konsoli PlayStation 1. Zawiera sceny rozgrywki i eksplozji samochodów. Długość: około 2 minuty.',
          meta: 'MP4',
          rating: 5
        },
        {
          id: 'demo-4',
          title: 'Big Buck Bunny - Otwarty Film Animacyjny',
          filePath: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
          mediaType: 'filmy',
          coverColor: 'bg-cyan-600',
          description: 'Darmowy film animacyjny stworzony przez Blender Foundation',
          a11yDescription:
            'Film animacyjny MP4 - otwarty projekt Blender Foundation. Króta animacja 3D o przygodach małego królika. Idealna do testowania odtwarzania wideo i audio-deskrypcji.',
          meta: 'MP4',
          rating: 5
        }
      ]
      setArchiveItems((prev) => {
        // Sprawdź czy demo items już są załadowane (unikaj duplikatów)
        const existingIds = new Set(prev.map((item) => item.id))
        const newItems = demoItems.filter((item) => !existingIds.has(item.id))

        if (newItems.length === 0) {
          console.log('Demo items już załadowane, pomijam duplikaty')
          return prev
        }

        return [...prev, ...newItems]
      })
    } catch (err) {
      console.error('Error loading initial data:', err)
      showToast('Wystąpił błąd podczas ładowania danych demonstracyjnych.', 'error')
    }
  }

  const getRandomColor = (): string => {
    const colors = [
      'bg-blue-600',
      'bg-purple-600',
      'bg-red-600',
      'bg-green-600',
      'bg-yellow-600',
      'bg-pink-600',
      'bg-indigo-600',
      'bg-teal-600'
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  const loadPlaystationMagazines = async (): Promise<void> => {
    try {
      showToast('Pobieranie listy magazynów...', 'info')
      const allReleases: any[] = []
      let page = 1
      let hasMore = true

      // 1. Fetch all releases, handling pagination
      while (hasMore) {
        const response = await fetch(
          `https://api.github.com/repos/mavethee/Oficjalny-Polski-PlayStation-Magazyn/releases?page=${page}`
        )
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.statusText}`)
        }
        const releases = await response.json()
        if (releases.length === 0) {
          hasMore = false
        } else {
          allReleases.push(...releases)
          page++
        }
      }

      // 2. Extract PDF assets from all releases
      const magazineItems: ArchiveItem[] = allReleases.flatMap((release: any) => {
        const pdfAssets = release.assets.filter((asset: any) => asset.name.endsWith('.pdf'));
        return pdfAssets.map((asset: any) => {
          const nameWithoutExt = asset.name.substring(0, asset.name.lastIndexOf('.')) || asset.name;
          // Czyścimy nazwę: zamieniamy kropki i podkreślenia na spacje, normalizujemy spacje
          const cleanName = nameWithoutExt
            .replace(/[._-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return {
            id: asset.id || asset.name,
            title: cleanName,
            filePath: asset.browser_download_url,
            mediaType: 'teksty' as MediaType,
            coverColor: getRandomColor(),
            description: release.name || `Oficjalny Polski PlayStation Magazyn - ${asset.name}`,
            a11yDescription: `Magazyn PlayStation, numer ${cleanName}`,
            meta: 'PDF',
            rating: 0
          };
        });
      });

      if (magazineItems.length > 0) {
        setArchiveItems((prev) => {
          // Sprawdź czy magazyny już są załadowane (unikaj duplikatów)
          const existingIds = new Set(prev.map((item) => item.id))
          const newItems = magazineItems.filter((item) => !existingIds.has(item.id))

          if (newItems.length === 0) {
            console.log('Magazyny już załadowane, pomijam duplikaty')
            return prev
          }

          return [...prev, ...newItems]
        })
        showToast(`Załadowano ${magazineItems.length} magazynów!`, 'success')
        speak(`Załadowano ${magazineItems.length} numerów Polskiego PlayStation Magazyn.`)
      } else {
        showToast('Nie znaleziono żadnych magazynów do załadowania.', 'warning')
      }
    } catch (err) {
      console.error('Error loading PlayStation magazines:', err)
      showToast('Błąd podczas ładowania magazynów z GitHub.', 'error')
      speak('Nie udało się pobrać listy magazynów.')
    }
  }

  let lastTtsText = ''
  let lastTtsTimeout: NodeJS.Timeout | null = null
  const speak = (text: string, force = false): void => {
    if (!('speechSynthesis' in window)) return;

    // Zawsze anuluj poprzedni komunikat przed nowym
    window.speechSynthesis.cancel();

    // Nie powtarzaj tego samego tekstu jeśli już gra
    if (!force && window.speechSynthesis.speaking && lastTtsText === text) {
      return;
    }

    try {
      if (lastTtsTimeout) clearTimeout(lastTtsTimeout);
      lastTtsTimeout = setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pl-PL';
        if (text.length > 300) {
          utterance.rate = 0.7;
        } else if (text.length > 150) {
          utterance.rate = 0.85;
        } else {
          utterance.rate = 1.0;
        }
        utteranceRef.current = utterance;
        let watchdog: NodeJS.Timeout | null = null;
        utterance.onstart = () => {
          lastTtsText = text;
          console.log('[TTS] Started:', text);
          watchdog = setTimeout(() => {
            console.warn('[TTS] Watchdog: TTS długo mówi:', text);
            // Nie restartuj, tylko loguj
          }, 10000);
        };
        utterance.onend = () => {
          if (watchdog) clearTimeout(watchdog);
          lastTtsText = '';
          console.log('[TTS] Finished:', text);
        };
        utterance.onerror = (e) => {
          if (watchdog) clearTimeout(watchdog);
          lastTtsText = '';
          console.error('[TTS] Error:', e);
        };
        if (force || ttsEnabled) {
          window.speechSynthesis.speak(utterance);
        }
      }, 200);
    } catch (err) {
      console.error('[TTS] Exception:', err);
    }
  }

  const filteredData = archiveItems.filter((item) => {
    const matchesCategory = activeCategory === 'wszystkie' || item.mediaType === activeCategory
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const describeScene = (): void => {
    let description = ''
    if (selectedItem) {
      description = `Jesteś w widoku szczegółów pliku ${selectedItem.title}. `
      if (isFocusMode) {
        description +=
          'Odtwarzacz jest teraz powiększony i zajmuje większość ekranu. Sekcja komentarzy jest przyciemniona. '
        description +=
          'Możesz użyć przycisków sterowania pod filmem lub wrócić do widoku pełnego zatrzymując odtwarzanie. '
      } else {
        description +=
          'Po lewej stronie znajduje się podgląd pliku i ocena gwiazdkowa, a po prawej sekcja dyskusji. '
        description += `Aktualnie plik ma ${comments.length} komentarzy i Twoją ocenę ${rating > 0 ? rating + ' gwiazdek' : 'brak oceny'}. `
        description += 'Możesz napisać komentarz na dole panelu po prawej.'
      }
    } else {
      description = `Jesteś w bibliotece głównej. Wybrana kategoria to ${activeCategory}. `
      description += `Na liście wyświetlam ${filteredData.length} elementów pasujących do Twoich filtrów. `
      if (searchQuery) {
        description += `Wyniki są filtrowane po haśle: ${searchQuery}. `
      }
      if (isSidebarOpen) {
        description += 'Pasek boczny z kategoriami jest aktualnie wysunięty.'
      } else {
        description += 'Pasek boczny jest schowany, ale możesz go otworzyć przyciskiem menu.'
      }
      description += ' Użyj strzałek, aby przeglądać listę plików.'
    }
    speak(description, true)
  }

  useEffect(() => {
    // Check if user has saved token from previous login
    const savedToken = localStorage.getItem('authToken')
    const savedUsername = localStorage.getItem('username')
    if (savedToken) {
      setAuthToken(savedToken)
    }

    // Dodaj helper do konsoli dla czyszczenia cache
    if (typeof window !== 'undefined') {
      // @ts-expect-error - helper function for debugging
      window.clearPdfCache = async () => {
        try {
          const result = await window.api.clearPdfCache()
          console.log(`✅ Wyczyszczono ${result.cleared} plików PDF z cache`)
          return result
        } catch (error) {
          console.error('❌ Błąd czyszczenia cache:', error)
          return { cleared: 0, error: String(error) }
        }
      }
      console.log('💡 Tip: Użyj window.clearPdfCache() aby wyczyścić cache PDF-ów')
    }

    setTimeout(() => {
      loadInitialData()
      // Przywróć użytkownika jeśli ma token i username
      if (savedToken && savedUsername) {
        setUser({
          name: savedUsername,
          avatar: savedUsername[0].toUpperCase()
        })
      }
    }, 0)

    // Powitanie i instrukcja dla osób niewidomych przy starcie
    const welcomeTimeout = setTimeout(() => {
      // Zawsze witaj głosowo przy starcie, nawet jeśli TTS jest wyłączony w ustawieniach,
      // bo to jedyna szansa by niewidomy dowiedział się co robić.
      speak(
        'Witaj w e-Archiwum. Naciśnij klawisz funkcyjny numer 2, aby otworzyć menu ustawień dostępności. Możesz poruszać się po przyciskach strzałkami. Naciśnij klawisz funkcyjny numer 1, aby usłyszeć opis tego, co widzisz na ekranie.',
        true
      )
    }, 1500)

    return () => clearTimeout(welcomeTimeout)
  }, [])

  useEffect(() => {
    if (selectedItem) {
      // Załaduj komentarze z localStorage
      const timeout = setTimeout(() => {
        const savedComments = localStorage.getItem(`comments-${selectedItem.id}`)
        if (savedComments) {
          try {
            const parsedComments = JSON.parse(savedComments)
            setComments(parsedComments)
          } catch (e) {
            console.error('Błąd parsowania komentarzy:', e)
            setComments([])
          }
        } else {
          setComments([])
        }
        setRating(selectedItem.rating || 0)
      }, 0)

      // Inteligentny opis sceny po otwarciu (bez komentarzy)
      speak(
        `Otwarto: ${selectedItem.title}. ${selectedItem.a11yDescription} Możesz teraz uruchomić odtwarzanie lub ocenić plik.`
      )

      return () => clearTimeout(timeout)
    }
    return
  }, [selectedItem])

  useEffect(() => {
    if (isFocusMode && selectedItem) {
      speak(
        `Tryb skupienia aktywny. Odtwarzam ${selectedItem.title}. Interfejs boczny został przyciemniony, aby nie rozpraszać uwagi.`
      )
    } else if (!isFocusMode && selectedItem) {
      speak('Powrót do widoku szczegółów.')
    }
  }, [isFocusMode])

  // Logika Auto-Skanowania (AAC Switch Access) z wizualnym wskaźnikiem postępu
  useEffect(() => {
    let interval: NodeJS.Timeout
    let progressInterval: NodeJS.Timeout
    
    if (aacMode && !isPaused) {
      // Resetuj postęp
      setScanProgress(0)
      
      // Animacja postępu (60 FPS)
      const progressStep = 100 / (scanSpeed / 16.67) // 16.67ms = 1 frame @ 60fps
      progressInterval = setInterval(() => {
        setScanProgress((prev) => {
          const next = prev + progressStep
          return next >= 100 ? 0 : next
        })
      }, 16.67)
      
      interval = setInterval(() => {
        // KONTEKSTOWE SKANOWANIE - wybierz odpowiedni zakres
        let container: Element | Document = document
        let contextName = 'głównej aplikacji'
        
        // Priorytet 1: Menu dostępności (jeśli otwarte) - ma z-[150]
        if (showA11yMenu) {
          const a11yPanel = document.querySelector('.z-\\[150\\][role="dialog"]')
          if (a11yPanel) {
            container = a11yPanel
            contextName = 'menu dostępności'
          }
        }
        // Priorytet 2: Modal szczegółów (jeśli otwarty) - ma z-[100]
        else if (selectedItem) {
          const modal = document.querySelector('.z-\\[100\\][role="dialog"]')
          if (modal) {
            container = modal
            contextName = 'okna szczegółów'
          }
        }
        // Priorytet 3: Główna zawartość (bez sidebara)
        else {
          const mainContent = document.querySelector('main')
          if (mainContent) {
            container = mainContent
            contextName = 'głównej zawartości'
          }
        }
        
        const focusable = container.querySelectorAll(
          'button:not([disabled]):not(.no-aac-click), [tabindex="0"]:not(.no-aac-click), input:not([disabled]):not(.no-aac-click)'
        )
        
        // Filtruj tylko widoczne elementy
        const visibleFocusable = Array.from(focusable).filter((el) => {
          const htmlEl = el as HTMLElement
          const rect = htmlEl.getBoundingClientRect()
          const style = window.getComputedStyle(htmlEl)
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
          )
        })
        
        if (visibleFocusable.length === 0) return

        const current = document.activeElement
        let index = visibleFocusable.indexOf(current as Element)
        if (index === -1) index = -1 // Start from beginning

        // Kierunek skanowania: do przodu lub do tyłu
        const next = scanDirection === 'forward'
          ? visibleFocusable[(index + 1) % visibleFocusable.length] as HTMLElement
          : visibleFocusable[(index - 1 + visibleFocusable.length) % visibleFocusable.length] as HTMLElement
        
        next?.focus()

        // Highlight z przedłużonym czasem (20% dłużej niż scanSpeed)
        const originalOutline = next.style.outline
        const originalBoxShadow = next.style.boxShadow
        next.style.outline = '8px solid #EAB308' // yellow-500
        next.style.boxShadow = '0 0 30px 10px rgba(234, 179, 8, 0.6)'
        
        setTimeout(() => {
          if (next) {
            next.style.outline = originalOutline
            next.style.boxShadow = originalBoxShadow
          }
        }, scanSpeed * 1.2) // 20% dłużej

        const label =
          next.getAttribute('aria-label') || (next as HTMLElement).innerText || 'Element bez nazwy'

        // Podczas skanowania AAC, czytaj etykiety (automatycznie włącza TTS przy starcie AAC)
        if (ttsEnabled) {
          // Przy pierwszym elemencie w nowym kontekście, powiedz gdzie jesteśmy
          if (index === -1) {
            speak(`Skanowanie ${contextName}. ${label}`, true)
          } else {
            speak(label, true)
          }
        }
        
        // Resetuj postęp po przejściu
        setScanProgress(0)
      }, scanSpeed)
    } else {
      setScanProgress(0)
    }
    
    return () => {
      clearInterval(interval)
      clearInterval(progressInterval)
    }
  }, [aacMode, scanSpeed, isPaused, scanDirection, ttsEnabled])

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent): void => {
      // F1 for Scene Description
      if (e.key === 'F1') {
        describeScene()
      }
      // F2 to toggle Accessibility Menu
      if (e.key === 'F2') {
        setShowA11yMenu((prev) => !prev)
        speak('Menu ustawień dostępności', true)
      }
      // F3 to Pause Scan
      if (e.key === 'F3' && aacMode) {
        setIsPaused((prev) => !prev)
        speak(!isPaused ? 'Pauza skanowania' : 'Wznowienie skanowania')
      }
      // Shift to reverse scan direction (2-switch mode)
      if (e.key === 'Shift' && aacMode && !isPaused) {
        setScanDirection((prev) => {
          const newDir = prev === 'forward' ? 'backward' : 'forward'
          speak(newDir === 'backward' ? 'Cofanie' : 'Do przodu')
          return newDir
        })
        e.preventDefault()
      }
      // Space or Enter to select when scanning
      if (aacMode && (e.key === ' ' || e.key === 'Enter')) {
        const current = document.activeElement as HTMLElement
        if (
          current &&
          current.tagName !== 'INPUT' &&
          current.tagName !== 'TEXTAREA' &&
          !current.classList.contains('no-aac-click')
        ) {
          current.click()
          e.preventDefault()
        }
      }

      // Arrow navigation for blind users
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const focusable = Array.from(
          document.querySelectorAll(
            'button:not([disabled]), [tabindex="0"], input:not([disabled]), a[href]'
          )
        ).filter((el) => {
          const style = window.getComputedStyle(el)
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            (el as HTMLElement).offsetWidth > 0
          )
        }) as HTMLElement[]

        if (focusable.length === 0) return

        const current = document.activeElement as HTMLElement
        const currentIndex = focusable.indexOf(current)

        let nextIndex = currentIndex
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          nextIndex = (currentIndex + 1) % focusable.length
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          nextIndex = (currentIndex - 1 + focusable.length) % focusable.length
        }

        if (nextIndex !== currentIndex || currentIndex === -1) {
          if (currentIndex === -1) nextIndex = 0
          const next = focusable[nextIndex]
          next.focus()
          const label = next.getAttribute('aria-label') || next.innerText || 'Element bez nazwy'
          speak(label, showA11yMenu)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handleGlobalKeys)
    return () => window.removeEventListener('keydown', handleGlobalKeys)
  }, [aacMode, isPaused, ttsEnabled, showA11yMenu])

  // Czytanie przy focusie (Tab/Shift+Tab) poza logiką strzałek/AAC
  useEffect(() => {
    if (!ttsEnabled) return

    const handleFocus = (e: FocusEvent): void => {
      const el = e.target as HTMLElement | null
      if (!el || el.classList.contains('no-aac-click')) return

      // Only allow TTS for elements inside the currently visible view
      let allowed = false;
      // If details modal is open, only allow TTS for elements inside it
      const detailsModal = document.querySelector('.z-[100][role="dialog"]');
      if (detailsModal && detailsModal.contains(el)) {
        allowed = true;
      }
      // If accessibility menu is open, only allow TTS for elements inside it
      const a11yPanel = document.querySelector('.z-[150][role="dialog"]');
      if (a11yPanel && a11yPanel.contains(el)) {
        allowed = true;
      }
      // If no modal/panel, allow TTS for elements in main
      if (!detailsModal && !a11yPanel) {
        const main = document.querySelector('main');
        if (main && main.contains(el)) allowed = true;
      }
      if (!allowed) return;

      const label = el.getAttribute('aria-label') || el.innerText || 'Element bez nazwy';
      speak(label, true);
    }

    window.addEventListener('focusin', handleFocus)
    return () => window.removeEventListener('focusin', handleFocus)
  }, [ttsEnabled, speak])

  const handleLogin = async (): Promise<void> => {
    if (!loginInput.trim() || !loginPassword.trim()) {
      speak('Wpisz nick i hasło')
      return
    }
    try {
      const username = loginInput.trim()
      const password = loginPassword.trim()

      // Try to login
      const response = await apiClient.auth.login(username, password)

      if (response.success && response.data) {
        const token = response.data.token
        setAuthToken(token)
        localStorage.setItem('authToken', token)
        localStorage.setItem('username', username)

        const user = response.data.user as { username?: string }
        const displayName = user.username || username
        setUser({
          name: displayName,
          avatar: `https://ui-avatars.com/api/?name=${displayName}&background=random`
        })
        setShowLogin(false)
        setLoginInput('')
        setLoginPassword('')
        setIsRegisterMode(false)
        const successMsg = `Zalogowano jako ${displayName}`
        showToast(successMsg, 'success')
        speak(successMsg)
      } else {
        const errorMsg = `Błąd logowania: ${response.error?.message || 'Nieznany błąd'}`
        showToast(errorMsg, 'error')
        speak(errorMsg)
      }
    } catch (err) {
      speak('Błąd połączenia z serwerem')
      console.error('Login error:', err)
    }
  }

  const handleRegister = async (): Promise<void> => {
    if (!loginInput.trim() || !loginPassword.trim() || !registerEmail.trim()) {
      speak('Wpisz nick, hasło i email')
      return
    }
    try {
      const username = loginInput.trim()
      const password = loginPassword.trim()
      const email = registerEmail.trim()

      // Try to register
      const response = await apiClient.auth.register(username, password, email)

      if (response.success && response.data) {
        const successMsg = 'Konto utworzone! Zalogowanie...'
        showToast(successMsg, 'success')
        speak(successMsg)
        const token = response.data.token
        setAuthToken(token)
        localStorage.setItem('authToken', token)
        localStorage.setItem('username', username)

        const user = response.data.user as { username?: string }
        const displayName = user.username || username
        setUser({
          name: displayName,
          avatar: `https://ui-avatars.com/api/?name=${displayName}&background=random`
        })
        setShowLogin(false)
        setLoginInput('')
        setLoginPassword('')
        setRegisterEmail('')
        setIsRegisterMode(false)
        speak(`Zalogowano jako ${displayName}`)
      } else {
        // Provide more detailed validation feedback
        let errorMessage = `Błąd rejestracji: ${response.error?.message || 'Nieznany błąd'}`
        if (
          response.error?.code === 'VALIDATION_ERROR' &&
          Array.isArray((response.error as any).details)
        ) {
          const details = (response.error as any).details
            .map((d: { field: string; message: string }) => d.message)
            .join(', ')
          errorMessage = `Błąd walidacji: ${details}`
        }
        showToast(errorMessage, 'error')
        speak(errorMessage)
      }
    } catch (err) {
      speak('Błąd połączenia z serwerem')
      console.error('Register error:', err)
    }
  }

  const handleAddComment = async (): Promise<void> => {
    if (!selectedItem || !user || !newComment.trim()) return
    try {
      const newCommentObj: Comment = {
        id: Date.now().toString(),
        user: user.name,
        text: newComment,
        date: new Date().toLocaleDateString('pl-PL')
      }
      const updatedComments = [...comments, newCommentObj]
      setComments(updatedComments)

      // Zapisz komentarze w localStorage
      localStorage.setItem(`comments-${selectedItem.id}`, JSON.stringify(updatedComments))

      setNewComment('')
      speak('Komentarz dodany i zapisany')
    } catch (err) {
      console.error('Error adding comment:', err)
    }
  }

  const handleRate = async (newRating: number): Promise<void> => {
    if (!selectedItem || !user) return
    try {
      // In a real app: await apiClient.files.setRating(selectedItem.id, newRating)
      setRating(newRating)
      setArchiveItems((prev) =>
        prev.map((i) => (i.id === selectedItem.id ? { ...i, rating: newRating } : i))
      )
      speak(`Oceniono na ${newRating} gwiazdek`)
    } catch (err) {
      console.error('Error setting rating:', err)
    }
  }

  // Remove this effect - derive scanning state from aacMode directly in the scanning logic below

  const renderMediaPlayer = (item: ArchiveItem): React.ReactElement => {
    let mediaUrl = item.filePath

    // Use local proxy for archive.org to bypass CSP and CORS
    if (item.filePath.includes('archive.org')) {
      mediaUrl = `http://localhost:3000/api/media/proxy?url=${encodeURIComponent(item.filePath)}`
    } else if (!item.filePath.startsWith('http')) {
      mediaUrl = `media://${item.filePath.replace(/\\/g, '/')}`
    }

    if (item.mediaType === 'filmy') {
      return (
        <VideoPlayer
          key={item.id + item.filePath}
          url={mediaUrl}
          title={item.title}
          aacMode={aacMode}
          speak={speak}
          onPlayChange={setIsFocusMode}
        />
      )
    }

    if (item.mediaType === 'audio') {
      return (
        <div className="flex flex-col gap-6 md:gap-8 w-full">
          <AudioPlayer
            key={item.id + item.filePath}
            url={mediaUrl}
            title={item.title}
            aacMode={aacMode}
            speak={speak}
            onPlayChange={setIsFocusMode}
            item={item}
            onTrackChange={(newIdx) => {
              if (item.playlist && item.playlist[newIdx]) {
                setSelectedItem({
                  ...item,
                  filePath: item.playlist[newIdx].url,
                  currentTrackIndex: newIdx
                })
              }
            }}
          />
          
          {/* Playlist - display if available */}
          {item.playlist && item.playlist.length > 0 && (
            <div className={`${highContrast ? 'bg-white text-black border-2 border-black shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]' : 'bg-gradient-to-br from-slate-900 to-cyan-950/50 backdrop-blur-md border-cyan-500/30 shadow-2xl shadow-cyan-500/10'} rounded-lg p-4 border-2 ${aacMode ? 'space-y-3' : 'space-y-2'}`} style={highContrast ? { background: '#fff', color: '#000', border: '2px solid #000', boxShadow: '0 0 0 2px #fff, 0 0 0 4px #000' } : {}}>
              <h3 className={`${aacMode ? 'text-xl' : 'text-base'} font-black uppercase tracking-wider mb-3 ${highContrast ? 'text-black' : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-400'}`}>
                ▶ TRACKLIST ({item.playlist.length})
              </h3>
              <div className={`space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin ${highContrast ? 'scrollbar-thumb-black scrollbar-track-black/10' : 'scrollbar-thumb-cyan-500/50 scrollbar-track-slate-800'}`}>
                {item.playlist.map((track, idx) => (
                  <button
                    key={track.id}
                    onClick={() => {
                      setSelectedItem({
                        ...item,
                        filePath: track.url,
                        currentTrackIndex: idx
                      })
                      speak(`Odtwarzam: ${track.title}`, true)
                    }}
                    className={`w-full text-left p-2 md:p-3 rounded transition-transform active:scale-95 border ${
                      (selectedItem?.currentTrackIndex ?? item.currentTrackIndex) === idx
                        ? highContrast
                          ? 'bg-black text-white border-2 border-black shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]'
                          : 'bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 border-cyan-400 text-white shadow-lg shadow-cyan-500/50'
                        : highContrast
                          ? 'bg-white text-black border-2 border-black shadow-[0_0_0_2px_#fff,0_0_0_4px_#000]'
                          : 'bg-slate-800/80 border-slate-700/50 text-slate-200'
                    }`}
                    style={highContrast ? { background: (selectedItem?.currentTrackIndex ?? item.currentTrackIndex) === idx ? '#000' : '#fff', color: (selectedItem?.currentTrackIndex ?? item.currentTrackIndex) === idx ? '#fff' : '#000', border: '2px solid #000', boxShadow: '0 0 0 2px #fff, 0 0 0 4px #000' } : {}}
                    aria-label={`Utwór ${idx + 1}: ${track.title}. ${track.duration}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {(selectedItem?.currentTrackIndex ?? item.currentTrackIndex) === idx && (
                          <span className="text-cyan-400 animate-pulse text-sm">▶</span>
                        )}
                        <span className={`${aacMode ? 'text-base' : 'text-xs'} font-bold truncate`}>
                          {idx + 1}. {track.title}
                        </span>
                      </div>
                      <span className={`${aacMode ? 'text-base' : 'text-xs'} font-mono text-cyan-400 flex-shrink-0`}>
                        {track.duration}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    }

    if (item.mediaType === 'obrazy') {
      return (
        <img
          src={mediaUrl}
          alt={`Podgląd: ${item.title}`}
          className="max-w-full max-h-full object-contain"
        />
      )
    }

    if (item.mediaType === 'teksty' && item.filePath.toLowerCase().endsWith('.pdf')) {
      return <PdfViewer url={mediaUrl} aacMode={aacMode} speak={speak} highContrast={highContrast} />
    }

    return (
      <div className={`${item.coverColor} p-20 rounded-2xl`}>
        {item.mediaType === 'teksty' ? (
          <FileText size={100} className="text-white" />
        ) : (
          <Disc size={100} className="text-white" />
        )}
      </div>
    )
  }

  const getColorBlindFilter = () => {
    switch (colorBlindMode) {
      case 'protanopia':
        return 'url(#protanopia-filter)'
      case 'deuteranopia':
        return 'url(#deuteranopia-filter)'
      case 'tritanopia':
        return 'url(#tritanopia-filter)'
      default:
        return 'none'
    }
  }

  // Helper to get high contrast classes
  const getHighContrastClass = () =>
    highContrast
      ? 'grayscale contrast-150 invert bg-white text-black'
      : 'bg-slate-900 text-slate-100';

  // Helper to get modal background
  const getModalBgClass = () =>
    highContrast
      ? 'bg-white text-black border-black'
      : 'bg-slate-900 text-white border-yellow-500';

  // Helper to get overlay background
  const getOverlayBgClass = () =>
    highContrast
      ? 'bg-black/80'
      : 'bg-black/90';

  return (
    <div
      className={`flex h-screen w-full overflow-hidden ${getHighContrastClass()} ${aacMode ? 'font-mono' : 'font-sans'} transition-colors duration-300 relative`}
      style={{ filter: getColorBlindFilter() }}
    >
      {/* SVG Filters for Color Blindness */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <filter id="protanopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.567, 0.433, 0,     0, 0
                    0.558, 0.442, 0,     0, 0
                    0,     0.242, 0.758, 0, 0
                    0,     0,     0,     1, 0"
          />
        </filter>
        <filter id="deuteranopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.625, 0.375, 0,   0, 0
                    0.7,   0.3,   0,   0, 0
                    0,     0.3,   0.7, 0, 0
                    0,     0,     0,   1, 0"
          />
        </filter>
        <filter id="tritanopia-filter">
          <feColorMatrix
            type="matrix"
            values="0.95, 0.05,  0,     0, 0
                    0,    0.433, 0.567, 0, 0
                    0,    0.475, 0.525, 0, 0
                    0,    0,     0,     1, 0"
          />
        </filter>
      </svg>
      {/* SKIP LINK DLA OSÓB KORZYSTAJĄCYCH Z KLAWIATURY / CZYTNIKÓW */}
      <button
        onClick={() => setShowA11yMenu(true)}
        className="absolute top-0 left-0 z-[1000] bg-blue-600 text-white p-4 -translate-y-full focus:translate-y-0 transition-transform font-bold outline-none"
      >
        Przejdź do ustawień dostępności (F2)
      </button>

      {/* OVERLAY FOR MOBILE SIDEBAR */}
      {isSidebarOpen && (
        <div
          className={`fixed inset-0 ${highContrast ? 'bg-black/60' : 'bg-black/60'} z-[60] md:hidden`}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* UKRYTA INSTRUKCJA DLA CZYTNIKÓW EKRANU (Screen Readers Only) */}
      <div className="sr-only" role="note">
        Witaj w e-Archiwum. Aplikacja posiada rozbudowane funkcje dostępności. Naciśnij klawisz F1,
        aby usłyszeć opis bieżącego ekranu. Naciśnij klawisz F2 w dowolnym momencie, aby otworzyć
        ustawienia dostępności. Możesz poruszać się po elementach używając strzałek na klawiaturze.
        W menu ustawień możesz włączyć czytanie na głos (Lektor) oraz automatyczne skanowanie
        interfejsu (Tryb AAC).
      </div>

      {/* WIZUALNY WSKAŹNIK POSTĘPU SKANOWANIA AAC */}
      {aacMode && !isPaused && (
        <div className="fixed top-0 left-0 right-0 z-[999] h-2 bg-slate-950">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 via-yellow-400 to-yellow-500 transition-all duration-75 shadow-lg shadow-yellow-500/50"
            style={{ width: `${scanProgress}%` }}
            role="progressbar"
            aria-valuenow={Math.round(scanProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Postęp skanowania elementów"
          />
        </div>
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-[70] transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 transition-transform duration-300 ease-in-out
          ${aacMode ? 'w-[85vw] md:w-96' : 'w-[75vw] md:w-64'}
          ${highContrast ? 'bg-white text-black border-black' : 'bg-slate-950'} flex-shrink-0 flex flex-col border-r ${highContrast ? 'border-black' : 'border-slate-800'}
        `}
        role="complementary"
      >
        <div className="p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Library className={highContrast ? 'text-black' : 'text-yellow-500'} size={aacMode ? 52 : 32} aria-hidden="true" />
            <h1 className={`${aacMode ? 'text-3xl' : 'text-xl'} font-bold ${highContrast ? 'text-black' : ''}`}>eArchiwum</h1>
          </div>
          <button
            className={`md:hidden p-2 rounded-lg border ${highContrast ? 'bg-black text-white border-black hover:bg-black/80' : 'text-slate-400 hover:text-white border-slate-800'}`}
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Zamknij menu"
          >
            <X size={aacMode ? 48 : 32} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-4 overflow-y-auto" aria-label="Kategorie">
          {['Wszystkie', 'Filmy', 'Audio', 'Teksty', 'Oprogramowanie'].map((cat) => {
            const getIcon = () => {
              switch (cat) {
                case 'Audio':
                  return Music
                case 'Teksty':
                  return FileText
                case 'Filmy':
                  return Film
                case 'Oprogramowanie':
                  return Cpu
                default:
                  return Library
              }
            }
            return (
              <SidebarItem
                key={cat}
                icon={getIcon()}
                label={cat}
                active={activeCategory === cat.toLowerCase()}
                aacMode={aacMode}
                highContrast={highContrast}
                onClick={() => {
                  setActiveCategory(cat.toLowerCase())
                  const count = archiveItems.filter(
                    (i) => cat.toLowerCase() === 'wszystkie' || i.mediaType === cat.toLowerCase()
                  ).length
                  speak(`Wybrano kategorię ${cat}. Znaleziono ${count} plików.`)
                  if (window.innerWidth < 768) setIsSidebarOpen(false)
                }}
              />
            )
          })}
        </nav>

        <div className={`p-6 border-t ${highContrast ? 'border-black bg-white' : 'border-cyan-500/30 bg-gradient-to-t from-slate-950 to-slate-900'} space-y-4`}>
          <button
            onClick={() => setShowA11yMenu(true)}
            className={`w-full py-5 px-4 rounded-xl ${highContrast ? 'bg-black text-white border-black' : 'bg-gradient-to-r from-cyan-600 to-blue-600 border-2 border-cyan-400/50 text-white'} font-black text-xl flex items-center justify-center gap-3 hover:shadow-lg hover:shadow-cyan-500/50 active:scale-95 transition-all`}
            aria-label="Ustawienia dostępności"
          >
            <Accessibility size={aacMode ? 48 : 32} />
            <span>DOSTĘPNOŚĆ</span>
          </button>

          {aacMode && (
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20">
                <p className="text-yellow-500 font-bold text-xs uppercase mb-1">Instrukcja AAC:</p>
                <p className="text-slate-300 text-xs leading-relaxed">
                  System automatycznie przeskakuje między przyciskami. Gdy usłyszysz właściwy,
                  naciśnij <strong>ENTER</strong> lub <strong>SPACJĘ</strong> aby go wybrać.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex justify-between">
                  <span>Prędkość: {scanSpeed / 1000}s</span>
                  {isPaused && <span className="text-yellow-500 animate-pulse">PAUZA (F3)</span>}
                </label>
                <div className="flex gap-2">
                  {[2000, 3500, 5000].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        setScanSpeed(speed)
                        speak(`Prędkość ${speed / 1000} sekundy`)
                      }}
                      className={`flex-1 py-2 rounded-lg border-2 font-bold text-xs ${scanSpeed === speed ? 'bg-yellow-500 border-yellow-300 text-black' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                    >
                      {speed / 1000}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className={`flex-1 flex flex-col min-w-0 ${highContrast ? 'bg-white text-black' : ''}`} role="main">
        <header className={`h-24 border-b ${highContrast ? 'border-black bg-white' : 'border-slate-800/50 bg-slate-900/40 backdrop-blur-md'} flex items-center px-6 md:px-12 justify-between gap-4 sticky top-0 z-50`}>
          <div className="flex items-center gap-6 flex-1">
            <button
              className={`md:hidden p-3 rounded-2xl ${highContrast ? 'bg-black text-white' : 'bg-slate-800 text-slate-400 hover:text-white'} transition-colors`}
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Otwórz menu"
            >
              <Library size={32} className={highContrast ? 'text-black' : 'text-yellow-500'} />
            </button>
            <div className="relative flex-1 max-w-xl group">
              <label htmlFor="search-input" className="sr-only">
                Szukaj
              </label>
              <Search
                className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors"
                size={24}
                aria-hidden="true"
              />
              <input
                id="search-input"
                type="text"
                placeholder="Wyszukaj w archiwum..."
                aria-label="Wyszukaj pliki w archiwum"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ${highContrast ? 'bg-white border-black text-black placeholder:text-black' : 'bg-slate-800/50 border-2 border-slate-700/50'} rounded-2xl pl-14 pr-6 py-3 md:py-4 ${aacMode ? 'text-2xl' : 'text-base'} focus:ring-4 focus:ring-yellow-500/20 focus:border-yellow-500/50 outline-none transition-all placeholder:text-slate-600 font-bold`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            {user ? (
              <div className="flex items-center gap-4 bg-slate-800/50 p-1.5 md:p-2 rounded-2xl border border-slate-700/50 shadow-lg pr-4 md:pr-6 hover:border-slate-600 transition-colors cursor-pointer group">
                <div className="relative">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-white text-lg md:text-xl font-bold shadow-inner group-hover:scale-110 transition-transform">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-slate-900 rounded-full" />
                </div>
                <span className="font-black hidden sm:inline text-white uppercase tracking-tighter text-lg">
                  {user.name}
                </span>
              </div>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="bg-yellow-500 hover:bg-yellow-400 text-black px-6 md:px-10 py-3 md:py-4 rounded-2xl font-black text-sm md:text-lg uppercase tracking-widest transition-all shadow-lg hover:shadow-yellow-500/20 active:scale-95"
              >
                ZALOGUJ
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2
              className={`${aacMode ? 'text-4xl md:text-5xl' : 'text-3xl md:text-4xl'} font-black capitalize flex items-center gap-6`}
            >
              {activeCategory}
              <span
                className="text-sm md:text-lg font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-4 py-1 rounded-full uppercase tracking-widest"
                aria-live="polite"
              >
                {filteredData.length} plików
              </span>
            </h2>
          </div>

          <div
            className={`grid gap-4 md:gap-8 ${aacMode ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'}`}
          >
            {filteredData.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-20 md:py-32 text-center">
                <Library size={120} className="text-slate-700 mb-8 opacity-30" />
                <h3 className="text-2xl md:text-4xl font-black text-slate-600 mb-4 uppercase tracking-tighter">
                  {searchQuery ? 'Brak wyników' : 'Brak plików'}
                </h3>
                <p className="text-slate-500 text-lg md:text-xl max-w-md mb-8 font-medium">
                  {searchQuery
                    ? 'Spróbuj zmodyfikować wyszukiwanie'
                    : 'Nie znaleziono plików do wyświetlenia'}
                </p>
              </div>
            ) : (
              filteredData.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onClick={() => setSelectedItem(item)}
                  onSpeak={(e, text) => {
                    e.stopPropagation()
                    speak(text)
                  }}
                  aacMode={aacMode}
                  highContrast={highContrast}
                />
              ))
            )}
          </div>
        </div>

        {/* LOGIN MODAL */}
        {showLogin && (
          <Modal
            isOpen={showLogin}
            title={isRegisterMode ? 'Załóż konto' : 'Zaloguj się'}
            onClose={() => {
              setShowLogin(false)
              setLoginInput('')
              setLoginPassword('')
              setRegisterEmail('')
              setIsRegisterMode(false)
            }}
            highContrast={highContrast}
            buttons={[]}
          >
            <input
              autoFocus
              type="text"
              placeholder="NICK"
              aria-label="Nazwa użytkownika"
              className="w-full bg-slate-950 border-4 border-slate-800 p-5 md:p-7 rounded-3xl mb-6 text-2xl md:text-3xl text-white text-center focus:border-yellow-500 transition-colors outline-none font-black"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && (isRegisterMode ? handleRegister() : handleLogin())
              }
            />
            {isRegisterMode && (
              <input
                type="email"
                placeholder="EMAIL"
                aria-label="Adres email"
                className="w-full bg-slate-950 border-4 border-slate-800 p-5 md:p-7 rounded-3xl mb-6 text-2xl md:text-3xl text-white text-center focus:border-yellow-500 transition-colors outline-none font-black"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              />
            )}
            <input
              type="password"
              placeholder="HASŁO"
              aria-label="Hasło"
              className="w-full bg-slate-950 border-4 border-slate-800 p-5 md:p-7 rounded-3xl mb-8 text-2xl md:text-3xl text-white text-center focus:border-yellow-500 transition-colors outline-none font-black"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' && (isRegisterMode ? handleRegister() : handleLogin())
              }
            />
            <button
              onClick={isRegisterMode ? handleRegister : handleLogin}
              className="w-full bg-yellow-500 text-black font-black py-5 md:py-8 rounded-3xl text-2xl md:text-3xl hover:bg-yellow-400 transition-all transform hover:scale-105 active:scale-95 shadow-xl"
            >
              {isRegisterMode ? 'ZAŁÓŻ KONTO' : 'WEJDŹ'}
            </button>
            <button
              onClick={() => {
                setIsRegisterMode(!isRegisterMode)
                speak(
                  isRegisterMode ? 'Przełączono na logowanie' : 'Przełączono na rejestrację',
                  false
                )
              }}
              className="w-full mt-6 text-yellow-400 uppercase font-black tracking-widest hover:text-yellow-300 transition-colors text-sm md:text-base"
            >
              {isRegisterMode ? 'Mam już konto - logowanie' : 'Brak konta? Załóż je tutaj'}
            </button>
            <button
              onClick={() => {
                setShowLogin(false)
                setLoginInput('')
                setLoginPassword('')
                setRegisterEmail('')
                setIsRegisterMode(false)
              }}
              className="w-full mt-4 text-slate-500 uppercase font-black tracking-widest hover:text-white transition-colors"
            >
              Anuluj
            </button>
          </Modal>
        )}
  {/* TOASTS */}
  <ToastContainer highContrast={highContrast} />

        {/* ACCESSIBILITY MENU MODAL */}
        {showA11yMenu && (
          <div
            className={`fixed inset-0 ${getOverlayBgClass()} backdrop-blur-md flex items-center justify-center z-[150] p-4`}
            role="dialog"
            aria-modal="true"
          >
            <div className={`p-8 md:p-12 rounded-[3rem] border-8 w-full max-w-[700px] shadow-[0_0_80px_rgba(59,130,246,0.3)] overflow-y-auto max-h-[95vh] relative ${getModalBgClass()}`}>  
              <div className="flex justify-between items-center mb-10 md:mb-14">
                <div className="flex items-center gap-6">
                  <div className="p-4 bg-blue-500/10 rounded-3xl border border-blue-500/20">
                    <Accessibility size={32} className="md:size-[48px] text-blue-500" />
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black uppercase text-white tracking-tighter">
                    Ustawienia
                  </h2>
                </div>
                <button
                  autoFocus
                  onClick={() => setShowA11yMenu(false)}
                  aria-label="Zamknij menu ustawień dostępności"
                  className="p-3 md:p-5 bg-slate-800 rounded-2xl hover:bg-slate-700 text-white transition-all focus:ring-4 focus:ring-blue-400 outline-none active:scale-90 shadow-lg border border-slate-700"
                >
                  <X size={24} className="md:size-[36px]" />
                </button>
              </div>

              <div className="space-y-4 md:space-y-8">
                {/* Lektor (TTS) */}
                <button
                  aria-label={`Czytanie na głos: ${ttsEnabled ? 'Włączone' : 'Wyłączone'}. Lektor TTS - mówi co jest na ekranie.`}
                  onClick={() => {
                    const newState = !ttsEnabled
                    setTtsEnabled(newState)
                    speak(
                      newState ? 'Włączono czytanie na głos' : 'Wyłączono czytanie na głos',
                      true
                    )
                  }}
                  className={`w-full flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 transition-all focus:outline-none focus:ring-8 focus:ring-yellow-400 ${highContrast ? 'bg-white border-black text-black' : ttsEnabled ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                >
                  <div className="flex items-center gap-4 md:gap-6">
                    <Volume2 size={32} className="md:size-[40px]" />
                    <div className="flex flex-col items-start text-left">
                      <span className="text-lg md:text-2xl font-bold uppercase">
                        Czytanie na głos
                      </span>
                      <span className="text-[10px] md:text-sm opacity-75 font-bold">
                        Lektor (TTS) - mówi co jest na ekranie
                      </span>
                    </div>
                  </div>
                  {ttsEnabled ? <Check size={32} /> : <X size={32} />}
                </button>

                {/* Tryb AAC (Scanning) */}
                <button
                  aria-label={`Automatyczne wybieranie: ${aacMode ? 'Włączone' : 'Wyłączone'}. Tryb AAC - samo przeskakuje po przyciskach.`}
                  onClick={() => {
                    const newState = !aacMode
                    setAacMode(newState)
                    // Automatycznie włącz lektora przy włączaniu AAC, bo skanowanie bez mowy jest trudne
                    if (newState && !ttsEnabled) setTtsEnabled(true)
                    speak(
                      newState
                        ? 'Włączono automatyczne wybieranie'
                        : 'Wyłączono automatyczne wybieranie',
                      true
                    )
                  }}
                  className={`w-full flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 transition-all focus:outline-none focus:ring-8 focus:ring-yellow-400 ${highContrast ? 'bg-white border-black text-black' : aacMode ? 'bg-yellow-500 border-yellow-300 text-black' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                >
                  <div className="flex items-center gap-4 md:gap-6">
                    <Eye size={32} className="md:size-[40px]" />
                    <div className="flex flex-col items-start text-left">
                      <span className="text-lg md:text-2xl font-bold uppercase">
                        Automatyczne wybieranie
                      </span>
                      <span className="text-[10px] md:text-sm opacity-75 font-bold">
                        Spacja = wybierz, Shift = cofnij, F3 = pauza
                      </span>
                    </div>
                  </div>
                  {aacMode ? <Check size={32} /> : <X size={32} />}
                </button>

                {/* Wysoki Kontrast */}
                <button
                  aria-label={`Wysoki Kontrast: ${highContrast ? 'Włączony' : 'Wyłączony'}.`}
                  onClick={() => {
                    const newState = !highContrast
                    setHighContrast(newState)
                    speak(newState ? 'Włączono wysoki kontrast' : 'Wyłączono wysoki kontrast', true)
                  }}
                  className={`w-full flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 md:border-4 transition-all focus:outline-none focus:ring-8 focus:ring-yellow-400 ${highContrast ? 'bg-white border-black text-black' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                >
                  <div className="flex items-center gap-4 md:gap-6">
                    <Activity size={32} className="md:size-[40px]" />
                    <span className="text-lg md:text-2xl font-bold uppercase">Wysoki Kontrast</span>
                  </div>
                  {highContrast ? <Check size={32} /> : <X size={32} />}
                </button>

                {/* Tryb dla daltonistów */}
                <div className="bg-slate-800 p-4 md:p-8 rounded-2xl md:rounded-3xl border-2 md:border-4 border-slate-700 space-y-4 md:space-y-6">
                  <div className="flex items-center gap-4 md:gap-6">
                    <Eye size={32} className="md:size-[40px] text-green-400" />
                    <span className="text-lg md:text-2xl font-bold uppercase text-white">
                      Tryb barw (Daltonizm)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:gap-4">
                    {(['none', 'protanopia', 'deuteranopia', 'tritanopia'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => {
                          setColorBlindMode(mode)
                          const labels = {
                            none: 'Brak',
                            protanopia: 'Protanopia',
                            deuteranopia: 'Deuteranopia',
                            tritanopia: 'Tritanopia'
                          }
                          speak(`Wybrano tryb barw: ${labels[mode]}`, true)
                        }}
                        className={`py-3 md:py-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm uppercase border-2 transition-all ${colorBlindMode === mode ? 'bg-green-600 border-green-400 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}
                      >
                        {mode === 'none' ? 'Brak' : mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Powiększenie Tekstu */}
                <div className="bg-slate-800 p-4 md:p-8 rounded-2xl md:rounded-3xl border-2 md:border-4 border-slate-700 space-y-4 md:space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 md:gap-6">
                      <Type size={32} className="md:size-[40px] text-blue-400" />
                      <span className="text-lg md:text-2xl font-bold uppercase text-white">
                        Powiększenie
                      </span>
                    </div>
                    <span className="text-xl md:text-3xl font-black text-blue-400">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      aria-label="Zmniejsz powiększenie"
                      onClick={() => {
                        const newZoom = Math.max(1, zoomLevel - 0.1)
                        setZoomLevel(newZoom)
                        speak(`Powiększenie ${Math.round(newZoom * 100)} procent`)
                      }}
                      className="p-3 md:p-4 bg-slate-700 rounded-xl md:rounded-2xl hover:bg-slate-600 text-white font-black text-xl md:text-2xl"
                    >
                      <span aria-hidden="true">−</span>
                      <span className="sr-only">Zmniejsz</span>
                    </button>
                    <input
                      aria-label="Suwak powiększenia"
                      type="range"
                      min="1"
                      max="2"
                      step="0.05"
                      value={zoomLevel}
                      className="no-aac-click flex-1 h-3 md:h-4 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        setZoomLevel(val)
                        // Używamy debounce lub throttle jeśli to za często, ale range w React przy przesuwanu strzałkami jest ok
                        speak(`Powiększenie ${Math.round(val * 100)} procent`)
                      }}
                    />
                    <button
                      aria-label="Zwiększ powiększenie"
                      onClick={() => {
                        const newZoom = Math.min(2, zoomLevel + 0.1)
                        setZoomLevel(newZoom)
                        speak(`Powiększenie ${Math.round(newZoom * 100)} procent`)
                      }}
                      className="p-3 md:p-4 bg-slate-700 rounded-xl md:rounded-2xl hover:bg-slate-600 text-white font-black text-xl md:text-2xl"
                    >
                      <span aria-hidden="true">+</span>
                      <span className="sr-only">Zwiększ</span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowA11yMenu(false)}
                aria-label="Zatwierdź i zamknij ustawienia"
                className={`w-full mt-10 md:mt-14 font-black py-5 md:py-8 rounded-3xl text-2xl md:text-3xl uppercase shadow-[0_10px_40px_rgba(37,99,235,0.4)] transition-all transform hover:-translate-y-1 active:scale-95 border-b-8 ${highContrast ? 'bg-black text-white border-black hover:bg-black/80' : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-800'}`}
              >
                Gotowe
              </button>
            </div>
          </div>
        )}

        {/* DETAIL MODAL - Simplified full screen layout */}
        {selectedItem && (
          <div
            className={`fixed inset-0 z-[100] flex flex-col ${highContrast ? 'bg-white text-black' : 'bg-slate-950 text-white'}`}
            role="dialog"
            aria-modal="true"
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <button
                  onClick={() => {
                    setSelectedItem(null)
                    setIsFocusMode(false)
                    speak('Zamknięto widok szczegółów')
                  }}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                  aria-label="Zamknij"
                >
                  <X size={24} />
                </button>
                <h2 className="text-lg font-bold text-white truncate">{selectedItem.title}</h2>
                <span className="px-3 py-1 bg-slate-800 rounded text-xs font-mono text-slate-400">
                  {selectedItem.mediaType}
                </span>
              </div>
              {user && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-slate-300">{user.name}</span>
                </div>
              )}
            </div>

            {/* Main content - 70/30 split */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Player/Viewer - 70% */}
              <div className="flex-1 flex items-center justify-center p-6 bg-slate-900 overflow-auto">
                {renderMediaPlayer(selectedItem)}
              </div>

              {/* Sidebar - 30% */}
              <div className="w-96 flex-shrink-0 border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                {/* Rating */}
                <div className="p-6 border-b border-slate-800">
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">Oceń</h3>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleRate(star)}
                        disabled={!user}
                        className="transition-transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label={`Oceń na ${star} gwiazdek`}
                      >
                        <Star
                          size={24}
                          className={
                            star <= (rating || selectedItem.rating || 0)
                              ? 'fill-yellow-500 text-yellow-500'
                              : 'text-slate-700 hover:text-slate-600'
                          }
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comments */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className={`p-6 border-b ${highContrast ? 'border-black bg-white' : 'border-slate-800'}`}>
                    <div className="flex items-center gap-2 mb-4">
                      <MessageSquare size={18} className={highContrast ? 'text-black' : 'text-slate-500'} />
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${highContrast ? 'text-black' : 'text-slate-500'}`}>
                        Komentarze ({comments.length})
                      </h3>
                    </div>

                    {user ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Dodaj komentarz..."
                          aria-label="Pole do wpisania komentarza"
                          value={newComment}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Speak only the last typed character
                            if (value.length > newComment.length) {
                              const lastChar = value[value.length - 1];
                              if (lastChar && lastChar !== '\n' && lastChar !== '\r') {
                                speak(lastChar, true);
                              }
                            }
                            setNewComment(value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newComment.trim()) {
                              handleAddComment();
                            }
                          }}
                          className={`flex-1 px-3 py-2 rounded text-sm focus:outline-none ${highContrast ? 'bg-white border border-black text-black placeholder-black focus:border-black' : 'bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:border-slate-700'}`}
                        />
                        <button
                          onClick={handleAddComment}
                          disabled={!newComment.trim()}
                          className={`p-2 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${highContrast ? 'bg-black text-white border border-black hover:bg-black/80' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                          aria-label="Wyślij"
                        >
                          <Send size={18} className={highContrast ? 'text-white' : ''} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowLogin(true)}
                        className={`w-full py-2 px-4 text-sm rounded transition-colors ${highContrast ? 'bg-black text-white border border-black hover:bg-black/80' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                      >
                        Zaloguj się
                      </button>
                    )}
                  </div>

                  {/* Comments list - TTS on hover only */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {comments.length === 0 ? (
                      <p className={`text-sm text-center py-8 ${highContrast ? 'text-black' : 'text-slate-600'}`}>Brak komentarzy</p>
                    ) : (
                      comments.map((comment) => (
                        <div
                          key={comment.id}
                          tabIndex={0}
                          role="article"
                          aria-label={`Komentarz od ${comment.user}: ${comment.text}`}
                          className={`p-3 rounded border transition-colors focus:outline-none focus:ring-2 cursor-pointer ${highContrast ? 'bg-white border-black hover:border-black focus:ring-black text-black' : 'bg-slate-900 border-slate-800 hover:border-slate-700 focus:ring-cyan-500 text-white'}`}
                          // TTS tylko na focus (klawiatura/AAC), nie na hover
                          onFocus={() => {
                            if (ttsEnabled && aacMode) {
                              speak(`Komentarz od ${comment.user}: ${comment.text}`, false)
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-md ${highContrast ? 'bg-black text-white border border-black' : 'bg-gradient-to-br from-cyan-500 to-purple-600 text-white'}`}> 
                              {comment.user?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`font-semibold text-sm truncate ${highContrast ? 'text-black' : 'text-white'}`}>{comment.user}</span>
                                <span className={`text-xs ${highContrast ? 'text-black' : 'text-slate-600'}`}>{comment.date}</span>
                              </div>
                              <p className={`text-sm ${highContrast ? 'text-black' : 'text-slate-400'}`}>{comment.text}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
