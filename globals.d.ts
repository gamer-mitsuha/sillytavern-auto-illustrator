export {};

// Import SillyTavern's official global types
// 1. Import when extension is user-scoped
import '../../../../public/global';
// 2. Import when extension is server-scoped
import '../../../../global';

declare global {
  // Toastr notification library (loaded globally)
  interface Toastr {
    success(message: string, title?: string): void;
    info(message: string, title?: string): void;
    warning(message: string, title?: string): void;
    error(message: string, title?: string): void;
  }

  const toastr: Toastr;

  // jQuery (loaded globally by SillyTavern)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type JQuery = any;

  // SillyTavern context type - manually typed since st-context.js has no type info
  /* eslint-disable @typescript-eslint/no-explicit-any */
  interface SillyTavernContext {
    eventSource: {
      on(event: string, callback: (...args: any[]) => void): void;
      once(event: string, callback: (...args: any[]) => void): void;
      emit(event: string, ...args: any[]): Promise<void>;
    };
    eventTypes: Record<string, string> & {
      CHAT_COMPLETION_PROMPT_READY: string;
      CHAT_CHANGED: string;
      GENERATION_ENDED: string;
      GENERATION_STARTED: string;
      MESSAGE_EDITED: string;
      MESSAGE_RECEIVED: string;
      MESSAGE_UPDATED: string;
      STREAM_TOKEN_RECEIVED: string;
    };
    SlashCommandParser: {
      commands: Record<
        string,
        Partial<{
          callback: (args: any, value: string) => Promise<string>;
          namedArgumentList: string[];
          unnamedArgumentList: string[];
          helpString: string;
        }>
      >;
    };
    extensionSettings: Record<string, any>;
    extensionPrompts: Record<
      string,
      {
        value: string;
        position: number;
        depth: number;
        scan: boolean;
        role: number;
        filter: (() => boolean) | null;
      }
    >;
    chat: any[];
    chat_metadata: Record<string, any>;
    characters: any[];
    this_chid: number;
    saveSettingsDebounced(): void;
    saveChat(): Promise<void>;
    setExtensionPrompt(
      key: string,
      value: string,
      position: number,
      depth: number,
      scan?: boolean,
      role?: number,
      filter?: (() => boolean) | null
    ): void;
    updateMessageBlock(
      messageId: number,
      message: any,
      options?: {rerenderMessage?: boolean}
    ): void;
    translate(text: string, key?: string | null): string;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Extension-specific types

  // Meta prompt preset interface
  interface MetaPromptPreset {
    id: string;
    name: string;
    template: string;
    predefined: boolean;
  }

  interface AutoIllustratorSettings {
    enabled: boolean;
    metaPrompt: string;
    currentPresetId: string;
    customPresets: MetaPromptPreset[];
    streamingEnabled: boolean;
    streamingPollInterval: number;
    maxConcurrentGenerations: number;
    logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
    manualGenerationMode: 'replace' | 'append';
    promptDetectionPatterns: string[];
  }

  interface ImagePromptMatch {
    fullMatch: string;
    prompt: string;
    startIndex: number;
    endIndex: number;
  }
}
