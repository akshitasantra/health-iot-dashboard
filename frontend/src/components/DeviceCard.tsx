import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

interface DeviceCardProps {
  device: {
    id: number;
    name: string;
    readings: number[];
  };
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device }) => {
  const data = {
    labels: device.readings.map((_, i) => `${i + 1}`),
    datasets: [
      {
        label: device.name,
        data: device.readings,
        borderColor: "rgb(75, 192, 192)",
        backgroundColor: "rgba(75, 192, 192, 0.2)",
      }
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { display: false },
      y: { min: 0, max: 100 },
    },
    plugins: { legend: { display: false } },
  };

  return (
    <div className="device-card">
      <h3>{device.name}</h3>
      <div className="chart-container">
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

export default DeviceCard;
