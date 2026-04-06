import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { US_STATE_OPTIONS } from "../lib/usStates";
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
const fieldLabelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: theme.text,
  marginBottom: 6,
};

const checkboxRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 8,
  fontSize: 14,
  fontWeight: 500,
  color: theme.text,
};
const checkboxInputStyle = {
  width: 16,
  height: 16,
  margin: 0,
  padding: 0,
  flex: "0 0 auto",
};

export default function CustomerForm() {
  const nav = useNavigate();
  const { customer_id } = useParams();
  const isNew = customer_id === "new" || !customer_id;

  const [form, setForm] = useState({
    name: "",
    street_address_line_1: "",
    street_address_line_2: "",
    city: "",
    state: "",
    zip: "",
    note: "",
    active: true,
  });

  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    if (isNew) return;

    (async () => {
      setErr(null);
      setLoading(true);

      const { data, error } = await supabase
        .schema("app")
        .from("customers")
        .select("*")
        .eq("customer_id", customer_id)
        .single();

      if (!alive) return;

      if (error) {
        setErr(error.message);
      } else {
        setForm({
          name: data.name ?? "",
          street_address_line_1: data.street_address_line_1 ?? "",
          street_address_line_2: data.street_address_line_2 ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
          zip: data.zip ?? "",
          note: data.note ?? "",
          active: !!data.active,
        });
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [isNew, customer_id]);

  async function save() {
    setSaving(true);
    setErr(null);

    if (!form.name.trim()) {
      setErr("Customer name is required.");
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      street_address_line_1: form.street_address_line_1.trim() || null,
      street_address_line_2: form.street_address_line_2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zip: form.zip.trim() || null,
      note: form.note.trim() || null,
      active: !!form.active,
    };

    let res;
    if (isNew) {
      res = await supabase
        .schema("app")
        .from("customers")
        .insert(payload)
        .select("customer_id")
        .single();
    } else {
      res = await supabase
        .schema("app")
        .from("customers")
        .update(payload)
        .eq("customer_id", customer_id)
        .select("customer_id")
        .single();
    }

    if (res.error) {
      setErr(res.error.message);
      setSaving(false);
      return;
    }

    nav("/customers");
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ marginBottom: 12 }}>
          <Link to="/customers" style={{ color: theme.link, fontWeight: 600, textDecoration: "none" }}>
            ← Back to customers
          </Link>
        </div>

        <div style={{ ...sectionCardStyle, maxWidth: 820 }}>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>{isNew ? "New Customer" : "Edit Customer"}</h2>
          <div style={{ color: theme.mutedText }}>
            Capture customer account information, address details, and operational notes.
          </div>
        </div>
      </div>

      {err && (
        <div
          style={{
            ...cardStyle,
            color: theme.warningText,
            background: theme.warningBg,
            borderColor: theme.warningBorder,
            marginBottom: 12,
            maxWidth: 820,
          }}
        >
          {err}
        </div>
      )}

      <div style={{ ...sectionCardStyle, display: "grid", gap: 12, maxWidth: 820 }}>
        <label>
          <span style={fieldLabelStyle}>Name (required)</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>

        <label>
          <span style={fieldLabelStyle}>Street address line 1</span>
          <input
            value={form.street_address_line_1}
            onChange={(e) => setForm({ ...form, street_address_line_1: e.target.value })}
          />
        </label>

        <label>
          <span style={fieldLabelStyle}>Street address line 2</span>
          <input
            value={form.street_address_line_2}
            onChange={(e) => setForm({ ...form, street_address_line_2: e.target.value })}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(220px, 220px) 140px", gap: 12 }}>
          <label>
            <span style={fieldLabelStyle}>City</span>
            <input
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </label>

          <label>
            <span style={fieldLabelStyle}>State</span>
            <select
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            >
              <option value="">Select state</option>
              {US_STATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span style={fieldLabelStyle}>Zip</span>
            <input
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
          </label>
        </div>

        <label>
          <span style={fieldLabelStyle}>Note</span>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            style={{ minHeight: 90 }}
          />
        </label>

        <label style={checkboxRowStyle}>
          <input
            type="checkbox"
            style={checkboxInputStyle}
            checked={!!form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Active
        </label>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
