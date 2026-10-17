// A stand-in for the Resend email API, for browser tests: it keeps every message the app "sends" so a test can read it.
//   POST   /emails         the app sends mail here (same shape as Resend); answers like Resend does
//   GET    /__emails       every message received so far, as JSON
//   DELETE /__emails       forget them
import http from "node:http";

const PORT = Number(process.env.MOCK_RESEND_PORT ?? 8899);
const emails = [];

http
  .createServer((req, res) => {
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/__health") return json(200, { ok: true });
    if (req.url === "/__emails" && req.method === "GET") return json(200, emails);
    if (req.url === "/__emails" && req.method === "DELETE") {
      emails.length = 0;
      return json(200, { ok: true });
    }
    if (req.url === "/emails" && req.method === "POST") {
      let raw = "";
      req.on("data", (c) => {
        raw += c;
      });
      req.on("end", () => {
        try {
          emails.push({ ...JSON.parse(raw), received_at: new Date().toISOString() });
          json(200, { id: `mock_${emails.length}` });
        } catch {
          json(400, { message: "bad json" });
        }
      });
      return;
    }
    json(404, { message: "not found" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock Resend listening on ${PORT}`));
