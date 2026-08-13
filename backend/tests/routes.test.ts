import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express, { Request, Response } from "express";
import request from "supertest";
import { createServer, Server } from "http";
import settingsRoutes from "../src/routes/settings.js";
import installRoutes from "../src/routes/install.js";
import { getBaseUrl } from "../src/routes/install.js";
import downloadRoutes from "../src/routes/downloads.js";
import { FORCE_UPDATE_BUNDLE_VERSION } from "../src/services/manifestBuilder.js";
import type { DownloadTask, Software } from "../src/types/index.js";

// The install routes look tasks up through the download manager. Keep the rest
// of that module real so the download-route tests below are unaffected.
const { installableTasks } = vi.hoisted(() => ({
  installableTasks: [] as DownloadTask[],
}));

vi.mock("../src/services/downloadManager.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/services/downloadManager.js")>();
  return { ...actual, getAllTasks: () => installableTasks };
});

function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api", settingsRoutes);
  app.use("/api", installRoutes);
  app.use("/api", downloadRoutes);
  return app;
}

describe("Settings Route", () => {
  const app = createApp();

  it("GET /api/settings should return server info", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("dataDir");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("downloadThreads");
  });
});

describe("Downloads Route", () => {
  const app = createApp();

  it("GET /api/downloads should return empty array initially", async () => {
    const res = await request(app).get("/api/downloads");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /api/downloads should reject missing fields", async () => {
    const res = await request(app)
      .post("/api/downloads")
      .send({ software: { id: 1 } }); // Missing accountHash, downloadURL, sinfs

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/downloads/:id should return 400 without accountHash", async () => {
    const res = await request(app).get("/api/downloads/nonexistent-id");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("accountHash");
  });

  it("GET /api/downloads/:id should return 404 with valid accountHash", async () => {
    const res = await request(app).get(
      "/api/downloads/nonexistent-id?accountHash=abcdef1234567890",
    );
    expect(res.status).toBe(404);
  });

  it("POST /api/downloads/:id/pause should return 400 without accountHash", async () => {
    const res = await request(app).post("/api/downloads/nonexistent-id/pause");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("accountHash");
  });

  it("POST /api/downloads/:id/resume should return 400 without accountHash", async () => {
    const res = await request(app).post("/api/downloads/nonexistent-id/resume");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("accountHash");
  });

  it("DELETE /api/downloads/:id should return 400 without accountHash", async () => {
    const res = await request(app).delete("/api/downloads/nonexistent-id");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("accountHash");
  });

  it("DELETE /api/downloads/:id should return 404 with valid accountHash", async () => {
    const res = await request(app).delete(
      "/api/downloads/nonexistent-id?accountHash=abcdef1234567890",
    );
    expect(res.status).toBe(404);
  });
});

describe("Install Route", () => {
  const app = createApp();

  it("GET /api/install/:id/manifest.plist should return 404 for non-existent", async () => {
    const res = await request(app).get(
      "/api/install/nonexistent-id/manifest.plist",
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/install/:id/payload.ipa should return 404 for non-existent", async () => {
    const res = await request(app).get(
      "/api/install/nonexistent-id/payload.ipa",
    );
    expect(res.status).toBe(404);
  });

  it("GET /api/install/:id/icon-small.png should return a PNG", async () => {
    const res = await request(app).get("/api/install/any-id/icon-small.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    // Check PNG magic bytes
    expect(res.body[0]).toBe(137);
    expect(res.body[1]).toBe(80); // P
    expect(res.body[2]).toBe(78); // N
    expect(res.body[3]).toBe(71); // G
  });

  it("GET /api/install/:id/icon-large.png should return a PNG", async () => {
    const res = await request(app).get("/api/install/any-id/icon-large.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
  });
});

describe("Install Route — manifest versions", () => {
  const app = createApp();

  const software: Software = {
    id: 12345,
    bundleID: "com.example.testapp",
    name: "Test App",
    version: "8.0.61",
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

  function addTask(id: string, bundleVersion?: string) {
    installableTasks.push({
      id,
      software,
      bundleVersion,
      accountHash: "abcdef1234567890",
      downloadURL: "",
      sinfs: [],
      status: "completed",
      progress: 100,
      speed: "0 B/s",
      filePath: `/tmp/${id}.ipa`,
      createdAt: new Date().toISOString(),
    });
  }

  function bundleVersionOf(manifest: string): string {
    const match = manifest.match(
      /<key>bundle-version<\/key>\s*<string>([^<]*)<\/string>/,
    );
    return match ? match[1] : "";
  }

  beforeAll(() => {
    addTask("forced-task", "2026081201");
    addTask("legacy-task");
  });

  afterAll(() => {
    installableTasks.length = 0;
  });

  it("forces the upgrade by default", async () => {
    const res = await request(app).get(
      "/api/install/forced-task/manifest.plist",
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("xml");
    expect(bundleVersionOf(res.text)).toBe(FORCE_UPDATE_BUNDLE_VERSION);
  });

  it("advertises the real CFBundleVersion with ?force=0", async () => {
    const res = await request(app).get(
      "/api/install/forced-task/manifest.plist?force=0",
    );
    expect(res.status).toBe(200);
    expect(bundleVersionOf(res.text)).toBe("2026081201");
  });

  it("falls back to the marketing version for packages without a build", async () => {
    const res = await request(app).get(
      "/api/install/legacy-task/manifest.plist?force=0",
    );
    expect(res.status).toBe(200);
    expect(bundleVersionOf(res.text)).toBe("8.0.61");
  });

  it("returns both the forced and strict install URLs", async () => {
    const res = await request(app).get("/api/install/forced-task/url");
    expect(res.status).toBe(200);
    expect(res.body.installUrl).toContain("itms-services://");
    expect(res.body.manifestUrl).not.toContain("force=0");
    expect(res.body.strictManifestUrl).toContain("force=0");
    expect(res.body.strictInstallUrl).toContain(
      encodeURIComponent(res.body.strictManifestUrl),
    );
  });
});

describe("getBaseUrl", () => {
  function fakeReq(headers: Record<string, string>, secure = false) {
    return { headers, secure } as unknown as Request;
  }

  it("uses Host header with port when present", () => {
    const url = getBaseUrl(
      fakeReq({ host: "example.com:8443", "x-forwarded-proto": "https" }),
    );
    expect(url).toBe("https://example.com:8443");
  });

  it("uses X-Forwarded-Port when Host lacks port", () => {
    const url = getBaseUrl(
      fakeReq({
        host: "example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-port": "8443",
      }),
    );
    expect(url).toBe("https://example.com:8443");
  });

  it("omits port when X-Forwarded-Port is default 443 for HTTPS", () => {
    const url = getBaseUrl(
      fakeReq({
        host: "example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-port": "443",
      }),
    );
    expect(url).toBe("https://example.com");
  });

  it("omits port when X-Forwarded-Port is default 80 for HTTP", () => {
    const url = getBaseUrl(
      fakeReq({
        host: "example.com",
        "x-forwarded-port": "80",
      }),
    );
    expect(url).toBe("http://example.com");
  });

  it("does not override port already in Host header", () => {
    const url = getBaseUrl(
      fakeReq({
        host: "example.com:9000",
        "x-forwarded-proto": "https",
        "x-forwarded-port": "8443",
      }),
    );
    expect(url).toBe("https://example.com:9000");
  });

  it("falls back to http when no forwarded proto and not secure", () => {
    const url = getBaseUrl(fakeReq({ host: "example.com" }));
    expect(url).toBe("http://example.com");
  });

  it("uses https when req.secure is true", () => {
    const url = getBaseUrl(fakeReq({ host: "example.com" }, true));
    expect(url).toBe("https://example.com");
  });

  it("sanitizes invalid characters in Host header", () => {
    const url = getBaseUrl(fakeReq({ host: "example.com/<script>" }));
    expect(url).toBe("http://example.comscript");
  });

  it("ignores non-numeric X-Forwarded-Port", () => {
    const url = getBaseUrl(
      fakeReq({
        host: "example.com",
        "x-forwarded-proto": "https",
        "x-forwarded-port": "abc",
      }),
    );
    expect(url).toBe("https://example.com");
  });
});
