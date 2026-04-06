import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useParams, Link } from "react-router-dom";
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
  textAlign: "left",
  padding: "10px 12px",
  fontWeight: 700,
  fontSize: 14,
  color: "#111",
  background: theme.surface,
  borderBottom: "1px solid #ddd",
};
const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f0f0",
  color: "#111",
  background: theme.surface,
};

const LINE_TYPE_LABELS = {
  REG: "Regular Hours",
  OT: "Overtime",
  OT2: "Double Time",
  EXP: "Expense Reimbursement",
  PP: "Prepay",
  ADJ: "Adjustment",
};

function fmtDate(value) {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function money(value) {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function InvoiceDetail() {
  const { invoice_id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const total = useMemo(
    () => (lines ?? []).reduce((sum, l) => sum + Number(l.amount ?? 0), 0),
    [lines]
  );
  const totalReg = useMemo(() => (lines ?? []).reduce((sum, l) => sum + Number(l.reg_hours ?? 0), 0), [lines]);
  const totalOt = useMemo(() => (lines ?? []).reduce((sum, l) => sum + Number(l.ot_hours ?? 0), 0), [lines]);
  const totalOt2 = useMemo(() => (lines ?? []).reduce((sum, l) => sum + Number(l.ot2_hours ?? 0), 0), [lines]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      const invRes = await supabase
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
          terms,
          purchase_order_number_snapshot,
          customer:customers(name),
          purchase_order:purchase_orders(purchase_order_number, project_name, is_stub)
        `)
        .eq("invoice_id", invoice_id)
        .single();

      if (!alive) return;
      if (invRes.error) {
        setErr(invRes.error.message);
        setLoading(false);
        return;
      }
      setInvoice(invRes.data);

      const lineRes = await supabase
        .schema("app")
        .from("invoice_lines")
        .select(`
          invoice_line_id,
          line_description,
          line_type,
          service_category,
          service_date,
          service_date_begin,
          service_date_end,
          consultant_id,
          reg_hours,
          ot_hours,
          ot2_hours,
          bill_rate_regular,
          bill_rate_overtime,
          amount
        `)
        .eq("invoice_id", invoice_id)
        .order("service_date", { ascending: true });

      if (!alive) return;
      if (lineRes.error) setErr(lineRes.error.message);
      else setLines(lineRes.data ?? []);

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [invoice_id]);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (err) return <div style={{ padding: 24, color: "crimson" }}>{err}</div>;
  if (!invoice) return <div style={{ padding: 24 }}>Not found</div>;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ marginBottom: 12 }}>
          <Link to="/invoices" style={{ color: theme.link, fontWeight: 600, textDecoration: "none" }}>
            ← Back to invoices
          </Link>
        </div>

        <div style={sectionCardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>
            Invoice {invoice.invoice_no ?? "(draft)"} — {invoice.customer?.name ?? ""}
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(120px, 1fr))", gap: 12 }}>
            <div style={cardStyle}><b>Status:</b><div style={{ marginTop: 4 }}>{invoice.status}</div></div>
            <div style={cardStyle}><b>Period:</b><div style={{ marginTop: 4 }}>{invoice.period_begin} → {invoice.period_end}</div></div>
            <div style={cardStyle}>
              <b>PO:</b>
              <div style={{ marginTop: 4 }}>
                {invoice.purchase_order?.purchase_order_number || invoice.purchase_order_number_snapshot || "—"}
              </div>
              {invoice.purchase_order?.project_name ? (
                <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>
                  {invoice.purchase_order.project_name}
                  {invoice.purchase_order?.is_stub ? " • Stub" : ""}
                </div>
              ) : null}
            </div>
            <div style={cardStyle}><b>Invoice Date:</b><div style={{ marginTop: 4 }}>{fmtDate(invoice.invoice_date)}</div></div>
            <div style={cardStyle}><b>Due Date:</b><div style={{ marginTop: 4 }}>{fmtDate(invoice.due_date)}</div></div>
            <div style={cardStyle}><b>Total:</b><div style={{ marginTop: 4 }}>{money(total)}</div></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 12, marginTop: 12 }}>
            <div style={cardStyle}><b>Reg Hours:</b><div style={{ marginTop: 4 }}>{totalReg}</div></div>
            <div style={cardStyle}><b>OT Hours:</b><div style={{ marginTop: 4 }}>{totalOt}</div></div>
            <div style={cardStyle}><b>OT2 Hours:</b><div style={{ marginTop: 4 }}>{totalOt2}</div></div>
          </div>
        </div>
      </div>

      <div style={sectionCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Invoice lines</h3>
          <div style={{ color: theme.mutedText, fontSize: 12 }}>
            Showing {lines.length} line{lines.length === 1 ? "" : "s"}
          </div>
        </div>

        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Service Date</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Reg</th>
              <th style={thStyle}>OT</th>
              <th style={thStyle}>OT2</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.invoice_line_id}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{LINE_TYPE_LABELS[l.line_type] || l.line_type || "—"}</div>
                  {l.line_type ? <div style={{ color: theme.mutedText, fontSize: 12 }}>{l.line_type}</div> : null}
                </td>
                <td style={tdStyle}>{l.line_description}</td>
                <td style={tdStyle}>
                  {l.service_date ??
                    (l.service_date_begin && l.service_date_end
                      ? `${l.service_date_begin} → ${l.service_date_end}`
                      : "")}
                </td>
                <td style={tdStyle}>{l.service_category || "—"}</td>
                <td style={tdStyle}>{["EXP", "PP", "ADJ"].includes(l.line_type) ? "N/A" : l.reg_hours ?? 0}</td>
                <td style={tdStyle}>{["EXP", "PP", "ADJ"].includes(l.line_type) ? "N/A" : l.ot_hours ?? 0}</td>
                <td style={tdStyle}>{["EXP", "PP", "ADJ"].includes(l.line_type) ? "N/A" : l.ot2_hours ?? 0}</td>
                <td style={tdStyle}>{["EXP", "PP", "ADJ"].includes(l.line_type) ? "N/A" : l.bill_rate_regular ?? l.bill_rate_overtime ?? ""}</td>
                <td style={tdStyle}>{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
