/**
 * Tests for ProgressManager.waitAllComplete()
 * Tests the new explicit await condition functionality
 */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ProgressManager} from './progress_manager';

describe('ProgressManager.waitAllComplete()', () => {
  let manager: ProgressManager;

  beforeEach(() => {
    manager = new ProgressManager();
  });

  it('should resolve immediately if not tracking', async () => {
    await expect(manager.waitAllComplete(1)).resolves.toBeUndefined();
  });

  it('should resolve immediately if already complete', async () => {
    manager.registerTask(1, 2);
    manager.completeTask(1);
    manager.completeTask(1);

    await expect(manager.waitAllComplete(1)).resolves.toBeUndefined();
  });

  it('should wait for tasks to complete', async () => {
    manager.registerTask(1, 2);

    let resolved = false;
    const promise = manager.waitAllComplete(1).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    manager.completeTask(1);
    expect(resolved).toBe(false);

    manager.completeTask(1);

    await promise;
    expect(resolved).toBe(true);
  });

  it('should reject on timeout', async () => {
    manager.registerTask(1, 2);

    await expect(manager.waitAllComplete(1, {timeoutMs: 100})).rejects.toThrow(
      'Timeout'
    );
  });

  it('should reject on abort signal', async () => {
    manager.registerTask(1, 2);

    const controller = new AbortController();
    const promise = manager.waitAllComplete(1, {signal: controller.signal});

    controller.abort();

    await expect(promise).rejects.toThrow('Aborted');
  });

  it('should reject immediately if signal already aborted', async () => {
    manager.registerTask(1, 2);

    const controller = new AbortController();
    controller.abort();

    await expect(
      manager.waitAllComplete(1, {signal: controller.signal})
    ).rejects.toThrow('Already aborted');
  });

  it('should handle failed tasks as completion', async () => {
    manager.registerTask(1, 2);

    const promise = manager.waitAllComplete(1);

    manager.completeTask(1);
    manager.failTask(1);

    await expect(promise).resolves.toBeUndefined();
  });

  it('should handle dynamic total updates', async () => {
    manager.registerTask(1, 1);

    const promise = manager.waitAllComplete(1);

    manager.updateTotal(1, 3);

    manager.completeTask(1);
    manager.completeTask(1);
    manager.completeTask(1);

    await expect(promise).resolves.toBeUndefined();
  });
});
