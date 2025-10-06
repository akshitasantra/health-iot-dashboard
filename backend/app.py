import React, { useEffect, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import Chart from "chart.js/auto";

type Reading = { time: string; value: number };

type Device = {
  id?: number;
  name: string;
  temperature?: number;
  heartRate?: number;
  battery: number;
  alertLevel?: "green" | "yellow" | "red";
  readings: Reading[];
};

type Patient = {
  id: number;
  name: string;
  devices: Device[];
};

const MAX_POINTS = 50;
const REDRAW_MS = 50; // redraw loop interval

export default function App() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [healthSummaries, setHealthSummaries] = useState<Record<number, string>>({});
  const patientsRef = useRef<Patient[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRefs = useRef<Record<string, Chart | null>>({});

  // keep ref in sync
  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);

  // dedupe by id if present, otherwise by name
  const dedupeDevices = (devices: Device[]): Device[] => {
    const map = new Map<string | number, Device>();
    for (const d of devices) {
      const key = d.id ?? d.name;
      map.set(key, d);
    }
    return Array.from(map.values());
  };

  const normalizeBattery = (raw: number | undefined): number => {
    if (raw === undefined || raw === null) return 0;
    if (raw <= 1) return Math.round(raw * 100);
    return Math.round(raw);
  };

  const patientBatteryPercent = (devices: Device[]): number => {
    if (!devices || devices.length === 0) return 0;
    const values = devices.map((d) => normalizeBattery(d.battery));
    return Math.min(...values);
  };

  const batteryColorFromPercent = (pct: number): string => {
    if (pct < 40) return "#ef4444";
    if (pct < 75) return "#eab308";
    return "#16a34a";
  };

  const alertColor = (level?: "green" | "yellow" | "red") => {
    if (level === "red") return { border: "#ef4444", fill: "rgba(239,68,68,0.08)" };
    if (level === "yellow") return { border: "#eab308", fill: "rgba(234,179,8,0.08)" };
    return { border: "#16a34a", fill: "rgba(22,163,74,0.08)" };
  };

  // WebSocket connect + robust parsing
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/patients");
    wsRef.current = ws;

    ws.onopen = () => console.info("WS open -> /ws/patients");
    ws.onerror = (e) => console.warn("WS error", e);
    ws.onclose = () => console.info("WS closed");

    ws.onmessage = (ev) => {
      try {
        const incoming = JSON.parse(ev.data);
        console.debug("WS frame:", incoming);

        // Expect incoming to be an array of patients
        const mapped: Patient[] = (incoming || []).map((p: any) => {
          const devices: Device[] = dedupeDevices(
            (p.devices ?? []).map((d: any) => {
              // Normalize readings: allow numbers, plain arrays, or {time,value}
              const rawReadings = d.readings ?? [];
              const readings: Reading[] = rawReadings.map((r: any) => {
                if (r === null || r === undefined) return { time: new Date().toLocaleTimeString(), value: 0 };
                // an entry like 72 or {value:72}
                if (typeof r === "number") return { time: new Date().toLocaleTimeString(), value: r };
                if (typeof r === "object") {
                  const value = r.value ?? (typeof r === "number" ? r : 0);
                  const time = r.time ? (typeof r.time === "number" ? new Date(r.time * 1000).toLocaleTimeString() : String(r.time)) : new Date().toLocaleTimeString();
                  return { time, value };
                }
                return { time: new Date().toLocaleTimeString(), value: Number(r) || 0 };
              });

              const clipped = readings.slice(-MAX_POINTS);

              return {
                id: d.id,
                name: d.name,
                temperature: d.temperature,
                heartRate: d.heartRate,
                battery: d.battery ?? 0,
                alertLevel: d.alertLevel ?? "green",
                readings: clipped,
              } as Device;
            })
          );

          return {
            id: p.id,
            name: p.name,
            devices,
          } as Patient;
        });

        setPatients(mapped);
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, []);

  // Single stable interval for health summary (reads patientsRef.current)
  useEffect(() => {
    const generateSummaryFromRef = () => {
      const current = patientsRef.current;
      const summaries: Record<number, string> = {};
      for (const p of current) {
        // compute average across devices that have the metric
        const temps = p.devices.filter((d) => d.temperature != null).map((d) => d.temperature as number);
        const hrs = p.devices.filter((d) => d.heartRate != null).map((d) => d.heartRate as number);
        const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
        const avgHR = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;

        let summary = `${p.name}: Vitals stable.`;
        if (avgTemp > 99) summary = `${p.name}: Temperature slightly elevated.`;
        if (avgHR > 100) summary = `${p.name}: Elevated heart rate detected.`;

        summaries[p.id] = summary;
      }
      setHealthSummaries(summaries);
    };

    // run once immediately
    generateSummaryFromRef();
    const interval = setInterval(generateSummaryFromRef, 30_000); // 30s
    return () => clearInterval(interval);
  }, []); // empty so interval created only once

  // Smooth redraw loop for Chart.js
  useEffect(() => {
    let rafId: number | null = null;
    const tick = () => {
      Object.values(chartRefs.current).forEach((c) => {
        try {
          if (c && (c as any).update) (c as any).update("none");
        } catch {}
      });
      rafId = window.setTimeout(() => requestAnimationFrame(tick), REDRAW_MS) as unknown as number;
    };
    requestAnimationFrame(tick);
    return () => {
      if (rafId) clearTimeout(rafId);
    };
  }, []);

  // layout styles
  const containerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "34% 1fr 320px",
    height: "100vh",
    background: "#f1f5f9",
    fontFamily: "Inter, Arial, sans-serif",
  };
  const leftPanelStyle: React.CSSProperties = { padding: 16, overflowY: "auto", borderRight: "1px solid #e5e7eb", background: "#f8fafc", minWidth: 280 };
  const centerPanelStyle: React.CSSProperties = { padding: 16, overflowY: "auto", boxSizing: "border-box", minWidth: 420 };
  const rightPanelStyle: React.CSSProperties = { padding: 16, borderLeft: "1px solid #e5e7eb", background: "#fafafa", overflowY: "auto", boxSizing: "border-box", width: "100%" };

  return (
    <div style={containerStyle}>
      {/* LEFT */}
      <div style={leftPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>Patients</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {patients.map((p) => {
            const batteryPct = patientBatteryPercent(p.devices);
            const leftStripe = batteryColorFromPercent(batteryPct);
            return (
              <div key={p.id} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 6px 18px rgba(0,0,0,0.06)", display: "flex", gap: 12, padding: 16, borderLeft: `8px solid ${leftStripe}`, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {p.devices.map((d) => (
                      <div key={d.id ?? d.name} style={{ padding: 8, borderRadius: 8, background: "#f3f4f6", border: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 600 }}>{d.name}</div>
                        <div style={{ textAlign: "right", minWidth: 80 }}>
                          <div style={{ fontSize: 12, color: "#6b7280" }}>🔋</div>
                          <div style={{ fontWeight: 700 }}>{normalizeBattery(d.battery)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CENTER */}
      <div style={centerPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>Live Telemetry</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {patients.flatMap((p) =>
            p.devices.map((d) => {
              const key = `${p.id}__${d.id ?? d.name}`;
              const colors = alertColor(d.alertLevel);
              return (
                <div key={key} style={{ background: "#fff", borderRadius: 10, padding: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.04)", border: "1px solid #e6e9ee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>{p.name} — {d.name}</div>
                    <div style={{ color: colors.border, fontWeight: 700 }}>{(d.alertLevel ?? "green").toUpperCase()}</div>
                  </div>
                  <div style={{ height: 140 }}>
                    <Line
                      ref={(el) => {
                        // keyed refs (replace previous)
                        // @ts-ignore
                        const chart = el?.chart ?? null;
                        chartRefs.current[key] = chart;
                      }}
                      data={{
                        labels: d.readings.map((r) => r.time),
                        datasets: [
                          {
                            label: d.name,
                            data: d.readings.map((r) => r.value),
                            borderColor: colors.border,
                            backgroundColor: colors.fill,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 0,
                          },
                        ],
                      }}
                      options={{
                        animation: { duration: 0 },
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { mode: "index" } },
                        scales: {
                          x: { ticks: { maxRotation: 0 }, grid: { display: false } },
                          y: { grid: { color: "#f3f4f6" } },
                        },
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div style={rightPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>AI Health Summary</h1>
        {patients.map((p) => {
          const summary = healthSummaries[p.id] ?? "Analyzing vitals...";
          return (
            <div key={p.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: "0 4px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
              <div style={{ fontSize: 14, color: "#374151" }}>{summary}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
