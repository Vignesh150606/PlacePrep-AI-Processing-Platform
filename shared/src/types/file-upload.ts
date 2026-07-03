/**
 * Upload constraints the client checks before sending a file, and the
 * server re-checks authoritatively (never trust the frontend check alone).
 */
export interface FileUploadConstraints {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

export const PDF_UPLOAD_CONSTRAINTS: FileUploadConstraints = {
  maxSizeBytes: 25 * 1024 * 1024, // 25MB
  allowedMimeTypes: ["application/pdf"],
};

export interface FileUploadResult {
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
}
