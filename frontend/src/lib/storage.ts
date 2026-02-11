import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

const STORAGE_BUCKET = 'documents';

/**
 * Upload file to Supabase Storage
 * @param file File buffer
 * @param fileName Original file name
 * @param folder Optional folder path
 * @returns Storage path
 */
export async function uploadFile(
  file: Buffer,
  fileName: string,
  folder?: string
): Promise<string> {
  const supabase = getSupabaseClient();
  
  // Generate unique file name
  const fileExt = fileName.split('.').pop();
  const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const folderPath = folder || 'uncategorized';
  const filePath = `${folderPath}/${uniqueFileName}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, {
      contentType: 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    console.error('Storage upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return filePath;
}

/**
 * Download file from Supabase Storage
 * @param filePath Storage path
 * @returns File buffer
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(filePath);

  if (error) {
    console.error('Storage download error:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Delete file from Supabase Storage
 * @param filePath Storage path
 */
export async function deleteFile(filePath: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error('Storage delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Get signed URL for file download (expires in 1 hour)
 * @param filePath Storage path
 * @returns Signed URL
 */
export async function getSignedUrl(filePath: string): Promise<string> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, 3600); // 1 hour expiration

  if (error) {
    console.error('Storage signed URL error:', error);
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}
