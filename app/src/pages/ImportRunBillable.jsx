import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { theme } from "../theme";

function money(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(String(v) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "long", day: "2-digit", year: "numeric" });
}

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
const confirmOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.42)",
  zIndex: 80,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};
const confirmCardStyle = {
  background: theme.surface,
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  boxShadow: "0 24px 50px rgba(25, 14, 5, 0.16)",
  width: "min(620px, 100%)",
  maxHeight: "min(88vh, 780px)",
  overflowY: "auto",
  padding: 22,
};

function assignmentOptionLabel(item) {
  const project = item.purchase_order?.project_name ?? "(No project)";
  const po = item.purchase_order?.purchase_order_number ? `PO ${item.purchase_order.purchase_order_number}` : "No PO";
  const dates = [fmtDate(item.assignment_start_date), item.assignment_end_date ? fmtDate(item.assignment_end_date) : "(open)"]
    .filter(Boolean)
    .join(" → ");
  return [project, po, dates].filter(Boolean).join(" • ");
}

export default function ImportRunBillable() {
  const { import_run_id } = useParams();
  const [rows, setRows] = useState([]);
  const [detailRows, setDetailRows] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState(null);
  const [unmatchedRows, setUnmatchedRows] = useState([]);
  const [unassignedRows, setUnassignedRows] = useState([]);
  const [missingRateRows, setMissingRateRows] = useState([]);
  const [ptoRows, setPtoRows] = useState([]);
  const [previewTab, setPreviewTab] = useState("po");
  const [overrideContext, setOverrideContext] = useState(null);
  const [overrideAssignments, setOverrideAssignments] = useState([]);
  const [overrideAssignmentId, setOverrideAssignmentId] = useState("");
  const [overrideDate, setOverrideDate] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideErr, setOverrideErr] = useState(null);

  async function loadBillablePreview(aliveRef = { alive: true }) {
      setErr(null);
      setLoading(true);

      const runRes = await supabase
        .schema("raw")
        .from("payroll_import_runs")
        .select("import_run_id, period_begin, period_end, imported_at, is_active_for_period")
        .eq("import_run_id", import_run_id)
        .single();

      if (!aliveRef.alive) return;
      if (runRes.error) {
        setErr(runRes.error.message);
        setLoading(false);
        return;
      }
      setRun(runRes.data);

      const { data, error } = await supabase
        .schema("app")
        .from("invoice_preview_po_summary_by_run_view")
        .select("*")
        .eq("import_run_id", import_run_id)
        .order("customer_name", { ascending: true })
        .order("project_name", { ascending: true });

      if (!aliveRef.alive) return;
      if (error) {
        setErr(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows(data ?? []);

      const detailRes = await supabase
        .schema("app")
        .from("invoice_preview_po_detail_by_run_view")
        .select("*")
        .eq("import_run_id", import_run_id)
        .order("consultant_name", { ascending: true })
        .order("service_date", { ascending: true });

      if (!aliveRef.alive) return;
      if (detailRes.error) {
        setErr(detailRes.error.message);
        setLoading(false);
        return;
      }
      setDetailRows(detailRes.data ?? []);

      // --- Exceptions / readiness checks
      const unmatchedRes = await supabase
      .schema("raw")
      .from("payroll_unmatched_employees")
      .select(
          "unmatched_id, full_name, kelly_employee_unique_id, kelly_employee_code, kelly_worker_key, total_reg_hours, total_ot_hours, total_ot2_hours"
        )
        .eq("import_run_id", import_run_id)
        .order("full_name", { ascending: true });

      if (!aliveRef.alive) return;
      if (unmatchedRes.error) {
        setErr(unmatchedRes.error.message);
        setLoading(false);
        return;
      }
      setUnmatchedRows(unmatchedRes.data ?? []);

      const unassignedRes = await supabase
        .schema("app")
        .from("unassigned_time_entries_by_run_ui_view")
        .select("import_run_id, consultant_id, consultant_name, kelly_worker_key, first_uncovered_date, last_uncovered_date, uncovered_hours")
        .eq("import_run_id", import_run_id)
        .order("uncovered_hours", { ascending: false });

      if (!aliveRef.alive) return;
      if (unassignedRes.error) {
        setErr(unassignedRes.error.message);
        setLoading(false);
        return;
      }
      setUnassignedRows(unassignedRes.data ?? []);

      const ptoRes = await supabase
        .schema("app")
        .from("pto_time_by_run_view")
        .select("*")
        .eq("import_run_id", import_run_id)
        .order("consultant_name", { ascending: true })
        .order("service_date", { ascending: true });

      if (!aliveRef.alive) return;
      if (ptoRes.error) {
        if (!String(ptoRes.error.message ?? "").includes("pto_time_by_run_view")) {
          setErr((prev) => prev ?? ptoRes.error.message);
          setLoading(false);
          return;
        }
        setPtoRows([]);
      } else {
        setPtoRows(ptoRes.data ?? []);
      }

      const missingRatesRes = await supabase
        .schema("app")
        .from("invoice_preview_missing_rates_by_run_view")
        .select(
          "import_run_id, purchase_order_id, purchase_order_number, project_name, customer_name, consultant_id, consultant_name, service_date, bill_rate_regular, bill_rate_overtime, total_amount"
        )
        .eq("import_run_id", import_run_id)
        .order("customer_name", { ascending: true })
        .order("project_name", { ascending: true })
        .order("consultant_name", { ascending: true })
        .order("service_date", { ascending: true });

      if (!aliveRef.alive) return;
      if (missingRatesRes.error) {
        setErr(missingRatesRes.error.message);
        setLoading(false);
        return;
      }

      const rawMissingRows = missingRatesRes.data ?? [];
      const poIds = Array.from(new Set(rawMissingRows.map((r) => r.purchase_order_id).filter(Boolean)));

      if (poIds.length === 0) {
        setMissingRateRows(rawMissingRows);
      } else {
        const poStatusRes = await supabase
          .schema("app")
          .from("purchase_orders")
          .select("purchase_order_id, tracking_active")
          .in("purchase_order_id", poIds);

        if (!aliveRef.alive) return;
        if (poStatusRes.error) {
          setErr((prev) => prev ?? poStatusRes.error.message);
          setLoading(false);
          return;
        }

        const trackingMap = new Map((poStatusRes.data ?? []).map((po) => [po.purchase_order_id, po.tracking_active]));
        setMissingRateRows(
          rawMissingRows.filter((r) => {
            if (!r.purchase_order_id) return true;
            return trackingMap.get(r.purchase_order_id) !== false;
          })
        );
      }

      setLoading(false);
  }

  useEffect(() => {
    const aliveRef = { alive: true };
    loadBillablePreview(aliveRef);

    return () => {
      aliveRef.alive = false;
    };
  }, [import_run_id]);

  async function openBillingOverride(row) {
    if (!row?.consultant_id) return;

    setOverrideContext(row);
    setOverrideAssignments([]);
    setOverrideAssignmentId("");
    setOverrideDate(run?.period_end ?? "");
    setOverrideNote(run?.period_end ? `Billing through ${fmtDate(run.period_end)} (PO extension pending)` : "");
    setOverrideErr(null);
    setOverrideLoading(true);

    const res = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .select(
        "assignment_id, consultant_id, purchase_order_id, assignment_start_date, assignment_end_date, billing_end_date_override, purchase_order:purchase_orders(purchase_order_number, project_name)"
      )
      .eq("consultant_id", row.consultant_id)
      .is("deleted_at", null)
      .order("assignment_start_date", { ascending: false });

    if (res.error) {
      setOverrideErr(res.error.message);
      setOverrideLoading(false);
      return;
    }

    const options = [...(res.data ?? [])].sort((a, b) => {
      const aEnd = a.assignment_end_date ? new Date(`${a.assignment_end_date}T00:00:00`).getTime() : -Infinity;
      const bEnd = b.assignment_end_date ? new Date(`${b.assignment_end_date}T00:00:00`).getTime() : -Infinity;
      if (bEnd !== aEnd) return bEnd - aEnd;
      const aStart = a.assignment_start_date ? new Date(`${a.assignment_start_date}T00:00:00`).getTime() : -Infinity;
      const bStart = b.assignment_start_date ? new Date(`${b.assignment_start_date}T00:00:00`).getTime() : -Infinity;
      return bStart - aStart;
    });
    setOverrideAssignments(options);
    setOverrideAssignmentId(options[0]?.assignment_id ?? "");
    setOverrideLoading(false);
  }

  function closeBillingOverride() {
    if (overrideSaving) return;
    setOverrideContext(null);
    setOverrideAssignments([]);
    setOverrideAssignmentId("");
    setOverrideDate("");
    setOverrideNote("");
    setOverrideErr(null);
    setOverrideLoading(false);
  }

  async function saveBillingOverride() {
    if (!overrideAssignmentId || !overrideDate) {
      setOverrideErr("Choose an assignment and bill-through date.");
      return;
    }

    setOverrideSaving(true);
    setOverrideErr(null);

    const { error } = await supabase.schema("app").rpc("set_assignment_billing_override", {
      p_assignment_id: overrideAssignmentId,
      p_bill_through: overrideDate,
      p_note: overrideNote.trim() || null,
    });

    if (error) {
      setOverrideErr(error.message);
      setOverrideSaving(false);
      return;
    }

    await loadBillablePreview({ alive: true });
    setOverrideSaving(false);
    closeBillingOverride();
  }

  const totals = useMemo(() => {
    const poCount = rows.length;
    const consultantCount = rows.reduce((s, r) => s + Number(r.consultant_count ?? 0), 0);
    const totalHours = rows.reduce((s, r) => s + Number(r.total_hours ?? 0), 0);
    const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
    return { poCount, consultantCount, totalHours, totalAmount };
  }, [rows]);

  const consultantGroups = useMemo(() => {
    const map = new Map();

    for (const r of detailRows) {
      const key = r.consultant_id ?? r.consultant_name ?? `unknown-${map.size}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          consultant_id: r.consultant_id,
          consultant_name: r.consultant_name,
          kelly_employee_unique_id: r.kelly_employee_unique_id,
          purchaseOrders: new Set(),
          reg_hours: 0,
          ot_hours: 0,
          ot2_hours: 0,
          total_hours: 0,
          total_amount: 0,
          rows: [],
        });
      }

      const group = map.get(key);
      group.rows.push(r);
      if (r.purchase_order_id) group.purchaseOrders.add(r.purchase_order_id);
      group.reg_hours += Number(r.reg_hours ?? 0);
      group.ot_hours += Number(r.ot_hours ?? 0);
      group.ot2_hours += Number(r.ot2_hours ?? 0);
      group.total_hours += Number(
        r.total_hours ??
          (Number(r.reg_hours ?? 0) + Number(r.ot_hours ?? 0) + Number(r.ot2_hours ?? 0))
      );
      group.total_amount += Number(r.total_amount ?? 0);
    }

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        po_count: group.purchaseOrders.size,
      }))
      .sort((a, b) => {
        if (b.total_amount !== a.total_amount) return b.total_amount - a.total_amount;
        return String(a.consultant_name ?? "").localeCompare(String(b.consultant_name ?? ""));
      });
  }, [detailRows]);

  const readiness = useMemo(() => {
    const unmatchedCount = unmatchedRows.length;
    const unassignedCount = unassignedRows.length;
    const missingRatesCount = missingRateRows.filter((row) => !!row.purchase_order_id).length;
    const totalIssues = unmatchedCount + unassignedCount + missingRatesCount;

    return {
      unmatchedCount,
      unassignedCount,
      missingRatesCount,
      totalIssues,
      ready: totalIssues === 0,
    };
  }, [unmatchedRows, unassignedRows, missingRateRows]);

  const matchedMissingRateRows = useMemo(
    () => missingRateRows.filter((row) => !!row.purchase_order_id),
    [missingRateRows]
  );

  const ptoSummary = useMemo(() => {
    const totalHours = ptoRows.reduce((sum, row) => sum + Number(row.pto_hours ?? 0), 0);
    const consultantCount = new Set(ptoRows.map((row) => row.consultant_id || row.consultant_name).filter(Boolean)).size;
    return { totalHours, consultantCount };
  }, [ptoRows]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to={`/import-runs/${import_run_id}`}>← Back to import run</Link>
        </div>

        <h2 style={{ marginTop: 12 }}>Billable Preview</h2>

        {run && (
          <div style={{ color: "#666", marginTop: 4 }}>
            Period: {fmtDate(run.period_begin) || "?"} → {fmtDate(run.period_end) || "?"}
            {run.is_active_for_period ? " • (ACTIVE)" : ""}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(140px, 1fr))",
            gap: 12,
            marginTop: 14,
            marginBottom: 12,
          }}
        >
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Total billed</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{money(totals.totalAmount)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Total hours</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{totals.totalHours.toLocaleString()}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>POs</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{totals.poCount}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Consultant count (sum)</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{totals.consultantCount}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 8,
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            border: readiness.ready ? `1px solid ${theme.successBorder}` : `1px solid ${theme.warningBorder}`,
            background: readiness.ready ? theme.successBg : theme.warningBg,
            color: readiness.ready ? theme.successText : theme.warningText,
            fontWeight: 700,
          }}
        >
          {readiness.ready
            ? "Ready to generate: no unmatched workers, no unassigned time, no missing bill rates."
            : `Not ready: ${readiness.unmatchedCount} unmatched, ${readiness.unassignedCount} unassigned, ${readiness.missingRatesCount} missing-rate issues.`}
        </div>
      </div>
      <div style={{ height: 6 }} />

      {!loading && !err && !readiness.ready && (
        <div style={{ ...sectionCardStyle, display: "grid", gap: 18, marginBottom: 20 }}>
          <h3 style={sectionTitleStyle}>Exceptions</h3>
          {unmatchedRows.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 8 }}>Unmatched workers</h3>
              <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th>Name</th>
                    <th>Kelly UID</th>
                    <th>Kelly Code</th>
                    <th>Worker Key</th>
                    <th>Reg</th>
                    <th>OT</th>
                    <th>OT2</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedRows.map((r) => (
                    <tr key={r.unmatched_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td>{r.full_name ?? ""}</td>
                      <td>{r.kelly_employee_unique_id ?? ""}</td>
                      <td>{r.kelly_employee_code ?? ""}</td>
                      <td>{r.kelly_worker_key ?? ""}</td>
                      <td>{r.total_reg_hours ?? 0}</td>
                      <td>{r.total_ot_hours ?? 0}</td>
                      <td>{r.total_ot2_hours ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unassignedRows.length > 0 && (
            <div style={sectionCardStyle}>
              <h3 style={sectionTitleStyle}>Unassigned time</h3>
              <div style={{ color: theme.mutedText, fontSize: 12, marginBottom: 8 }}>
                No assignment matched these hours. If the assignment ended but billing should continue through payroll close,
                set a billing override on the assignment.
              </div>
              <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th>Consultant</th>
                    <th>Worker Key</th>
                    <th>First Uncovered</th>
                    <th>Last Uncovered</th>
                    <th>Uncovered Hours</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td>
                        {r.consultant_id ? (
                          <Link to={`/consultants/${r.consultant_id}`}>{r.consultant_name ?? ""}</Link>
                        ) : (
                          r.consultant_name ?? ""
                        )}
                      </td>
                      <td>{r.kelly_worker_key ?? ""}</td>
                      <td>{fmtDate(r.first_uncovered_date)}</td>
                      <td>{fmtDate(r.last_uncovered_date)}</td>
                      <td>{r.uncovered_hours ?? 0}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {r.consultant_id ? (
                            <button type="button" className="subtle-button" onClick={() => openBillingOverride(r)}>
                              Bill through…
                            </button>
                          ) : null}
                          {r.consultant_id ? (
                            <Link to={`/consultants/${r.consultant_id}`}>
                              <button style={{ padding: "6px 10px" }}>Fix →</button>
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {matchedMissingRateRows.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 8 }}>Missing bill rates on matched assignments</h3>
              <div style={{ color: theme.mutedText, fontSize: 12, marginBottom: 8 }}>
                These rows matched an assignment/PO, but at least one bill rate is still blank.
              </div>
              <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th>Project</th>
                    <th>PO #</th>
                    <th>Consultant</th>
                    <th>Date</th>
                    <th>Bill Reg</th>
                    <th>Bill OT</th>
                    <th>Total $</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matchedMissingRateRows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td>
                        {r.purchase_order_id ? (
                          <Link to={`/purchase-orders/${r.purchase_order_id}`}>{r.project_name ?? ""}</Link>
                        ) : (
                          r.project_name ?? ""
                        )}
                      </td>
                      <td>{r.purchase_order_number ?? ""}</td>
                      <td>
                        {r.consultant_id ? (
                          <Link to={`/consultants/${r.consultant_id}`}>{r.consultant_name ?? ""}</Link>
                        ) : (
                          r.consultant_name ?? ""
                        )}
                      </td>
                      <td>{fmtDate(r.service_date)}</td>
                      <td>{money(r.bill_rate_regular)}</td>
                      <td>{money(r.bill_rate_overtime)}</td>
                      <td>{money(r.total_amount)}</td>
                      <td style={{ textAlign: "right" }}>
                        {r.purchase_order_id ? (
                          <Link to={`/purchase-orders/${r.purchase_order_id}`}>
                            <button style={{ padding: "6px 10px" }}>Fix →</button>
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ptoRows.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 8 }}>PTO (Non-Billable)</h3>
              <div style={{ color: theme.mutedText, fontSize: 12, marginBottom: 8 }}>
                Informational only. PTO does not affect readiness unless your billing rules explicitly make PTO billable.
                {` ${ptoSummary.consultantCount} consultant${ptoSummary.consultantCount === 1 ? "" : "s"} • ${ptoSummary.totalHours.toLocaleString()} PTO hours`}
              </div>
              <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th>Consultant</th>
                    <th>Worker Key</th>
                    <th>Date</th>
                    <th>PTO Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {ptoRows.map((row, i) => (
                    <tr key={`${row.consultant_id ?? row.kelly_worker_key ?? "pto"}_${row.service_date ?? i}`} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td>
                        {row.consultant_id ? (
                          <Link to={`/consultants/${row.consultant_id}`}>{row.consultant_name ?? ""}</Link>
                        ) : (
                          row.consultant_name ?? ""
                        )}
                      </td>
                      <td>{row.kelly_worker_key ?? ""}</td>
                      <td>{fmtDate(row.service_date)}</td>
                      <td>{Number(row.pto_hours ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading && <div>Loading…</div>}
      {err && <div style={{ color: "crimson" }}>{err}</div>}

      {!loading && !err && rows.length === 0 && (
        <div style={{ color: "#666" }}>No billable rows found for this run.</div>
      )}

      {!loading && !err && rows.length > 0 && (
        <div style={sectionCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                ["po", `By PO (${rows.length})`],
                ["consultant", `By Consultant (${consultantGroups.length})`],
              ].map(([key, label]) => {
                const on = previewTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreviewTab(key)}
                    style={{
                      height: 36,
                      padding: "0 4px",
                      borderRadius: 0,
                      border: "none",
                      borderBottom: `2px solid ${on ? theme.primary : "transparent"}`,
                      background: "transparent",
                      color: on ? theme.primary : theme.text,
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: on ? 700 : 600,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ color: "#666", fontSize: 12 }}>
              {previewTab === "po"
                ? `Showing ${rows.length} PO${rows.length === 1 ? "" : "s"}`
                : `Showing ${consultantGroups.length} consultant${consultantGroups.length === 1 ? "" : "s"}`}
            </div>
          </div>

          {previewTab === "po" ? (
            <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th>Project</th>
                  <th>PO #</th>
                  <th>Customer</th>
                  <th>Consultants</th>
                  <th>Reg</th>
                  <th>OT</th>
                  <th>OT2</th>
                  <th>Total Hrs</th>
                  <th>Total $</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.import_run_id}_${r.purchase_order_id}`} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td>
                      <Link to={`/import-runs/${import_run_id}/billable/po/${r.purchase_order_id}`}>
                        {r.project_name ?? "(No project name)"}
                      </Link>
                    </td>
                    <td>{r.purchase_order_number ?? ""}</td>
                    <td>{r.customer_name ?? ""}</td>
                    <td>{r.consultant_count ?? 0}</td>
                    <td>{r.reg_hours ?? 0}</td>
                    <td>{r.ot_hours ?? 0}</td>
                    <td>{r.ot2_hours ?? 0}</td>
                    <td>{r.total_hours ?? 0}</td>
                    <td>{money(r.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {consultantGroups.map((group) => (
                <details
                  key={group.key}
                  style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    background: theme.surface,
                    padding: 14,
                  }}
                >
                  <summary
                    style={{
                      listStyle: "none",
                      cursor: "pointer",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                        <div style={{ fontSize: 18, fontWeight: 800 }}>
                          {group.consultant_id ? (
                            <Link to={`/consultants/${group.consultant_id}`}>{group.consultant_name ?? "(No consultant name)"}</Link>
                          ) : (
                            group.consultant_name ?? "(No consultant name)"
                          )}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{money(group.total_amount)}</div>
                      </div>
                      <div style={{ color: theme.link, fontWeight: 700, fontSize: 13 }}>View daily detail</div>
                    </div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", color: theme.text, fontSize: 13 }}>
                      <span>Total: <b>{group.total_hours.toLocaleString()}</b></span>
                      <span>Reg: <b>{group.reg_hours.toLocaleString()}</b></span>
                      <span>OT: <b>{group.ot_hours.toLocaleString()}</b></span>
                      <span>OT2: <b>{group.ot2_hours.toLocaleString()}</b></span>
                      <span>POs: <b>{group.po_count}</b></span>
                    </div>
                    {group.kelly_employee_unique_id ? (
                      <div style={{ color: theme.mutedText, fontSize: 12 }}>
                        Kelly UID: {group.kelly_employee_unique_id}
                      </div>
                    ) : null}
                  </summary>

                  <div style={{ marginTop: 14 }}>
                    <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                          <th>Date</th>
                          <th>Project</th>
                          <th>PO #</th>
                          <th>Reg</th>
                          <th>OT</th>
                          <th>OT2</th>
                          <th>Bill Reg</th>
                          <th>Bill OT</th>
                          <th>Total $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((r, idx) => (
                          <tr key={`${group.key}_${idx}`} style={{ borderBottom: "1px solid #f0f0f0" }}>
                            <td>{fmtDate(r.service_date)}</td>
                            <td>
                              {r.purchase_order_id ? (
                                <Link to={`/purchase-orders/${r.purchase_order_id}`}>{r.project_name ?? ""}</Link>
                              ) : (
                                r.project_name ?? ""
                              )}
                            </td>
                            <td>{r.purchase_order_number ?? ""}</td>
                            <td>{r.reg_hours ?? 0}</td>
                            <td>{r.ot_hours ?? 0}</td>
                            <td>{r.ot2_hours ?? 0}</td>
                            <td>{money(r.bill_rate_regular)}</td>
                            <td>{money(r.bill_rate_overtime)}</td>
                            <td>{money(r.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {overrideContext && (
        <div style={confirmOverlayStyle}>
          <div style={confirmCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Bill Through Date</h3>
                <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>
                  {overrideContext.consultant_name ?? "Consultant"} • {fmtDate(overrideContext.first_uncovered_date)} → {fmtDate(overrideContext.last_uncovered_date)}
                </div>
              </div>
              <button type="button" onClick={closeBillingOverride} disabled={overrideSaving} style={{ border: "none", background: "transparent", color: theme.mutedText, fontSize: 26, lineHeight: 1, cursor: "pointer" }}>
                ×
              </button>
            </div>

            <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 12, marginBottom: 16 }}>
              Use this when the assignment ended, but billing should continue through the payroll period while the PO extension catches up.
            </div>

            {overrideErr ? (
              <div
                style={{
                  ...cardStyle,
                  borderColor: theme.warningBorder,
                  background: theme.warningBg,
                  color: theme.warningText,
                  marginBottom: 14,
                }}
              >
                {overrideErr}
              </div>
            ) : null}

            {overrideLoading ? (
              <div style={{ color: theme.mutedText }}>Loading assignment options…</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Assignment</span>
                  <select value={overrideAssignmentId} onChange={(e) => setOverrideAssignmentId(e.target.value)} style={{ padding: 10 }}>
                    <option value="">Select assignment…</option>
                    {overrideAssignments.map((item) => (
                      <option key={item.assignment_id} value={item.assignment_id}>
                        {assignmentOptionLabel(item)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Bill through date</span>
                  <input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} style={{ padding: 10 }} />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Note</span>
                  <textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} style={{ padding: 10, minHeight: 90 }} />
                </label>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-start", marginTop: 4 }}>
                  <button type="button" onClick={saveBillingOverride} disabled={overrideSaving || overrideLoading || !overrideAssignments.length}>
                    {overrideSaving ? "Saving…" : "Save billing override"}
                  </button>
                  <button type="button" className="subtle-button" onClick={closeBillingOverride} disabled={overrideSaving}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
