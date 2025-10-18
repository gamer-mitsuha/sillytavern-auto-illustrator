/**
 * Unit tests for image_utils module
 */

import {normalizeImageUrl} from './image_utils';

describe('normalizeImageUrl', () => {
  describe('data URIs', () => {
    it('should preserve data URIs with base64 encoding', () => {
      const dataUri =
        'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4IiBoZWlnaHQ9IjEyOCI+PC9zdmc+';
      expect(normalizeImageUrl(dataUri)).toBe(dataUri);
    });

    it('should preserve data URIs with charset', () => {
      const dataUri =
        'data:image/svg+xml;charset=utf-8;base64,PHN2ZyB3aWR0aD0iMTI4Ij48L3N2Zz4=';
      expect(normalizeImageUrl(dataUri)).toBe(dataUri);
    });

    it('should preserve data URIs without base64', () => {
      const dataUri = 'data:image/svg+xml,<svg></svg>';
      expect(normalizeImageUrl(dataUri)).toBe(dataUri);
    });
  });

  describe('absolute URLs', () => {
    it('should extract pathname from absolute HTTP URL', () => {
      const url = 'http://example.com/user/images/test.png';
      expect(normalizeImageUrl(url)).toBe('/user/images/test.png');
    });

    it('should extract pathname from absolute HTTPS URL', () => {
      const url = 'https://example.com/images/avatar.jpg';
      expect(normalizeImageUrl(url)).toBe('/images/avatar.jpg');
    });

    it('should decode URL-encoded characters in pathname', () => {
      const url =
        'http://example.com/user/images/%E5%B0%8F%E8%AF%B4%E5%AE%B6/test.png';
      expect(normalizeImageUrl(url)).toBe('/user/images/小说家/test.png');
    });
  });

  describe('relative paths', () => {
    it('should return relative path as-is', () => {
      const path = '/user/images/test.png';
      expect(normalizeImageUrl(path)).toBe('/user/images/test.png');
    });

    it('should decode URL-encoded characters in relative path', () => {
      const path = '/user/images/%E5%B0%8F%E8%AF%B4%E5%AE%B6/test.png';
      expect(normalizeImageUrl(path)).toBe('/user/images/小说家/test.png');
    });
  });
});
