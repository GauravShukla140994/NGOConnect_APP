/**
 * upload.api.ts — File upload to Azure Blob via /media/upload
 * module param matches AppConfig.UPLOAD_MODULES keys (org-logos, user-photos, etc.)
 */
import apiClient from './apiClient';
import { ApiResponse } from '../types/api.types';

export interface UploadResult {
  fileUrl: string;
  fileName: string;
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

  if (res.data?.isSuccess && res.data.data?.fileUrl) {
    return res.data.data.fileUrl;
  }
  throw new Error(res.data?.message ?? 'Upload failed');
};
