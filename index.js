const GEMINI_URL = "https://gemini.google.com/";
const GEMINI_API =
  "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

let session = null;
let reqId = 1;

// 🔹 Initialize session
async function initSession() {
  const res = await fetch(GEMINI_URL, {
    headers: { "user-agent": UA },
  });

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

// 🔹 Ask Gemini
async function ask(prompt) {
  if (!session) await initSession();

  const payload = [
    null,
    JSON.stringify([[prompt, 0, null, null, null, null, 0]]),
  ];

  const params = new URLSearchParams({
    bl: session.cfb2h,
    "f.sid": session.fdrfje,
    hl: "en",
    _reqid: String(reqId),
    rt: "c",
  });

  reqId++;

  const body = `f.req=${encodeURIComponent(
    JSON.stringify(payload)
  )}&at=${session.snlm0e}`;

  const res = await fetch(`${GEMINI_API}?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type":
        "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": UA,
      "x-same-domain": "1",
    },
    body,
  });

  const text = await res.text();
  return parse(text);
}

// 🔹 Parse Gemini response
function parse(text) {
  let result = null;

  const lines = text
    .split("\n")
    .filter((line) => line.startsWith('[["wrb.fr"'));

  for (const line of lines) {
    try {
      const outer = JSON.parse(line);
      const inner = JSON.parse(outer[0][2]);
      const candidate = inner?.[4]?.[0]?.[1];

      if (candidate) {
        result = Array.isArray(candidate)
          ? candidate[0]
          : candidate;
      }
    } catch (e) {}
  }

  return result;
}

// 🔹 Extract prompt from URL
function extractPrompt(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const raw = url.pathname.replace(/^\/api\/ask\/?/, "");
  return decodeURIComponent(raw).trim();
}

// 🔹 Vercel handler
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const prompt =
    req.method === "POST"
      ? req.body?.prompt
      : extractPrompt(req);

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: "MISSING_PROMPT",
      message:
        "Usage: /api/ask/your prompt OR POST { prompt }",
    });
  }

  try {
    const response = await ask(prompt);

    if (!response) {
      return res.status(502).json({
        success: false,
        error: "EMPTY_RESPONSE",
      });
    }

    return res.status(200).json({
      success: true,
      prompt,
      response,
    });
  } catch (err) {
    session = null;

    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: err.message,
    });
  }
}