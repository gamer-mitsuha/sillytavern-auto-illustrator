/**
 * Prompt Manager Module
 * Manages prompt nodes, refinement history, and image associations
 *
 * This module provides a content-addressed prompt management system that:
 * - Tracks prompts by hash(text + messageId + promptIndex) - survives message edits
 * - Maintains tree structure for prompt refinement history
 * - Links images to prompts for regeneration and tracking
 * - Provides O(1) lookups for all common queries
 *
 * Design principles:
 * - All functions accept metadata directly (no internal context calls)
 * - Pure functions for better testability
 * - Caller responsible for saving metadata via saveMetadata()
 *
 * ============================================================================
 * IMPORTANT USAGE PATTERNS
 * ============================================================================
 *
 * 1. DETECTING PROMPTS:
 *    ```typescript
 *    const context = SillyTavern.getContext();
 *    const metadata = context.chat_metadata?.auto_illustrator;
 *    if (metadata) {
 *      const patterns = settings.promptDetectionPatterns;
 *      const nodes = detectPromptsInMessage(msgId, text, patterns, metadata);
 *    }
 *    ```
 *
 * 2. UPDATING A PROMPT (creates child node):
 *    ```typescript
 *    // Step 1: Create refined child node
 *    const child = refinePrompt(
 *      parentId,
 *      newText,
 *      feedback,
 *      'manual-refined',
 *      metadata
 *    );
 *
 *    // Step 2: Replace text in message (at parent's position)
 *    const patterns = settings.promptDetectionPatterns;
 *    const updatedText = replacePromptTextInMessage(
 *      parentId,      // Replace at parent's position
 *      message.mes,
 *      child.text,    // Use child's text
 *      patterns,
 *      metadata
 *    );
 *    message.mes = updatedText;
 *    await context.saveChat();
 *
 *    // Step 3: Link images to child (if regenerating)
 *    linkImageToPrompt(child.id, newImageUrl, metadata);
 *    await saveMetadata();
 *    ```
 *
 * 3. NODE.TEXT IS READONLY:
 *    ✅ Correct: Create child with new text via refinePrompt()
 *    ❌ Wrong:   node.text = newText (TypeScript will prevent this)
 *
 * 4. ALWAYS PASS PATTERNS AS PARAMETER:
 *    ✅ Correct: detectPromptsInMessage(..., settings.promptDetectionPatterns, ...)
 *    ❌ Wrong:   Hardcoding DEFAULT_PROMPT_DETECTION_PATTERNS inside functions
 */

import {createLogger} from './logger';
import type {AutoIllustratorChatMetadata} from './types';
import {extractImagePromptsMultiPattern} from './regex';

const logger = createLogger('PromptManager');

/**
 * Source of a prompt node
 * - 'ai-message': Initial prompt detected from AI's message
 * - 'ai-refined': User provided feedback, AI generated refined prompt
 * - 'manual-refined': User manually edited the prompt text
 */
export type PromptSource = 'ai-message' | 'ai-refined' | 'manual-refined';

/**
 * A node in the prompt refinement tree
 *
 * Each node represents a specific version of a prompt at a specific location
 * in a message. Nodes can have children representing refined versions.
 */
export interface PromptNode {
  /** Unique ID: hash(promptText + messageId + promptIndex) */
  id: string;

  /** Message ID this prompt belongs to */
  messageId: number;

  /** Index of this prompt in the message (0-based) */
  promptIndex: number;

  /** The actual prompt text (READONLY - create child node for updates) */
  readonly text: string;

  /** ID of parent node (null for root prompts) */
  parentId: string | null;

  /** IDs of child nodes (refined versions) */
  childIds: string[];

  /** URLs of images generated using this prompt */
  generatedImages: string[];

  /** Metadata */
  metadata: {
    /** When this node was created (Unix timestamp) */
    createdAt: number;

    /** When this node was last used for generation (Unix timestamp) */
    lastUsedAt: number;

    /** User feedback that led to this refinement (if refined) */
    feedback?: string;

    /** How this prompt was created */
    source: PromptSource;
  };
}

/**
 * Registry of all prompt nodes and indices
 */
export interface PromptRegistry {
  /** All prompt nodes, keyed by prompt ID */
  nodes: Record<string, PromptNode>;

  /** Index: image URL → prompt ID for fast lookup */
  imageToPromptId: Record<string, string>;

  /** Array of root prompt IDs (prompts with no parent) */
  rootPromptIds: string[];
}

/**
 * Generates a unique prompt ID from text, message ID, and prompt index
 *
 * Uses hash function to create consistent IDs. Same inputs always produce
 * same ID, enabling deduplication.
 *
 * @param text - The prompt text
 * @param messageId - Message ID this prompt belongs to
 * @param promptIndex - Index of prompt in message (0-based)
 * @returns Prompt ID in format: prompt_<hash36>
 *
 * @example
 * const id = generatePromptId("1girl, red dress", 42, 0);
 * // Returns: "prompt_abc123"
 */
export function generatePromptId(
  text: string,
  messageId: number,
  promptIndex: number
): string {
  // Combine all three parameters to ensure uniqueness
  const input = `${text}|${messageId}|${promptIndex}`;

  // Simple hash function (same as old prompt_metadata.ts for consistency)
  // TODO: Consider upgrading to a more robust hash function (e.g., crypto-based)
  // to reduce collision risk for very large datasets.
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `prompt_${Math.abs(hash).toString(36)}`;
}

/**
 * Gets or initializes the prompt registry from auto-illustrator metadata
 *
 * If registry doesn't exist, creates a new empty one and stores it in metadata.
 * This function mutates the metadata object.
 *
 * @param metadata - Auto-illustrator chat metadata object
 * @returns The prompt registry
 *
 * @example
 * const context = SillyTavern.getContext();
 * const metadata = context.chat_metadata?.auto_illustrator;
 * if (metadata) {
 *   const registry = getRegistry(metadata);
 * }
 */
export function getRegistry(
  metadata: AutoIllustratorChatMetadata
): PromptRegistry {
  // Initialize prompt registry if needed
  if (!metadata.promptRegistry) {
    metadata.promptRegistry = {
      nodes: {},
      imageToPromptId: {},
      rootPromptIds: [],
    };
    logger.debug('Initialized new prompt registry');
  }

  return metadata.promptRegistry;
}

/**
 * Creates a new prompt node
 *
 * Does NOT add to registry - use registerPrompt() for that.
 * This is a low-level function for internal use.
 *
 * @param text - Prompt text
 * @param messageId - Message ID
 * @param promptIndex - Index in message
 * @param source - How this prompt was created
 * @returns New prompt node
 */
export function createPromptNode(
  text: string,
  messageId: number,
  promptIndex: number,
  source: PromptSource
): PromptNode {
  const id = generatePromptId(text, messageId, promptIndex);
  const now = Date.now();

  return {
    id,
    messageId,
    promptIndex,
    text,
    parentId: null,
    childIds: [],
    generatedImages: [],
    metadata: {
      createdAt: now,
      lastUsedAt: now,
      feedback: undefined,
      source,
    },
  };
}

/**
 * Gets a prompt node by ID
 *
 * @param promptId - The prompt ID to look up
 * @param metadata - Chat metadata
 * @returns The prompt node, or null if not found
 *
 * @example
 * const node = getPromptNode("prompt_abc123", metadata);
 * if (node) {
 *   console.log(node.text);
 * }
 */
export function getPromptNode(
  promptId: string,
  metadata: AutoIllustratorChatMetadata
): PromptNode | null {
  const registry = getRegistry(metadata);
  return registry.nodes[promptId] || null;
}

/**
 * Deletes a prompt node from the registry
 *
 * Removes the node and cleans up all references:
 * - Removes from parent's childIds
 * - Removes from rootPromptIds if it's a root
 * - Removes all image associations
 * - Promotes children to roots (sets parentId=null, adds to rootPromptIds)
 *
 * @param promptId - ID of node to delete
 * @param metadata - Chat metadata
 *
 * @example
 * deletePromptNode("prompt_abc123", metadata);
 */
export function deletePromptNode(
  promptId: string,
  metadata: AutoIllustratorChatMetadata
): void {
  const registry = getRegistry(metadata);
  const node = registry.nodes[promptId];

  if (!node) {
    logger.warn(`Cannot delete non-existent node: ${promptId}`);
    return;
  }

  // Remove from parent's childIds if node has a parent
  if (node.parentId) {
    const parent = registry.nodes[node.parentId];
    if (parent) {
      parent.childIds = parent.childIds.filter(id => id !== promptId);
    }
  }

  // Remove from rootPromptIds if it's a root
  if (node.parentId === null) {
    registry.rootPromptIds = registry.rootPromptIds.filter(
      id => id !== promptId
    );
  }

  // Promote children to roots before deleting the node
  for (const childId of node.childIds) {
    const child = registry.nodes[childId];
    if (child) {
      child.parentId = null;
      // Add to rootPromptIds if not already there
      if (!registry.rootPromptIds.includes(childId)) {
        registry.rootPromptIds.push(childId);
      }
    }
  }

  // Remove all image associations
  for (const imageUrl of node.generatedImages) {
    delete registry.imageToPromptId[imageUrl];
  }

  // Remove the node itself
  delete registry.nodes[promptId];

  logger.debug(
    `Deleted prompt node: ${promptId} (promoted ${node.childIds.length} children to roots)`
  );
}

/**
 * Updates the lastUsedAt timestamp for a prompt node
 *
 * @param promptId - ID of node to update
 * @param metadata - Chat metadata
 *
 * @example
 * updatePromptLastUsed("prompt_abc123", metadata);
 */
export function updatePromptLastUsed(
  promptId: string,
  metadata: AutoIllustratorChatMetadata
): void {
  const registry = getRegistry(metadata);
  const node = registry.nodes[promptId];

  if (node) {
    node.metadata.lastUsedAt = Date.now();
  }
}

// ============================================================================
// Phase 2: Prompt Registration & Image Linking
// ============================================================================

/**
 * Registers a prompt in the registry
 *
 * If a prompt with the same (text, messageId, promptIndex) already exists,
 * returns the existing node and updates its lastUsedAt timestamp.
 * Otherwise, creates a new node and adds it to the registry.
 *
 * @param text - Prompt text
 * @param messageId - Message ID
 * @param promptIndex - Index in message (0-based)
 * @param source - How this prompt was created
 * @param metadata - Chat metadata
 * @returns The prompt node (existing or newly created)
 *
 * @example
 * const node = registerPrompt("1girl, red dress", 42, 0, 'ai-message', metadata);
 * console.log(node.id); // "prompt_abc123"
 */
export function registerPrompt(
  text: string,
  messageId: number,
  promptIndex: number,
  source: PromptSource,
  metadata: AutoIllustratorChatMetadata
): PromptNode {
  const registry = getRegistry(metadata);
  const id = generatePromptId(text, messageId, promptIndex);

  // Check if node already exists (deduplication)
  const existing = registry.nodes[id];
  if (existing) {
    updatePromptLastUsed(id, metadata);
    logger.debug(`Prompt already registered: ${id}`);
    return existing;
  }

  // Create new node
  const node = createPromptNode(text, messageId, promptIndex, source);

  // Add to registry
  registry.nodes[id] = node;

  // Add to rootPromptIds (only roots, not refined children)
  registry.rootPromptIds.push(id);

  logger.info(
    `Registered new prompt: ${id} (messageId: ${messageId}, index: ${promptIndex})`
  );

  return node;
}

/**
 * Normalize image URL to pathname for consistent lookups
 * Converts absolute URLs to relative paths
 * @param url - Image URL (absolute or relative)
 * @returns Normalized relative path
 */
function normalizeImageUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Return just the pathname (e.g., /user/images/test.png)
    return urlObj.pathname;
  } catch {
    // If URL parsing fails, it's already a relative path
    return url;
  }
}

/**
 * Links an image URL to a prompt
 *
 * Adds the image URL to the prompt's generatedImages array and updates
 * the imageToPromptId index for fast reverse lookup.
 * Automatically normalizes URLs to pathname for consistency.
 *
 * @param promptId - Prompt ID
 * @param imageUrl - Image URL to link (absolute or relative, will be normalized)
 * @param metadata - Chat metadata
 *
 * @example
 * linkImageToPrompt("prompt_abc123", "https://example.com/image.jpg", metadata);
 * // Stores as: "/image.jpg" -> "prompt_abc123"
 */
export function linkImageToPrompt(
  promptId: string,
  imageUrl: string,
  metadata: AutoIllustratorChatMetadata
): void {
  const registry = getRegistry(metadata);
  const node = registry.nodes[promptId];

  if (!node) {
    logger.error(`Cannot link image to non-existent prompt: ${promptId}`);
    return;
  }

  // Normalize URL to pathname for consistent lookups
  // Converts absolute URLs (http://host/path) to relative (/path)
  const normalizedUrl = normalizeImageUrl(imageUrl);

  // Add to node's generated images (avoid duplicates)
  if (!node.generatedImages.includes(normalizedUrl)) {
    node.generatedImages.push(normalizedUrl);
  }

  // Update index with normalized URL
  registry.imageToPromptId[normalizedUrl] = promptId;

  // Update last used timestamp
  updatePromptLastUsed(promptId, metadata);

  logger.debug(`Linked image to prompt ${promptId}: ${imageUrl}`);
}

/**
 * Unlinks an image URL from its prompt
 *
 * Removes the image from the prompt's generatedImages array and removes
 * the imageToPromptId index entry.
 *
 * @param imageUrl - Image URL to unlink
 * @param metadata - Chat metadata
 * @returns True if image was found and unlinked, false otherwise
 *
 * @example
 * const unlinked = unlinkImageFromPrompt("https://example.com/image.jpg", metadata);
 * if (unlinked) {
 *   console.log("Image unlinked successfully");
 * }
 */
export function unlinkImageFromPrompt(
  imageUrl: string,
  metadata: AutoIllustratorChatMetadata
): boolean {
  const registry = getRegistry(metadata);
  const promptId = registry.imageToPromptId[imageUrl];

  if (!promptId) {
    logger.debug(`Image not linked to any prompt: ${imageUrl}`);
    return false;
  }

  const node = registry.nodes[promptId];
  if (node) {
    // Remove from node's generated images
    node.generatedImages = node.generatedImages.filter(url => url !== imageUrl);
  }

  // Remove from index
  delete registry.imageToPromptId[imageUrl];

  logger.debug(`Unlinked image from prompt ${promptId}: ${imageUrl}`);
  return true;
}

/**
 * Gets the prompt node for an image URL
 *
 * Fast O(1) lookup using the imageToPromptId index.
 *
 * @param imageUrl - Image URL to look up
 * @param metadata - Chat metadata
 * @returns The prompt node, or null if image not linked to any prompt
 *
 * @example
 * const node = getPromptForImage("https://example.com/image.jpg", metadata);
 * if (node) {
 *   console.log(`Image generated from prompt: ${node.text}`);
 * }
 */
export function getPromptForImage(
  imageUrl: string,
  metadata: AutoIllustratorChatMetadata
): PromptNode | null {
  const registry = getRegistry(metadata);
  const promptId = registry.imageToPromptId[imageUrl];

  if (!promptId) {
    return null;
  }

  return registry.nodes[promptId] || null;
}

// ============================================================================
// Phase 3: Tree Operations (Refinement)
// ============================================================================

/**
 * Refines a prompt by creating a child node
 *
 * Creates a new prompt node as a child of the parent, inheriting the same
 * messageId and promptIndex. This represents a refined version of the prompt.
 *
 * The child node is NOT added to rootPromptIds (only roots are in that array).
 *
 * @param parentId - ID of the parent prompt to refine
 * @param newText - The refined prompt text
 * @param feedback - User feedback that led to this refinement
 * @param source - Source type ('ai-refined' or 'manual-refined')
 * @param metadata - Chat metadata
 * @returns The new child prompt node
 *
 * @example
 * const refined = refinePrompt(
 *   "prompt_abc123",
 *   "1girl, long hair, detailed hands",
 *   "fix the hands",
 *   'ai-refined',
 *   metadata
 * );
 */
export function refinePrompt(
  parentId: string,
  newText: string,
  feedback: string,
  source: 'ai-refined' | 'manual-refined',
  metadata: AutoIllustratorChatMetadata
): PromptNode {
  const registry = getRegistry(metadata);
  const parent = registry.nodes[parentId];

  if (!parent) {
    throw new Error(`Cannot refine non-existent prompt: ${parentId}`);
  }

  // Pre-compute child ID to detect collisions before mutation
  const childId = generatePromptId(
    newText,
    parent.messageId,
    parent.promptIndex
  );

  // CASE 1: New text generates same ID as parent (no change)
  if (childId === parentId) {
    logger.debug(
      `Refinement produced identical ID to parent: ${parentId} (no change)`
    );
    return parent;
  }

  // CASE 2: Child ID already exists in registry (reparent existing node)
  const existingNode = registry.nodes[childId];
  if (existingNode) {
    // Remove existing node from its current parent (if any)
    if (existingNode.parentId) {
      const oldParent = registry.nodes[existingNode.parentId];
      if (oldParent) {
        oldParent.childIds = oldParent.childIds.filter(id => id !== childId);
      }
    }

    // Remove from rootPromptIds if it was a root
    if (existingNode.parentId === null) {
      registry.rootPromptIds = registry.rootPromptIds.filter(
        id => id !== childId
      );
    }

    // Reparent to new parent
    existingNode.parentId = parentId;
    existingNode.metadata.feedback = feedback;

    // Add to new parent's childIds (avoid duplicates)
    if (!parent.childIds.includes(childId)) {
      parent.childIds.push(childId);
    }

    logger.info(
      `Reparented existing node ${childId} to ${parentId} (feedback: "${feedback}")`
    );
    return existingNode;
  }

  // CASE 3: New child ID (normal case)
  const child = createPromptNode(
    newText,
    parent.messageId,
    parent.promptIndex,
    source
  );

  // Set parent-child relationship
  child.parentId = parentId;
  child.metadata.feedback = feedback;

  // Add child to parent's childIds
  parent.childIds.push(child.id);

  // Add child to registry
  registry.nodes[child.id] = child;

  // NOTE: Do NOT add to rootPromptIds - only roots go there

  logger.info(
    `Refined prompt ${parentId} → ${child.id} (feedback: "${feedback}")`
  );

  return child;
}

/**
 * Gets the root prompt of a tree
 *
 * Walks up the parent chain until finding a node with no parent.
 * Handles cycles defensively (shouldn't happen, but defensive programming).
 *
 * @param promptId - ID of any node in the tree
 * @param metadata - Chat metadata
 * @returns The root node, or null if promptId not found
 *
 * @example
 * const root = getRootPrompt("prompt_child123", metadata);
 * console.log(root?.text); // Original prompt text
 */
export function getRootPrompt(
  promptId: string,
  metadata: AutoIllustratorChatMetadata
): PromptNode | null {
  const registry = getRegistry(metadata);
  let current = registry.nodes[promptId];

  if (!current) {
    return null;
  }

  // Walk up the tree (with cycle detection)
  const visited = new Set<string>();
  while (current.parentId !== null) {
    if (visited.has(current.id)) {
      logger.error(`Cycle detected in prompt tree at ${current.id}`);
      break;
    }
    visited.add(current.id);

    const parent = registry.nodes[current.parentId];
    if (!parent) {
      logger.error(`Parent ${current.parentId} not found for ${current.id}`);
      break;
    }
    current = parent;
  }

  return current;
}

/**
 * Gets the full chain from root to current prompt
 *
 * Returns an array of prompts ordered from root to the specified prompt.
 *
 * @param promptId - ID of the prompt to get chain for
 * @param metadata - Chat metadata
 * @returns Array of prompts [root, ..., current], or empty array if not found
 *
 * @example
 * const chain = getPromptChain("prompt_child123", metadata);
 * chain.forEach((node, i) => {
 *   console.log(`Version ${i}: ${node.text}`);
 * });
 */
export function getPromptChain(
  promptId: string,
  metadata: AutoIllustratorChatMetadata
): PromptNode[] {
  const registry = getRegistry(metadata);
  const node = registry.nodes[promptId];

  if (!node) {
    return [];
  }

  const chain: PromptNode[] = [];
  let current: PromptNode | null = node;
  const visited = new Set<string>();

  // Build chain backwards (current → root)
  while (current !== null) {
    if (visited.has(current.id)) {
      logger.error(`Cycle detected in prompt chain at ${current.id}`);
      break;
    }
    visited.add(current.id);
    chain.unshift(current); // Add to front

    if (current.parentId === null) {
      break;
    }

    current = registry.nodes[current.parentId] || null;
  }

  return chain;
}

/**
 * Gets the direct children of a prompt
 *
 * @param promptId - ID of the parent prompt
 * @param metadata - Chat metadata
 * @returns Array of child prompts, or empty array if no children
 *
 * @example
 * const children = getChildPrompts("prompt_abc123", metadata);
 * console.log(`Prompt has ${children.length} refinements`);
 */
export function getChildPrompts(
  promptId: string,
  metadata: AutoIllustratorChatMetadata
): PromptNode[] {
  const registry = getRegistry(metadata);
  const parent = registry.nodes[promptId];

  if (!parent) {
    return [];
  }

  return parent.childIds
    .map(id => registry.nodes[id])
    .filter((node): node is PromptNode => node !== undefined);
}

/**
 * Gets the entire subtree rooted at a prompt (DFS)
 *
 * Returns all descendants of the prompt, including the prompt itself.
 *
 * @param promptId - ID of the root of the subtree
 * @param metadata - Chat metadata
 * @returns Array of all nodes in subtree (DFS order), or empty if not found
 *
 * @example
 * const tree = getPromptTree("prompt_root", metadata);
 * console.log(`Tree has ${tree.length} total versions`);
 */
export function getPromptTree(
  promptId: string,
  metadata: AutoIllustratorChatMetadata
): PromptNode[] {
  const registry = getRegistry(metadata);
  const root = registry.nodes[promptId];

  if (!root) {
    return [];
  }

  const result: PromptNode[] = [];
  const visited = new Set<string>();

  // DFS traversal
  function dfs(node: PromptNode) {
    if (visited.has(node.id)) {
      logger.error(`Cycle detected in prompt tree at ${node.id}`);
      return;
    }
    visited.add(node.id);
    result.push(node);

    for (const childId of node.childIds) {
      const child = registry.nodes[childId];
      if (child) {
        dfs(child);
      }
    }
  }

  dfs(root);
  return result;
}

// ============================================================================
// Phase 4: Query & Cleanup
// ============================================================================

/**
 * Gets all prompt nodes for a message
 *
 * Returns prompts sorted by promptIndex.
 *
 * @param messageId - Message ID to query
 * @param metadata - Chat metadata
 * @returns Array of prompt nodes, sorted by promptIndex
 *
 * @example
 * const prompts = getPromptsForMessage(42, metadata);
 * prompts.forEach(p => console.log(`[${p.promptIndex}] ${p.text}`));
 */
export function getPromptsForMessage(
  messageId: number,
  metadata: AutoIllustratorChatMetadata
): PromptNode[] {
  const registry = getRegistry(metadata);

  return Object.values(registry.nodes)
    .filter(node => node.messageId === messageId)
    .sort((a, b) => a.promptIndex - b.promptIndex);
}

/**
 * Deletes all prompt nodes for a message
 *
 * Removes all prompts belonging to the specified message, including:
 * - The nodes themselves
 * - All image associations
 * - Parent/child relationships
 * - Entries in rootPromptIds
 *
 * @param messageId - Message ID whose prompts to delete
 * @param metadata - Chat metadata
 * @returns Number of nodes deleted
 *
 * @example
 * const deleted = deleteMessagePrompts(42, metadata);
 * console.log(`Deleted ${deleted} prompts`);
 */
export function deleteMessagePrompts(
  messageId: number,
  metadata: AutoIllustratorChatMetadata
): number {
  const prompts = getPromptsForMessage(messageId, metadata);

  for (const prompt of prompts) {
    deletePromptNode(prompt.id, metadata);
  }

  logger.info(`Deleted ${prompts.length} prompts for message ${messageId}`);
  return prompts.length;
}

/**
 * Prunes orphaned nodes (no images, no children)
 *
 * Removes nodes that have:
 * - Zero generated images AND
 * - Zero child nodes
 *
 * These are considered orphaned/unused and can be safely removed.
 *
 * @param metadata - Chat metadata
 * @returns Number of nodes pruned
 *
 * @example
 * const pruned = pruneOrphanedNodes(metadata);
 * console.log(`Pruned ${pruned} orphaned nodes`);
 */
export function pruneOrphanedNodes(
  metadata: AutoIllustratorChatMetadata
): number {
  const registry = getRegistry(metadata);
  const toPrune: string[] = [];

  // Find orphaned nodes
  for (const [id, node] of Object.entries(registry.nodes)) {
    if (node.generatedImages.length === 0 && node.childIds.length === 0) {
      toPrune.push(id);
    }
  }

  // Delete them
  for (const id of toPrune) {
    deletePromptNode(id, metadata);
  }

  logger.info(`Pruned ${toPrune.length} orphaned nodes`);
  return toPrune.length;
}

/**
 * Gets all root prompts
 *
 * Returns all prompts that have no parent (roots of refinement trees).
 *
 * @param metadata - Chat metadata
 * @returns Array of root prompt nodes
 *
 * @example
 * const roots = getAllRootPrompts(metadata);
 * console.log(`${roots.length} root prompts`);
 */
export function getAllRootPrompts(
  metadata: AutoIllustratorChatMetadata
): PromptNode[] {
  const registry = getRegistry(metadata);

  return registry.rootPromptIds
    .map(id => registry.nodes[id])
    .filter((node): node is PromptNode => node !== undefined);
}

/**
 * Gets statistics about the prompt registry
 *
 * @param metadata - Chat metadata
 * @returns Statistics object
 *
 * @example
 * const stats = getPromptStats(metadata);
 * console.log(`${stats.totalNodes} nodes, ${stats.totalImages} images`);
 */
export function getPromptStats(metadata: AutoIllustratorChatMetadata): {
  totalNodes: number;
  totalImages: number;
  totalTrees: number;
} {
  const registry = getRegistry(metadata);

  const totalNodes = Object.keys(registry.nodes).length;
  const totalImages = Object.keys(registry.imageToPromptId).length;
  const totalTrees = registry.rootPromptIds.length;

  return {
    totalNodes,
    totalImages,
    totalTrees,
  };
}

// ============================================================================
// Phase 5: Message Text Integration
// ============================================================================

/**
 * Detects and registers prompts in a message
 *
 * Uses regex patterns from regex.ts to extract prompts from message text,
 * then registers each detected prompt in the registry.
 *
 * @param messageId - Message ID
 * @param messageText - The message text to scan
 * @param patterns - Array of regex patterns to detect prompts (e.g., settings.promptDetectionPatterns)
 * @param metadata - Chat metadata
 * @returns Array of prompt nodes (newly created or existing)
 *
 * @example
 * const patterns = settings.promptDetectionPatterns;
 * const prompts = detectPromptsInMessage(
 *   42,
 *   'Text <!--img-prompt="1girl"--> more text',
 *   patterns,
 *   metadata
 * );
 * console.log(`Detected ${prompts.length} prompts`);
 */
export function detectPromptsInMessage(
  messageId: number,
  messageText: string,
  patterns: string[],
  metadata: AutoIllustratorChatMetadata
): PromptNode[] {
  // Extract prompts using centralized regex patterns
  const matches = extractImagePromptsMultiPattern(messageText, patterns);

  const nodes: PromptNode[] = [];

  // Register each detected prompt
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const node = registerPrompt(
      match.prompt,
      messageId,
      i, // promptIndex
      'ai-message',
      metadata
    );
    nodes.push(node);
  }

  logger.debug(`Detected ${matches.length} prompts in message ${messageId}`);

  return nodes;
}

/**
 * Replaces prompt text in a message WITHOUT modifying the prompt node
 *
 * This is a low-level utility for message text manipulation.
 * To update a prompt semantically, use refinePrompt() to create a child node instead.
 *
 * Replaces the Nth occurrence of a prompt tag in the message text with new text.
 * The prompt node itself is NOT modified (node.text is readonly).
 *
 * This function does NOT save the message - caller is responsible for that.
 *
 * @param promptId - ID of the prompt whose position to replace in message
 * @param messageText - Current message text
 * @param newText - New prompt text to insert
 * @param patterns - Array of regex patterns to detect prompts (e.g., settings.promptDetectionPatterns)
 * @param metadata - Chat metadata (used to get promptIndex)
 * @returns Updated message text (caller must save it)
 * @throws Error if prompt node not found
 *
 * @example
 * // Create child node with new text
 * const child = refinePrompt(parentId, newText, feedback, 'manual-refined', metadata);
 *
 * // Replace text in message at parent's position
 * const patterns = settings.promptDetectionPatterns;
 * const updatedText = replacePromptTextInMessage(
 *   parentId,  // Replace at parent's position
 *   message.mes,
 *   child.text,  // Use child's text
 *   patterns,
 *   metadata
 * );
 * message.mes = updatedText;
 * await context.saveChat();
 */
export function replacePromptTextInMessage(
  promptId: string,
  messageText: string,
  newText: string,
  patterns: string[],
  metadata: AutoIllustratorChatMetadata
): string {
  const node = getPromptNode(promptId, metadata);

  if (!node) {
    throw new Error(`Prompt node not found: ${promptId}`);
  }

  // Find and replace the Nth occurrence (where N = promptIndex)
  const matches = extractImagePromptsMultiPattern(messageText, patterns);

  if (node.promptIndex >= matches.length) {
    throw new Error(
      `Prompt index ${node.promptIndex} out of range (found ${matches.length} prompts)`
    );
  }

  // Build a combined pattern that matches ANY prompt tag
  // We'll use a capturing group to match the entire tag
  const combinedPattern = new RegExp(
    patterns.map(p => `(${p})`).join('|'),
    'g'
  );

  // Replace only the Nth match
  let matchCount = 0;
  const updatedText = messageText.replace(combinedPattern, match => {
    if (matchCount === node.promptIndex) {
      matchCount++;
      // Extract the prompt pattern that matched and replace just the content
      // For standard pattern: <!--img-prompt="OLD"-->
      // We need to preserve the wrapper and replace just the content
      for (const pattern of patterns) {
        const regex = new RegExp(pattern);
        const regexMatch = match.match(regex);
        if (regexMatch && regexMatch[1] !== undefined) {
          // Replace the captured prompt text
          return match.replace(regexMatch[1], newText);
        }
      }
      return match; // Fallback
    }
    matchCount++;
    return match;
  });

  logger.debug(
    `Replaced prompt text at position ${promptId} in message ${node.messageId}`
  );

  return updatedText;
}
