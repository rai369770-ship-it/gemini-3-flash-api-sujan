const GEMINI_URL = "https://gemini.google.com/";
const GEMINI_API = "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";
const UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

let session = null;
let reqId = 1;

async function initSession() {
  const res = await fetch(GEMINI_URL, { headers: { "user-agent": UA } });
  const html = await res.text();
  const extract = (pattern) => {
    const match = html.match(pattern);
    return match ? match[1] : "";
  };
  session = {
    snlm0e: extract(/"SNlM0e":"(.*?)"/),
    cfb2h: extract(/"cfb2h":"(.*?)"/),
    fdrfje: extract(/"FdrFJe":"(.*?)"/),
  };
}

async function ask(prompt) {
  if (!session) await initSession();

  const payload = [null, JSON.stringify([[prompt, 0, null, null, null, null, 0]])];

  const params = new URLSearchParams({
    bl: session.cfb2h,
    "f.sid": session.fdrfje,
    hl: "id",
    _reqid: String(reqId),
    rt: "c",
  });

  reqId += 1;

  const body = `f.req=${encodeURIComponent(JSON.stringify(payload))}&at=${session.snlm0e}`;

  const res = await fetch(`${GEMINI_API}?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": UA,
      "x-same-domain": "1",
    },
    body,
  });

  return parse(await res.text());
}

function parse(text) {
  let result = null;
  const lines = text.split("\n").filter((line) => line.startsWith('[["wrb.fr"'));
  for (const line of lines) {
    try {
      const outer = JSON.parse(line);
      const inner = JSON.parse(outer[0][2]);
      const candidate = inner[4][0][1];
      if (candidate) {
        result = Array.isArray(candidate) ? candidate[0] : candidate;
      }
    } catch (_) {}
  }
  return result;
}

function extractPrompt(url) {
  const parsed = new URL(url, "https://localhost");
  const raw = parsed.pathname.replace(/^\/+/, "");
  const query = parsed.search ? parsed.search : "";
  const combined = decodeURIComponent(raw + query);
  return combined.trim() || null;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return jsonResponse({ status: "ok" }, 204);
    }

    const prompt = extractPrompt(request.url);

    if (!prompt) {
      return jsonResponse(
        {
          success: false,
          error: "MISSING_PROMPT",
          message: "No prompt provided. Usage: https://your-api.com/your prompt here",
        },
        400
      );
    }

    try {
      const response = await ask(prompt);
      if (!response) {
        return jsonResponse(
          {
            success: false,
            error: "EMPTY_RESPONSE",
            message: "Gemini returned no response for the given prompt.",
          },
          502
        );
      }
      return jsonResponse({
        success: true,
        prompt,
        response,
      });
    } catch (err) {
      session = null;
      return jsonResponse(
        {
          success: false,
          error: "INTERNAL_ERROR",
          message: err.message || "An unexpected error occurred.",
        },
        500
      );
    }
  },
};