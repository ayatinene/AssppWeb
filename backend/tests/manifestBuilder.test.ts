import { describe, it, expect } from "vitest";
import {
  buildManifest,
  getWhitePng,
  FORCE_UPDATE_BUNDLE_VERSION,
} from "../src/services/manifestBuilder.js";
import type { Software } from "../src/types/index.js";

const mockSoftware: Software = {
  id: 12345,
  bundleID: "com.example.testapp",
  name: "Test App",
  version: "1.0.0",
  artistName: "Test Developer",
  sellerName: "Test Developer Inc.",
  description: "A test application",
  averageUserRating: 4.5,
  userRatingCount: 1000,
  artworkUrl: "https://example.com/icon.png",
  screenshotUrls: [],
  minimumOsVersion: "15.0",
  releaseDate: "2024-01-01",
  primaryGenreName: "Utilities",
};

describe("manifestBuilder", () => {
  describe("buildManifest", () => {
    it("should generate valid plist XML", () => {
      const manifest = buildManifest(
        mockSoftware,
        "https://example.com/payload.ipa",
        "https://example.com/small.png",
        "https://example.com/large.png",
      );

      expect(manifest).toContain('<?xml version="1.0"');
      expect(manifest).toContain("<!DOCTYPE plist");
      expect(manifest).toContain('<plist version="1.0">');
    });

    it("should include software-package asset with correct URL", () => {
      const manifest = buildManifest(
        mockSoftware,
        "https://example.com/payload.ipa",
        "https://example.com/small.png",
        "https://example.com/large.png",
      );

      expect(manifest).toContain("<string>software-package</string>");
      expect(manifest).toContain(
        "<string>https://example.com/payload.ipa</string>",
      );
    });

    it("should include display-image and full-size-image assets", () => {
      const manifest = buildManifest(
        mockSoftware,
        "https://example.com/payload.ipa",
        "https://example.com/small.png",
        "https://example.com/large.png",
      );

      expect(manifest).toContain("<string>display-image</string>");
      expect(manifest).toContain(
        "<string>https://example.com/small.png</string>",
      );
      expect(manifest).toContain("<string>full-size-image</string>");
      expect(manifest).toContain(
        "<string>https://example.com/large.png</string>",
      );
    });

    it("should include correct metadata", () => {
      const manifest = buildManifest(
        mockSoftware,
        "https://example.com/payload.ipa",
        "https://example.com/small.png",
        "https://example.com/large.png",
      );

      expect(manifest).toContain("<key>bundle-identifier</key>");
      expect(manifest).toContain("<string>com.example.testapp</string>");
      expect(manifest).toContain("<key>bundle-version</key>");
      expect(manifest).toContain("<string>1.0.0</string>");
      expect(manifest).toContain("<key>kind</key>");
      expect(manifest).toContain("<string>software</string>");
      expect(manifest).toContain("<key>title</key>");
      expect(manifest).toContain("<string>Test App</string>");
    });

    it("should XML-escape special characters", () => {
      const specialSoftware = {
        ...mockSoftware,
        name: 'Test & <App> "Special"',
        bundleID: "com.example.test",
      };

      const manifest = buildManifest(
        specialSoftware,
        "https://example.com/payload.ipa",
        "https://example.com/small.png",
        "https://example.com/large.png",
      );

      expect(manifest).toContain("Test &amp; &lt;App&gt; &quot;Special&quot;");
      expect(manifest).not.toContain("Test & <App>");
    });
  });

  describe("bundle-version", () => {
    function bundleVersionOf(manifest: string): string {
      const match = manifest.match(
        /<key>bundle-version<\/key>\s*<string>([^<]*)<\/string>/,
      );
      return match ? match[1] : "";
    }

    function build(options?: Parameters<typeof buildManifest>[4]): string {
      return buildManifest(
        mockSoftware,
        "https://example.com/payload.ipa",
        "https://example.com/small.png",
        "https://example.com/large.png",
        options,
      );
    }

    it("advertises the real CFBundleVersion when given one", () => {
      expect(bundleVersionOf(build({ bundleVersion: "2026081201" }))).toBe(
        "2026081201",
      );
    });

    it("falls back to the marketing version for legacy packages", () => {
      // Packages compiled before the build number was recorded have no
      // bundleVersion; the manifest must still name some version.
      expect(bundleVersionOf(build())).toBe("1.0.0");
    });

    it("emits the sentinel when forcing, ignoring the real build number", () => {
      const manifest = build({ bundleVersion: "2026081201", force: true });
      expect(bundleVersionOf(manifest)).toBe(FORCE_UPDATE_BUNDLE_VERSION);
      expect(manifest).not.toContain("2026081201");
    });

    it("uses a sentinel that outranks date-style build numbers", () => {
      // iOS refuses the payload unless the manifest version sorts above the
      // installed app's CFBundleVersion, which is often a 10-digit date.
      const [major] = FORCE_UPDATE_BUNDLE_VERSION.split(".");
      expect(Number(major)).toBeGreaterThan(2999999999);
    });
  });

  describe("getWhitePng", () => {
    it("should return a Buffer", () => {
      const png = getWhitePng();
      expect(Buffer.isBuffer(png)).toBe(true);
    });

    it("should have valid PNG signature", () => {
      const png = getWhitePng();
      // PNG magic bytes: 137 80 78 71 13 10 26 10
      expect(png[0]).toBe(137);
      expect(png[1]).toBe(80); // P
      expect(png[2]).toBe(78); // N
      expect(png[3]).toBe(71); // G
    });

    it("should be non-empty", () => {
      const png = getWhitePng();
      expect(png.length).toBeGreaterThan(0);
    });
  });
});
