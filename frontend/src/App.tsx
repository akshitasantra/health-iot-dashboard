import { useEffect, useState, useRef } from "react";
import { Line } from "react-chartjs-2";
import Chart from "chart.js/auto";

interface Device {
  id: number;
  name: string;
  readings: { value: number; timestamp: string }[];
}

const MAX_POINTS = 20;

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    wsRef.current = new WebSocket("ws://127.0.0.1:8000/ws/devices");

    wsRef.current.onmessage = (event) => {
      const data: { id: number; name: string; readings: number[] }[] = JSON.parse(event.data);

      setDevices((prevDevices) =>
        data.map((device) => {
          const prev = prevDevices.find((d) => d.id === device.id);
          const newReadingValue = device.readings[device.readings.length - 1];
          const newReading = { value: newReadingValue, timestamp: new Date().toLocaleTimeString() };

          return {
            ...device,
            readings: prev
              ? [...prev.readings, newReading].slice(-MAX_POINTS)
              : [newReading],
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
              labels: device.readings.map((r) => r.timestamp),
              datasets: [
                {
                  label: device.name,
                  data: device.readings.map((r) => r.value),
                  borderColor: "blue",
                  backgroundColor: "rgba(0,0,255,0.1)",
                  tension: 0.4, // smooth line
                },
              ],
            }}
            options={{
              animation: { duration: 0 },
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: { display: true, title: { display: true, text: "Time" } },
                y: { display: true, title: { display: true, text: "Value" } },
              },
            }}
          />
        </div>
      ))}
    </div>
  );
}
