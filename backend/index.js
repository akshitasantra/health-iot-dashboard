import express from "express";
import { WebSocketServer } from "ws";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

const app = express();
const prisma = new PrismaClient();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Example REST endpoint
app.get("/patients", async (req, res) => {
  const patients = await prisma.patient.findMany({
    include: { devices: true },
  });
  res.json(patients);
});

// WebSocket Setup
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

const wss = new WebSocketServer({ server, path: "/ws/patients" });

// Broadcast random telemetry updates every 2 seconds
setInterval(async () => {
  const patients = await prisma.patient.findMany({ include: { devices: true } });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(patients));
    }
  });
}, 2000);
