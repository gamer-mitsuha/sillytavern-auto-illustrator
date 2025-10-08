/**
 * Tests for i18n module
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {initializeI18n, t, tCount} from './i18n';

describe('i18n', () => {
  const mockContext = {
    translate: (text: string, key?: string | null) => {
      // Mock translation function that just returns the key
      return key || text;
    },
  } as unknown as SillyTavernContext;

  beforeEach(() => {
    initializeI18n(mockContext);
  });

  describe('t', () => {
    it('should return translation key when no replacements', () => {
      const result = t('test.key');
      expect(result).toBe('test.key');
    });

    it('should replace single placeholder', () => {
      const result = t('test.{name}', {name: 'John'});
      expect(result).toBe('test.John');
    });

    it('should replace multiple placeholders', () => {
      const result = t('test.{count}.{name}', {count: 5, name: 'items'});
      expect(result).toBe('test.5.items');
    });

    it('should handle numeric replacements', () => {
      const result = t('count.{num}', {num: 42});
      expect(result).toBe('count.42');
    });
  });

  describe('tCount', () => {
    it('should include count in replacements', () => {
      const result = tCount(5, 'test.{count}');
      expect(result).toBe('test.5');
    });

    it('should work with additional replacements', () => {
      const result = tCount(3, 'test.{count}.{item}', {item: 'books'});
      expect(result).toBe('test.3.books');
    });

    it('should work with zero count', () => {
      const result = tCount(0, 'test.{count}');
      expect(result).toBe('test.0');
    });
  });
});
