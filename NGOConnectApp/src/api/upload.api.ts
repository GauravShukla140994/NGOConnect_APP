/**
 * upload.api.ts — File upload to Azure Blob via /media/upload
 * module param matches AppConfig.UPLOAD_MODULES keys (org-logos, user-photos, etc.)
 */
import apiClient from './apiClient';
import { ApiResponse } from '../types/api.types';

export interface UploadResult {
  fileUrl:    string | null;
  fileKey:    string | null;
  fileName:   string;
  fileSizeKb?: number;
  isPrivate?: boolean;
}

export const uploadFile = async (
  localUri: string,
  fileName: string,
  mimeType: string,
  module: string,
): Promise<string> => {
  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    name: fileName,
    type: mimeType,
  } as any);

  // IMPORTANT: Set Content-Type to undefined (not 'multipart/form-data') so that
  // axios does NOT send the apiClient default 'application/json'. React Native's
  // native layer will then set 'multipart/form-data; boundary=...' automatically.
  // Manually setting 'multipart/form-data' omits the boundary and breaks parsing.
  const res = await apiClient.post<ApiResponse<UploadResult>>(
    `/media/upload?module=${module}`,
    formData,
    { headers: { 'Content-Type': undefined } },
  );

  // Private modules (user-documents, org-documents, certificates) return fileKey.
  // Public modules (user-photos, org-logos, etc.) return fileUrl.
  const storageRef = res.data?.data?.fileUrl ?? res.data?.data?.fileKey;
  if (res.data?.isSuccess && storageRef) {
    return storageRef;
  }
  throw new Error(res.data?.message ?? 'Upload failed');
};

/**
 * Get a temporary signed URL for a private document.
 * fileKey is what's stored in DB for private modules (user-documents, org-documents, etc.)
 * Returns a short-lived HTTPS URL valid for 15 minutes.
 */
export const getSignedUrl = async (fileKey: string): Promise<string> => {
  const res = await apiClient.get<ApiResponse<{ signedUrl: string; expiresInMinutes: number }>>(
    `/media/signed-url?key=${encodeURIComponent(fileKey)}`,
  );
  if (res.data?.isSuccess && res.data.data?.signedUrl) {
    return res.data.data.signedUrl;
  }
  throw new Error(res.data?.message ?? 'Could not generate download link');
};
