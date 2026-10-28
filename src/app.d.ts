declare global {
  namespace App {}
}

interface ImportMetaEnv {
  readonly VITE_ADAPTER?: string;
  readonly VITE_GOATCOUNTER?: string;
}
export {};
