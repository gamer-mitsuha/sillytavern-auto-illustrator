export {};

// Import SillyTavern's official global types
// 1. Import when extension is user-scoped
import '../../../../public/global';
// 2. Import when extension is server-scoped
import '../../../../global';

declare global {
  // Use SillyTavern's official context type
  type SillyTavernContext = ReturnType<typeof SillyTavern.getContext>;

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
