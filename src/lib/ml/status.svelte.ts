/** État de chargement du modèle de reconnaissance, affiché dans l'interface. */
export type ModelState = 'idle' | 'loading' | 'ready' | 'error';

function createModelStatus() {
  let state = $state<ModelState>('idle');
  let progress = $state(0);
  let message = $state('');
  return {
    get state() {
      return state;
    },
    get progress() {
      return progress;
    },
    get message() {
      return message;
    },
    loading(p: number) {
      state = 'loading';
      progress = Math.max(0, Math.min(1, p));
    },
    ready() {
      state = 'ready';
      progress = 1;
    },
    error(msg: string) {
      state = 'error';
      message = msg;
    }
  };
}

export const modelStatus = createModelStatus();
