/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Optionaler Build-Default für die Entra-Gruppe des Benutzer-Syncs. Kann in der
  // App (Einstellungen > Benutzer) überschrieben werden; kein Secret (nur Name/GUID).
  readonly VITE_ENTRA_GROUP_ID?: string
  readonly VITE_ENTRA_GROUP_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
