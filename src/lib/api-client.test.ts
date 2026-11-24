import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError, resolveApiAssetUrl } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("API transport", () => {
  it("preserves Headers instances and sends cookies only to the same origin", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await apiRequest("/api/test", { headers: new Headers({ "X-Test": "yes" }) })).toBeNull();
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(fetcher.mock.calls[0]![1].headers.get("X-Test")).toBe("yes");
  });
  it("reads ASP.NET validation problem responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errors: { Email: ["Invalid email"] } }), {
          status: 400,
          headers: { "content-type": "application/problem+json" },
        }),
      ),
    );
    await expect(apiRequest("/api/orders")).rejects.toThrow("Invalid email");
  });
  it("does not expose proxy HTML errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>private failure</html>", { status: 502 })),
    );
    await expect(apiRequest("/api/products")).rejects.toMatchObject({ status: 502 });
  });
  it("reports an offline connection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(apiRequest("/api/products")).rejects.toMatchObject({ status: 0 });
  });
  it("times out and aborts the request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener("abort", () => reject(new Error("aborted"))),
          ),
      ),
    );
    const pending = expect(apiRequest("/api/products", {}, 30)).rejects.toBeInstanceOf(ApiError);
    await vi.advanceTimersByTimeAsync(31);
    await pending;
  });
  it("accepts API product images and rejects foreign or executable addresses", () => {
    expect(resolveApiAssetUrl("/api/product-images/image.webp")).toBe(
      "/api/product-images/image.webp",
    );
    expect(resolveApiAssetUrl("javascript:alert(1)")).toBeNull();
    expect(resolveApiAssetUrl("//evil.test/image.webp")).toBeNull();
    expect(resolveApiAssetUrl("https://evil.test/image.webp")).toBeNull();
  });
});
