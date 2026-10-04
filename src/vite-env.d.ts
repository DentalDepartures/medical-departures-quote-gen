/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_APP_MODE?: 'agent' | 'admin'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
