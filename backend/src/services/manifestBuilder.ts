import type { Software } from "../types/index.js";

export interface ManifestOptions {
  /**
   * Real CFBundleVersion of the packaged app, read from its Info.plist.
   * Falls back to the marketing version when unknown (packages compiled
   * before this field was recorded).
   */
  bundleVersion?: string;
  /**
   * Advertise a bundle-version that outranks whatever is already installed so
   * iOS treats the payload as an upgrade instead of rejecting it.
   */
  force?: boolean;
}

/**
 * iOS compares the manifest's `bundle-version` against the installed app's
 * CFBundleVersion to decide whether an itms-services payload is a valid
 * upgrade. Reinstalling the same version, or installing an older one (the
 * whole point of picking a version from the version history), loses that
 * comparison and iOS refuses with "Unable to Install".
 *
 * This sentinel wins every comparison — it outranks 10-digit date-style build
 * numbers such as 2026081201. It only steers that upgrade decision; the payload
 * still installs whatever version it actually contains.
 */
export const FORCE_UPDATE_BUNDLE_VERSION = "9999999999.9999.9999";

export function buildManifest(
  software: Software,
  payloadUrl: string,
  displayImageSmallUrl: string,
  displayImageLargeUrl: string,
  options: ManifestOptions = {},
): string {
  const bundleVersion = options.force
    ? FORCE_UPDATE_BUNDLE_VERSION
    : (options.bundleVersion ?? software.version);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${escapeXml(payloadUrl)}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>display-image</string>
                    <key>url</key>
                    <string>${escapeXml(displayImageSmallUrl)}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>full-size-image</string>
                    <key>url</key>
                    <string>${escapeXml(displayImageLargeUrl)}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${escapeXml(software.bundleID)}</string>
                <key>bundle-version</key>
                <string>${escapeXml(bundleVersion)}</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${escapeXml(software.name)}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Minimal valid 1x1 white PNG (hardcoded)
// This is the smallest valid PNG: 8-byte signature + IHDR + IDAT + IEND
const MINIMAL_WHITE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12P4////DwAJBgMBMHREuwAAAABJRU5ErkJggg==",
  "base64",
);

export function getWhitePng(): Buffer {
  return MINIMAL_WHITE_PNG;
}
