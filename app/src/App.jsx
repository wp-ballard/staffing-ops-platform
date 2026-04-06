import { NavLink } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { palette, theme } from "./theme";

const navLinkStyle = ({ isActive }) => ({
  display: "inline-flex",
  alignItems: "center",
  height: 36,
  padding: "0 6px",
  borderRadius: 0,
  border: "none",
  borderBottom: `2px solid ${isActive ? theme.primary : "transparent"}`,
  background: "transparent",
  color: isActive ? theme.primary : theme.link,
  fontWeight: isActive ? 700 : 500,
  textDecoration: "none",
  boxShadow: "none",
});

export default function App({ children }) {
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: `1px solid ${theme.headerBorder}`,
          background: "rgba(255, 253, 249, 0.92)",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ color: palette.brownBlack }}>Conexus</b>
          <NavLink to="/customers" style={navLinkStyle}>
            Customers
          </NavLink>
          <NavLink to="/invoices" style={navLinkStyle}>
            Invoices
          </NavLink>
          <NavLink to="/consultants" style={navLinkStyle}>
            Consultants
          </NavLink>
          <NavLink to="/purchase-orders" style={navLinkStyle}>
            POs
          </NavLink>
          <NavLink to="/import-runs" style={navLinkStyle}>
            Import Runs
          </NavLink>
        </div>
        <button onClick={signOut}>Sign out</button>
      </header>

      <main>{children}</main>
    </div>
  );
}
