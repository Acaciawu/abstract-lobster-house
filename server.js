const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "orders.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
  }
}

function readOrders() {
  ensureDataFile();

  try {
    const content = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeOrders(orders) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), "utf8");
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp"
  };

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream"
    });
    res.end(content);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk.toString();
      if (raw.length > 1e6) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function buildOrder(payload) {
  return {
    id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    nickname: String(payload.nickname || "").trim() || "未署名朋友",
    flavor: String(payload.flavor || "").trim(),
    spice: String(payload.spice || "").trim(),
    portion: String(payload.portion || "").trim(),
    extras: normalizeList(payload.extras),
    preferences: normalizeList(payload.preferences),
    payer: String(payload.payer || "").trim(),
    remark: String(payload.remark || "").trim(),
    submittedAt: new Date().toISOString()
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    const orders = readOrders().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    sendJson(res, 200, { orders });
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    try {
      const payload = await parseBody(req);
      const order = buildOrder(payload);

      if (!order.flavor || !order.spice || !order.portion || !order.payer) {
        sendJson(res, 400, { message: "提交内容不完整，请先完成必要选择。" });
        return;
      }

      const orders = readOrders();
      orders.push(order);
      writeOrders(orders);

      sendJson(res, 201, {
        message: "点单已提交成功",
        order
      });
    } catch (error) {
      sendJson(res, 400, { message: error.message || "提交失败" });
    }
    return;
  }

  if (req.method === "GET" && pathname === "/") {
    sendFile(res, path.join(ROOT, "index.html"));
    return;
  }

  if (req.method === "GET" && pathname === "/admin") {
    sendFile(res, path.join(ROOT, "admin.html"));
    return;
  }

  const staticPath = path.join(ROOT, pathname.replace(/^\/+/, ""));
  if (staticPath.startsWith(ROOT) && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    sendFile(res, staticPath);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not Found");
});

ensureDataFile();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
