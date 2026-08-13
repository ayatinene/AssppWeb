import { describe, it, expect } from "vitest";
import { getInstallInfo } from "../../src/api/install";

function manifestUrlOf(installUrl: string): string {
  const encoded = installUrl.replace(
    "itms-services://?action=download-manifest&url=",
    "",
  );
  return decodeURIComponent(encoded);
}

describe("api/install", () => {
  it("forces the upgrade by default", () => {
    const info = getInstallInfo("abc");
    expect(info.manifestUrl).toContain("/api/install/abc/manifest.plist");
    expect(info.manifestUrl).toContain("force=1");
  });

  it("asks for the real build number when force is off", () => {
    const info = getInstallInfo("abc", false);
    expect(info.manifestUrl).toContain("force=0");
  });

  it("wraps the manifest URL in an itms-services link", () => {
    const info = getInstallInfo("abc", false);
    expect(info.installUrl.startsWith("itms-services://")).toBe(true);
    // The query string must survive encoding, or iOS fetches the wrong URL.
    expect(manifestUrlOf(info.installUrl)).toBe(info.manifestUrl);
    expect(info.installUrl).not.toContain("?force=0");
  });
});
