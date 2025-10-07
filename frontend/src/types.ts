// src/types.ts
export interface Reading {
  time: number;
  value: number;
}

export interface Device {
  id: number;
  name: string;
  temperature: number;
  heartRate: number;
  battery: number;
  readings: Reading[];
  alertLevel?: "green" | "yellow" | "red";
}
