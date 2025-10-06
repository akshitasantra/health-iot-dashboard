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
const REDRAW_MS = 50;

export default function App(){
  const [patients, setPatients] = useState<Patient[]>([]);
  const [healthSummaries, setHealthSummaries] = useState<Record<number, string>>({});
  const [summaryHighlights, setSummaryHighlights] = useState<Record<number, boolean>>({});
  const patientsRef = useRef<Patient[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const chartRefs = useRef<Record<string, Chart | null>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("—");

  // keep ref synced
  useEffect(() => {
    patientsRef.current = patients;
  }, [patients]);

  // helper functions (same as before)
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

  // robust WS parsing (expect array of patients)
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/patients");
    wsRef.current = ws;

    ws.onopen = () => console.info("WS open -> /ws/patients");
    ws.onerror = (e) => console.warn("WS error", e);
    ws.onclose = () => console.info("WS closed");

    ws.onmessage = (ev) => {
      try {
        const incoming = JSON.parse(ev.data);
        // map incoming -> Patient[]
        const mapped: Patient[] = (incoming || []).map((p: any) => {
          const devices: Device[] = (p.devices ?? []).map((d: any) => {
            const rawReadings = d.readings ?? [];
            const readings: Reading[] = rawReadings.map((r: any) => {
              if (r == null) return { time: new Date().toLocaleTimeString(), value: 0 };
              if (typeof r === "number") return { time: new Date().toLocaleTimeString(), value: r };
              if (typeof r === "object") {
                const value = typeof r.value === "number" ? r.value : Number(r) || 0;
                const time = r.time ? (typeof r.time === "number" ? new Date(r.time * 1000).toLocaleTimeString() : String(r.time)) : new Date().toLocaleTimeString();
                return { time, value };
              }
              return { time: new Date().toLocaleTimeString(), value: Number(r) || 0 };
            });

            return {
              id: d.id,
              name: d.name,
              temperature: d.temperature,
              heartRate: d.heartRate,
              battery: d.battery ?? 0,
              alertLevel: d.alertLevel ?? "green",
              readings: readings.slice(-MAX_POINTS),
            } as Device;
          });

          return {
            id: p.id,
            name: p.name,
            devices,
          } as Patient;
        });

        setPatients(mapped);
        setLastUpdated(new Date().toLocaleTimeString());

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

  // stable interval for AI summaries (reads patientsRef.current)
  useEffect(() => {
    const generate = () => {
      const current = patientsRef.current;
      const newSummaries: Record<number, string> = {};

      for (const p of current) {
        const temps = p.devices.filter((d) => typeof d.temperature === "number").map((d) => d.temperature as number);
        const hrs = p.devices.filter((d) => typeof d.heartRate === "number").map((d) => d.heartRate as number);
        const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
        const avgHR = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : 0;

        let summary = `${p.name}: Vitals stable.`;
        if (avgTemp > 99) summary = `${p.name}: Temperature slightly elevated.`;
        if (avgHR > 100) summary = `${p.name}: Elevated heart rate detected.`;

        newSummaries[p.id] = summary;
      }

      // compare with previous and trigger highlight if changed
      setHealthSummaries((prev) => {
        for (const idStr of Object.keys(newSummaries)) {
          const id = Number(idStr);
          if (prev[id] !== newSummaries[id]) {
            // flash highlight
            setSummaryHighlights((h) => ({ ...h, [id]: true }));
            // remove highlight after 3s
            setTimeout(() => setSummaryHighlights((h) => ({ ...h, [id]: false })), 3000);
          }
        }
        return newSummaries;
      });
    };

    generate();
    const interval = setInterval(generate, 30_000); // every 30s
    return () => clearInterval(interval);
  }, []);

  // chart redraw loop
  useEffect(() => {
    let raf: number | null = null;
    const tick = () => {
      Object.values(chartRefs.current).forEach((c) => {
        try {
          if (c && (c as any).update) (c as any).update("none");
        } catch {}
      });
      raf = window.setTimeout(() => requestAnimationFrame(tick), REDRAW_MS) as unknown as number;
    };
    requestAnimationFrame(tick);
    return () => {
      if (raf) clearTimeout(raf);
    };
  }, []);

  // Analytics footer calculation (derived from current patients)
  const analytics = (() => {
    const temps: number[] = [];
    const hrs: number[] = [];
    let deviceCount = 0;
    patients.forEach((p) => {
      p.devices.forEach((d) => {
        deviceCount += 1;
        if (typeof d.temperature === "number") temps.push(d.temperature);
        if (typeof d.heartRate === "number") hrs.push(d.heartRate);
      });
    });

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const min = (arr: number[]) => (arr.length ? Math.min(...arr) : 0);
    const max = (arr: number[]) => (arr.length ? Math.max(...arr) : 0);

    return {
      deviceCount,
      avgTemp: avg(temps),
      minTemp: min(temps),
      maxTemp: max(temps),
      avgHR: avg(hrs),
      minHR: min(hrs),
      maxHR: max(hrs),
    };
  })();

  // styles (keeps layout consistent)
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
    <div style={{ height: "100vh", background: "#f1f5f9", fontFamily: "Inter, Arial, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{ padding: "12px 20px", borderBottom: "1px solid #e6e9ee", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Health IoT Dashboard</h1>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Last updated: <span style={{ fontWeight: 700, color: "#374151" }}>{lastUpdated}</span>
          </div>
        </div>
        {/* small right-side place for live status if desired */}
        <div style={{ fontSize: 12, color: "#6b7280" }}>Live</div>
      </header>

      {/* Main grid (keeps your existing containerStyle, left/center/right panels) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "34% 1fr 320px",
        flex: 1,            // allow grid to take remaining height
        overflow: "hidden"  // keep panels layout stable
      }}>

      {/* LEFT: Patients */}
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

      {/* CENTER: live telemetry */}
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
                        // store keyed chart reference
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

      {/* RIGHT: AI summary + footer analytics */}
      <div style={rightPanelStyle}>
        <h1 style={{ margin: 0, marginBottom: 12 }}>AI Health Summary</h1>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {patients.map((p) => {
            const summary = healthSummaries[p.id] ?? "Analyzing vitals...";
            const highlight = !!summaryHighlights[p.id];
            return (
              <div key={p.id} style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 16,
                marginBottom: 6,
                boxShadow: "0 4px 10px rgba(0,0,0,0.05)",
                transition: "background-color 300ms ease",
                // highlight effect:
                backgroundColor: highlight ? "rgba(59,130,246,0.06)" : "#fff"
              }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
                <div style={{ fontSize: 14, color: "#374151" }}>{summary}</div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>Last summary: {new Date().toLocaleTimeString()}</div>
              </div>
            );
          })}
        </div>

        {/* Footer analytics panel */}
        <div style={{ marginTop: 18, borderTop: "1px solid #e6e9ee", paddingTop: 12 }}>
          <h3 style={{ margin: "6px 0 12px 0" }}>Analytics (all devices)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Avg Temperature</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{isFinite(analytics.avgTemp) ? analytics.avgTemp.toFixed(1) : "—"} °F</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                Min: {isFinite(analytics.minTemp) ? analytics.minTemp.toFixed(1) : "—"} • Max: {isFinite(analytics.maxTemp) ? analytics.maxTemp.toFixed(1) : "—"}
              </div>
            </div>

            <div style={{ background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Avg Heart Rate</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{isFinite(analytics.avgHR) ? analytics.avgHR.toFixed(0) : "—"} BPM</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                Min: {isFinite(analytics.minHR) ? analytics.minHR.toFixed(0) : "—"} • Max: {isFinite(analytics.maxHR) ? analytics.maxHR.toFixed(0) : "—"}
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", background: "#fff", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Devices tracked</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{analytics.deviceCount}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Updated live from backend telemetry</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
