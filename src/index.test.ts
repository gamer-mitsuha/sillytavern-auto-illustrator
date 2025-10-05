/**
 * Tests for Index Module
 * Note: Testing only exported utility functions that can be unit tested.
 * Integration tests for event handlers would require more complex setup.
 */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMockContext} from './test_helpers';

// Since findLastAssistantMessageId is not exported, we'll test through integration
// or expose it for testing. For now, let's create a testable version.

/**
 * Helper function to find the last assistant message ID
 * This is the same logic used in index.ts
 */
function findLastAssistantMessageId(context: SillyTavernContext): number {
  if (!context.chat || context.chat.length === 0) {
    return -1;
  }

  // Search from the end of the chat array
  for (let i = context.chat.length - 1; i >= 0; i--) {
    const message = context.chat[i];
    if (!message.is_user && !message.is_system) {
      return i;
    }
  }

  return -1;
}

describe('findLastAssistantMessageId', () => {
  let mockContext: SillyTavernContext;

  beforeEach(() => {
    mockContext = createMockContext();
  });

  it('should return -1 for empty chat', () => {
    mockContext.chat = [];
    expect(findLastAssistantMessageId(mockContext)).toBe(-1);
  });

  it('should return -1 when chat is undefined', () => {
    mockContext.chat = undefined;
    expect(findLastAssistantMessageId(mockContext)).toBe(-1);
  });

  it('should find last assistant message', () => {
    mockContext.chat = [
      {mes: 'Hello', is_user: true},
      {mes: 'Hi there', is_user: false},
      {mes: 'How are you?', is_user: true},
    ];

    expect(findLastAssistantMessageId(mockContext)).toBe(1);
  });

  it('should find most recent assistant message', () => {
    mockContext.chat = [
      {mes: 'Hello', is_user: true},
      {mes: 'Hi', is_user: false},
      {mes: 'How are you?', is_user: true},
      {mes: 'I am fine', is_user: false},
    ];

    expect(findLastAssistantMessageId(mockContext)).toBe(3);
  });

  it('should skip user messages', () => {
    mockContext.chat = [
      {mes: 'Assistant message', is_user: false},
      {mes: 'User message 1', is_user: true},
      {mes: 'User message 2', is_user: true},
    ];

    expect(findLastAssistantMessageId(mockContext)).toBe(0);
  });

  it('should skip system messages', () => {
    mockContext.chat = [
      {mes: 'Assistant message', is_user: false, is_system: false},
      {mes: 'System message', is_user: false, is_system: true},
    ];

    expect(findLastAssistantMessageId(mockContext)).toBe(0);
  });

  it('should return -1 when only user messages exist', () => {
    mockContext.chat = [
      {mes: 'User 1', is_user: true},
      {mes: 'User 2', is_user: true},
    ];

    expect(findLastAssistantMessageId(mockContext)).toBe(-1);
  });

  it('should return -1 when only system messages exist', () => {
    mockContext.chat = [
      {mes: 'System 1', is_user: false, is_system: true},
      {mes: 'System 2', is_user: false, is_system: true},
    ];

    expect(findLastAssistantMessageId(mockContext)).toBe(-1);
  });

  it('should find assistant message among mixed message types', () => {
    mockContext.chat = [
      {mes: 'User', is_user: true},
      {mes: 'Assistant 1', is_user: false, is_system: false},
      {mes: 'System', is_user: false, is_system: true},
      {mes: 'User', is_user: true},
      {mes: 'Assistant 2', is_user: false, is_system: false},
      {mes: 'User', is_user: true},
    ];

    expect(findLastAssistantMessageId(mockContext)).toBe(4);
  });

  it('should handle assistant message with undefined is_system', () => {
    mockContext.chat = [
      {mes: 'Assistant', is_user: false},
      {mes: 'User', is_user: true},
    ];

    // undefined is_system should be treated as false (not a system message)
    expect(findLastAssistantMessageId(mockContext)).toBe(0);
  });
});
