import { describe, test, expect } from "bun:test";
import { authenticate } from "./auth";

describe("authenticate", () => {
  const passphrase = "my-secret";

  test("valid passphrase with empty username", () => {
    const headers = { "proxy-authorization": `Basic ${btoa(":" + passphrase)}` };
    expect(authenticate(headers, passphrase)).toBe(true);
  });

  test("valid passphrase with username", () => {
    const headers = { "proxy-authorization": `Basic ${btoa("user:" + passphrase)}` };
    expect(authenticate(headers, passphrase)).toBe(true);
  });

  test("invalid passphrase", () => {
    const headers = { "proxy-authorization": `Basic ${btoa(":wrong")}` };
    expect(authenticate(headers, passphrase)).toBe(false);
  });

  test("missing header", () => {
    expect(authenticate({}, passphrase)).toBe(false);
  });

  test("malformed base64", () => {
    const headers = { "proxy-authorization": "Basic !!invalid!!" };
    expect(authenticate(headers, passphrase)).toBe(false);
  });

  test("non-Basic scheme", () => {
    const headers = { "proxy-authorization": "Bearer some-token" };
    expect(authenticate(headers, passphrase)).toBe(false);
  });

  test("missing colon in decoded value", () => {
    const headers = { "proxy-authorization": `Basic ${btoa("no-colon-here")}` };
    expect(authenticate(headers, passphrase)).toBe(false);
  });
});
