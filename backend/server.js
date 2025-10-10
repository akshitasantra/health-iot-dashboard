// backend/server.js
require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const { WebSocketServer } = require("ws");
const fs = require("fs");
const prisma = new PrismaClient();
const app = express();

const cors = require('cors');

// --- Enable CORS for local frontend dev ---
app.use(cors({
  origin: ['http://localhost:5173', "https://health-iot-dashboard-frontend-1.onrender.com"],
  credentials: true,
}));


const PORT = process.env.PORT || 5000;

// --- CSP middleware (development-friendly) ---
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `connect-src 'self' ws://18.212.75.149:${PORT} http://18.212.75.149:${PORT}`,
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
    ].join("; ")
  );
  next();
});

// --- Serve React production build ---
const frontendDistVite = path.join(__dirname, "../frontend/dist");  // Vite
const frontendDistCRA = path.join(__dirname, "../frontend/build");  // CRA
let staticFolder = null;

if (require("fs").existsSync(frontendDistVite)) staticFolder = frontendDistVite;
else if (require("fs").existsSync(frontendDistCRA)) staticFolder = frontendDistCRA;

// --- HTTP server + WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let clients = new Set();

// --- Helper to fetch patients with devices and readings ---
async function fetchPatientsWithReadings() {
  const patients = await prisma.patient.findMany({
    include: {
      devices: {
        include: { readings: { orderBy: { timestamp: "desc" }, take: 30 } },
      },
    },
  });

  return patients.map((p) => ({
    id: p.id,
    name: p.name,
    devices: p.devices.map((d) => ({
      id: d.id,
      name: d.name,
      battery: d.battery ?? 100, // include battery, default to 100 if undefined
      readings: (d.readings || [])
        .slice()
        .reverse()
        .map((r) => ({
          time: Math.floor(new Date(r.timestamp).getTime() / 1000),
          value: r.value,
        })),
    })),
  }));
}


// --- Broadcast helper ---
async function broadcastPatients() {
  try {
    const snapshot = await fetchPatientsWithReadings();
    const payload = JSON.stringify(snapshot);

    for (const client of clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  } catch (err) {
    console.error("Broadcast error:", err);
  }
}

// --- WebSocket connection ---
wss.on("connection", (ws, req) => {
  if (!req.url || !req.url.startsWith("/ws/patients")) {
    ws.close();
    return;
  }

  console.log("WS client connected:", req.socket.remoteAddress);
  clients.add(ws);

  ws.on("close", () => {
    clients.delete(ws);
    console.log("WS client disconnected");
  });

  ws.on("error", (err) => {
    console.warn("WS error", err);
  });
});

// --- Simulation tick ---
async function simulationTick() {
  try {
    const devices = await prisma.device.findMany({
      include: { readings: { orderBy: { timestamp: "desc" }, take: 1 } },
    });

    const updates = devices.map(async (d) => {
      const lastReading = d.readings[0] || null;

      // Determine baseline and variation
      let baseline = 75, variation = 0.5;
      if (d.name.toLowerCase().includes("heart")) { baseline = 70; variation = 1; }
      if (d.name.toLowerCase().includes("temperature")) { baseline = 98.6; variation = 0.2; }

      const prevValue = lastReading ? lastReading.value : baseline;
      let newValue = prevValue + (baseline - prevValue) * 0.05 + (Math.random() - 0.5) * variation;

      // enforce realistic floors
      if (d.name.toLowerCase().includes("heart")) newValue = Math.max(50, newValue);
      if (d.name.toLowerCase().includes("temperature")) newValue = Math.max(95, newValue);

      let battery = d.battery ?? 100;
      if (battery <= 0) battery = 100; // reset if drained
      const now = Date.now();
      if (!d._lastBatteryRed) d._lastBatteryRed = 0;
      if (now - d._lastBatteryRed > 60_000) {
        battery = Math.max(0, battery - 1); // reduce once per minute
        d._lastBatteryRed = now;
      }

      // Save new reading (and updated battery if you want)
      await prisma.$transaction([
        prisma.reading.create({
          data: {
            deviceId: d.id,
            value: parseFloat(newValue.toFixed(2)),
          },
        }),
        prisma.device.update({
          where: { id: d.id },
          data: { battery: parseFloat(battery.toFixed(1)) },
        }),
      ]);
    });

    await Promise.all(updates);

    // Broadcast updated readings to frontend
    await broadcastPatients();
  } catch (err) {
    console.error("Simulation tick error:", err);
  }
}





// Start simulation loop
setInterval(simulationTick, 1000);

app.get("/api/patients", async (req, res) => {
  try {
    const snapshot = await fetchPatientsWithReadings();
    res.json(snapshot);
  } catch (err) {
    console.error("GET /api/patients error:", err);
    res.status(500).json({ error: "failed" });
  }
});

// --- SPA fallback (put after all API routes!) ---
if (staticFolder) {
  app.get("*", (req, res) => {
    res.sendFile(path.join(staticFolder, "index.html"));
  });
}
// --- Start server ---
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket endpoint: ws://0.0.0.0:${PORT}/ws/patients`);
});
