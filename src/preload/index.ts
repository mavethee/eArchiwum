import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Definiujemy API, które będzie dostępne w oknie przeglądarki jako window.api
const api = {
  // Skanowanie wybranego folderu z dysku
  scanFolder: (): Promise<unknown[]> => ipcRenderer.invoke('scan-directory'),

  // Pobieranie przykładowych danych z internetu
  loadDemoData: (): Promise<unknown[]> => ipcRenderer.invoke('load-demo-data'),

  // Otwieranie pliku w domyślnej aplikacji systemowej
  openFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke('open-file', filePath),

  // --- API BAZY DANYCH (Nowe metody) ---

  // Logowanie / Rejestracja (zwraca obiekt usera)
  login: (username: string): Promise<unknown> => ipcRenderer.invoke('auth-login', username),

  // Pobranie aktualnie zalogowanego użytkownika (przy starcie)
  getCurrentUser: (): Promise<unknown> => ipcRenderer.invoke('auth-get-user'),

  // Pobranie komentarzy dla konkretnego pliku
  getComments: (fileId: string): Promise<unknown[]> => ipcRenderer.invoke('get-comments', fileId),

  // Dodanie komentarza
  addComment: (fileId: string, text: string, user: string): Promise<unknown[]> =>
    ipcRenderer.invoke('add-comment', { fileId, text, user }),

  // Ustawienie oceny
  setRating: (fileId: string, rating: number): Promise<number> =>
    ipcRenderer.invoke('set-rating', { fileId, rating }),

  // Pobranie oceny użytkownika dla pliku
  getRating: (fileId: string): Promise<number> => ipcRenderer.invoke('get-rating', fileId),

  // Pobieranie zdalnych plików przez proces główny
  fetchRemoteFile: (url: string): Promise<Buffer> => ipcRenderer.invoke('fetch-remote-file', url),

  // Czyszczenie cache PDF-ów
  clearPdfCache: (): Promise<{ cleared: number; error?: string }> =>
    ipcRenderer.invoke('clear-pdf-cache')
}

// Eksponowanie API w bezpieczny sposób (Context Isolation)
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Fallback dla starszych konfiguracji
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}
