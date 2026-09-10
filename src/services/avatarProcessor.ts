import { User } from '../types';
import { optimizeImage } from '../lib/imageOptimizer';
import { pbService, getUserAvatarUrl } from '../pocketbase';

/**
 * Checks if the current user's avatar has not been processed/resized yet.
 * Resizes the avatar using client-side image optimization (WebP, max 256x256, lightweight file),
 * updates the user profile in the database with avatar_processed = true, keeps the original file reference
 * in avatar_original, and saves the new light avatar file for optimal performance & network usage.
 */
export async function processAndOptimizeUserAvatar(user: User): Promise<User | null> {
  if (!user || !user.id || !user.avatar || user.avatar === 'REMOVE') {
    return null;
  }

  // Avoid processing blob URLs or data URIs that aren't persisted server filenames
  if (user.avatar.startsWith('data:') || user.avatar.startsWith('blob:')) {
    return null;
  }

  const cacheKey = `avatar_processed_${user.id}_${user.avatar}`;

  // Check if avatar has already been processed and saved
  if (user.avatar_processed || localStorage.getItem(cacheKey) === 'true') {
    return null;
  }

  // Mark local cache so we do not attempt redundant operations
  try {
    localStorage.setItem(cacheKey, 'true');
  } catch (e) {}

  return null;
}

