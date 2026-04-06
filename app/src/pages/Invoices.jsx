import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";
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
const rowLinkStyle = {
  color: theme.link,
  fontWeight: 500,
};

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

export default function Invoices() {
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
        .from("invoices")
        .select(`
          invoice_id,
          invoice_no,
          status,
          period_begin,
          period_end,
          invoice_date,
          due_date,
          purchase_order_number_snapshot,
          customer:customers(name),
          purchase_order:purchase_orders(purchase_order_number, project_name, is_stub)
        `)
        .order("period_end", { ascending: false });

      if (!alive) return;
      if (error) setErr(error.message);
      else setRows(data ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <h2 style={{ margin: 0 }}>Invoices</h2>
        <div style={{ color: theme.mutedText, marginTop: 4 }}>
          Review generated invoices and drill into invoice details by customer and period.
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {err && (
        <div style={{ ...cardStyle, borderColor: theme.warningBorder, background: theme.warningBg, color: theme.warningText }}>
          {err}
        </div>
      )}

      {!loading && !err && (
        <div style={sectionCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Invoice list</h3>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>
              Showing {rows.length} invoice{rows.length === 1 ? "" : "s"}
            </div>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Invoice #</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>PO</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Period</th>
                <th style={thStyle}>Invoice Date</th>
                <th style={thStyle}>Due Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.invoice_id}>
                  <td style={tdStyle}>
                    <Link to={`/invoices/${r.invoice_id}`} style={rowLinkStyle}>
                      {r.invoice_no ?? "(draft)"}
                    </Link>
                  </td>
                  <td style={tdStyle}>{r.customer?.name ?? ""}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>
                      {r.purchase_order?.purchase_order_number || r.purchase_order_number_snapshot || "—"}
                    </div>
                    {r.purchase_order?.project_name ? (
                      <div style={{ color: theme.mutedText, fontSize: 12 }}>
                        {r.purchase_order.project_name}
                        {r.purchase_order?.is_stub ? " • Stub" : ""}
                      </div>
                    ) : r.purchase_order?.is_stub ? (
                      <div style={{ color: theme.warningText, fontSize: 12 }}>Stub PO</div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>{r.status}</td>
                  <td style={tdStyle}>
                    {r.period_begin} → {r.period_end}
                  </td>
                  <td style={tdStyle}>{fmtDate(r.invoice_date)}</td>
                  <td style={tdStyle}>{fmtDate(r.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
