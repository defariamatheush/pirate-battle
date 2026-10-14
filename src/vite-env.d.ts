/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_RETRY_BASE_DELAY_MS?: string;
  readonly VITE_MAX_RETRIES?: string;
}
