export interface FileUploadConstraints {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

export const PDF_UPLOAD_CONSTRAINTS: FileUploadConstraints = {
  maxSizeBytes: 25 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf"],
};

/** Phase 6: direct image upload (phone photo / screenshot of a question
 * paper) -- see server/app/core/config.py's ALLOWED_IMAGE_MIME_TYPES /
 * MAX_IMAGE_SIZE_BYTES, which this must stay in sync with. Images are
 * capped smaller than PDFs since a phone photo rarely needs to be 25MB
 * and a lower cap keeps the OCR-only extraction path (image_text.py)
 * fast. */
export const IMAGE_UPLOAD_CONSTRAINTS: FileUploadConstraints = {
  maxSizeBytes: 15 * 1024 * 1024,
  allowedMimeTypes: ["image/png", "image/jpeg", "image/jpg"],
};

/** What the PDF Library upload dropzone should actually accept now that
 * the backend supports both -- see FUNCTIONAL_RECOMMENDATIONS.md for the
 * note that the dropzone's `accept` attribute still needs loosening to
 * `application/pdf,image/png,image/jpeg` to let a user pick an image in
 * their file browser; this constant exists so that change (whenever the
 * frontend session picks it up) has a single source of truth instead of a
 * hardcoded string. */
export const UPLOAD_CONSTRAINTS: FileUploadConstraints = {
  maxSizeBytes: PDF_UPLOAD_CONSTRAINTS.maxSizeBytes,
  allowedMimeTypes: [
    ...PDF_UPLOAD_CONSTRAINTS.allowedMimeTypes,
    ...IMAGE_UPLOAD_CONSTRAINTS.allowedMimeTypes,
  ],
};

export interface FileUploadResult {
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
}
