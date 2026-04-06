import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { theme } from "../theme";

const pageBg = theme.pageBg;
const cardStyle = {
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: 14,
  boxShadow: theme.shadowSm,
};
const sectionCardStyle = {
  ...cardStyle,
  padding: 16,
};
const tableWrapStyle = {
  ...sectionCardStyle,
  padding: 0,
  overflow: "hidden",
};
const tableHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  padding: "16px 16px 12px",
  borderBottom: "1px solid #eef1f5",
  flexWrap: "wrap",
};
const tableScrollStyle = {
  position: "relative",
  overflowX: "auto",
};
const sectionTitleStyle = {
  margin: 0,
  marginBottom: 10,
  fontSize: 16,
  fontWeight: 800,
};
const stickyHeaderStyle = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  background: "rgba(246, 243, 238, 0.92)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  borderBottom: `1px solid ${theme.headerBorder}`,
  paddingBottom: 12,
  marginBottom: 14,
};
const tableStyle = {
  borderCollapse: "collapse",
  width: "100%",
  fontVariantNumeric: "tabular-nums",
};
const thStyle = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 700,
  color: "#111",
  background: theme.surfaceMuted,
  borderBottom: `1px solid ${theme.border}`,
  boxShadow: `0 1px 0 ${theme.border}`,
};
const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f0f0",
  color: "#111",
  verticalAlign: "top",
  background: theme.surface,
};
const rowLinkStyle = {
  color: theme.link,
  fontWeight: 500,
};
const uploadCardStyle = {
  ...cardStyle,
  display: "grid",
  gap: 8,
  minWidth: 260,
};
const controlCardStyle = {
  background: "linear-gradient(135deg, #f2ede5 0%, #f8f4ee 58%, #f2f4f2 100%)",
  border: `1px solid ${theme.borderStrong}`,
  borderRadius: 12,
  padding: 16,
  boxShadow: theme.shadowMd,
};
const statCardStyle = {
  ...cardStyle,
  padding: 16,
};
const subtlePillStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  border: `1px solid ${theme.neutralPillBorder}`,
  background: theme.neutralPillBg,
  color: theme.neutralPillText,
};
const successPillStyle = {
  ...subtlePillStyle,
  border: `1px solid ${theme.successBorder}`,
  background: theme.successBg,
  color: theme.successText,
};
const periodMetaPillStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  border: "1px solid #e4e7ec",
  background: "#fafbfc",
  color: "#667085",
};
const activeCheckStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: 999,
  border: `1px solid ${theme.successBorder}`,
  background: theme.successBg,
  color: theme.successText,
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
};

function fmtPeriodLabel(periodBegin) {
  if (!periodBegin) return "Unknown period";
  const d = new Date(periodBegin + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(periodBegin);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fmtImported(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ImportRuns() {
  const [rows, setRows] = useState([]);
  const [latestPayrollRun, setLatestPayrollRun] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [uploadStartedAt, setUploadStartedAt] = useState(null);
  const [uploadElapsedSec, setUploadElapsedSec] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState("");

  async function refresh() {
    setErr(null);
    setLoading(true);

    const [recentRes, latestRunRes] = await Promise.all([
      supabase
        .schema("app")
        .from("payroll_import_runs_recent_view")
        .select(
          "import_run_id, period_begin, period_end, imported_at, bucket, storage_path, is_active_for_period"
        )
        .order("period_begin", { ascending: false })
        .order("is_active_for_period", { ascending: false })
        .order("imported_at", { ascending: false }),
      supabase
        .schema("app")
        .from("latest_payroll_run_view")
        .select("*")
        .maybeSingle(),
    ]);

    if (recentRes.error) setErr((prev) => prev ?? recentRes.error.message);
    if (latestRunRes.error) setErr((prev) => prev ?? latestRunRes.error.message);

    setRows(recentRes.data ?? []);
    setLatestPayrollRun(latestRunRes.data ?? null);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!uploading || !uploadStartedAt) return undefined;

    setUploadElapsedSec(Math.max(0, Math.floor((Date.now() - uploadStartedAt) / 1000)));
    const timer = window.setInterval(() => {
      setUploadElapsedSec(Math.max(0, Math.floor((Date.now() - uploadStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [uploading, uploadStartedAt]);

  async function handleUpload(file) {
    setUploadMsg(null);
    setErr(null);
    setUploading(true);
    setUploadingFileName(file.name);
    setUploadStartedAt(Date.now());
    setUploadElapsedSec(0);

    try {
      const bucket = "payroll-imports";
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const ym = ts.slice(0, 7); // YYYY-MM
      const storagePath = `${ym}/${ts}_${file.name}`;

      const up = await supabase.storage.from(bucket).upload(storagePath, file, {
        upsert: false,
        contentType: file.type || "text/xml",
      });

      if (up.error) throw new Error(up.error.message);

      const { data, error } = await supabase.functions.invoke("kelly_payroll_import", {
        body: { bucket, path: storagePath, force: false },
      });

      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Import failed");

      if (data?.deduped) {
        setUploadMsg({
          kind: "deduped",
          text: `Already imported (deduped): ${file.name}${data.imported_at ? ` • existing run imported ${fmtImported(data.imported_at)}` : ""}`,
        });
      } else {
        setUploadMsg({
          kind: "success",
          text: `Uploaded + processed: ${file.name}`,
        });
      }
      await refresh();
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setUploading(false);
      setUploadStartedAt(null);
      setUploadElapsedSec(0);
      setUploadingFileName("");
    }
  }

  const grouped = useMemo(() => {
    // Group by period_begin/period_end combo
    const map = new Map();

    for (const r of rows) {
      const key = `${r.period_begin ?? "?"}__${r.period_end ?? "?"}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          period_begin: r.period_begin,
          period_end: r.period_end,
          periodLabel: fmtPeriodLabel(r.period_begin),
          runs: [],
        });
      }
      map.get(key).runs.push(r);
    }

    const groups = Array.from(map.values());

    // Within each period: always newest import first.
    for (const g of groups) {
      g.runs.sort((a, b) => {
        return String(b.imported_at ?? "").localeCompare(String(a.imported_at ?? ""));
      });
    }

    // Newest periods first.
    groups.sort((a, b) => {
      return String(b.period_begin ?? "").localeCompare(String(a.period_begin ?? ""));
    });

    return groups;
  }, [rows]);

  const summary = useMemo(() => {
    const activePeriods = grouped.filter((g) => g.runs.some((x) => x.is_active_for_period)).length;
    const mostRecentImport = rows[0] ?? null;
    const latestPeriodLabel = latestPayrollRun?.period_begin
      ? `${fmtPeriodLabel(latestPayrollRun.period_begin)}`
      : "—";

    return {
      totalRuns: rows.length,
      totalPeriods: grouped.length,
      activePeriods,
      latestRunLabel:
        latestPayrollRun?.run_label ??
        (latestPayrollRun?.period_begin && latestPayrollRun?.period_end
          ? `${latestPayrollRun.period_begin} → ${latestPayrollRun.period_end}`
          : "No payroll run found"),
      latestPeriodLabel,
      latestImportLabel: mostRecentImport ? fmtImported(mostRecentImport.imported_at) : "—",
      latestRunImportedLabel: latestPayrollRun?.imported_at ? fmtImported(latestPayrollRun.imported_at) : "—",
    };
  }, [grouped, latestPayrollRun, rows]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Payroll Import Runs</h2>
            <div style={{ color: "#666", marginTop: 4 }}>
              Review payroll import history by period, track which run is active, and upload new source files.
            </div>
          </div>

          <label style={uploadCardStyle}>
            <div style={{ fontSize: 12, color: "#666" }}>Upload payroll source</div>
            <input
              type="file"
              accept=".xml,.csv,.txt"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <div style={{ fontSize: 12, color: "#64748b" }}>
              XML, CSV, and TXT files are supported.
            </div>
          </label>
        </div>

        <div
          style={{
            ...controlCardStyle,
            display: "grid",
            gap: 12,
            marginTop: 14,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 12, color: theme.mutedText, fontWeight: 700, letterSpacing: 0.2 }}>Latest payroll run</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>{summary.latestPeriodLabel}</div>
              <div style={{ color: theme.mutedText, marginTop: 4 }}>
                {summary.latestRunLabel}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={subtlePillStyle}>
                {latestPayrollRun?.import_run_id ? "Determined automatically by DB" : "No payroll run found"}
              </span>
              {latestPayrollRun?.is_active_for_period ? (
                <span style={successPillStyle}>Active for period</span>
              ) : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ color: "#756b5f", fontSize: 12 }}>
              {latestPayrollRun?.import_run_id
                ? `Imported ${summary.latestRunImportedLabel} • Run ID ${latestPayrollRun.import_run_id}`
                : "The latest payroll run will appear here once a run is available."}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
            gap: 12,
            marginTop: 14,
            marginBottom: 12,
          }}
        >
          <div style={statCardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Total import runs</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.totalRuns}</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Tracked periods</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.totalPeriods}</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Active periods</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.activePeriods}</div>
          </div>
          <div style={statCardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Most recent import</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.latestImportLabel}</div>
          </div>
        </div>

        {uploadMsg && (
          <div
            style={{
              ...cardStyle,
              borderColor: uploadMsg.kind === "deduped" ? theme.borderStrong : theme.successBorder,
              background: uploadMsg.kind === "deduped" ? theme.controlSurface || theme.surfaceMuted : theme.successBg,
              color: uploadMsg.kind === "deduped" ? theme.text : theme.successText,
              marginBottom: 12,
            }}
          >
            {uploadMsg.text}
          </div>
        )}

        {uploading && (
          <div
            style={{
              ...cardStyle,
              borderColor: theme.borderStrong,
              background: theme.controlSurface || theme.surface,
              color: theme.text,
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              Processing payroll upload{uploadingFileName ? `: ${uploadingFileName}` : ""}
            </div>
            <div style={{ color: theme.mutedText, marginTop: 4, fontSize: 13 }}>
              Uploading the file and rebuilding this run in the background. Elapsed: {uploadElapsedSec}s
            </div>
          </div>
        )}

        {err && (
          <div
            style={{
              ...cardStyle,
              borderColor: theme.warningBorder,
              background: theme.warningBg,
              color: theme.warningText,
              marginBottom: 12,
            }}
          >
            {err}
          </div>
        )}
      </div>

      <div style={{ maxWidth: "100%" }}>
        {loading && <div>Loading…</div>}

        {!loading && !err && grouped.length === 0 && (
          <div style={{ color: "#666" }}>No import runs yet.</div>
        )}

        {!loading && !err &&
          grouped.map((g) => {
          const periodIsActive = g.runs.some((x) => x.is_active_for_period);

          return (
            <div key={g.key} style={{ ...tableWrapStyle, marginTop: 18 }}>
              <div style={tableHeaderStyle}>
                <div>
                  <h3 style={sectionTitleStyle}>{g.periodLabel}</h3>
                  <div style={{ color: "#666", fontSize: 13 }}>
                    {g.period_begin ?? "?"} → {g.period_end ?? "?"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {latestPayrollRun && g.runs.some((x) => x.import_run_id === latestPayrollRun.import_run_id) && (
                    <span style={periodMetaPillStyle}>
                      Includes latest run
                    </span>
                  )}
                  {periodIsActive && (
                    <span style={{ ...periodMetaPillStyle, borderColor: "#d8e4d7", background: "#f4f8f2", color: "#4d6b50" }}>
                      Active period
                    </span>
                  )}
                  <span style={{ color: "#666", fontSize: 12 }}>
                    {g.runs.length} import run{g.runs.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div style={tableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: 96 }}>Run</th>
                      <th style={{ ...thStyle, width: 240 }}>Imported</th>
                      <th style={{ ...thStyle, width: 100 }}>Status</th>
                      <th style={thStyle}>File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.runs.map((r) => (
                      <tr key={r.import_run_id} style={{ fontWeight: r.is_active_for_period ? 700 : 400 }}>
                        <td style={tdStyle}>
                          <Link to={`/import-runs/${r.import_run_id}`} style={rowLinkStyle}>
                            View
                          </Link>
                        </td>
                        <td style={tdStyle}>{fmtImported(r.imported_at)}</td>
                        <td style={tdStyle}>
                          {r.is_active_for_period ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={activeCheckStyle}>✓</span>
                              {latestPayrollRun?.import_run_id === r.import_run_id ? (
                                <span style={{ color: "#4d6b50", fontSize: 12, fontWeight: 700 }}>Latest</span>
                              ) : null}
                            </div>
                          ) : latestPayrollRun?.import_run_id === r.import_run_id ? (
                            <span style={{ color: "#667085", fontSize: 12, fontWeight: 700 }}>Latest</span>
                          ) : (
                            <span style={{ color: "#667085" }}>—</span>
                          )}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            color: "#666",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={r.storage_path ?? ""}
                        >
                          {r.storage_path ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
