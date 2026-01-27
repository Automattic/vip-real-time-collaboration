/**
 * Meta Sync Module
 *
 * Provides real-time synchronization for third-party plugin meta fields
 * that don't use WordPress core-data.
 */

export { MetaSyncManager, getMetaSyncManager } from './meta-sync-manager';
export { createYoastSeoBridge } from './bridges/yoast-seo-bridge';
export type { MetaSyncBridge, MetaSyncField, MetaSyncState } from './types';
