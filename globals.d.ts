export {};

// Import SillyTavern's official global types
// 1. Import when extension is user-scoped
import '../../../../public/global';
// 2. Import when extension is server-scoped
import '../../../../global';

declare global {
  // Toastr notification library (loaded globally)
  interface ToastrOptions {
    timeOut?: number;
    extendedTimeOut?: number;
    closeButton?: boolean;
    progressBar?: boolean;
  }

  interface Toastr {
    success(message: string, title?: string, options?: ToastrOptions): void;
    info(message: string, title?: string, options?: ToastrOptions): void;
    warning(message: string, title?: string, options?: ToastrOptions): void;
    error(message: string, title?: string, options?: ToastrOptions): void;
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
    chatMetadata: Record<string, any>; // Official property name (camelCase)
    chat_metadata: Record<string, any>; // Legacy alias
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
    printMessages(): void;
    reloadCurrentChat(): void;
    translate(text: string, key?: string | null): string;
    generateQuietPrompt(options: {
      quietPrompt: string;
      quietToLoud?: boolean;
    }): Promise<string>;
    generateRaw(options: {
      systemPrompt?: string;
      prompt: string | unknown[];
      prefill?: string;
      jsonSchema?: unknown;
    }): Promise<string>;
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
    metaPromptDepth: number;
    currentPresetId: string;
    customPresets: MetaPromptPreset[];
    streamingPollInterval: number;
    monitorPollingInterval: number;
    maxConcurrentGenerations: number;
    minGenerationInterval: number;
    logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
    manualGenerationMode: 'replace' | 'append';
    promptDetectionPatterns: string[];
    commonStyleTags: string;
    commonStyleTagsPosition: 'prefix' | 'suffix';
    showGalleryWidget: boolean;
    showProgressWidget: boolean;
    showStreamingPreviewWidget: boolean;
    enableClickToRegenerate: boolean;
    promptGenerationMode:
      | 'shared-api'
      | 'independent-api'
      | 'regex'
      | 'llm-post'; // regex and llm-post are legacy aliases
    maxPromptsPerMessage: number;
    contextMessageCount: number;
    llmFrequencyGuidelines: string;
    llmPromptWritingGuidelines: string;
    /** Delay (ms) before running final reconciliation after GENERATION_ENDED (default: 5000, 0 to disable) */
    finalReconciliationDelayMs: number;
    /** Display width of generated images in chat messages (percentage: 10-100) */
    imageDisplayWidth: number;
  }

  interface ImagePromptMatch {
    fullMatch: string;
    prompt: string;
    startIndex: number;
    endIndex: number;
  }
}
