export interface FileUploadConstraints {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

export const PDF_UPLOAD_CONSTRAINTS: FileUploadConstraints = {
  maxSizeBytes: 25 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf"],
};

export interface FileUploadResult {
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
}
