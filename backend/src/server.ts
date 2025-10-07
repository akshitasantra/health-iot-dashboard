import express from "express";
import http from "http";
import cors from "cors";
import { WebSocketServer } from "ws";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);

// simple HTTP test endpoint
app.get("/health", (req, res) => res.json({ ok: true }));

const server = http.createServer(app);

// WebSocket server for /ws/patients
const wss = new WebSocketServer({ server, path: "/ws/patients" });

// In-memory simulated state (you can seed DB instead)
type Device = {
  id: number;
  name: string;
  temperature: number;
  heartRate: number;
  battery: number;
  readings: { time: number; value: number }[];
  alertLevel?: "green" | "yellow" | "red";
};

type Patient = {
  id: number;
  name: string;
  devices: Device[];
};

const patients: Patient[] = [
  {
    id: 1,
    name: "Patient 1",
    devices: [
      { id: 1, name: "Heart Rate Sensor", temperature: 98.6, heartRate: 75, battery: 100, readings: [] },
      { id: 2, name: "Temperature Sensor", temperature: 99.1, heartRate: 0, battery: 92, readings: [] }
    ]
  },
  {
    id: 2,
    name: "Patient 2",
    devices: [
      { id: 3, name: "Heart Rate Sensor", temperature: 97.9, heartRate: 68, battery: 98, readings: [] },
      { id: 4, name: "Temperature Sensor", temperature: 99.4, heartRate: 70, battery: 95, readings: [] }
    ]
  }
];

function simulateDevice(d: Device) {
  d.temperature += (Math.random() - 0.5) * 0.4;
  d.heartRate += Math.floor(Math.random() * 5) - 2;
  d.battery = Math.max(0, d.battery - Math.random() * 0.05);

  if (d.heartRate > 100 || d.temperature > 100.4) d.alertLevel = "red";
  else if (d.heartRate < 60 || d.temperature < 97.0) d.alertLevel = "yellow";
  else d.alertLevel = "green";
}

// broadcast helper
function broadcastPatients() {
  const payload = patients.map((p) => ({
    id: p.id,
    name: p.name,
    devices: p.devices.map((d) => ({
      id: d.id,
      name: d.name,
      temperature: Number(d.temperature.toFixed(2)),
      heartRate: Math.max(0, Math.round(d.heartRate)),
      battery: Number(d.battery.toFixed(2)),
      alertLevel: d.alertLevel,
      readings: d.readings.slice(-30)
    }))
  }));
  const text = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(text);
  });
}

// On new WS connection
wss.on("connection", (ws) => {
  console.log("ws connection accepted");
  // send an immediate snapshot
  broadcastPatients();

  ws.on("close", () => {
    console.log("ws disconnected");
  });
});

// Simulate streaming loop
setInterval(() => {
  const now = Date.now();
  patients.forEach((p) => {
    p.devices.forEach((d) => {
      simulateDevice(d);
      // choose value: temperature sensors send temperature; heart sensors send heartRate
      const val = d.name.toLowerCase().includes("temp") ? d.temperature : d.heartRate;
      d.readings.push({ time: Math.floor(now / 1000), value: Number(val.toFixed(2)) });
      d.readings = d.readings.slice(-50);
    });
  });
  broadcastPatients();
}, 500); // send every 500ms

server.listen(PORT, () => {
  console.log(`Node backend running on http://localhost:${PORT}`);
  console.log(`WebSocket path: ws://localhost:${PORT}/ws/patients`);
});
