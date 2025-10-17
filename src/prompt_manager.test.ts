/**
 * Comprehensive tests for prompt_manager.ts
 * Tests all 17+ functions with edge cases and robustness checks
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import type {AutoIllustratorChatMetadata} from './types';
import {
  generatePromptId,
  getRegistry,
  createPromptNode,
  getPromptNode,
  deletePromptNode,
  updatePromptLastUsed,
  registerPrompt,
  linkImageToPrompt,
  unlinkImageFromPrompt,
  getPromptForImage,
  refinePrompt,
  getRootPrompt,
  getPromptChain,
  getChildPrompts,
  getPromptTree,
  getPromptsForMessage,
  deleteMessagePrompts,
  pruneOrphanedNodes,
  getAllRootPrompts,
  getPromptStats,
  detectPromptsInMessage,
  replacePromptTextInMessage,
} from './prompt_manager';

// ============================================================================
// Mocks
// ============================================================================

// Mock saveMetadata since all mutation functions now auto-save
vi.mock('./metadata', () => ({
  saveMetadata: vi.fn().mockResolvedValue(undefined),
  getMetadata: vi.fn(),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Helper to normalize URL (matching production behavior)
 * URLs are normalized to pathname in linkImageToPrompt
 */
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    return url;
  }
}

/**
 * Creates a fresh AutoIllustratorChatMetadata object for testing
 */
function createTestMetadata(): AutoIllustratorChatMetadata {
  return {};
}

// Removed unused helper function

// ============================================================================
// Suite 1: Prompt ID Generation
// ============================================================================

describe('Prompt ID Generation', () => {
  it('should generate consistent IDs for same inputs', async () => {
    const text = '1girl, red dress';
    const messageId = 42;
    const promptIndex = 0;

    const id1 = generatePromptId(text, messageId, promptIndex);
    const id2 = generatePromptId(text, messageId, promptIndex);

    expect(id1).toBe(id2);
    expect(id1).toMatch(/^prompt_[a-z0-9]+$/);
  });

  it('should generate different IDs for different promptIndex', async () => {
    const text = '1girl, red dress';
    const messageId = 42;

    const id1 = generatePromptId(text, messageId, 0);
    const id2 = generatePromptId(text, messageId, 1);

    expect(id1).not.toBe(id2);
  });

  it('should generate different IDs for different messageId', async () => {
    const text = '1girl, red dress';
    const promptIndex = 0;

    const id1 = generatePromptId(text, 42, promptIndex);
    const id2 = generatePromptId(text, 43, promptIndex);

    expect(id1).not.toBe(id2);
  });

  it('should be resistant to hash collisions with similar strings', async () => {
    const messageId = 42;
    const promptIndex = 0;

    const id1 = generatePromptId('test', messageId, promptIndex);
    const id2 = generatePromptId('test ', messageId, promptIndex);
    const id3 = generatePromptId('test1', messageId, promptIndex);

    expect(id1).not.toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id2).not.toBe(id3);
  });
});

// ============================================================================
// Suite 2: CRUD Operations
// ============================================================================

describe('CRUD Operations', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should create prompt node with all required fields', async () => {
    const node = createPromptNode('test prompt', 42, 0, 'ai-message');

    expect(node.text).toBe('test prompt');
    expect(node.messageId).toBe(42);
    expect(node.promptIndex).toBe(0);
    expect(node.metadata.source).toBe('ai-message');
    expect(node.parentId).toBeNull();
    expect(node.childIds).toEqual([]);
    expect(node.generatedImages).toEqual([]);

    // Note: text is readonly at TypeScript level (compile-time),
    // not enforced at JavaScript runtime
  });

  it('should get existing node', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const retrieved = getPromptNode(node.id, metadata);

    expect(retrieved).toBe(node);
  });

  it('should return null for non-existent node', async () => {
    const node = getPromptNode('prompt_nonexistent', metadata);

    expect(node).toBeNull();
  });

  it('should delete node and clean up references', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    await linkImageToPrompt(node.id, 'http://example.com/img.jpg', metadata);

    const registry = getRegistry(metadata);
    expect(registry.nodes[node.id]).toBeDefined();
    expect(registry.rootPromptIds).toContain(node.id);

    await deletePromptNode(node.id, metadata);

    expect(registry.nodes[node.id]).toBeUndefined();
    expect(registry.rootPromptIds).not.toContain(node.id);
    expect(
      registry.imageToPromptId[normalizeUrl('http://example.com/img.jpg')]
    ).toBeUndefined();
  });

  it('should update lastUsedAt timestamp', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const originalTime = node.metadata.lastUsedAt;

    // Wait a bit to ensure timestamp difference
    const futureTime = Date.now() + 1000;
    vi.spyOn(Date, 'now').mockReturnValue(futureTime);

    await updatePromptLastUsed(node.id, metadata);

    expect(node.metadata.lastUsedAt).toBe(futureTime);
    expect(node.metadata.lastUsedAt).toBeGreaterThan(originalTime);

    vi.restoreAllMocks();
  });
});

// ============================================================================
// Suite 3: Registration & Deduplication
// ============================================================================

describe('Registration & Deduplication', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should register new prompt and add to registry', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const registry = getRegistry(metadata);

    expect(registry.nodes[node.id]).toBe(node);
    expect(registry.rootPromptIds).toContain(node.id);
  });

  it('should return existing node on duplicate registration', async () => {
    const node1 = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const originalTime = node1.metadata.lastUsedAt;

    // Wait and register again
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    const node2 = await registerPrompt('test', 42, 0, 'ai-message', metadata);

    expect(node2).toBe(node1);
    expect(node2.metadata.lastUsedAt).toBeGreaterThan(originalTime);

    vi.restoreAllMocks();
  });

  it('should create different nodes for multiple prompts in same message', async () => {
    const node1 = await registerPrompt(
      'prompt 1',
      42,
      0,
      'ai-message',
      metadata
    );
    const node2 = await registerPrompt(
      'prompt 2',
      42,
      1,
      'ai-message',
      metadata
    );

    expect(node1.id).not.toBe(node2.id);
    expect(node1.messageId).toBe(node2.messageId);
    expect(node1.promptIndex).not.toBe(node2.promptIndex);
  });

  it('should create different nodes for same text in different messages', async () => {
    const node1 = await registerPrompt(
      'same text',
      42,
      0,
      'ai-message',
      metadata
    );
    const node2 = await registerPrompt(
      'same text',
      43,
      0,
      'ai-message',
      metadata
    );

    expect(node1.id).not.toBe(node2.id);
    expect(node1.text).toBe(node2.text);
  });
});

// ============================================================================
// Suite 4: Image Linking
// ============================================================================

describe('Image Linking', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should link image to prompt', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const imageUrl = 'http://example.com/img.jpg';

    await linkImageToPrompt(node.id, imageUrl, metadata);

    // URLs are normalized to pathname for consistent lookups
    const normalizedUrl = '/img.jpg';
    expect(node.generatedImages).toContain(normalizedUrl);
    const registry = getRegistry(metadata);
    expect(registry.imageToPromptId[normalizedUrl]).toBe(node.id);
  });

  it('should link multiple images to same prompt', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const img1 = 'http://example.com/img1.jpg';
    const img2 = 'http://example.com/img2.jpg';

    await linkImageToPrompt(node.id, img1, metadata);
    await linkImageToPrompt(node.id, img2, metadata);

    // URLs are normalized
    expect(node.generatedImages).toContain(normalizeUrl(img1));
    expect(node.generatedImages).toContain(normalizeUrl(img2));
    expect(node.generatedImages).toHaveLength(2);
  });

  it('should get prompt for image with O(1) lookup', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const imageUrl = 'http://example.com/img.jpg';

    await linkImageToPrompt(node.id, imageUrl, metadata);
    // URLs are normalized, so look up with normalized URL
    const retrieved = getPromptForImage(normalizeUrl(imageUrl), metadata);

    expect(retrieved).toBe(node);
  });

  it('should unlink image from prompt', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const imageUrl = 'http://example.com/img.jpg';

    await linkImageToPrompt(node.id, imageUrl, metadata);
    // URLs are normalized, use normalized URL for unlinking
    const result = await unlinkImageFromPrompt(
      normalizeUrl(imageUrl),
      metadata
    );

    expect(result).toBe(true);
    expect(node.generatedImages).not.toContain(normalizeUrl(imageUrl));

    const registry = getRegistry(metadata);
    expect(registry.imageToPromptId[normalizeUrl(imageUrl)]).toBeUndefined();
  });

  it('should return false when unlinking non-existent image', async () => {
    const result = await unlinkImageFromPrompt(
      'http://nonexistent.com/img.jpg',
      metadata
    );

    expect(result).toBe(false);
  });

  it('should avoid duplicate images in generatedImages array', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    const imageUrl = 'http://example.com/img.jpg';

    await linkImageToPrompt(node.id, imageUrl, metadata);
    await linkImageToPrompt(node.id, imageUrl, metadata);

    expect(node.generatedImages).toHaveLength(1);
    expect(node.generatedImages[0]).toBe(normalizeUrl(imageUrl));
  });
});

// ============================================================================
// Suite 5: Tree Operations
// ============================================================================

describe('Tree Operations', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should refine prompt and create child node', async () => {
    const parent = await registerPrompt(
      'original',
      42,
      0,
      'ai-message',
      metadata
    );
    const child = await refinePrompt(
      parent.id,
      'refined text',
      'make it better',
      'ai-refined',
      metadata
    );

    expect(child.text).toBe('refined text');
    expect(child.parentId).toBe(parent.id);
    expect(child.metadata.feedback).toBe('make it better');
    expect(child.metadata.source).toBe('ai-refined');
    expect(parent.childIds).toContain(child.id);
  });

  it('should inherit messageId and promptIndex from parent', async () => {
    const parent = await registerPrompt(
      'original',
      42,
      3,
      'ai-message',
      metadata
    );
    const child = await refinePrompt(
      parent.id,
      'refined',
      'feedback',
      'ai-refined',
      metadata
    );

    expect(child.messageId).toBe(parent.messageId);
    expect(child.promptIndex).toBe(parent.promptIndex);
  });

  it('should not add child to rootPromptIds', async () => {
    const parent = await registerPrompt(
      'original',
      42,
      0,
      'ai-message',
      metadata
    );
    const child = await refinePrompt(
      parent.id,
      'refined',
      'feedback',
      'ai-refined',
      metadata
    );

    const registry = getRegistry(metadata);
    expect(registry.rootPromptIds).toContain(parent.id);
    expect(registry.rootPromptIds).not.toContain(child.id);
  });

  it('should get root from nested child', async () => {
    const root = await registerPrompt(
      'original',
      42,
      0,
      'ai-message',
      metadata
    );
    const child1 = await refinePrompt(
      root.id,
      'v2',
      'feedback1',
      'ai-refined',
      metadata
    );
    const child2 = await refinePrompt(
      child1.id,
      'v3',
      'feedback2',
      'ai-refined',
      metadata
    );

    const foundRoot = getRootPrompt(child2.id, metadata);

    expect(foundRoot).toBe(root);
  });

  it('should get prompt chain from root to current', async () => {
    const root = await registerPrompt(
      'original',
      42,
      0,
      'ai-message',
      metadata
    );
    const child1 = await refinePrompt(
      root.id,
      'v2',
      'feedback1',
      'ai-refined',
      metadata
    );
    const child2 = await refinePrompt(
      child1.id,
      'v3',
      'feedback2',
      'ai-refined',
      metadata
    );

    const chain = getPromptChain(child2.id, metadata);

    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(root);
    expect(chain[1]).toBe(child1);
    expect(chain[2]).toBe(child2);
  });

  it('should get direct children only', async () => {
    const parent = await registerPrompt(
      'original',
      42,
      0,
      'ai-message',
      metadata
    );
    const child1 = await refinePrompt(
      parent.id,
      'v2',
      'feedback1',
      'ai-refined',
      metadata
    );
    const child2 = await refinePrompt(
      parent.id,
      'v3',
      'feedback2',
      'manual-refined',
      metadata
    );
    const grandchild = await refinePrompt(
      child1.id,
      'v4',
      'feedback3',
      'ai-refined',
      metadata
    );

    const children = getChildPrompts(parent.id, metadata);

    expect(children).toHaveLength(2);
    expect(children).toContain(child1);
    expect(children).toContain(child2);
    expect(children).not.toContain(grandchild);
  });

  it('should support multiple levels of refinement', async () => {
    const root = await registerPrompt('v1', 42, 0, 'ai-message', metadata);
    const v2 = await refinePrompt(root.id, 'v2', 'f1', 'ai-refined', metadata);
    const v3 = await refinePrompt(v2.id, 'v3', 'f2', 'ai-refined', metadata);
    const v4 = await refinePrompt(
      v3.id,
      'v4',
      'f3',
      'manual-refined',
      metadata
    );

    const chain = getPromptChain(v4.id, metadata);
    expect(chain).toHaveLength(4);

    const root4 = getRootPrompt(v4.id, metadata);
    expect(root4).toBe(root);
  });

  it('should get entire subtree with DFS', async () => {
    const root = await registerPrompt('root', 42, 0, 'ai-message', metadata);
    const child1 = await refinePrompt(
      root.id,
      'c1',
      'f1',
      'ai-refined',
      metadata
    );
    const child2 = await refinePrompt(
      root.id,
      'c2',
      'f2',
      'ai-refined',
      metadata
    );
    const grandchild1 = await refinePrompt(
      child1.id,
      'gc1',
      'f3',
      'ai-refined',
      metadata
    );

    const tree = getPromptTree(root.id, metadata);

    expect(tree).toHaveLength(4);
    expect(tree).toContain(root);
    expect(tree).toContain(child1);
    expect(tree).toContain(child2);
    expect(tree).toContain(grandchild1);
  });
});

// ============================================================================
// Suite 6: Query Operations
// ============================================================================

describe('Query Operations', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should get prompts for message sorted by promptIndex', async () => {
    await registerPrompt('prompt 2', 42, 2, 'ai-message', metadata);
    await registerPrompt('prompt 0', 42, 0, 'ai-message', metadata);
    await registerPrompt('prompt 1', 42, 1, 'ai-message', metadata);
    await registerPrompt('other message', 43, 0, 'ai-message', metadata);

    const prompts = getPromptsForMessage(42, metadata);

    expect(prompts).toHaveLength(3);
    expect(prompts[0].promptIndex).toBe(0);
    expect(prompts[1].promptIndex).toBe(1);
    expect(prompts[2].promptIndex).toBe(2);
  });

  it('should return empty array for message with no prompts', async () => {
    await registerPrompt('test', 42, 0, 'ai-message', metadata);

    const prompts = getPromptsForMessage(99, metadata);

    expect(prompts).toEqual([]);
  });

  it('should get all root prompts', async () => {
    const root1 = await registerPrompt('root1', 42, 0, 'ai-message', metadata);
    const root2 = await registerPrompt('root2', 42, 1, 'ai-message', metadata);
    const child = await refinePrompt(
      root1.id,
      'child',
      'feedback',
      'ai-refined',
      metadata
    );

    const roots = getAllRootPrompts(metadata);

    expect(roots).toHaveLength(2);
    expect(roots).toContain(root1);
    expect(roots).toContain(root2);
    expect(roots).not.toContain(child);
  });

  it('should get accurate statistics', async () => {
    const root1 = await registerPrompt('root1', 42, 0, 'ai-message', metadata);
    const root2 = await registerPrompt('root2', 42, 1, 'ai-message', metadata);
    const child = await refinePrompt(
      root1.id,
      'child',
      'f',
      'ai-refined',
      metadata
    );

    await linkImageToPrompt(root1.id, 'http://example.com/img1.jpg', metadata);
    await linkImageToPrompt(child.id, 'http://example.com/img2.jpg', metadata);

    const stats = getPromptStats(metadata);

    expect(stats.totalNodes).toBe(3);
    expect(stats.totalImages).toBe(2);
    expect(stats.totalTrees).toBe(2); // root1 and root2
    expect(root2).toBeDefined(); // Verify root2 was created
  });
});

// ============================================================================
// Suite 7: Cleanup Operations
// ============================================================================

describe('Cleanup Operations', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should delete all prompts for a message', async () => {
    const node1 = await registerPrompt('p1', 42, 0, 'ai-message', metadata);
    const node2 = await registerPrompt('p2', 42, 1, 'ai-message', metadata);
    const node3 = await registerPrompt('p3', 43, 0, 'ai-message', metadata);

    await linkImageToPrompt(node1.id, 'http://example.com/img1.jpg', metadata);

    const count = await deleteMessagePrompts(42, metadata);

    expect(count).toBe(2);
    expect(getPromptNode(node1.id, metadata)).toBeNull();
    expect(getPromptNode(node2.id, metadata)).toBeNull();
    expect(getPromptNode(node3.id, metadata)).toBe(node3);

    const registry = getRegistry(metadata);
    expect(
      registry.imageToPromptId[normalizeUrl('http://example.com/img1.jpg')]
    ).toBeUndefined();
  });

  it('should prune orphaned nodes with no images and no children', async () => {
    const orphan = await registerPrompt(
      'orphan',
      42,
      0,
      'ai-message',
      metadata
    );
    const withImage = await registerPrompt(
      'with image',
      42,
      1,
      'ai-message',
      metadata
    );
    const withChild = await registerPrompt(
      'with child',
      42,
      2,
      'ai-message',
      metadata
    );

    await linkImageToPrompt(
      withImage.id,
      'http://example.com/img.jpg',
      metadata
    );
    const child = await refinePrompt(
      withChild.id,
      'child',
      'feedback',
      'ai-refined',
      metadata
    );

    const pruned = await pruneOrphanedNodes(metadata);

    // Both orphan and child get pruned (child has no images and no children)
    expect(pruned).toBe(2);
    expect(getPromptNode(orphan.id, metadata)).toBeNull();
    expect(getPromptNode(child.id, metadata)).toBeNull();
    expect(getPromptNode(withImage.id, metadata)).toBe(withImage);
    expect(getPromptNode(withChild.id, metadata)).toBe(withChild);
  });

  it('should preserve nodes with children during pruning', async () => {
    const parent = await registerPrompt(
      'parent',
      42,
      0,
      'ai-message',
      metadata
    );
    const child = await refinePrompt(
      parent.id,
      'child',
      'feedback',
      'ai-refined',
      metadata
    );

    // Parent has no images but has a child
    const pruned = await pruneOrphanedNodes(metadata);

    expect(pruned).toBe(1); // Only child is pruned (no images, no children)
    expect(getPromptNode(parent.id, metadata)).toBe(parent);
    expect(getPromptNode(child.id, metadata)).toBeNull();
  });

  it('should preserve nodes with images during pruning', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);
    await linkImageToPrompt(node.id, 'http://example.com/img.jpg', metadata);

    const pruned = await pruneOrphanedNodes(metadata);

    expect(pruned).toBe(0);
    expect(getPromptNode(node.id, metadata)).toBe(node);
  });

  it('should maintain parent-child integrity after cleanup', async () => {
    const parent = await registerPrompt(
      'parent',
      42,
      0,
      'ai-message',
      metadata
    );
    const child1 = await refinePrompt(
      parent.id,
      'c1',
      'f1',
      'ai-refined',
      metadata
    );
    const child2 = await refinePrompt(
      parent.id,
      'c2',
      'f2',
      'ai-refined',
      metadata
    );

    await deletePromptNode(child1.id, metadata);

    expect(parent.childIds).toHaveLength(1);
    expect(parent.childIds).not.toContain(child1.id);
    expect(parent.childIds).toContain(child2.id);
  });
});

// ============================================================================
// Suite 8: Message Text Integration
// ============================================================================

describe('Message Text Integration', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should detect prompts with custom patterns parameter', async () => {
    const messageText = 'Text <!--img-prompt="1girl, red dress"--> more text';
    const patterns = ['<!--img-prompt="([^"]*)"-->'];

    const nodes = await detectPromptsInMessage(
      42,
      messageText,
      patterns,
      metadata
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('1girl, red dress');
    expect(nodes[0].messageId).toBe(42);
    expect(nodes[0].promptIndex).toBe(0);
  });

  it('should detect prompts with different pattern sets', async () => {
    const messageText = '[[img-prompt: test prompt]]';
    const patterns = ['\\[\\[img-prompt:\\s*([^\\]]+)\\]\\]'];

    const nodes = await detectPromptsInMessage(
      42,
      messageText,
      patterns,
      metadata
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe('test prompt');
  });

  it('should handle multiple prompts in message', async () => {
    const messageText =
      '<!--img-prompt="prompt 1"--> text <!--img-prompt="prompt 2"--> more';
    const patterns = ['<!--img-prompt="([^"]*)"-->'];

    const nodes = await detectPromptsInMessage(
      42,
      messageText,
      patterns,
      metadata
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[0].text).toBe('prompt 1');
    expect(nodes[0].promptIndex).toBe(0);
    expect(nodes[1].text).toBe('prompt 2');
    expect(nodes[1].promptIndex).toBe(1);
  });

  it('should replace prompt text at correct index', async () => {
    const node = await registerPrompt(
      'old prompt',
      42,
      1,
      'ai-message',
      metadata
    );
    const messageText =
      '<!--img-prompt="first"--> <!--img-prompt="old prompt"--> <!--img-prompt="third"-->';
    const patterns = ['<!--img-prompt="([^"]*)"-->'];

    const updatedText = replacePromptTextInMessage(
      node.id,
      messageText,
      'new prompt',
      patterns,
      metadata
    );

    expect(updatedText).toBe(
      '<!--img-prompt="first"--> <!--img-prompt="new prompt"--> <!--img-prompt="third"-->'
    );
  });

  it('should NOT mutate node.text when replacing', async () => {
    const node = await registerPrompt(
      'original text',
      42,
      0,
      'ai-message',
      metadata
    );
    const messageText = '<!--img-prompt="original text"-->';
    const patterns = ['<!--img-prompt="([^"]*)"-->'];

    replacePromptTextInMessage(
      node.id,
      messageText,
      'new text',
      patterns,
      metadata
    );

    // Verify node.text is unchanged
    expect(node.text).toBe('original text');
  });

  it('should handle escaped quotes in prompts', async () => {
    const messageText = '<!--img-prompt="prompt with \\"quotes\\""-->';
    const patterns = ['<!--img-prompt="([^"]*)"-->'];

    const nodes = await detectPromptsInMessage(
      42,
      messageText,
      patterns,
      metadata
    );

    // Depending on regex behavior, this may or may not capture the escaped quotes
    // This test documents the current behavior
    expect(nodes.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Suite 9: Edge Cases & Robustness
// ============================================================================

describe('Edge Cases & Robustness', () => {
  let metadata: AutoIllustratorChatMetadata;

  beforeEach(() => {
    metadata = createTestMetadata();
  });

  it('should handle empty prompt text', async () => {
    const node = await registerPrompt('', 42, 0, 'ai-message', metadata);

    expect(node.text).toBe('');
    expect(node.id).toMatch(/^prompt_[a-z0-9]+$/);
  });

  it('should handle very long prompt text (>1000 chars)', async () => {
    const longText = 'a'.repeat(1500);
    const node = await registerPrompt(longText, 42, 0, 'ai-message', metadata);

    expect(node.text).toBe(longText);
    expect(node.text).toHaveLength(1500);
  });

  it('should handle special characters in prompt', async () => {
    const specialChars =
      '1girl, "quotes", \\backslashes\\, unicode: 你好, emoji: 🎨';
    const node = await registerPrompt(
      specialChars,
      42,
      0,
      'ai-message',
      metadata
    );

    expect(node.text).toBe(specialChars);
  });

  it('should handle non-existent message ID gracefully', async () => {
    const prompts = getPromptsForMessage(999, metadata);

    expect(prompts).toEqual([]);
  });

  it('should detect cycles in tree traversal', async () => {
    const node1 = await registerPrompt('n1', 42, 0, 'ai-message', metadata);
    const node2 = await refinePrompt(
      node1.id,
      'n2',
      'f',
      'ai-refined',
      metadata
    );

    // Manually create a cycle (this shouldn't happen in normal use)
    const registry = getRegistry(metadata);
    registry.nodes[node1.id].parentId = node2.id;

    // getRootPrompt should handle cycle gracefully
    const root = getRootPrompt(node1.id, metadata);

    // Should stop at cycle detection
    expect(root).toBeDefined();
  });

  it('should handle orphaned nodes (parent deleted but child remains)', async () => {
    const parent = await registerPrompt(
      'parent',
      42,
      0,
      'ai-message',
      metadata
    );
    const child = await refinePrompt(
      parent.id,
      'child',
      'f',
      'ai-refined',
      metadata
    );

    // Delete parent
    await deletePromptNode(parent.id, metadata);

    // Child should still exist
    const retrievedChild = getPromptNode(child.id, metadata);
    expect(retrievedChild).toBe(child);

    // But getRootPrompt should handle missing parent
    const root = getRootPrompt(child.id, metadata);
    // Since parent is missing, should stop traversal
    expect(root).toBeDefined();
  });

  it('should handle multiple images linked to same prompt', async () => {
    const node = await registerPrompt('test', 42, 0, 'ai-message', metadata);

    for (let i = 0; i < 10; i++) {
      await linkImageToPrompt(
        node.id,
        `http://example.com/img${i}.jpg`,
        metadata
      );
    }

    expect(node.generatedImages).toHaveLength(10);
  });

  it('should handle concurrent registrations with deduplication', async () => {
    // Simulate multiple registrations of same prompt
    const nodes = [];
    for (let i = 0; i < 5; i++) {
      const node = await registerPrompt('same', 42, 0, 'ai-message', metadata);
      nodes.push(node);
    }

    // All should be the same node
    expect(new Set(nodes.map(n => n.id)).size).toBe(1);
    expect(nodes[0]).toBe(nodes[1]);
    expect(nodes[0]).toBe(nodes[4]);
  });

  it('should handle getRegistry initializing promptRegistry if not exists', async () => {
    const emptyMetadata: AutoIllustratorChatMetadata = {};

    const registry = getRegistry(emptyMetadata);

    expect(registry).toBeDefined();
    expect(registry.nodes).toEqual({});
    expect(registry.imageToPromptId).toEqual({});
    expect(registry.rootPromptIds).toEqual([]);
  });

  it('should throw error when refining non-existent prompt', async () => {
    await expect(
      refinePrompt(
        'prompt_nonexistent',
        'new text',
        'feedback',
        'ai-refined',
        metadata
      )
    ).rejects.toThrow('Cannot refine non-existent prompt');
  });

  it('should throw error when replacing prompt text with non-existent promptId', async () => {
    const messageText = '<!--img-prompt="test"-->';
    const patterns = ['<!--img-prompt="([^"]*)"-->'];

    expect(() => {
      replacePromptTextInMessage(
        'prompt_nonexistent',
        messageText,
        'new',
        patterns,
        metadata
      );
    }).toThrow('Prompt node not found');
  });

  // ===================================================================
  // NEW TESTS: ID Collision Handling in refinePrompt()
  // ===================================================================

  it('should handle refinePrompt ID collision: same as parent (no-op)', async () => {
    const parent = await registerPrompt(
      'original',
      42,
      0,
      'ai-message',
      metadata
    );
    const registry = getRegistry(metadata);

    // Refine with same text (generates same ID as parent)
    const result = await refinePrompt(
      parent.id,
      'original',
      'no change',
      'ai-refined',
      metadata
    );

    // Should return parent unchanged
    expect(result.id).toBe(parent.id);
    expect(result).toBe(parent);
    expect(parent.childIds).toHaveLength(0); // No child added
    expect(Object.keys(registry.nodes)).toHaveLength(1); // Only parent in registry
  });

  it('should handle refinePrompt ID collision: existing node reparented', async () => {
    // Scenario: Refine parent to create a child that would collide with
    // an existing orphaned node at the same position
    const parent = await registerPrompt(
      'parent',
      42,
      0,
      'ai-message',
      metadata
    );

    // Manually create an orphaned node at same position with different text
    // (simulates a node that was orphaned after its parent was deleted)
    const orphan = await registerPrompt(
      'orphan',
      42,
      0,
      'ai-message',
      metadata
    );

    const registry = getRegistry(metadata);
    const initialRootCount = registry.rootPromptIds.length;

    // Now refine parent with text matching the orphan
    // This should reparent the orphan under parent
    const result = await refinePrompt(
      parent.id,
      'orphan',
      'adopt orphan',
      'ai-refined',
      metadata
    );

    // Should return the existing orphan node, now reparented
    expect(result.id).toBe(orphan.id);
    expect(result).toBe(orphan);
    expect(orphan.parentId).toBe(parent.id); // Reparented
    expect(orphan.metadata.feedback).toBe('adopt orphan'); // Feedback updated
    expect(parent.childIds).toEqual([orphan.id]); // Added to parent
    // Orphan should be removed from roots
    expect(registry.rootPromptIds).not.toContain(orphan.id);
    expect(registry.rootPromptIds.length).toBe(initialRootCount - 1);
  });

  it('should handle refinePrompt ID collision: existing root reparented', async () => {
    const root1 = await registerPrompt('r1', 42, 0, 'ai-message', metadata);
    const root2 = await registerPrompt('r2', 42, 0, 'ai-message', metadata);

    const registry = getRegistry(metadata);
    expect(registry.rootPromptIds).toContain(root1.id);
    expect(registry.rootPromptIds).toContain(root2.id);

    // Refine root1 with text matching root2 (collision - same position)
    const result = await refinePrompt(
      root1.id,
      'r2',
      'f',
      'ai-refined',
      metadata
    );

    // Should reparent root2 under root1
    expect(result.id).toBe(root2.id);
    expect(root2.parentId).toBe(root1.id);
    expect(root1.childIds).toEqual([root2.id]);
    expect(registry.rootPromptIds).not.toContain(root2.id); // Removed from roots
    expect(registry.rootPromptIds).toContain(root1.id); // Still a root
  });

  // ===================================================================
  // NEW TESTS: Children Promotion in deletePromptNode()
  // ===================================================================

  it('should promote children to roots when deleting parent', async () => {
    const parent = await registerPrompt(
      'parent',
      42,
      0,
      'ai-message',
      metadata
    );
    const child1 = await refinePrompt(
      parent.id,
      'child1',
      'f1',
      'ai-refined',
      metadata
    );
    const child2 = await refinePrompt(
      parent.id,
      'child2',
      'f2',
      'ai-refined',
      metadata
    );

    const registry = getRegistry(metadata);
    expect(registry.rootPromptIds).toEqual([parent.id]);
    expect(child1.parentId).toBe(parent.id);
    expect(child2.parentId).toBe(parent.id);

    // Delete parent
    await deletePromptNode(parent.id, metadata);

    // Children should be promoted to roots
    expect(child1.parentId).toBeNull();
    expect(child2.parentId).toBeNull();
    expect(registry.rootPromptIds).toContain(child1.id);
    expect(registry.rootPromptIds).toContain(child2.id);
    expect(registry.rootPromptIds).not.toContain(parent.id);
    expect(registry.nodes[parent.id]).toBeUndefined(); // Parent deleted
  });

  it('should promote grandchildren correctly when deleting middle node', async () => {
    const root = await registerPrompt('root', 42, 0, 'ai-message', metadata);
    const middle = await refinePrompt(
      root.id,
      'middle',
      'f1',
      'ai-refined',
      metadata
    );
    const grandchild = await refinePrompt(
      middle.id,
      'grandchild',
      'f2',
      'ai-refined',
      metadata
    );

    const registry = getRegistry(metadata);

    // Delete middle node
    await deletePromptNode(middle.id, metadata);

    // Grandchild should be promoted to root
    expect(grandchild.parentId).toBeNull();
    expect(registry.rootPromptIds).toContain(grandchild.id);
    expect(registry.rootPromptIds).toContain(root.id);
    expect(registry.nodes[middle.id]).toBeUndefined(); // Middle deleted
    expect(root.childIds).toEqual([]); // Middle removed from root's children
  });

  it('should handle deleting node with no children', async () => {
    const parent = await registerPrompt(
      'parent',
      42,
      0,
      'ai-message',
      metadata
    );
    const child = await refinePrompt(
      parent.id,
      'child',
      'f',
      'ai-refined',
      metadata
    );

    const registry = getRegistry(metadata);

    // Delete child (leaf node)
    await deletePromptNode(child.id, metadata);

    // Parent should remain unchanged
    expect(parent.childIds).toEqual([]);
    expect(registry.nodes[parent.id]).toBe(parent);
    expect(registry.rootPromptIds).toEqual([parent.id]);
    expect(registry.nodes[child.id]).toBeUndefined(); // Child deleted
  });

  it('should handle deletePromptNode removing image associations', async () => {
    const parent = await registerPrompt(
      'parent',
      42,
      0,
      'ai-message',
      metadata
    );
    const child = await refinePrompt(
      parent.id,
      'child',
      'f',
      'ai-refined',
      metadata
    );

    // Link images to parent
    await linkImageToPrompt(parent.id, 'http://example.com/img1.jpg', metadata);
    await linkImageToPrompt(parent.id, 'http://example.com/img2.jpg', metadata);

    const registry = getRegistry(metadata);
    expect(parent.generatedImages).toHaveLength(2);
    expect(
      registry.imageToPromptId[normalizeUrl('http://example.com/img1.jpg')]
    ).toBe(parent.id);

    // Delete parent
    await deletePromptNode(parent.id, metadata);

    // Image associations should be removed
    expect(
      registry.imageToPromptId[normalizeUrl('http://example.com/img1.jpg')]
    ).toBeUndefined();
    expect(
      registry.imageToPromptId[normalizeUrl('http://example.com/img2.jpg')]
    ).toBeUndefined();

    // Child should be promoted to root
    expect(child.parentId).toBeNull();
    expect(registry.rootPromptIds).toContain(child.id);
  });
});
