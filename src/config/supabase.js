/**
 * Supabase Storage Configuration
 * Handles video file uploads and management
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role key for admin operations
const supabaseUrl = process.env.SUPABASE_URL || 'https://qfgjyyqntoejmhwuncll.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
  console.warn('⚠️ SUPABASE_SERVICE_KEY not found in environment variables');
  console.warn('Video upload feature will not work until configured');
  console.warn('Get your service key from: Supabase Dashboard → Settings → API');
}

export const supabase = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

/**
 * Upload video file to Supabase Storage
 * @param {Buffer} fileBuffer - Video file buffer from multer
 * @param {string} fileName - Original file name
 * @param {string} mimeType - File MIME type (e.g., 'video/mp4')
 * @returns {Promise<string>} - Public URL of uploaded video
 * @throws {Error} - If upload fails
 */
export async function uploadVideo(fileBuffer, fileName, mimeType) {
  if (!supabase) {
    throw new Error('Supabase client not initialized. Check SUPABASE_SERVICE_KEY environment variable.');
  }

  try {
    // Generate unique file name to prevent conflicts
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${timestamp}-${randomString}.${fileExtension}`;
    
    console.log(`[Video Upload] Starting upload: ${fileName} → ${uniqueFileName}`);
    console.log(`[Video Upload] Size: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`[Video Upload] Type: ${mimeType}`);

    // Upload to Supabase Storage bucket 'lesson-videos'
    const { data, error } = await supabase.storage
      .from('lesson-videos')
      .upload(uniqueFileName, fileBuffer, {
        contentType: mimeType,
        cacheControl: '3600', // Cache for 1 hour
        upsert: false // Don't overwrite existing files
      });

    if (error) {
      console.error('[Video Upload] Error:', error);
      throw new Error(`Video upload failed: ${error.message}`);
    }

    console.log('[Video Upload] Upload successful:', data.path);

    // Get public URL for the uploaded video
    const { data: { publicUrl } } = supabase.storage
      .from('lesson-videos')
      .getPublicUrl(uniqueFileName);

    console.log('[Video Upload] Public URL:', publicUrl);

    return publicUrl;
  } catch (error) {
    console.error('[Video Upload] Unexpected error:', error);
    throw error;
  }
}

/**
 * Delete video file from Supabase Storage
 * @param {string} videoUrl - Public URL of the video to delete
 * @returns {Promise<boolean>} - True if deleted successfully, false otherwise
 */
export async function deleteVideo(videoUrl) {
  if (!supabase) {
    console.warn('[Video Delete] Supabase client not initialized');
    return false;
  }

  try {
    // Extract file name from URL
    // URL format: https://[project].supabase.co/storage/v1/object/public/lesson-videos/[filename]
    const urlParts = videoUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    console.log(`[Video Delete] Deleting: ${fileName}`);

    const { error } = await supabase.storage
      .from('lesson-videos')
      .remove([fileName]);

    if (error) {
      console.error('[Video Delete] Error:', error);
      return false;
    }

    console.log('[Video Delete] Deleted successfully:', fileName);
    return true;
  } catch (error) {
    console.error('[Video Delete] Unexpected error:', error);
    return false;
  }
}

/**
 * Check if Supabase Storage is properly configured
 * @returns {Promise<boolean>} - True if configured and accessible
 */
export async function checkStorageHealth() {
  if (!supabase) {
    return false;
  }

  try {
    // Try to list files in bucket (should work even if empty)
    const { data, error } = await supabase.storage
      .from('lesson-videos')
      .list('', {
        limit: 1
      });

    if (error) {
      console.error('[Storage Health] Error:', error.message);
      return false;
    }

    console.log('[Storage Health] ✅ Storage is healthy');
    return true;
  } catch (error) {
    console.error('[Storage Health] Unexpected error:', error);
    return false;
  }
}

// Export for use in other modules
export default {
  uploadVideo,
  deleteVideo,
  checkStorageHealth
};
