import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
const stickyHeaderStyle = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  background: "rgba(246, 243, 238, 0.92)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  borderBottom: `1px solid ${theme.headerBorder}`,
  paddingBottom: 12,
  marginBottom: 18,
};
const tableWrapStyle = {
  ...sectionCardStyle,
  padding: 0,
  overflow: "hidden",
};
const tableScrollStyle = {
  position: "relative",
  overflowX: "auto",
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
  fontWeight: 700,
  fontSize: 14,
  color: "#111",
  background: theme.surface,
  borderBottom: "1px solid #ddd",
  boxShadow: "0 1px 0 #ddd",
};
const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f0f0",
  color: "#111",
  background: theme.surface,
};
const sectionTitleStyle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
};
const sectionHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  padding: "16px 16px 12px",
  borderBottom: "1px solid #eef1f5",
  flexWrap: "wrap",
};
const mutedTextStyle = {
  color: theme.mutedText,
  fontSize: 13,
};

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(String(v) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "long", day: "2-digit", year: "numeric" });
}

function fmtDateDow(v) {
  if (!v) return "";
  const d = new Date(String(v) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function money(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

const actionRowStyle = { display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" };
const btnPrimaryStyle = {
  opacity: 1,
};
const btnGhostStyle = {
  opacity: 1,
};
const pillActiveStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: theme.successBg,
  border: `1px solid ${theme.successBorder}`,
  color: theme.successText,
  fontWeight: 700,
  fontSize: 13,
};

export default function ImportRunDetail() {
  const { import_run_id } = useParams();
  const [run, setRun] = useState(null);
  const [punches, setPunches] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [billableRows, setBillableRows] = useState([]);
  const [err, setErr] = useState(null);
  const [makingActive, setMakingActive] = useState(false);
  const [makingInactive, setMakingInactive] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessStartedAt, setReprocessStartedAt] = useState(null);
  const [reprocessElapsedSec, setReprocessElapsedSec] = useState(0);
  const [reprocessMsg, setReprocessMsg] = useState(null);
  const [inactiveMsg, setInactiveMsg] = useState(null);

  async function load() {
    setErr(null);

    const rRes = await supabase
      .schema("raw")
      .from("payroll_import_runs")
      .select(
        "import_run_id, period_begin, period_end, imported_at, bucket, storage_path, is_active_for_period, file_sha256"
      )
      .eq("import_run_id", import_run_id)
      .single();

    if (rRes.error) {
      setErr(rRes.error.message);
      return;
    }
    setRun(rRes.data);

    const uRes = await supabase
      .schema("raw")
      .from("payroll_unmatched_employees")
      .select(
        "unmatched_id, full_name, kelly_employee_unique_id, kelly_employee_code, kelly_worker_key, total_reg_hours, total_ot_hours, total_ot2_hours"
      )
      .eq("import_run_id", import_run_id)
      .order("full_name", { ascending: true });

    if (uRes.error) {
      setErr(uRes.error.message);
      return;
    }
    setUnmatched(uRes.data ?? []);

    const pRes = await supabase
      .schema("raw")
      .from("payroll_punches")
      .select(
        "payroll_punch_id, full_name, punch_date, hours, non_ot_hours, ot1_hours, ot2_hours, kelly_worker_key, kelly_employee_code, kelly_employee_unique_id"
      )
      .eq("import_run_id", import_run_id)
      .order("punch_date", { ascending: false });

    if (pRes.error) {
      setErr(pRes.error.message);
      return;
    }
    setPunches(pRes.data ?? []);

    const billableRes = await supabase
      .schema("app")
      .from("invoice_preview_po_detail_by_run_view")
      .select(
        "import_run_id, consultant_id, consultant_name, kelly_employee_code, kelly_worker_key, total_amount"
      )
      .eq("import_run_id", import_run_id);

    if (billableRes.error) {
      setErr(billableRes.error.message);
      return;
    }
    setBillableRows(billableRes.data ?? []);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await load();
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [import_run_id]);

  useEffect(() => {
    if (!reprocessing || !reprocessStartedAt) return undefined;

    setReprocessElapsedSec(Math.max(0, Math.floor((Date.now() - reprocessStartedAt) / 1000)));
    const timer = window.setInterval(() => {
      setReprocessElapsedSec(Math.max(0, Math.floor((Date.now() - reprocessStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [reprocessing, reprocessStartedAt]);

  async function makeActiveForPeriod() {
    setErr(null);
    setInactiveMsg(null);
    setMakingActive(true);

    const { error } = await supabase.schema("app").rpc("set_active_payroll_import_run", {
      p_import_run_id: import_run_id,
    });

    if (error) {
      setErr(error.message);
      setMakingActive(false);
      return;
    }

    await load();
    setMakingActive(false);
  }

  async function makeInactiveForPeriod() {
    setErr(null);
    setInactiveMsg(null);
    setMakingInactive(true);

    const { error } = await supabase.schema("app").rpc("set_inactive_payroll_import_run", {
      p_import_run_id: import_run_id,
    });

    if (error) {
      setErr(error.message);
      setMakingInactive(false);
      return;
    }

    await load();
    setInactiveMsg("This import run is no longer marked active for its period.");
    setMakingInactive(false);
  }

  async function reprocessForce() {
    setErr(null);
    setReprocessMsg(null);

    if (!run?.bucket || !run?.storage_path) {
      setErr("Missing bucket/storage_path for this run.");
      return;
    }

    setReprocessing(true);
    setReprocessStartedAt(Date.now());
    setReprocessElapsedSec(0);

    const { data, error } = await supabase.functions.invoke("kelly_payroll_import", {
      body: { bucket: run.bucket, path: run.storage_path, force: true },
    });

    if (error) {
      setErr(error.message);
      setReprocessing(false);
      setReprocessStartedAt(null);
      return;
    }

    if (!data?.ok) {
      setErr(data?.error || "Reprocess failed");
      setReprocessing(false);
      setReprocessStartedAt(null);
      return;
    }

    await load();
    setReprocessMsg(
      `Reprocessed ${Number(data.punches_found ?? 0).toLocaleString()} punches into ${Number(data.time_entries ?? 0).toLocaleString()} time entries with ${Number(data.unmatched_employees ?? 0).toLocaleString()} unmatched worker${Number(data.unmatched_employees ?? 0) === 1 ? "" : "s"}.`
    );
    setReprocessing(false);
    setReprocessStartedAt(null);
  }

  const groupedPunches = useMemo(() => {
    const billableByWorkerKey = new Map();
    const billableByEmployeeCode = new Map();

    for (const row of billableRows ?? []) {
      const totalAmount = Number(row.total_amount ?? 0);
      if (row.kelly_worker_key) {
        billableByWorkerKey.set(
          row.kelly_worker_key,
          (billableByWorkerKey.get(row.kelly_worker_key) ?? 0) + totalAmount
        );
      }
      if (row.kelly_employee_code) {
        billableByEmployeeCode.set(
          row.kelly_employee_code,
          (billableByEmployeeCode.get(row.kelly_employee_code) ?? 0) + totalAmount
        );
      }
    }

    const sorted = [...(punches ?? [])].sort((a, b) =>
      String(b.punch_date ?? "").localeCompare(String(a.punch_date ?? ""))
    );

    const map = new Map();

    for (const p of sorted) {
      const key = p.kelly_worker_key ?? "(no worker key)";
      if (!map.has(key)) {
        map.set(key, {
          worker_key: key,
          kelly_employee_unique_id: p.kelly_employee_unique_id ?? "",
          kelly_employee_code: p.kelly_employee_code ?? "",
          full_name: p.full_name ?? "",
          rows: [],
        });
      }
      const g = map.get(key);
      // capture code/name if later rows have it
      if (!g.kelly_employee_unique_id && p.kelly_employee_unique_id) g.kelly_employee_unique_id = p.kelly_employee_unique_id;
      if (!g.kelly_employee_code && p.kelly_employee_code) g.kelly_employee_code = p.kelly_employee_code;
      if (!g.full_name && p.full_name) g.full_name = p.full_name;
      g.rows.push(p);
    }

    return Array.from(map.values())
      .map((g) => {
        const totals = g.rows.reduce(
          (acc, row) => {
            acc.reg += Number(row.non_ot_hours ?? 0);
            acc.ot1 += Number(row.ot1_hours ?? 0);
            acc.ot2 += Number(row.ot2_hours ?? 0);
            acc.total += Number(row.hours ?? 0);
            return acc;
          },
          { reg: 0, ot1: 0, ot2: 0, total: 0 }
        );

        const billableTotal =
          billableByWorkerKey.get(g.worker_key) ??
          (g.kelly_employee_code ? billableByEmployeeCode.get(g.kelly_employee_code) : undefined) ??
          null;

        return { ...g, totals, billableTotal };
      })
      .sort((a, b) => String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")));
  }, [billableRows, punches]);

  if (err) return <div style={{ padding: 24, color: "crimson" }}>{err}</div>;
  if (!run) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <Link to="/import-runs" style={{ color: theme.link, fontWeight: 600, textDecoration: "none" }}>
          ← Back to import runs
        </Link>

        <div style={{ ...sectionCardStyle, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>Import Run</h2>
              <div style={{ ...mutedTextStyle, marginTop: 6 }}>
                Period: {fmtDate(run.period_begin) || "?"} → {fmtDate(run.period_end) || "?"} • Imported: {fmtDateTime(run.imported_at)}
              </div>
              <div style={{ ...mutedTextStyle, marginTop: 4 }}>
                Source file: {run.storage_path || "—"}
              </div>
            </div>
            {run.is_active_for_period ? (
              <span style={pillActiveStyle}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: "#2e7d32", display: "inline-block" }} />
                Active for period
              </span>
            ) : null}
          </div>

          <div style={actionRowStyle}>
            {run.is_active_for_period ? (
              <button
                onClick={makeInactiveForPeriod}
                disabled={makingInactive}
                style={{ ...btnGhostStyle, opacity: makingInactive ? 0.7 : 1 }}
                className="button-like"
                title="Clears the active flag for this import run."
              >
                {makingInactive ? "Setting Inactive…" : "Set Inactive"}
              </button>
            ) : (
              <button
                onClick={makeActiveForPeriod}
                disabled={makingActive}
                style={{ ...btnPrimaryStyle, opacity: makingActive ? 0.7 : 1 }}
                className="button-like button-like--primary"
              >
                {makingActive ? "Setting Active…" : "Make Active"}
              </button>
            )}

            <Link to={`/import-runs/${import_run_id}/billable`} style={btnGhostStyle} className="button-like">
              Billable Preview
            </Link>

            <button
              onClick={reprocessForce}
              disabled={reprocessing}
              style={{ ...btnGhostStyle, opacity: reprocessing ? 0.7 : 1 }}
              className="button-like"
              title="Re-runs the import for this exact file/run (clears and rebuilds time_entries and unmatched)."
            >
              {reprocessing ? "Reprocessing…" : "Reprocess (force)"}
            </button>
          </div>
        </div>

        {reprocessing && (
          <div
            style={{
              ...cardStyle,
              marginTop: 10,
              borderColor: theme.primarySoftBorder,
              background: theme.primarySoftBg,
              color: theme.primary,
            }}
          >
            Reprocessing is still running. Elapsed: {reprocessElapsedSec}s. Large runs can take over a minute because this rebuilds payroll punches, time entries, and unmatched workers in one request.
          </div>
        )}

        {!reprocessing && reprocessMsg && (
          <div
            style={{
              ...cardStyle,
              marginTop: 10,
              borderColor: theme.successBorder,
              background: theme.successBg,
              color: theme.successText,
            }}
          >
            {reprocessMsg}
          </div>
        )}

        {inactiveMsg && !run.is_active_for_period && (
          <div
            style={{
              ...cardStyle,
              marginTop: 10,
              borderColor: theme.border,
              background: theme.surfaceMuted,
              color: theme.mutedText,
            }}
          >
            {inactiveMsg}
          </div>
        )}
      </div>

      <div style={{ ...tableWrapStyle, marginTop: 18 }}>
        <div style={sectionHeaderStyle}>
          <h3 style={sectionTitleStyle}>Unmatched employees</h3>
          <div style={mutedTextStyle}>{unmatched.length} record{unmatched.length === 1 ? "" : "s"}</div>
        </div>
        {unmatched.length === 0 ? (
          <div style={{ padding: 16, color: "#666" }}>None.</div>
        ) : (
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Kelly UID</th>
                  <th style={thStyle}>Kelly Code</th>
                  <th style={thStyle}>Worker Key</th>
                  <th style={thStyle}>Reg</th>
                  <th style={thStyle}>OT</th>
                  <th style={thStyle}>OT2</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((u) => (
                  <tr key={u.unmatched_id}>
                    <td style={tdStyle}>{u.full_name ?? ""}</td>
                    <td style={tdStyle}>{u.kelly_employee_unique_id ?? ""}</td>
                    <td style={tdStyle}>{u.kelly_employee_code ?? ""}</td>
                    <td style={tdStyle}>{u.kelly_worker_key ?? ""}</td>
                    <td style={tdStyle}>{u.total_reg_hours}</td>
                    <td style={tdStyle}>{u.total_ot_hours}</td>
                    <td style={tdStyle}>{u.total_ot2_hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ ...sectionCardStyle, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <div>
            <h3 style={sectionTitleStyle}>Punches</h3>
            <div style={mutedTextStyle}>Showing {punches.length} punches grouped by consultant</div>
          </div>
        </div>

        {groupedPunches.length === 0 ? (
          <div style={{ color: "#666" }}>No punches for this run.</div>
        ) : (
          groupedPunches.map((g) => (
            <details key={g.worker_key} style={{ ...tableWrapStyle, marginTop: 14 }}>
              <summary
                style={{
                  ...sectionHeaderStyle,
                  cursor: "pointer",
                  listStyle: "none",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                    <h4 style={{ margin: 0 }}>{g.full_name || "(No name)"}</h4>
                    <div style={{ fontSize: 14, color: theme.mutedText }}>
                      Billable{" "}
                      <b style={{ color: theme.text, fontSize: 18 }}>
                        {g.billableTotal == null ? "—" : money(g.billableTotal)}
                      </b>
                    </div>
                  </div>
                  <div style={{ ...mutedTextStyle, marginTop: 8, display: "flex", flexWrap: "wrap", gap: 14 }}>
                    <span style={mutedTextStyle}>
                      Total: <b style={{ color: "#111", fontSize: 15 }}>{g.totals.total.toLocaleString()}</b>
                    </span>
                    <span style={mutedTextStyle}>
                      Reg: <b style={{ color: "#111" }}>{g.totals.reg.toLocaleString()}</b>
                    </span>
                    <span style={mutedTextStyle}>
                      OT1: <b style={{ color: "#111" }}>{g.totals.ot1.toLocaleString()}</b>
                    </span>
                    <span style={mutedTextStyle}>
                      OT2: <b style={{ color: "#111" }}>{g.totals.ot2.toLocaleString()}</b>
                    </span>
                    <span style={mutedTextStyle}>
                      Punches: <b style={{ color: "#111" }}>{g.rows.length}</b>
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: theme.mutedText,
                      fontSize: 12,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <span>UID {g.kelly_employee_unique_id || "—"}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <div
                    className="button-like button-like--compact"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ fontSize: 11, opacity: 0.7 }}>▾</span>
                    <span>View daily punches</span>
                  </div>
                </div>
              </summary>

              <div style={tableScrollStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Reg</th>
                      <th style={thStyle}>OT1</th>
                      <th style={thStyle}>OT2</th>
                      <th style={thStyle}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.slice(0, 200).map((p) => (
                      <tr key={p.payroll_punch_id}>
                        <td style={tdStyle}>{fmtDateDow(p.punch_date)}</td>
                        <td style={tdStyle}>{p.non_ot_hours ?? ""}</td>
                        <td style={tdStyle}>{p.ot1_hours ?? ""}</td>
                        <td style={tdStyle}>{p.ot2_hours ?? ""}</td>
                        <td style={tdStyle}>{p.hours ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
