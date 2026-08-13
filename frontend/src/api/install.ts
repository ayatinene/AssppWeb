export interface InstallInfo {
  installUrl: string;
  manifestUrl: string;
}

/**
 * Build the itms-services link for a compiled package.
 *
 * `force` (the default) asks the backend for a manifest that advertises a
 * bundle-version high enough to outrank whatever is installed, so iOS accepts
 * the payload as an upgrade instead of refusing with "Unable to Install".
 * Pass `false` to advertise the package's real CFBundleVersion instead.
 */
export function getInstallInfo(id: string, force = true): InstallInfo {
  const baseUrl = window.location.origin;
  const manifestUrl = `${baseUrl}/api/install/${id}/manifest.plist?force=${force ? "1" : "0"}`;
  const installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
  return { installUrl, manifestUrl };
}
