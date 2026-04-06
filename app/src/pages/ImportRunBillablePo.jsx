import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

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
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function ImportRunBillablePo() {
  const { import_run_id, purchase_order_id } = useParams();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      const { data, error } = await supabase
        .schema("app")
        .from("invoice_preview_po_detail_by_run_view")
        .select("*")
        .eq("import_run_id", import_run_id)
        .eq("purchase_order_id", purchase_order_id)
        .order("consultant_name", { ascending: true })
        .order("service_date", { ascending: true });

      if (!alive) return;
      if (error) setErr(error.message);
      else setRows(data ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [import_run_id, purchase_order_id]);

  const summary = useMemo(() => {
    if (!rows.length) return null;
    const first = rows[0];
    return {
      project_name: first.project_name,
      purchase_order_number: first.purchase_order_number,
      customer_name: first.customer_name,
      reg_hours: rows.reduce((s, r) => s + Number(r.reg_hours ?? 0), 0),
      ot_hours: rows.reduce((s, r) => s + Number(r.ot_hours ?? 0), 0),
      ot2_hours: rows.reduce((s, r) => s + Number(r.ot2_hours ?? 0), 0),
      total_amount: rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
    };
  }, [rows]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.consultant_id ?? r.consultant_name ?? "unknown";
      if (!map.has(key)) {
        map.set(key, {
          consultant_name: r.consultant_name,
          kelly_employee_code: r.kelly_employee_code,
          kelly_worker_key: r.kelly_worker_key,
          rows: [],
        });
      }
      map.get(key).rows.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      <Link to={`/import-runs/${import_run_id}/billable`}>← Back to billable preview</Link>

      {loading && <div style={{ marginTop: 12 }}>Loading…</div>}
      {err && <div style={{ marginTop: 12, color: "crimson" }}>{err}</div>}

      {!loading && !err && summary && (
        <>
          <h2 style={{ marginTop: 12 }}>{summary.project_name ?? "(No project name)"}</h2>
          <div style={{ color: "#666", marginBottom: 12 }}>
            <b>{summary.customer_name ?? ""}</b>
            {summary.purchase_order_number ? ` • PO ${summary.purchase_order_number}` : ""}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
            <div><b>Reg Hrs:</b> {summary.reg_hours}</div>
            <div><b>OT Hrs:</b> {summary.ot_hours}</div>
            <div><b>OT2 Hrs:</b> {summary.ot2_hours}</div>
            <div><b>Total $:</b> {money(summary.total_amount)}</div>
          </div>

          {grouped.map((g, idx) => (
            <div key={idx} style={{ marginTop: 18 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                <h3 style={{ margin: 0 }}>{g.consultant_name ?? "(No consultant name)"}</h3>
                <span style={{ color: "#666" }}>Kelly Code: <b>{g.kelly_employee_code ?? "—"}</b></span>
                <span style={{ color: "#666" }}>Worker Key: <b>{g.kelly_worker_key ?? "—"}</b></span>
              </div>

              <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th>Date</th>
                    <th>Reg</th>
                    <th>OT</th>
                    <th>OT2</th>
                    <th>Bill Reg</th>
                    <th>Bill OT</th>
                    <th>Total $</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td>{fmtDate(r.service_date)}</td>
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
          ))}
        </>
      )}
    </div>
  );
}