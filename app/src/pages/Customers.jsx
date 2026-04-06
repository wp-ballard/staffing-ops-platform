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
const sectionTitleStyle = {
  margin: 0,
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
  verticalAlign: "top",
};
const rowLinkStyle = {
  color: theme.link,
  fontWeight: 500,
  textDecoration: "none",
};

export default function Customers() {
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
        .from("customers")
        .select("customer_id, name, city, state, active")
        .order("name", { ascending: true });

      if (!alive) return;
      if (error) setErr(error.message);
      else setRows(data ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.active).length;
    const inactive = total - active;
    const states = new Set(rows.map((r) => String(r.state ?? "").trim()).filter(Boolean)).size;
    const withCity = rows.filter((r) => String(r.city ?? "").trim() !== "").length;
    return { total, active, inactive, states, withCity };
  }, [rows]);

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, marginBottom: 6 }}>Customers</h2>
            <div style={{ color: theme.mutedText }}>
              Browse customer accounts, review active coverage, and jump into customer detail records.
            </div>
          </div>

          <Link to="/customers/new">
            <button>New Customer</button>
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
            gap: 12,
            marginTop: 14,
            marginBottom: 12,
          }}
        >
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Total customers</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.total}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Active</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.active}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Inactive</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.inactive}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>States</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.states}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>With city</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.withCity}</div>
          </div>
        </div>

        {loading && <div>Loading…</div>}

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
        <div style={sectionCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <h3 style={sectionTitleStyle}>Customer List</h3>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>
              Showing {rows.length} customer{rows.length === 1 ? "" : "s"}
            </div>
          </div>

          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>State</th>
                <th style={thStyle}>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.customer_id}>
                  <td style={tdStyle}>
                    <Link to={`/customers/${r.customer_id}`} style={rowLinkStyle}>
                      {r.name}
                    </Link>
                  </td>
                  <td style={tdStyle}>{r.city ?? ""}</td>
                  <td style={tdStyle}>{r.state ?? ""}</td>
                  <td style={tdStyle}>{r.active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
