import { useEffect, useState, useRef } from "react";
import { Line } from "react-chartjs-2";
import Chart from "chart.js/auto";

interface Device {
  id: number;
  name: string;
  readings: number[];
}

const MAX_POINTS = 20; // Number of points visible at a time

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    wsRef.current = new WebSocket("ws://127.0.0.1:8000/ws/devices");

    wsRef.current.onmessage = (event) => {
      const data: Device[] = JSON.parse(event.data);

      // Update each device, keeping only MAX_POINTS points for smooth scrolling
      setDevices((prevDevices) =>
        data.map((device) => {
          const prev = prevDevices.find((d) => d.id === device.id);
          return {
            ...device,
            readings: prev
              ? [...prev.readings, device.readings[device.readings.length - 1]].slice(-MAX_POINTS)
              : device.readings.slice(-MAX_POINTS),
          };
        })
      );
    };

    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Health IoT Dashboard</h1>
      {devices.map((device) => (
        <div
          key={device.id}
          style={{ border: "1px solid #ccc", margin: "10px", padding: "10px" }}
        >
          <h2>{device.name}</h2>
          <Line
            data={{
              labels: device.readings.map((_, i) => i.toString()), // simple incremental x-axis
              datasets: [
                {
                  label: device.name,
                  data: device.readings,
                  borderColor: "blue",
                  backgroundColor: "rgba(0,0,255,0.1)",
                  tension: 0.4, // smooth line
                },
              ],
            }}
            options={{
              animation: { duration: 0 }, // disable animation for real-time speed
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: { 
                  display: true,
                  title: { display: true, text: "Time" },
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
