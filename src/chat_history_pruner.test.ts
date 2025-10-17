/**
 * Tests for Chat History Pruner Module
 */

import {describe, it, expect} from 'vitest';
import {pruneGeneratedImages} from './chat_history_pruner';

describe('Chat History Pruner', () => {
  describe('pruneGeneratedImages', () => {
    it('should remove img tags following img-prompt tags in assistant messages', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Hello <!--img-prompt="test prompt"-->\n<img src="test.jpg" title="test prompt" alt="test prompt> world',
        },
      ];

      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe(
        'Hello <!--img-prompt="test prompt"--> world'
      );
    });

    it('should preserve standalone img tags in assistant messages', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Hello <img src="user-image.jpg" title="user image" alt="user image> world',
        },
      ];

      const originalContent = chat[0].content;
      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe(originalContent);
    });

    it('should preserve all user messages unchanged', () => {
      const chat = [
        {
          role: 'user',
          content:
            'User message <!--img-prompt="test"-->\n<img src="test.jpg" title="test" alt="test>',
        },
      ];

      const originalContent = chat[0].content;
      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe(originalContent);
    });

    it('should preserve all system messages unchanged', () => {
      const chat = [
        {
          role: 'system',
          content:
            'System prompt <!--img-prompt="test"-->\n<img src="test.jpg" title="test" alt="test>',
        },
      ];

      const originalContent = chat[0].content;
      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe(originalContent);
    });

    it('should handle multiple generated images in a single message', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Start <!--img-prompt="prompt1"-->\n<img src="1.jpg" title="prompt1" alt="prompt1> middle <!--img-prompt="prompt2"-->\n<img src="2.jpg" title="prompt2" alt="prompt2> end',
        },
      ];

      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe(
        'Start <!--img-prompt="prompt1"--> middle <!--img-prompt="prompt2"--> end'
      );
    });

    it('should handle mixed generated and user images', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            '<img src="user.jpg" title="user" alt="user> text <!--img-prompt="gen"-->\n<img src="gen.jpg" title="gen" alt="gen> more',
        },
      ];

      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe(
        '<img src="user.jpg" title="user" alt="user> text <!--img-prompt="gen"--> more'
      );
    });

    it('should handle multiple messages in chat array', () => {
      const chat = [
        {
          role: 'user',
          content:
            'User <!--img-prompt="test"-->\n<img src="test.jpg" title="test" alt="test>',
        },
        {
          role: 'assistant',
          content:
            'Assistant <!--img-prompt="test"-->\n<img src="test.jpg" title="test" alt="test>',
        },
        {role: 'system', content: 'System message'},
      ];

      const userOriginal = chat[0].content;
      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe(userOriginal); // User unchanged
      expect(chat[1].content).toBe('Assistant <!--img-prompt="test"-->'); // Assistant pruned
      expect(chat[2].content).toBe('System message'); // System unchanged
    });

    it('should handle img-prompt without following img tag', () => {
      const chat = [
        {
          role: 'assistant',
          content: 'Text <!--img-prompt="test"--> more text',
        },
      ];

      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe('Text <!--img-prompt="test"--> more text');
    });

    it('should handle empty chat array', () => {
      const chat: Array<{role: string; content: string}> = [];

      pruneGeneratedImages(chat);

      expect(chat).toEqual([]);
    });

    it('should handle messages with no images or prompts', () => {
      const chat = [
        {role: 'user', content: 'Hello'},
        {role: 'assistant', content: 'Hi there'},
      ];

      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe('Hello');
      expect(chat[1].content).toBe('Hi there');
    });

    it('should handle img tags with varying whitespace after img-prompt', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Text <!--img-prompt="test"-->   \n  <img src="test.jpg" title="test" alt="test> end',
        },
      ];

      pruneGeneratedImages(chat);

      expect(chat[0].content).toBe('Text <!--img-prompt="test"--> end');
    });

    it('should only remove img tags that match the generated pattern', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            '<!--img-prompt="gen"-->\n<img src="gen.jpg" title="gen" alt="gen> and <img src="other.jpg">',
        },
      ];

      pruneGeneratedImages(chat);

      // Should remove the generated image but keep the other img tag
      expect(chat[0].content).toBe(
        '<!--img-prompt="gen"--> and <img src="other.jpg">'
      );
    });

    it('should preserve img-prompt tags even after removing images', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Before <!--img-prompt="beautiful sunset"-->\n<img src="sunset.jpg" title="beautiful sunset" alt="beautiful sunset> after',
        },
      ];

      pruneGeneratedImages(chat);

      expect(chat[0].content).toContain('<!--img-prompt="beautiful sunset"-->');
      expect(chat[0].content).not.toContain('<img src="sunset.jpg"');
    });

    it('should remove img tags regardless of attribute presence or order', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Text <!--img-prompt="test1"-->\n<img src="image1.jpg"> more text ' +
            '<!--img-prompt="test2"-->\n<img class="foo" src="image2.jpg" id="bar> end',
        },
      ];

      pruneGeneratedImages(chat);

      // Should remove both img tags regardless of attributes
      expect(chat[0].content).toContain('<!--img-prompt="test1"-->');
      expect(chat[0].content).toContain('<!--img-prompt="test2"-->');
      expect(chat[0].content).not.toContain('<img src="image1.jpg">');
      expect(chat[0].content).not.toContain(
        '<img class="foo" src="image2.jpg"'
      );
      expect(chat[0].content).toContain('Text');
      expect(chat[0].content).toContain('more text');
      expect(chat[0].content).toContain('end');
    });

    it('should remove idempotency markers from assistant messages', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Text <!--img-prompt="cat"-->\n<!-- auto-illustrator:promptId=test123,imageUrl=https://example.com/img.png --> \n<img src="https://example.com/img.png" alt="cat" data-prompt-id="test123"> more text',
        },
      ];

      pruneGeneratedImages(chat);

      // The main requirement: marker should always be removed
      expect(chat[0].content).not.toContain('auto-illustrator');
      // Prompt tag should remain
      expect(chat[0].content).toContain('<!--img-prompt="cat"-->');
      // Text content preserved
      expect(chat[0].content).toContain('Text');
      expect(chat[0].content).toContain('more text');
      // Image should be removed (follows prompt tag)
      expect(chat[0].content).not.toContain('data-prompt-id');
    });

    it('should remove idempotency markers even without adjacent prompt tags', () => {
      const chat = [
        {
          role: 'assistant',
          content:
            'Just some text with a marker <!-- auto-illustrator:promptId=test,imageUrl=https://example.com/img.png --> in the middle',
        },
      ];

      pruneGeneratedImages(chat);

      // Marker should be removed even without prompt tags
      expect(chat[0].content).not.toContain('auto-illustrator');
      expect(chat[0].content).toContain('Just some text with a marker');
      expect(chat[0].content).toContain('in the middle');
    });
  });
});
