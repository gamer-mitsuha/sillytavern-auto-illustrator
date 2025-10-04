export {};

// 1. Import when extension is user-scoped
import '../../../../public/global';
// 2. Import when extension is server-scoped
import '../../../../global';

declare global {
  // SillyTavern API types (external, uses any for flexibility)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  interface EventSource {
    on(event: string, callback: (...args: any[]) => void): void;
    once(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
  }

  interface SlashCommand {
    callback: (args: any, value: string) => Promise<string>;
    namedArgumentList: string[];
    unnamedArgumentList: string[];
    helpString: string;
  }

  interface SlashCommandParser {
    commands: Record<string, SlashCommand>;
  }

  interface SillyTavernContext {
    eventSource: EventSource;
    eventTypes: Record<string, string>;
    SlashCommandParser: SlashCommandParser;
    extensionSettings: Record<string, any>;
    chat: any[];
    chat_metadata: Record<string, any>;
    characters: any[];
    this_chid: number;
    saveSettingsDebounced(): void;
  }

  interface SillyTavern {
    getContext(): SillyTavernContext;
  }

  interface Window {
    SillyTavern: SillyTavern;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Extension-specific types
  interface AutoIllustratorSettings {
    enabled: boolean;
    wordInterval: number;
    metaPrompt: string;
  }

  interface ImagePromptMatch {
    fullMatch: string;
    prompt: string;
    startIndex: number;
    endIndex: number;
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  interface GenerateInterceptor {
    (chat: any[]): any[] | Promise<any[]>;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
