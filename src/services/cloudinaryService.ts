import { v2 as cloudinary } from 'cloudinary';

let isConfigured = false;

export function getCloudinary() {
  if (!isConfigured) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      console.warn('Cloudinary credentials missing. Image uploads will fail.');
      return null;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
    isConfigured = true;
  }
  return cloudinary;
}

export async function uploadImage(fileBase64: string): Promise<string> {
  const client = getCloudinary();
  if (!client) {
    throw new Error('Cloudinary not configured');
  }

  try {
    const result = await client.uploader.upload(fileBase64, {
      folder: 'greenhouse_marketplace',
    });
    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}
