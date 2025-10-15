/**
 * Unit tests for Regex Patterns Module (v2)
 */

import {describe, it, expect} from 'vitest';
import {
  IMG_PROMPT_COMMENT_PATTERN,
  IMG_TAG_PATTERN,
  IMG_TAG_AT_START_PATTERN,
  REGEX_SPECIAL_CHARS_PATTERN,
  escapeRegexSpecialChars,
  escapeHtmlAttribute,
  unescapePromptQuotes,
  createCombinedPromptRegex,
  extractImagePromptsMultiPattern,
} from './regex';

describe('regex', () => {
  describe('IMG_PROMPT_COMMENT_PATTERN', () => {
    it('should match basic HTML comment prompt', () => {
      const text = '<!--img-prompt="test prompt"-->';
      const pattern = new RegExp(IMG_PROMPT_COMMENT_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
      expect(matches?.[0]).toBe('<!--img-prompt="test prompt"-->');
    });

    it('should match prompt with escaped quotes', () => {
      const text = '<!--img-prompt="test \\"quoted\\" word"-->';
      const pattern = new RegExp(IMG_PROMPT_COMMENT_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
    });

    it('should match prompt with whitespace before closing', () => {
      const text = '<!--img-prompt="test"  -->';
      const pattern = new RegExp(IMG_PROMPT_COMMENT_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
    });

    it('should not match malformed prompts', () => {
      const malformed = [
        '<!--img-prompt="unclosed',
        '<!--img-prompt="no closing bracket"',
        '<img-prompt="wrong tag"-->',
      ];

      const pattern = new RegExp(IMG_PROMPT_COMMENT_PATTERN.source, 'g');
      malformed.forEach(text => {
        expect(text.match(pattern)).toBeNull();
      });
    });

    it('should match multiple prompts in text', () => {
      const text = '<!--img-prompt="first"--> text <!--img-prompt="second"-->';
      const pattern = new RegExp(IMG_PROMPT_COMMENT_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(2);
    });
  });

  describe('IMG_TAG_PATTERN', () => {
    it('should match basic img tag', () => {
      const text = '<img src="test.jpg">';
      const pattern = new RegExp(IMG_TAG_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
      expect(matches?.[0]).toBe('<img src="test.jpg">');
    });

    it('should match img tag with leading whitespace', () => {
      const text = '  <img src="test.jpg">';
      const pattern = new RegExp(IMG_TAG_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
      expect(matches?.[0]).toContain('<img src="test.jpg">');
    });

    it('should match img tag with multiple attributes', () => {
      const text = '<img src="test.jpg" alt="test" class="image">';
      const pattern = new RegExp(IMG_TAG_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
    });

    it('should match multiple img tags', () => {
      const text = '<img src="1.jpg"><img src="2.jpg"><img src="3.jpg">';
      const pattern = new RegExp(IMG_TAG_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toHaveLength(3);
    });

    it('should not match self-closing img tags without closing bracket', () => {
      const text = '<img src="test.jpg"';
      const pattern = new RegExp(IMG_TAG_PATTERN.source, 'g');
      const matches = text.match(pattern);

      expect(matches).toBeNull();
    });
  });

  describe('IMG_TAG_AT_START_PATTERN', () => {
    it('should match img tag at line start', () => {
      const text = '<img src="test.jpg">';
      const pattern = new RegExp(IMG_TAG_AT_START_PATTERN.source);
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
    });

    it('should match img tag with leading whitespace at start', () => {
      const text = '  <img src="test.jpg">';
      const pattern = new RegExp(IMG_TAG_AT_START_PATTERN.source);
      const matches = text.match(pattern);

      expect(matches).toHaveLength(1);
    });

    it('should not match img tag in middle of text', () => {
      const text = 'some text <img src="test.jpg">';
      const pattern = new RegExp(IMG_TAG_AT_START_PATTERN.source);
      const matches = text.match(pattern);

      expect(matches).toBeNull();
    });
  });

  describe('REGEX_SPECIAL_CHARS_PATTERN', () => {
    it('should match all regex special characters', () => {
      const specialChars = '.*+?^${}()|[]\\';
      const matches = specialChars.match(REGEX_SPECIAL_CHARS_PATTERN);

      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should not match regular characters', () => {
      const regularChars = 'abcABC123_-';
      const pattern = new RegExp(REGEX_SPECIAL_CHARS_PATTERN.source, 'g');
      const matches = regularChars.match(pattern);

      expect(matches).toBeNull();
    });
  });

  describe('escapeRegexSpecialChars', () => {
    it('should escape dots', () => {
      expect(escapeRegexSpecialChars('file.txt')).toBe('file\\.txt');
    });

    it('should escape multiple special chars', () => {
      const input = 'test.*+?^${}()|[]\\end';
      const escaped = escapeRegexSpecialChars(input);

      expect(escaped).toContain('\\.');
      expect(escaped).toContain('\\*');
      expect(escaped).toContain('\\+');
      expect(escaped).toContain('\\?');
      expect(escaped).toContain('\\^');
      expect(escaped).toContain('\\$');
    });

    it('should make string safe for use in RegExp', () => {
      const input = 'file.txt';
      const escaped = escapeRegexSpecialChars(input);
      const regex = new RegExp(escaped);

      expect('file.txt').toMatch(regex);
      expect('fileXtxt').not.toMatch(regex);
    });

    it('should not modify strings without special chars', () => {
      expect(escapeRegexSpecialChars('test123')).toBe('test123');
      expect(escapeRegexSpecialChars('hello_world')).toBe('hello_world');
    });

    it('should handle empty string', () => {
      expect(escapeRegexSpecialChars('')).toBe('');
    });

    it('should handle URL-like strings', () => {
      const url = 'http://example.com/path?query=1';
      const escaped = escapeRegexSpecialChars(url);

      expect(escaped).toContain('\\.');
      expect(escaped).toContain('\\?');
    });
  });

  describe('escapeHtmlAttribute', () => {
    it('should escape double quotes', () => {
      expect(escapeHtmlAttribute('Say "hello"')).toBe('Say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtmlAttribute("Say 'hello'")).toBe('Say &#39;hello&#39;');
    });

    it('should escape ampersands', () => {
      expect(escapeHtmlAttribute('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape multiple special chars', () => {
      const input = 'Say "hello" & \'goodbye\'';
      const escaped = escapeHtmlAttribute(input);

      expect(escaped).toBe('Say &quot;hello&quot; &amp; &#39;goodbye&#39;');
    });

    it('should handle empty string', () => {
      expect(escapeHtmlAttribute('')).toBe('');
    });

    it('should not modify strings without special chars', () => {
      expect(escapeHtmlAttribute('hello world')).toBe('hello world');
    });

    it('should handle complex HTML content', () => {
      const input = 'Click "Submit" & you\'ll see results';
      const escaped = escapeHtmlAttribute(input);

      // Should not contain the original unescaped characters
      // Note: & is escaped to &amp; which still contains '&' as part of the entity
      expect(escaped).toContain('&quot;'); // quotes escaped
      expect(escaped).toContain('&amp;'); // ampersand escaped
      expect(escaped).toContain('&#39;'); // single quote escaped
      expect(escaped).toBe(
        'Click &quot;Submit&quot; &amp; you&#39;ll see results'
      );
    });
  });

  describe('unescapePromptQuotes', () => {
    it('should unescape escaped quotes', () => {
      expect(unescapePromptQuotes('test \\"quoted\\" word')).toBe(
        'test "quoted" word'
      );
    });

    it('should handle multiple escaped quotes', () => {
      expect(unescapePromptQuotes('\\"one\\" \\"two\\" \\"three\\"')).toBe(
        '"one" "two" "three"'
      );
    });

    it('should not modify strings without escaped quotes', () => {
      expect(unescapePromptQuotes('regular text')).toBe('regular text');
    });

    it('should handle empty string', () => {
      expect(unescapePromptQuotes('')).toBe('');
    });

    it('should handle mixed escaped and unescaped content', () => {
      const input = 'normal text with \\"quotes\\" here';
      const unescaped = unescapePromptQuotes(input);

      expect(unescaped).toContain('"quotes"');
      expect(unescaped).not.toContain('\\"');
    });
  });

  describe('createCombinedPromptRegex', () => {
    it('should combine multiple patterns with alternation', () => {
      const patterns = ['pattern1', 'pattern2'];
      const regex = createCombinedPromptRegex(patterns);

      expect(regex.source).toContain('pattern1');
      expect(regex.source).toContain('pattern2');
      expect(regex.source).toContain('|');
    });

    it('should create global regex', () => {
      const patterns = ['test'];
      const regex = createCombinedPromptRegex(patterns);

      expect(regex.global).toBe(true);
    });

    it('should wrap each pattern in non-capturing group', () => {
      const patterns = ['pattern1', 'pattern2'];
      const regex = createCombinedPromptRegex(patterns);

      expect(regex.source).toContain('(?:');
      expect(regex.source).toContain(')');
    });

    it('should match text against any of the patterns', () => {
      const patterns = [
        '<!--img-prompt="([^"]*)"-->',
        '<img-prompt="([^"]*)">',
      ];
      const regex = createCombinedPromptRegex(patterns);

      expect('<!--img-prompt="test"-->').toMatch(regex);
      expect('<img-prompt="test">').toMatch(regex);
    });

    it('should handle single pattern', () => {
      const patterns = ['single'];
      const regex = createCombinedPromptRegex(patterns);

      expect(regex.source).toBe('(?:single)');
    });

    it('should handle empty array', () => {
      const patterns: string[] = [];
      const regex = createCombinedPromptRegex(patterns);

      // When joining empty array, we get empty string, which becomes '(?:)' in the pattern
      expect(regex.source).toBe('(?:)');
    });
  });

  describe('extractImagePromptsMultiPattern', () => {
    const testPatterns = [
      '<!--img-prompt="([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\\s*-->',
      '<img-prompt="([^"\\\\]*(?:\\\\.[^"\\\\]*)*)">',
    ];

    it('should extract single prompt using first pattern', () => {
      const text = 'Text <!--img-prompt="test prompt"--> more text';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('test prompt');
      expect(results[0].fullMatch).toBe('<!--img-prompt="test prompt"-->');
      expect(results[0].startIndex).toBeGreaterThan(0);
      expect(results[0].endIndex).toBeGreaterThan(results[0].startIndex);
    });

    it('should extract single prompt using second pattern', () => {
      const text = 'Text <img-prompt="test prompt"> more text';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('test prompt');
      expect(results[0].fullMatch).toBe('<img-prompt="test prompt">');
    });

    it('should extract multiple prompts with different patterns', () => {
      const text = '<!--img-prompt="first"--> text <img-prompt="second"> more';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(2);
      expect(results[0].prompt).toBe('first');
      expect(results[1].prompt).toBe('second');
    });

    it('should preserve correct positions for all matches', () => {
      const text = 'Start <!--img-prompt="test"--> end';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results[0].startIndex).toBe(6); // After "Start "
      expect(text.substring(results[0].startIndex, results[0].endIndex)).toBe(
        results[0].fullMatch
      );
    });

    it('should trim whitespace from extracted prompts', () => {
      const text = '<!--img-prompt="  test prompt  "-->';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results[0].prompt).toBe('test prompt');
    });

    it('should skip empty prompts', () => {
      const text = '<!--img-prompt=""--> text <!--img-prompt="valid"-->';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('valid');
    });

    it('should skip whitespace-only prompts', () => {
      const text = '<!--img-prompt="   "--> text <!--img-prompt="valid"-->';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('valid');
    });

    it('should unescape quotes in extracted prompts', () => {
      const text = '<!--img-prompt="test \\"quoted\\" word"-->';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('test "quoted" word');
    });

    it('should return empty array for text without prompts', () => {
      const text = 'Just regular text without any prompts';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(0);
    });

    it('should return empty array for empty pattern list', () => {
      const text = '<!--img-prompt="test"-->';
      const results = extractImagePromptsMultiPattern(text, []);

      expect(results).toHaveLength(0);
    });

    it('should handle text with special characters in prompts', () => {
      const text = '<!--img-prompt="test & special < > chars"-->';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(1);
      expect(results[0].prompt).toContain('&');
      expect(results[0].prompt).toContain('<');
      expect(results[0].prompt).toContain('>');
    });

    it('should extract prompts in order of appearance', () => {
      const text =
        '<!--img-prompt="first"--> <!--img-prompt="second"--> <!--img-prompt="third"-->';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      expect(results).toHaveLength(3);
      expect(results[0].prompt).toBe('first');
      expect(results[1].prompt).toBe('second');
      expect(results[2].prompt).toBe('third');
      expect(results[0].startIndex).toBeLessThan(results[1].startIndex);
      expect(results[1].startIndex).toBeLessThan(results[2].startIndex);
    });

    it('should handle malformed prompts gracefully', () => {
      const text = '<!--img-prompt="incomplete <!--img-prompt="complete"-->';
      const results = extractImagePromptsMultiPattern(text, testPatterns);

      // Should only match complete tags
      expect(results).toHaveLength(1);
      expect(results[0].prompt).toBe('complete');
    });
  });
});
