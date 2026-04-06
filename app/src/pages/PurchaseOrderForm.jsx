import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

function formatCurrencyInput(value) {
  const raw = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!raw) return "";

  const [wholeRaw, decimalRaw = ""] = raw.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const wholeFormatted = Number(whole).toLocaleString(undefined);
  const decimal = decimalRaw.slice(0, 2);

  return decimalRaw.length > 0 ? `$${wholeFormatted}.${decimal}` : `$${wholeFormatted}`;
}

export default function PurchaseOrderForm() {
  const nav = useNavigate();
  const { purchase_order_id } = useParams();
  const isNew = purchase_order_id === "new" || !purchase_order_id;

  const [customers, setCustomers] = useState([]);
  const [contacts, setContacts] = useState([]);

  const [form, setForm] = useState({
    customer_id: "",
    manager_id: "", // ✅ new
    project_name: "",
    purchase_order_number: "",
    amount: "",
    start_date: "",
    end_date: "",
    notes: "",
    pre_pay: false,
    tracking_active: true,
  });

  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load customers + (if editing) the PO
  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      const custRes = await supabase
        .schema("app")
        .from("customers")
        .select("customer_id, name")
        .order("name", { ascending: true });

      if (!alive) return;

      if (custRes.error) {
        setErr(custRes.error.message);
        setLoading(false);
        return;
      }
      setCustomers(custRes.data ?? []);

      if (!isNew) {
        const poRes = await supabase
          .schema("app")
          .from("purchase_orders")
          .select("*")
          .eq("purchase_order_id", purchase_order_id)
          .single();

        if (!alive) return;

        if (poRes.error) {
          setErr(poRes.error.message);
          setLoading(false);
          return;
        }

        const p = poRes.data;
        setForm((prev) => ({
          ...prev,
          customer_id: p.customer_id ?? "",
          manager_id: p.manager_id ?? "", // ✅ new
          project_name: p.project_name ?? "",
          purchase_order_number: p.purchase_order_number ?? "",
          amount: formatCurrencyInput(p.amount),
          start_date: p.start_date ?? "",
          end_date: p.end_date ?? "",
          notes: p.notes ?? "",
          pre_pay: !!p.pre_pay,
          tracking_active: !!p.tracking_active,
        }));
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [isNew, purchase_order_id]);

  // Load contacts for the selected customer
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!form.customer_id) {
        setContacts([]);
        if (form.manager_id) setForm((p) => ({ ...p, manager_id: "" }));
        return;
      }

      const { data, error } = await supabase
        .schema("app")
        .from("customer_contacts")
        .select("contact_id, manager_name, contact_type, active")
        .eq("customer_id", form.customer_id)
        .eq("contact_type", "Manager")
        .order("active", { ascending: false })
        .order("manager_name", { ascending: true });

      if (!alive) return;

      if (error) {
        setErr(error.message);
        setContacts([]);
      } else {
        setContacts(data ?? []);

        const exists = (data ?? []).some((m) => m.contact_id === form.manager_id);
        if (form.manager_id && !exists) {
          setForm((p) => ({ ...p, manager_id: "" }));
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [form.customer_id]); // intentionally only depends on customer_id

  const customerName = useMemo(() => {
    return customers.find((c) => c.customer_id === form.customer_id)?.name ?? "";
  }, [customers, form.customer_id]);

  async function save() {
    setSaving(true);
    setErr(null);

    const amountClean = String(form.amount ?? "").replace(/[$,]/g, "").trim();

    const payload = {
      customer_id: form.customer_id || null,
      manager_id: form.manager_id || null, // ✅ new
      project_name: form.project_name || null,
      purchase_order_number: form.purchase_order_number || null,
      amount: amountClean === "" ? null : Number(amountClean),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes || null,
      pre_pay: !!form.pre_pay,
      tracking_active: !!form.tracking_active,
      // document later
    };

    if (!payload.customer_id) {
      setErr("Customer is required.");
      setSaving(false);
      return;
    }

    if (amountClean !== "" && Number.isNaN(payload.amount)) {
      setErr("Amount must be a valid number (example: 112268.00).");
      setSaving(false);
      return;
    }

    let res;
    if (isNew) {
      res = await supabase
        .schema("app")
        .from("purchase_orders")
        .insert(payload)
        .select("purchase_order_id")
        .single();
    } else {
      res = await supabase
        .schema("app")
        .from("purchase_orders")
        .update(payload)
        .eq("purchase_order_id", purchase_order_id)
        .select("purchase_order_id")
        .single();
    }

    if (res.error) {
      setErr(res.error.message);
      setSaving(false);
      return;
    }

    nav(`/purchase-orders/${res.data.purchase_order_id}`);
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ marginBottom: 12 }}>
          <Link to="/purchase-orders" style={{ color: theme.link, fontWeight: 600, textDecoration: "none" }}>← Back to POs</Link>
        </div>

        <h2 style={{ margin: 0, marginBottom: 6 }}>{isNew ? "New Purchase Order" : "Edit Purchase Order"}</h2>
        <div style={{ color: theme.mutedText }}>
          {customerName
            ? `Customer: ${customerName}`
            : "Create or update purchase order details, customer ownership, and tracking settings."}
        </div>

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
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Customer</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{customerName || "—"}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>PO number</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{form.purchase_order_number || "—"}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Tracking</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{form.tracking_active ? "Active" : "Inactive"}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Pre-pay</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{form.pre_pay ? "Yes" : "No"}</div>
          </div>
        </div>

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

      <div style={{ maxWidth: 920 }}>
        <div style={sectionCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <h3 style={sectionTitleStyle}>Purchase Order Details</h3>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>{isNew ? "Create mode" : "Edit mode"}</div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <label>
              Customer (required)
              <select
                value={form.customer_id}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    customer_id: e.target.value,
                    manager_id: "",
                  }))
                }
                style={{ width: "100%", padding: 8 }}
              >
                <option value="">-- Select customer --</option>
                {customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Customer Contact (optional)
              <select
                value={form.manager_id}
                onChange={(e) => setForm((p) => ({ ...p, manager_id: e.target.value }))}
                style={{ width: "100%", padding: 8 }}
                disabled={!form.customer_id}
              >
                <option value="">
                  {form.customer_id ? "-- Select contact --" : "Select a customer first"}
                </option>
                {contacts.map((m) => (
                  <option key={m.contact_id} value={m.contact_id}>
                    {m.manager_name}
                    {m.active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>

              {form.customer_id && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <Link to={`/customers/${form.customer_id}`}>Manage contacts</Link>
                </div>
              )}
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                PO Number
                <input
                  value={form.purchase_order_number}
                  onChange={(e) => setForm((p) => ({ ...p, purchase_order_number: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Project Name
                <input
                  value={form.project_name}
                  onChange={(e) => setForm((p) => ({ ...p, project_name: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <label>
                Amount
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: formatCurrencyInput(e.target.value) }))}
                  placeholder="$112,268"
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Start Date
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                End Date
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
            </div>

            <label>
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                style={{ width: "100%", padding: 8, minHeight: 90 }}
              />
            </label>

            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={!!form.tracking_active}
                  onChange={(e) => setForm((p) => ({ ...p, tracking_active: e.target.checked }))}
                />
                Tracking active
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={!!form.pre_pay}
                  onChange={(e) => setForm((p) => ({ ...p, pre_pay: e.target.checked }))}
                />
                Pre-pay
              </label>
            </div>

            <div>
              <button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
