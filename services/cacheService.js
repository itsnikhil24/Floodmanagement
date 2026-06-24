import crypto from "crypto";

/**
 * Simple in-memory LRU-style cache for AI responses.
 *
 * Why in-memory instead of Redis?
 * - Zero extra infrastructure for your current setup
 * - Flood advice answers are mostly static (same question = same answer)
 * - You can swap this for Redis later by just replacing get/set below
 *
 * Cache key = SHA-256 of (userId + normalised query text)
 * TTL       = 10 minutes (flood conditions can change, so we don't cache too long)
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 500; // prevent unbounded memory growth

const store = new Map();

/**
 * Build a deterministic cache key from userId + query.
 * Normalise whitespace & lowercase so "  Flood drainage  " === "flood drainage"
 */
function makeKey(userId, query) {
  const normalised = query.trim().toLowerCase().replace(/\s+/g, " ");
  return crypto
    .createHash("sha256")
    .update(`${userId}::${normalised}`)
    .digest("hex");
}

function get(userId, query) {
  const key = makeKey(userId, query);
  const entry = store.get(key);
  if (!entry) return null;

  const isExpired = Date.now() - entry.createdAt > CACHE_TTL_MS;
  if (isExpired) {
    store.delete(key);
    return null;
  }

  return entry.value; // returns the cached response string
}

function set(userId, query, responseText) {
  // Evict oldest entry when cache is full
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }

  const key = makeKey(userId, query);
  store.set(key, {
    value: responseText,
    createdAt: Date.now(),
  });
}

function invalidate(userId, query) {
  const key = makeKey(userId, query);
  store.delete(key);
}

function stats() {
  return { size: store.size, maxEntries: MAX_ENTRIES, ttlMs: CACHE_TTL_MS };
}

export const responseCache = { get, set, invalidate, stats };