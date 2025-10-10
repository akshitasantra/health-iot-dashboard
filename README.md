# Healthcare IoT Dashboard
Real-time dashboard demonstrating simulated patient telemetry with live WebSocket updates.
Live demo: [https://<frontend-render>.onrender.com](https://health-iot-dashboard-frontend-1.onrender.com/)

Tech: React (Vite), Node.js + Express, Prisma (Postgres), WebSockets, Docker, Render.

Run locally:
  cd backend
  npm ci
  npx prisma migrate deploy
  npx prisma db seed
  npm start
  cd ../frontend
  npm ci
  npm run dev
