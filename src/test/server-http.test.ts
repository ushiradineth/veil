import { createServer as createHttpServer } from "node:http";

import { afterEach, describe, expect, test } from "bun:test";

import { __internalServer, startHttpServer, stopHttpServer } from "../server";

describe("HTTP server helpers", () => {
  afterEach(async () => {
    await stopHttpServer();
  });

  async function reservePort(): Promise<number> {
    const reserving = createHttpServer((_req, res) => {
      res.statusCode = 204;
      res.end();
    });
    const port = await new Promise<number>((resolve) => {
      reserving.listen(0, "127.0.0.1", () => {
        const address = reserving.address();
        if (!address || typeof address === "string") {
          throw new Error("Expected TCP address while reserving port");
        }
        resolve(address.port);
      });
    });
    await new Promise<void>((resolve, reject) => {
      reserving.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return port;
  }

  test("HTTP body parser rejects oversized payloads", async () => {
    const oversized = "x".repeat(__internalServer.maxHttpRequestBodyBytes + 1);
    const req = {
      method: "POST",
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield oversized;
      },
    };
    let message = "";
    try {
      await __internalServer.parseRequestBody(req as unknown as never);
    } catch (error) {
      message = String(error);
    }
    expect(message.includes("Request body exceeds")).toBe(true);
  });

  test("HTTP body parser accepts valid JSON payload", async () => {
    const req = {
      method: "POST",
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield '{"ok":true}';
      },
    };
    const parsed = await __internalServer.parseRequestBody(req as unknown as never);
    expect(parsed).toEqual({ ok: true });
  });

  test("HTTP server startup retries after listen failure", async () => {
    const blocker = createHttpServer((_req, res) => {
      res.statusCode = 204;
      res.end();
    });
    await new Promise<void>((resolve) => {
      blocker.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });

    try {
      const address = blocker.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP address for blocker server");
      }

      let firstError = "";
      try {
        await startHttpServer({ host: "127.0.0.1", port: address.port });
      } catch (error) {
        firstError = String(error);
      }
      expect(firstError.length).toBeGreaterThan(0);

      let secondError = "";
      try {
        await startHttpServer({ host: "127.0.0.1", port: address.port });
      } catch (error) {
        secondError = String(error);
      }
      expect(secondError.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  test("HTTP server can start again after stop", async () => {
    const port = await reservePort();

    await startHttpServer({ host: "127.0.0.1", port, path: "/mcp" });
    await stopHttpServer();

    const blocker = createHttpServer((_req, res) => {
      res.statusCode = 204;
      res.end();
    });
    await new Promise<void>((resolve) => {
      blocker.listen(port, "127.0.0.1", () => {
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await startHttpServer({ host: "127.0.0.1", port, path: "/mcp" });
  });
});
