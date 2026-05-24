# SimpleQuill 📚

SimpleQuill is a modern, fast, and privacy-focused digital library manager and reader built with **Tauri**, **React**, and **Rust**. It provides a seamless experience for managing and reading your digital book collection across multiple formats with powerful local features.

## ✨ Features

- **Multi-Format Support**: Read your favorite books in **EPUB**, **PDF**, and **CBZ** (manga/comics) formats.
- **Local Text-to-Speech (TTS)**: Includes a powerful offline TTS engine powered by **Piper**, allowing you to listen to your books without an internet connection.
- **Library Management**: 
  - Organize books into custom **Shelves**.
  - Group books into **Series** with volume ordering.
  - Mark books as **Favorites** or move them to the **Trash**.
- **Advanced Reader Experience**:
  - Customizable themes (Light, Dark, Sepia).
  - Adjustable font sizes and line heights.
  - **Focus Mode** for distraction-free reading.
  - Internal bookmarking and progress tracking.
- **Command Palette (Ctrl + K)**: Quickly find books or navigate the application using a powerful launcher.
- **Privacy First**: Your library database (SQLite) and all book metadata stay strictly on your local machine.
- **Cross-Platform**: Built on Tauri for a lightweight footprint and native performance on Windows, macOS, and Linux.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS)
- [Rust](https://www.rust-lang.org/tools/install)
- [Tauri Dependencies](https://tauri.app/v1/guides/getting-started/prerequisites) (System-specific)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/simplequill.git
   cd simplequill
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

4. Build for production:
   ```bash
   npm run tauri build
   ```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| **Ctrl + K** | Open Command Palette |
| **Ctrl + B** | Toggle Sidebar |
| **Ctrl + O** | Import File |
| **Ctrl + Shift + O** | Import Folder |
| **Ctrl + F** | Focus Search |
| **G / L** | Toggle Grid/List View |
| **F** | Toggle Favorite |
| **Esc** | Close Reader/Menus |

## 🛠️ Built With

- [Tauri](https://tauri.app/) - Frontend-to-Native bridge.
- [React](https://reactjs.org/) - User interface.
- [Rust](https://www.rust-lang.org/) - High-performance backend logic.
- [SQLite](https://www.sqlite.org/) - Local database management.
- [Piper](https://github.com/rhasspy/piper) - High-quality local neural TTS.
- [Lucide React](https://lucide.dev/) - Beautiful iconography.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
