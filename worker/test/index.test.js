import { describe, expect, it, vi } from "vitest";
import { handleRequest, validateBooking } from "../src/index.js";

const origin = "https://bhattakabiraj.com.np";
const futureBooking = {
  fullName: "Kabiraj Bhatta",
  email: "kabiraj@example.com",
  phone: "+61 425 192 976",
  date: "2099-08-30",
  time: "10:30",
  meetingType: "Video",
  message: "I would like to discuss a possible website project.",
  website: "",
};

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN: origin,
    TIME_ZONE: "Australia/Sydney",
    WHATSAPP_ACCESS_TOKEN: "test-only-token",
    WHATSAPP_API_VERSION: "v23.0",
    WHATSAPP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_RECIPIENT_NUMBER: "61425192976",
    WHATSAPP_TEMPLATE_LANGUAGE: "en_US",
    WHATSAPP_TEMPLATE_NAME: "new_meeting_request",
    MEETING_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ...overrides,
  };
}

function bookingRequest(payload = futureBooking, requestOrigin = origin) {
  return new Request(`${origin}/api/meetings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: requestOrigin,
    },
    body: JSON.stringify(payload),
  });
}

describe("meeting booking Worker", () => {
  it("rejects dates in the past in the Australia/Sydney timezone", () => {
    expect(() => validateBooking({ ...futureBooking, date: "2000-01-01" })).toThrow(
      "Choose a future date and time in Australia/Sydney."
    );
  });

  it("rejects requests from another origin", async () => {
    const response = await handleRequest(
      bookingRequest(futureBooking, "https://example.com"),
      makeEnv()
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("returns a clear unavailable state when WhatsApp secrets are missing", async () => {
    const response = await handleRequest(
      bookingRequest(),
      makeEnv({ WHATSAPP_ACCESS_TOKEN: "" })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("rate limits repeated requests before contacting Meta", async () => {
    const fetchMock = vi.fn();
    const response = await handleRequest(
      bookingRequest(),
      makeEnv({ MEETING_RATE_LIMITER: { limit: vi.fn(async () => ({ success: false })) } }),
      fetchMock
    );

    expect(response.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an approved template payload to Meta and confirms success", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const response = await handleRequest(bookingRequest(), makeEnv(), fetchMock);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/123456789/messages");
    expect(options.headers.Authorization).toMatch(/^Bearer /);

    const body = JSON.parse(options.body);
    expect(body.to).toBe("61425192976");
    expect(body.template.name).toBe("new_meeting_request");
    expect(body.template.components[0].parameters).toHaveLength(7);
  });

  it("silently accepts the honeypot without sending a WhatsApp message", async () => {
    const fetchMock = vi.fn();
    const response = await handleRequest(
      bookingRequest({ ...futureBooking, website: "spam.example" }),
      makeEnv(),
      fetchMock
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

