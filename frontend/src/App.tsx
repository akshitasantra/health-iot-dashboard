import { useEffect, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import Chart from "chart.js/auto";

interface Reading {
  value: number;
  timestamp: string;
}

interface Device {
  id: number;
  name: string;
  readings: Reading[];
}

const MAX_POINTS = 50; // how many points to show on screen
const STREAM_INTERVAL = 50; // ms between redraws (~20fps)

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRefs = useRef<Chart[]>([]);

  // Connect to WebSocket
  useEffect(() => {
    wsRef.current = new WebSocket("ws://127.0.0.1:8000/ws/devices");

    wsRef.current.onmessage = (event) => {
      const data: Device[] = JSON.parse(event.data);

      setDevices((prevDevices) =>
        data.map((device) => {
          const prev = prevDevices.find((d) => d.id === device.id);
          const newVal = device.readings[device.readings.length - 1];
          const newReading: Reading = {
            value: typeof newVal === "number" ? newVal : newVal.value,
            timestamp: new Date().toLocaleTimeString(),
          };

          return {
            ...device,
            readings: prev
              ? [...prev.readings, newReading].slice(-MAX_POINTS)
              : [newReading],
          };
        })
      );
    };

    return () => wsRef.current?.close();
  }, []);

  // Smooth redraw loop for continuous chart scrolling
  useEffect(() => {
    const animate = () => {
      chartRefs.current.forEach((chart) => {
        if (chart && chart.data.datasets) {
          chart.update("none"); // redraw without animation
        }
      });
      setTimeout(() => requestAnimationFrame(animate), STREAM_INTERVAL);
    };
    requestAnimationFrame(animate);
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Health IoT Dashboard</h1>
      {devices.map((device, i) => (
        <div
          key={device.id}
          style={{
            border: "1px solid #ccc",
            margin: "10px",
            padding: "10px",
            borderRadius: "8px",
          }}
        >
          <h2>{device.name}</h2>
          <Line
            ref={(el) => {
              if (el?.chart) chartRefs.current[i] = el.chart;
            }}
            data={{
              labels: device.readings.map((r) => r.timestamp),
              datasets: [
                {
                  label: device.name,
                  data: device.readings.map((r) => r.value),
                  borderColor: "blue",
                  backgroundColor: "rgba(0,0,255,0.1)",
                  tension: 0.4, // smooth line
                  fill: true,
                },
              ],
            }}
            options={{
              animation: { duration: 0 },
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  display: true,
                  title: { display: true, text: "Time" },
                  ticks: { maxRotation: 0 },
                },
                y: {
                  display: true,
                  title: { display: true, text: "Value" },
                },
              },
            }}
          />
        </div>
      ))}
    </div>
  );
}
