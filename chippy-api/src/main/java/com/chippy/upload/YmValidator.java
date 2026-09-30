package com.chippy.upload;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * YM5! and YM6! dumps, plus LHA level-0 wrappers.
 * Decompression stops at {@link #MAX_UNCOMPRESSED} bytes.
 */
public final class YmValidator {

    public static final int MAX_UPLOAD = 8_000_000;
    public static final int MAX_UNCOMPRESSED = 4_000_000;

    private YmValidator() {
    }

    public static byte[] canonicalize(byte[] body) {
        if (body.length == 0 || body.length > MAX_UPLOAD) {
            throw new UploadRejectedException("YM file is empty or larger than 8 MB.");
        }
        byte[] payload = body;
        if (looksLikeLha(body)) {
            payload = Lha.unpack(body, MAX_UNCOMPRESSED);
        }
        if (!isYmMagic(payload)) {
            throw new UploadRejectedException("Only uncompressed YM5 and YM6 files can be opened.");
        }
        String check = new String(payload, 4, Math.min(8, payload.length - 4), StandardCharsets.US_ASCII);
        if (!"LeOnArD!".equals(check)) {
            throw new UploadRejectedException("The YM check string is missing.");
        }
        return Arrays.copyOf(payload, payload.length);
    }

    static boolean isYmMagic(byte[] payload) {
        if (payload.length < 12) {
            return false;
        }
        String magic = new String(payload, 0, 4, StandardCharsets.US_ASCII);
        return "YM5!".equals(magic) || "YM6!".equals(magic);
    }

    private static boolean looksLikeLha(byte[] body) {
        if (body.length < 21) {
            return false;
        }
        int headerSize = body[0] & 0xff;
        if (headerSize < 20 || headerSize + 2 > body.length) {
            return false;
        }
        String method = new String(body, 2, 5, StandardCharsets.US_ASCII);
        return method.startsWith("-lh") && method.endsWith("-");
    }

    /** Level-0 LHA. lh0 is stored. Other methods are rejected rather than guessed. */
    static final class Lha {
        private Lha() {
        }

        static byte[] unpack(byte[] archive, int maxOut) {
            int headerSize = archive[0] & 0xff;
            String method = new String(archive, 2, 5, StandardCharsets.US_ASCII);
            long compressed = readUint32(archive, 7);
            long original = readUint32(archive, 11);
            if (original < 0 || original > maxOut) {
                throw new UploadRejectedException("YM archive is larger than the allowed size.");
            }
            int nameLength = archive[21] & 0xff;
            int dataStart = 2 + headerSize;
            if (dataStart > archive.length || compressed > archive.length - dataStart) {
                throw new UploadRejectedException("YM archive header does not match its body.");
            }
            if (!"-lh0-".equals(method)) {
                throw new UploadRejectedException("Only stored LHA (lh0) and raw YM6 are accepted in this build.");
            }
            ByteArrayInputStream input = new ByteArrayInputStream(archive, dataStart, (int) compressed);
            ByteArrayOutputStream output = new ByteArrayOutputStream((int) original);
            byte[] buffer = new byte[8192];
            int remaining = (int) original;
            while (remaining > 0) {
                int read;
                try {
                    read = input.read(buffer, 0, Math.min(buffer.length, remaining));
                } catch (Exception exception) {
                    throw new UploadRejectedException("YM archive could not be read.");
                }
                if (read < 0) {
                    throw new UploadRejectedException("YM archive ended early.");
                }
                output.write(buffer, 0, read);
                remaining -= read;
                if (output.size() > maxOut) {
                    throw new UploadRejectedException("YM archive is larger than the allowed size.");
                }
            }
            return output.toByteArray();
        }

        private static long readUint32(byte[] data, int offset) {
            return (data[offset] & 0xffL)
                    | ((data[offset + 1] & 0xffL) << 8)
                    | ((data[offset + 2] & 0xffL) << 16)
                    | ((data[offset + 3] & 0xffL) << 24);
        }
    }
}
