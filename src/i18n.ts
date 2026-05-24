import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "sidebar": {
        "all": "All Books",
        "recent": "Recently Read",
        "favorites": "Favorites",
        "filters": "FILTERS",
        "formats": "Formats",
        "formats_all": "Formats: All",
        "format_label": "Format: {{format}}",
        "shelves": "SHELVES",
        "my_shelves": "My Shelves",
        "new_shelf": "New Shelf",
        "reading": "Reading",
        "read": "Read",
        "deleted": "Deleted",
        "settings": "Settings",
        "help": "Help"
      },
      "settings": {
        "title": "Settings",
        "tabs": {
          "system": "System",
          "tts": "Text to Speech",
          "shortcuts": "Shortcuts"
        },
        "appearance": {
          "title": "Appearance",
          "theme": "Theme",
          "theme_desc": "Choose your preferred theme"
        },
        "reading": {
          "title": "Reading",
          "open_direct": "Open directly in reader",
          "open_direct_desc": "Skip details view when selecting a book in the library",
          "launcher_open_direct": "Launcher: Open directly in reader",
          "launcher_open_direct_desc": "Skip details view when selecting a book in the command palette (Ctrl+K)"
        },
        "language": {
          "title": "Language",
          "select": "Display Language",
          "select_desc": "Choose the application language"
        }
      },
      "common": {
        "confirm_delete_series": "Are you sure you want to delete this series? Books will be kept but no longer grouped.",
        "confirm_delete_voice": "Are you sure you want to delete the voice {{name}}?",
        "confirm_uninstall_piper": "Are you sure you want to uninstall the Piper engine? This will remove all engine binary files."
      }
    }
  },
  es: {
    translation: {
      "sidebar": {
        "all": "Todos",
        "recent": "Leído recientemente",
        "favorites": "Favoritos",
        "filters": "FILTROS",
        "formats": "Formatos",
        "formats_all": "Formatos: Todos",
        "format_label": "Formato: {{format}}",
        "shelves": "ESTANTERÍAS",
        "my_shelves": "Mis estanterías",
        "new_shelf": "Nueva estantería",
        "reading": "Leer",
        "read": "Leídos",
        "deleted": "Borrado",
        "settings": "Ajustes",
        "help": "Ayuda"
      },
      "settings": {
        "title": "Ajustes",
        "tabs": {
          "system": "Sistema",
          "tts": "Texto a Voz",
          "shortcuts": "Atajos"
        },
        "appearance": {
          "title": "Apariencia",
          "theme": "Tema",
          "theme_desc": "Elige tu tema preferido"
        },
        "reading": {
          "title": "Lectura",
          "open_direct": "Abrir directamente en el lector",
          "open_direct_desc": "Saltar la vista de detalles al seleccionar un libro en la biblioteca",
          "launcher_open_direct": "Launcher: Abrir directamente en el lector",
          "launcher_open_direct_desc": "Saltar la vista de detalles al seleccionar un libro en el buscador (Ctrl+K)"
        },
        "language": {
          "title": "Idioma",
          "select": "Idioma de la aplicación",
          "select_desc": "Elige el idioma de la interfaz"
        }
      },
      "common": {
        "confirm_delete_series": "¿Estás seguro de que quieres eliminar esta serie? Los libros se mantendrán pero dejarán de estar agrupados.",
        "confirm_delete_voice": "¿Seguro que quieres eliminar la voz {{name}}?",
        "confirm_uninstall_piper": "¿Estás seguro de que deseas desinstalar el motor Piper? Esto eliminará todos los archivos binarios del motor."
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
