/**
 * YouTube Transcript Service
 * Fetches captions/subtitles from YouTube videos
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Extract YouTube video ID from URL
 * @param {string} url - YouTube video URL
 * @returns {string|null} Video ID or null
 */
export function extractYouTubeVideoId(url) {
  if (!url) return null;
  
  // Match various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
    /youtube\.com\/embed\/([^&\s]+)/,
    /youtube\.com\/v\/([^&\s]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Fetch YouTube video captions using yt-dlp
 * @param {string} videoUrl - YouTube video URL
 * @param {string} language - Language code (default: 'en')
 * @returns {Promise<Object>} Transcript object with content and timestamps
 */
export async function fetchYouTubeCaptions(videoUrl, language = 'en') {
  const videoId = extractYouTubeVideoId(videoUrl);
  
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }
  
  try {
    // Try using yt-dlp to fetch subtitles
    // Note: This requires yt-dlp to be installed on the system
    const command = `yt-dlp --skip-download --write-auto-sub --sub-lang ${language} --sub-format json3 --output "%(id)s" "${videoUrl}"`;
    
    try {
      await execAsync(command);
      
      // Read the generated subtitle file
      const fs = await import('fs');
      const subtitleFile = `${videoId}.${language}.json3`;
      
      if (fs.existsSync(subtitleFile)) {
        const subtitleData = JSON.parse(fs.readFileSync(subtitleFile, 'utf8'));
        
        // Parse the JSON3 format
        const segments = [];
        let fullText = '';
        
        if (subtitleData.events) {
          for (const event of subtitleData.events) {
            if (event.segs) {
              const text = event.segs.map(s => s.utf8).join('');
              const timestamp = formatTimestamp(event.tStartMs / 1000);
              
              segments.push({
                timestamp,
                text: text.trim()
              });
              
              fullText += text + ' ';
            }
          }
        }
        
        // Clean up the subtitle file
        fs.unlinkSync(subtitleFile);
        
        return {
          content: fullText.trim(),
          timestamps: segments,
          language,
          source: 'youtube-auto'
        };
      }
    } catch (ytDlpError) {
      console.error('yt-dlp error:', ytDlpError.message);
      // Fall through to alternative method
    }
    
    // Fallback: Use youtube-transcript package (simpler but less reliable)
    return await fetchWithYouTubeTranscript(videoId, language);
    
  } catch (error) {
    console.error('Error fetching YouTube captions:', error);
    throw new Error(`Failed to fetch captions: ${error.message}`);
  }
}

/**
 * Fallback method using youtube-transcript npm package
 * @param {string} videoId - YouTube video ID
 * @param {string} language - Language code
 * @returns {Promise<Object>} Transcript object
 */
async function fetchWithYouTubeTranscript(videoId, language) {
  try {
    // Dynamic import to avoid issues if package isn't installed
    const { YoutubeTranscript } = await import('youtube-transcript');
    
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: language
    });
    
    const segments = transcript.map(item => ({
      timestamp: formatTimestamp(item.offset / 1000),
      text: item.text
    }));
    
    const fullText = transcript.map(item => item.text).join(' ');
    
    return {
      content: fullText,
      timestamps: segments,
      language,
      source: 'youtube-transcript'
    };
  } catch (error) {
    throw new Error(`YouTube captions not available: ${error.message}`);
  }
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Check if captions are available for a YouTube video
 * @param {string} videoUrl - YouTube video URL
 * @returns {Promise<boolean>} True if captions are available
 */
export async function checkCaptionsAvailable(videoUrl) {
  try {
    await fetchYouTubeCaptions(videoUrl);
    return true;
  } catch (error) {
    return false;
  }
}
