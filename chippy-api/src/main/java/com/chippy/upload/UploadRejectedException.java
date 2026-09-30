package com.chippy.upload;

/** A file that failed the allowlist. The message is safe to show. */
public class UploadRejectedException extends RuntimeException {

    public UploadRejectedException(String message) {
        super(message);
    }
}
