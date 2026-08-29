const BOOKING_PATH = "/api/meetings";
const MAX_BODY_BYTES = 12_000;
const REQUIRED_TIME_ZONE = "Australia/Sydney";
const MEETING_TYPES = new Set(["Phone", "Video", "In Person"]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env, fetch);
  },
};

export async function handleRequest(request, env, fetchImpl = fetch) {
  const requestId = crypto.randomUUID();
  const allowedOrigin = env.ALLOWED_ORIGIN;
  const origin = request.headers.get("Origin");
  const url = new URL(request.url);

  if (url.pathname !== BOOKING_PATH) {
    return jsonResponse(404, { ok: false, message: "Not found." }, origin, allowedOrigin);
  }

  if (!allowedOrigin || origin !== allowedOrigin) {
    return jsonResponse(403, { ok: false, message: "Request origin is not allowed." });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: responseHeaders(origin, allowedOrigin, {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Max-Age": "86400",
      }),
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      405,
      { ok: false, message: "Only POST requests are accepted." },
      origin,
      allowedOrigin,
      { Allow: "POST, OPTIONS" }
    );
  }

  try {
    ensureConfigured(env);

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new HttpError(415, "Send booking details as JSON.");
    }

    const payload = await readJsonBody(request, MAX_BODY_BYTES);
    const booking = validateBooking(payload, new Date());

    if (booking.website) {
      return jsonResponse(
        200,
        { ok: true, message: "Your meeting request was sent. Kabiraj will contact you to confirm the time." },
        origin,
        allowedOrigin
      );
    }

    const rateLimit = await env.MEETING_RATE_LIMITER.limit({ key: booking.email });
    if (!rateLimit.success) {
      throw new HttpError(429, "Too many meeting requests. Please wait a minute and try again.");
    }

    await sendWhatsAppNotification(booking, env, fetchImpl);

    console.log(JSON.stringify({
      event: "meeting_request_sent",
      requestId,
      meetingType: booking.meetingType,
    }));

    return jsonResponse(
      200,
      { ok: true, message: "Your meeting request was sent. Kabiraj will contact you to confirm the time." },
      origin,
      allowedOrigin
    );
  } catch (error) {
    if (error instanceof HttpError) {
      console.warn(JSON.stringify({
        event: "meeting_request_rejected",
        requestId,
        status: error.status,
      }));
      return jsonResponse(error.status, { ok: false, message: error.message }, origin, allowedOrigin);
    }

    console.error(JSON.stringify({
      event: "meeting_request_failed",
      requestId,
      error: error instanceof Error ? error.name : "UnknownError",
    }));
    return jsonResponse(
      502,
      { ok: false, message: "Your request could not be delivered. Please try again or use the contact form." },
      origin,
      allowedOrigin
    );
  }
}

export function validateBooking(payload, now = new Date()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Please provide valid booking details.");
  }

  const website = optionalString(payload.website, 160);
  const fullName = requiredString(payload.fullName, "Full name", 2, 100);
  const email = requiredString(payload.email, "Email", 5, 254).toLowerCase();
  const phone = requiredString(payload.phone, "Phone number", 7, 30);
  const date = requiredString(payload.date, "Preferred date", 10, 10);
  const time = requiredString(payload.time, "Preferred time", 5, 5);
  const meetingType = requiredString(payload.meetingType, "Meeting type", 4, 20);
  const message = requiredString(payload.message, "Message", 10, 350);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }

  if (!/^[0-9+().\s-]{7,30}$/.test(phone)) {
    throw new HttpError(400, "Enter a valid phone number.");
  }

  if (!isValidDate(date)) {
    throw new HttpError(400, "Choose a valid preferred date.");
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new HttpError(400, "Choose a valid preferred time.");
  }

  if (!MEETING_TYPES.has(meetingType)) {
    throw new HttpError(400, "Choose Phone, Video or In Person for the meeting type.");
  }

  const sydneyNow = getZonedDateTime(now, REQUIRED_TIME_ZONE);
  if (date < sydneyNow.date || (date === sydneyNow.date && time <= sydneyNow.time)) {
    throw new HttpError(400, "Choose a future date and time in Australia/Sydney.");
  }

  return { fullName, email, phone, date, time, meetingType, message, website };
}

async function sendWhatsAppNotification(booking, env, fetchImpl) {
  const endpoint = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: env.WHATSAPP_RECIPIENT_NUMBER,
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: booking.fullName },
            { type: "text", text: booking.email },
            { type: "text", text: booking.phone },
            { type: "text", text: booking.date },
            { type: "text", text: `${booking.time} (${REQUIRED_TIME_ZONE})` },
            { type: "text", text: booking.meetingType },
            { type: "text", text: booking.message },
          ],
        },
      ],
    },
  };

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await response.body?.cancel();

  if (!response.ok) {
    throw new HttpError(502, "Your request could not be delivered. Please try again or use the contact form.");
  }
}

function ensureConfigured(env) {
  const required = [
    "ALLOWED_ORIGIN",
    "MEETING_RATE_LIMITER",
    "TIME_ZONE",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_API_VERSION",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_RECIPIENT_NUMBER",
    "WHATSAPP_TEMPLATE_LANGUAGE",
    "WHATSAPP_TEMPLATE_NAME",
  ];

  if (required.some((key) => !env[key])) {
    throw new HttpError(503, "Online booking is being connected. Please use the contact form for now.");
  }

  if (
    env.TIME_ZONE !== REQUIRED_TIME_ZONE ||
    !/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION) ||
    !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID) ||
    !/^\d{8,15}$/.test(env.WHATSAPP_RECIPIENT_NUMBER) ||
    !/^[a-z0-9_]+$/.test(env.WHATSAPP_TEMPLATE_NAME)
  ) {
    throw new HttpError(503, "Online booking is being connected. Please use the contact form for now.");
  }
}

async function readJsonBody(request, limit) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > limit) {
    throw new HttpError(413, "Booking details are too large.");
  }

  if (!request.body) {
    throw new HttpError(400, "Please provide booking details.");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "Booking details are too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, "Please provide valid booking details.");
  }
}

function requiredString(value, label, min, max) {
  if (typeof value !== "string") {
    throw new HttpError(400, `${label} is required.`);
  }

  const cleaned = value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < min || cleaned.length > max) {
    throw new HttpError(400, `${label} must be between ${min} and ${max} characters.`);
  }
  return cleaned;
}

function optionalString(value, max) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || value.length > max) {
    throw new HttpError(400, "Please provide valid booking details.");
  }
  return value.trim();
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getZonedDateTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function responseHeaders(origin, allowedOrigin, extra = {}) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });

  if (origin && allowedOrigin && origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Vary", "Origin");
  }

  return headers;
}

function jsonResponse(status, body, origin, allowedOrigin, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin, allowedOrigin, extraHeaders),
  });
}
