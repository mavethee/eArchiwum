# eArchiwum 📚

![Electron](https://img.shields.io/badge/Electron-27.x-blue)
![React](https://img.shields.io/badge/React-19.x-61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791)
![Status](https://img.shields.io/badge/status-edu--project-informational)

Aplikacja desktopowa do cyfrowego archiwizowania dokumentów, multimediów i
metadanych, zbudowana w oparciu o Electron, React, TypeScript oraz PostgreSQL.
Pozwala na bezpieczne przechowywanie, wyszukiwanie, wersjonowanie i audyt plików
zgodnie ze standardami Dublin Core, PREMIS, OAIS i WCAG 2.1.

---

## 📑 Spis treści

- [🖥️ Demonstracja](#️-demonstracja)
- [🚀 Funkcje](#-funkcje)
- [🧰 Technologie](#-technologie)
- [📁 Struktura katalogów](#-struktura-katalogów)
- [⚙️ Jak uruchomić lokalnie](#️-jak-uruchomić-lokalnie)
- [🛠 Konfiguracja bazy danych](#-konfiguracja-bazy-danych)
- [🔒 Bezpieczeństwo](#-bezpieczeństwo)
- [📦 Upload plików](#-upload-plików)
- [📜 Licencja](#-licencja)

## 🖥️ Demonstracja

![eArchiwum - Menu główne](<./screenshots/MainMenu.png> "eArchiwum - Menu główne")
![eArchiwum - Czytnik PDF](<./screenshots/PdfReader.png> "eArchiwum - Czytnik PDF")
![eArchiwum - Odtwarzacz wideo](<./screenshots/VideoPlayer.png> "eArchiwum - Odtwarzacz wideo")
![eArchiwum - Odtwarzacz dźwięku](<./screenshots/AudioPlayer.png> "eArchiwum - Odtwarzacz dźwięku")

## 🚀 Funkcje

- Rejestracja i logowanie użytkowników (JWT, bcrypt, blokada konta po wielu  
  nieudanych próbach)
- Wyszukiwanie pełnotekstowe (język polski, indeksowanie semantyczne)
- Obsługa wielu formatów: PDF, wideo, audio, obrazy, archiwa oprogramowania
- Automatyczne rozpoznawanie tekstu (OCR, Tesseract.js)
- Zarządzanie metadanymi (Dublin Core, PREMIS)
- Kontrola dostępu (role: Czytelnik, Kurator, Administrator)
- Wersjonowanie plików i metadanych
- Niezmienny dziennik audytowy (pełna historia operacji)
- Walidacja integralności (fixity checking)
- Tryb dostępności (AAC):
  - synteza mowy,
  - wysoki kontrast,
  - auto-skanning,
  - wsparcie dla daltonistów,
  - pełna obsługa klawiatury i czytników ekranu,
- Monitoring i alerty systemowe
(automatyczne powiadomienia e-mail przy krytycznych zdarzeniach)

---

## 🧰 Technologie

- **Electron 27+**
- **React 19+**
- **TypeScript 5+**
- **Express.js** (REST API)
- **PostgreSQL 15+**
- **Redis** (opcjonalnie)
- **Jest, Playwright** (testy jednostkowe i E2E)
- **Snyk, npm audit** (automatyczny audyt bezpieczeństwa zależności)
- **nodemailer** (alerty e-mail)
- **TailwindCSS**
- **Tesseract.js** (OCR)
- **bcrypt, JWT, Helmet.js, CORS**

---

## 📁 Struktura katalogów

```sh
e-archiwum/
├── src/
│   ├── main/           # Backend: API, serwisy, baza, middleware
│   ├── renderer/       # Frontend: React, komponenty, style
│   └── preload/        # Bezpieczna komunikacja
│                       # Electron
├── storage/            # Pliki użytkowników
├── backups/            # Kopie zapasowe
├── screenshots/        # Screeny
├── scripts/            # Skrypty pomocnicze
├── docker-compose.yml  # Konfiguracja Dockera
├── package.json        # Konfiguracja projektu
├── README.md           # Ten plik
└── LICENSE             # Licencja MIT
```

---

## ⚙️ Jak uruchomić lokalnie?

### 🧑‍💻 Node.js + Docker

>[!WARNING]
> Najwygodniej uruchomić przez Docker Compose,
> ale możesz też użyć własnej bazy PostgreSQL.

1. Wymagania:

- Node.js 18+
- PostgreSQL 15+ (lub Docker)
- npm

1. Sklonuj repozytorium:

 ```bash
 git clone https://github.com/mavethee/eArchiwum.git
 cd eArchiwum
 ```

1. Zainstaluj zależności:

 ```bash
 npm install
 ```

1. Skonfiguruj środowisko:

 ```bash
 cp .env.example .env
 ```

1. Uruchom bazę danych i backend (Docker):

 ```bash
 docker-compose up -d
 ```

1. Uruchom aplikację:

 ```bash
 npm run dev
 ```

1. Otwórz aplikację:

- API: <http://localhost:3000>
- Interfejs Electron: uruchomi się automatycznie

---

## 🛠 Konfiguracja bazy danych

- Domyślnie baza PostgreSQL uruchamiana jest przez Docker Compose na porcie `5432`.
- Pliki migracji i schematy znajdują się w
  `src/main/database/`.
- Przykładowe dane testowe możesz dodać przez plik `seed.sql`.
- Zmienne środowiskowe konfiguruje plik `.env`.
  
**Uwaga:**

- Aplikacja korzysta wyłącznie z pliku `.env`.
- Plik `.env.example` służy jako szablon – skopiuj go jako `.env` i edytuj wg potrzeb.

## 🔒 Bezpieczeństwo

- JWT z 24h ważnością
- Bcrypt (hashowanie haseł)
- Szyfrowanie AES-256-GCM
- TLS/SSL dla transportu
- RBAC (role i uprawnienia)
- Audyt operacji
- Rate limiting
- Blokada konta po wielu nieudanych logowaniach
- Helmet.js, CORS, walidacja wejścia (Joi)
- Ochrona API i cache PDF
- Automatyczne alerty e-mail do administratora przy krytycznych zdarzeniach  
  (np. awaria bazy, wysokie zużycie zasobów)
- Automatyczny audyt zależności (npm audit, Snyk) w CI

---

## 📦 Upload plików

- Pliki użytkowników przechowywane są w katalogu `storage/files/`
- Kopie zapasowe trafiają do `backups/`
- Cache PDF: `userData/pdf-cache/`
- System automatycznie monitoruje miejsce na dysku i ostrzega administratora  
  przy przekroczeniu progów
- Przykładowe API do pobierania pliku:

  ```bash
  curl -X GET http://localhost:3000/api/files/ID_PLIKU \
  -H "Authorization: Bearer TWOJ_TOKEN"
  ```

---

## 📜 Licencja

Projekt edukacyjny. Możesz go używać, modyfikować i rozwijać wedle uznania.  
Szczegóły w pliku [LICENSE](./LICENSE.md) (MIT License).

> Stworzono z myślą o nauce i rozwoju 😄  
> Autor: **Marcin Mitura**  
> Data: `2026-01-18`
