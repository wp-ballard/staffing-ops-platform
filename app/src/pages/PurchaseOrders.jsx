import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  marginBottom: 10,
  fontSize: 16,
  fontWeight: 800,
};
const drawerBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.28)",
  zIndex: 60,
};
const drawerPanelStyle = {
  position: "fixed",
  top: 0,
  right: 0,
  height: "100vh",
  width: "min(560px, 100vw)",
  background: theme.surface,
  borderLeft: `1px solid ${theme.border}`,
  boxShadow: "-18px 0 40px rgba(25, 14, 5, 0.12)",
  zIndex: 70,
  display: "flex",
  flexDirection: "column",
};
const drawerHeaderStyle = {
  padding: "18px 20px 14px",
  borderBottom: `1px solid ${theme.border}`,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};
const drawerBodyStyle = {
  padding: 20,
  overflowY: "auto",
  display: "grid",
  gap: 14,
};
const drawerFooterStyle = {
  padding: 20,
  borderTop: `1px solid ${theme.border}`,
  display: "flex",
  gap: 10,
  justifyContent: "flex-start",
};
const fieldLabelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: theme.text,
  marginBottom: 6,
};
const iconButtonStyle = {
  width: 36,
  height: 36,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 400,
  color: theme.mutedText,
  background: "transparent",
  border: "none",
  boxShadow: "none",
  cursor: "pointer",
  flex: "0 0 auto",
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
const rowLinkStyle = {
  color: theme.link,
  fontWeight: 500,
};

const CONTACT_TYPE_OPTIONS = [
  { value: "Manager", label: "Manager" },
  { value: "AP", label: "AP" },
  { value: "Billing", label: "Billing" },
  { value: "Project", label: "Project" },
  { value: "Operations", label: "Operations" },
  { value: "Other", label: "Other" },
];

function sanitizeFilename(name) {
  return String(name ?? "document")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function money(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function formatCurrencyInput(value) {
  const raw = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!raw) return "";

  const [wholeRaw, decimalRaw = ""] = raw.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const wholeFormatted = Number(whole).toLocaleString(undefined);
  const decimal = decimalRaw.slice(0, 2);

  return decimalRaw.length > 0 ? `$${wholeFormatted}.${decimal}` : `$${wholeFormatted}`;
}

const nearCapFlagStyle = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: "rgba(179, 90, 32, 0.18)",
  color: "#B35A20",
  border: "1px solid rgba(179, 90, 32, 0.42)",
};

const overCapFlagStyle = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  background: "rgba(143, 32, 32, 0.18)",
  color: "#8F2020",
  border: "1px solid rgba(143, 32, 32, 0.45)",
};

export default function PurchaseOrders() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [poSpendMap, setPoSpendMap] = useState(new Map());
  const [activePoMap, setActivePoMap] = useState(new Map());
  const [latestRun, setLatestRun] = useState(null);
  const [q, setQ] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewDrawer, setShowNewDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState("new");
  const [editingPurchaseOrderId, setEditingPurchaseOrderId] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [drawerErr, setDrawerErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [contactErr, setContactErr] = useState(null);
  const [pendingDocs, setPendingDocs] = useState([]);
  const [docDraft, setDocDraft] = useState({
    file: null,
    doc_type: "PO",
    note: "",
    is_primary: false,
  });
  const [docInputKey, setDocInputKey] = useState(0);
  const [contactForm, setContactForm] = useState({
    manager_name: "",
    email: "",
    phone: "",
    title: "",
    active: true,
    contact_type: "Manager",
    note: "",
  });
  const [form, setForm] = useState({
    customer_id: "",
    manager_id: "",
    project_name: "",
    purchase_order_number: "",
    amount: "",
    start_date: "",
    end_date: "",
    notes: "",
    pre_pay: false,
    tracking_active: true,
  });

  async function loadPurchaseOrders() {
    const { data, error } = await supabase
      .schema("app")
      .from("purchase_orders")
      .select(
        `
          purchase_order_id,
          purchase_order_number,
          project_name,
          amount,
          start_date,
          end_date,
          tracking_active,
          is_stub,
          stub_note,
          pre_pay,
          customer:customers(name),
          manager:customer_contacts(manager_name, contact_type)
        `
      )
      .order("updated_at", { ascending: false });

    if (error) throw error;
    setRows(data ?? []);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      if (!alive) return;

      try {
        await loadPurchaseOrders();
      } catch (error) {
        setErr(error.message);
        setRows([]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const latestRes = await supabase
        .schema("app")
        .from("latest_payroll_run_view")
        .select("import_run_id, period_begin, period_end, imported_at")
        .single();

      if (!alive) return;

      if (latestRes.error) {
        setErr((prev) => prev ?? latestRes.error.message);
        setLatestRun(null);
        setActivePoMap(new Map());
        return;
      }

      setLatestRun(latestRes.data);

      const activeRes = await supabase
        .schema("app")
        .from("invoice_preview_po_summary_by_run_view")
        .select("import_run_id, purchase_order_id, purchase_order_number, project_name, customer_name, consultant_count, total_hours, total_amount")
        .eq("import_run_id", latestRes.data.import_run_id)
        .order("total_hours", { ascending: false });

      if (!alive) return;

      if (activeRes.error) {
        setErr((prev) => prev ?? activeRes.error.message);
        setActivePoMap(new Map());
        return;
      }

      const next = new Map();
      for (const row of activeRes.data ?? []) {
        if (!row.purchase_order_id) continue;
        if (Number(row.total_hours ?? 0) <= 0) continue;
        next.set(row.purchase_order_id, row);
      }
      setActivePoMap(next);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const next = new Map();
      const { data, error } = await supabase
        .schema("app")
        .from("purchase_order_spend_view")
        .select("purchase_order_id, invoiced_amount, po_cap_amount, remaining_amount, is_stub");

      if (!alive) return;

      if (error) {
        setErr((prev) => prev ?? error.message);
        setPoSpendMap(new Map());
        return;
      }

      for (const row of data ?? []) {
        if (!row.purchase_order_id) continue;
        next.set(row.purchase_order_id, row);
      }

      setPoSpendMap(next);
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .schema("app")
        .from("customers")
        .select("customer_id, name")
        .order("name", { ascending: true });

      if (!alive) return;
      if (error) return;
      setCustomers(data ?? []);
    })();

    return () => {
      alive = false;
    };
  }, []);

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
        setDrawerErr(error.message);
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
  }, [form.customer_id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return rows.filter((r) => {
      const searchMatch =
        !needle ||
        [r.purchase_order_number, r.project_name, r.customer?.name, r.manager?.manager_name, r.stub_note]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle));

      if (!searchMatch) return false;

      const spendRow = poSpendMap.get(r.purchase_order_id);
      const spend = Number(spendRow?.invoiced_amount ?? 0);
      const cap = spendRow?.po_cap_amount == null ? (r.amount == null ? null : Number(r.amount)) : Number(spendRow.po_cap_amount);
      const nearCap = r.tracking_active !== false && cap != null && spend >= cap * 0.8;
      const needsDetails = !!r.is_stub || r.amount == null || !r.start_date || !r.end_date;
      const isActivePo = activePoMap.has(r.purchase_order_id) && r.tracking_active !== false;

      if (filterMode === "needs_details") return needsDetails;
      if (filterMode === "active") return isActivePo;
      if (filterMode === "stub") return !!r.is_stub;
      if (filterMode === "near_cap") return nearCap;
      if (filterMode === "tracking_off") return r.tracking_active === false;
      return true;
    });
  }, [rows, q, filterMode, poSpendMap, activePoMap]);

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.tracking_active).length;
    const prepaid = rows.filter((r) => r.pre_pay).length;
    const withContact = rows.filter((r) => !!r.manager?.manager_name).length;
    const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    const stubCount = rows.filter((r) => !!r.is_stub).length;
    const needsDetails = rows.filter((r) => !!r.is_stub || r.amount == null || !r.start_date || !r.end_date).length;
    const activePayroll = rows.filter((r) => activePoMap.has(r.purchase_order_id) && r.tracking_active !== false).length;
    const nearCapCount = rows.filter((r) => {
      const spendRow = poSpendMap.get(r.purchase_order_id);
      const spend = Number(spendRow?.invoiced_amount ?? 0);
      const cap =
        spendRow?.po_cap_amount == null ? (r.amount == null ? null : Number(r.amount)) : Number(spendRow.po_cap_amount);
      return r.tracking_active !== false && cap != null && spend >= cap * 0.8;
    }).length;
    return { total: rows.length, active, prepaid, withContact, totalAmount, stubCount, needsDetails, activePayroll, nearCapCount };
  }, [rows, activePoMap, poSpendMap]);

  const displayedRows = useMemo(() => {
    if (filterMode !== "active") return filtered;
    return [...filtered].sort((a, b) => {
      const activeA = Number(activePoMap.get(a.purchase_order_id)?.total_hours ?? 0);
      const activeB = Number(activePoMap.get(b.purchase_order_id)?.total_hours ?? 0);
      if (activeA !== activeB) return activeB - activeA;
      return String(a.project_name ?? a.purchase_order_number ?? "").localeCompare(
        String(b.project_name ?? b.purchase_order_number ?? "")
      );
    });
  }, [filtered, filterMode, activePoMap]);

  const customerName = useMemo(() => {
    return customers.find((c) => c.customer_id === form.customer_id)?.name ?? "";
  }, [customers, form.customer_id]);

  function openNewDrawer() {
    setDrawerErr(null);
    setDrawerMode("new");
    setEditingPurchaseOrderId(null);
    setForm({
      customer_id: "",
      manager_id: "",
      project_name: "",
      purchase_order_number: "",
      amount: "",
      start_date: "",
      end_date: "",
      notes: "",
      pre_pay: false,
      tracking_active: true,
    });
    setPendingDocs([]);
    setDocDraft({
      file: null,
      doc_type: "PO",
      note: "",
      is_primary: false,
    });
    setDocInputKey((v) => v + 1);
    setShowNewDrawer(true);
  }

  async function openEditDrawer(purchaseOrderId) {
    setDrawerErr(null);
    setDrawerMode("edit");
    setEditingPurchaseOrderId(purchaseOrderId);
    setPendingDocs([]);
    setDocDraft({
      file: null,
      doc_type: "PO",
      note: "",
      is_primary: false,
    });
    setDocInputKey((v) => v + 1);

    const res = await supabase
      .schema("app")
      .from("purchase_orders")
      .select("*")
      .eq("purchase_order_id", purchaseOrderId)
      .single();

    if (res.error) {
      setDrawerErr(res.error.message);
      setShowNewDrawer(true);
      return;
    }

    const po = res.data;
    setForm({
      customer_id: po.customer_id ?? "",
      manager_id: po.manager_id ?? "",
      project_name: po.project_name ?? "",
      purchase_order_number: po.purchase_order_number ?? "",
      amount: formatCurrencyInput(po.amount),
      start_date: po.start_date ?? "",
      end_date: po.end_date ?? "",
      notes: po.notes ?? "",
      pre_pay: !!po.pre_pay,
      tracking_active: !!po.tracking_active,
    });
    setShowNewDrawer(true);
  }

  function closeNewDrawer() {
    if (saving) return;
    setShowNewDrawer(false);
    setDrawerErr(null);
    setEditingPurchaseOrderId(null);
  }

  function openContactDrawer() {
    if (!form.customer_id) {
      setDrawerErr("Select a customer first so the new contact can be attached correctly.");
      return;
    }
    setContactErr(null);
    setContactForm({
      manager_name: "",
      email: "",
      phone: "",
      title: "",
      active: true,
      contact_type: "Manager",
      note: "",
    });
    setShowContactDrawer(true);
  }

  function closeContactDrawer() {
    if (creatingContact) return;
    setShowContactDrawer(false);
    setContactErr(null);
  }

  function addPendingDocument() {
    if (!docDraft.file) {
      setDrawerErr("Choose a document file before adding it.");
      return;
    }

    setDrawerErr(null);
    setPendingDocs((docs) => {
      const shouldBePrimary = docDraft.is_primary || docs.length === 0;
      const normalized = docs.map((doc) => ({
        ...doc,
        is_primary: shouldBePrimary ? false : doc.is_primary,
      }));

      return [
        ...normalized,
        {
          id: `${Date.now()}-${docDraft.file.name}`,
          file: docDraft.file,
          filename: docDraft.file.name,
          doc_type: docDraft.doc_type || "PO",
          note: docDraft.note.trim(),
          is_primary: shouldBePrimary,
        },
      ];
    });

    setDocDraft({
      file: null,
      doc_type: "PO",
      note: "",
      is_primary: false,
    });
    setDocInputKey((v) => v + 1);
  }

  function removePendingDocument(id) {
    setPendingDocs((docs) => {
      const next = docs.filter((doc) => doc.id !== id);
      if (next.length > 0 && !next.some((doc) => doc.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
  }

  async function createContactFromDrawer() {
    if (!form.customer_id) {
      setContactErr("Select a customer before adding a contact.");
      return;
    }
    if (!contactForm.manager_name.trim()) {
      setContactErr("Name is required.");
      return;
    }

    setCreatingContact(true);
    setContactErr(null);

    const payload = {
      customer_id: form.customer_id,
      manager_name: contactForm.manager_name.trim(),
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      title: contactForm.title.trim() || null,
      active: !!contactForm.active,
      contact_type: contactForm.contact_type || "Manager",
      note: contactForm.note.trim() || null,
    };

    const res = await supabase
      .schema("app")
      .from("customer_contacts")
      .insert(payload)
      .select("contact_id, manager_name, contact_type, active")
      .single();

    if (res.error) {
      setContactErr(res.error.message);
      setCreatingContact(false);
      return;
    }

    setContacts((prev) =>
      [res.data, ...prev].sort((a, b) => {
        if (!!a.active !== !!b.active) return a.active ? -1 : 1;
        return String(a.manager_name ?? "").localeCompare(String(b.manager_name ?? ""));
      })
    );
    setForm((prev) => ({ ...prev, manager_id: res.data.contact_id }));
    setCreatingContact(false);
    setShowContactDrawer(false);
  }

  async function savePoFromDrawer() {
    setSaving(true);
    setDrawerErr(null);

    const amountClean = String(form.amount ?? "").replace(/[$,]/g, "").trim();
    const payload = {
      customer_id: form.customer_id || null,
      manager_id: form.manager_id || null,
      project_name: form.project_name || null,
      purchase_order_number: form.purchase_order_number || null,
      amount: amountClean === "" ? null : Number(amountClean),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes || null,
      pre_pay: !!form.pre_pay,
      tracking_active: !!form.tracking_active,
    };

    if (!payload.customer_id) {
      setDrawerErr("Customer is required.");
      setSaving(false);
      return;
    }

    if (amountClean !== "" && Number.isNaN(payload.amount)) {
      setDrawerErr("Amount must be a valid number (example: 112268.00).");
      setSaving(false);
      return;
    }

    const res =
      drawerMode === "edit" && editingPurchaseOrderId
        ? await supabase
            .schema("app")
            .from("purchase_orders")
            .update(payload)
            .eq("purchase_order_id", editingPurchaseOrderId)
            .select("purchase_order_id")
            .single()
        : await supabase
            .schema("app")
            .from("purchase_orders")
            .insert(payload)
            .select("purchase_order_id")
            .single();

    if (res.error) {
      setDrawerErr(res.error.message);
      setSaving(false);
      return;
    }

    const purchaseOrderId = res.data.purchase_order_id;
    if (drawerMode === "new" && pendingDocs.length > 0) {
      for (let i = 0; i < pendingDocs.length; i += 1) {
        const doc = pendingDocs[i];
        const safeName = sanitizeFilename(doc.filename);
        const storagePath = `purchase_orders/${purchaseOrderId}/${Date.now()}_${safeName}`;

        const up = await supabase.storage.from("po-documents").upload(storagePath, doc.file, {
          cacheControl: "3600",
          upsert: false,
          contentType: doc.file.type || undefined,
        });

        if (up.error) {
          setSaving(false);
          setDrawerErr(`PO created, but document upload failed for ${doc.filename}: ${up.error.message}`);
          nav(`/purchase-orders/${purchaseOrderId}`);
          return;
        }

        const ins = await supabase
          .schema("app")
          .from("purchase_order_documents")
          .insert({
            purchase_order_id: purchaseOrderId,
            bucket: "po-documents",
            storage_path: storagePath,
            filename: doc.filename,
            mime_type: doc.file.type || null,
            file_size_bytes: doc.file.size || null,
            doc_type: doc.doc_type || "PO",
            is_primary: !!doc.is_primary,
            note: doc.note || null,
          });

        if (ins.error) {
          setSaving(false);
          setDrawerErr(`PO created, but document record failed for ${doc.filename}: ${ins.error.message}`);
          nav(`/purchase-orders/${purchaseOrderId}`);
          return;
        }

        if (doc.is_primary) {
          await supabase
            .schema("app")
            .from("purchase_orders")
            .update({ primary_document_path: storagePath })
            .eq("purchase_order_id", purchaseOrderId);
        }
      }
    }

    try {
      await loadPurchaseOrders();
    } catch (error) {
      setErr((prev) => prev ?? error.message);
    }

    setSaving(false);
    setShowNewDrawer(false);
    setEditingPurchaseOrderId(null);

    if (drawerMode === "edit") return;
    nav(`/purchase-orders/${purchaseOrderId}`);
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <h2>Purchase Orders</h2>

      <div style={{ color: theme.mutedText, marginTop: 4 }}>
        Browse purchase orders, review customer contacts, and manage assignment activity.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(140px, 1fr))",
          gap: 12,
          marginTop: 14,
          marginBottom: 12,
        }}
      >
        <div style={cardStyle}>
          <div style={{ color: theme.mutedText, fontSize: 12 }}>Total POs</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: theme.mutedText, fontSize: 12 }}>Tracking active</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.active}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: theme.mutedText, fontSize: 12 }}>Pre-pay</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.prepaid}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: theme.mutedText, fontSize: 12 }}>With contact</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.withContact}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: theme.mutedText, fontSize: 12 }}>Total amount</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{money(summary.totalAmount)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ color: theme.mutedText, fontSize: 12 }}>Needs details</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: summary.needsDetails > 0 ? theme.warningText : theme.text }}>
            {summary.needsDetails}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0" }}>
        <button type="button" onClick={openNewDrawer}>New PO</button>

        <input
          placeholder="Search PO #, project, customer, manager…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 420, padding: 8 }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          ["active", `Active POs (${summary.activePayroll})`],
          ["near_cap", `Near Cap (${summary.nearCapCount})`],
          ["needs_details", `Needs details (${summary.needsDetails})`],
          ["tracking_off", `Tracking Off (${rows.filter((r) => r.tracking_active === false).length})`],
          ["all", `All POs (${rows.length})`],
        ].map(([key, label]) => {
          const on = filterMode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilterMode(key)}
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

      {loading && <div>Loading…</div>}
      {err && (
        <div style={{ ...cardStyle, borderColor: theme.warningBorder, background: theme.warningBg, color: theme.warningText }}>
          {err}
        </div>
      )}

      {!loading && !err && displayedRows.length === 0 && (
      <div style={{ marginTop: 12 }}>
          <p style={{ margin: "8px 0" }}>
            {filterMode === "active" ? "No purchase orders have hours on the latest payroll run." : "No purchase orders yet."}
          </p>
          <button type="button" onClick={openNewDrawer}>Create your first PO</button>
        </div>
      )}

{!loading && !err && displayedRows.length > 0 && (
  <div style={sectionCardStyle}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
      <h3 style={sectionTitleStyle}>Purchase order list</h3>
      <div style={{ color: theme.mutedText, fontSize: 12 }}>
        {filterMode === "active" && latestRun
          ? `Latest payroll period ${shortDate(latestRun.period_begin)} - ${shortDate(latestRun.period_end)} • `
          : ""}
        Showing {displayedRows.length} purchase order{displayedRows.length === 1 ? "" : "s"}
      </div>
    </div>
    <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: "25%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "4%" }} />
      </colgroup>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
          <th>Project</th>
          <th>PO #</th>
          <th>Cap</th>
          <th>Invoiced</th>
          <th>Remaining</th>
          <th>Start</th>
          <th>End</th>
          <th>Tracking</th>
          <th>Flags</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {displayedRows.map((r) => {
          const projectLabel =
            (r.project_name && r.project_name.trim()) ||
            (r.purchase_order_number ? `PO ${r.purchase_order_number}` : "(no project/PO)");
          const spendRow = poSpendMap.get(r.purchase_order_id);
          const activePo = r.tracking_active === false ? null : activePoMap.get(r.purchase_order_id);
          const spend = Number(spendRow?.invoiced_amount ?? 0);
          const cap = spendRow?.po_cap_amount == null ? (r.amount == null ? null : Number(r.amount)) : Number(spendRow.po_cap_amount);
          const remaining = spendRow?.remaining_amount == null ? (cap == null ? null : cap - spend) : Number(spendRow.remaining_amount);
          const nearCap = cap != null && spend >= cap * 0.8;
          const overCap = cap != null && spend > cap;

          return (
            <tr key={r.purchase_order_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td>
                <Link to={`/purchase-orders/${r.purchase_order_id}`} style={rowLinkStyle}>
                  {projectLabel}
                </Link>
              </td>
              <td>{r.purchase_order_number ?? ""}</td>
              <td>{cap == null ? "—" : money(cap)}</td>
              <td>{money(spend)}</td>
              <td
                style={{
                  color: remaining != null && remaining < 0 ? "#8F2020" : theme.text,
                  fontWeight: remaining != null && remaining < 0 ? 700 : 500,
                }}
              >
                {remaining == null ? "—" : money(remaining)}
              </td>
              <td>{shortDate(r.start_date)}</td>
              <td>{shortDate(r.end_date)}</td>
              <td>
                <span
                  title={r.tracking_active === false ? "Tracking off" : "Tracking active"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 800,
                    background: r.tracking_active === false ? theme.surfaceMuted : theme.successBg,
                    color: r.tracking_active === false ? theme.mutedText : theme.successText,
                    border: `1px solid ${r.tracking_active === false ? theme.border : theme.successBorder}`,
                  }}
                >
                  {r.tracking_active === false ? "—" : "✓"}
                </span>
              </td>
              <td>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {r.is_stub ? (
                    <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: theme.warningBg, color: theme.warningText, border: `1px solid ${theme.warningBorder}` }}>
                      Stub
                    </span>
                  ) : null}
                  {r.pre_pay ? (
                    <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: theme.primarySoftBg, color: theme.primary, border: `1px solid ${theme.primarySoftBorder}` }}>
                      Pre-pay
                    </span>
                  ) : null}
                  {!r.is_stub && cap != null && nearCap ? (
                    <span style={overCap ? overCapFlagStyle : nearCapFlagStyle}>
                      {overCap ? "Over cap" : "Near cap"}
                    </span>
                  ) : null}
                  {!r.is_stub && !r.pre_pay && !(cap != null && nearCap) ? (
                    <span style={{ color: theme.mutedText }}>—</span>
                  ) : null}
                </div>
              </td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => openEditDrawer(r.purchase_order_id)}
                >
                  Edit
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
)}

      {showNewDrawer && (
        <>
          <div style={drawerBackdropStyle} onClick={closeNewDrawer} />
          <aside style={drawerPanelStyle} aria-label="Add purchase order drawer">
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                  {drawerMode === "edit" ? "Edit Purchase Order" : "New Purchase Order"}
                </h3>
                <div style={{ color: theme.mutedText, marginTop: 6 }}>
                  {customerName
                    ? `Customer: ${customerName}`
                    : drawerMode === "edit"
                      ? "Update purchase order details, customer ownership, and tracking settings."
                      : "Create purchase order details, customer ownership, and tracking settings."}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close add purchase order drawer"
                onClick={closeNewDrawer}
                disabled={saving}
                style={iconButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              {drawerErr ? (
                <div
                  style={{
                    ...cardStyle,
                    borderColor: theme.warningBorder,
                    background: theme.warningBg,
                    color: theme.warningText,
                    marginBottom: 4,
                  }}
                >
                  {drawerErr}
                </div>
              ) : null}

              <label>
                <span style={fieldLabelStyle}>Customer (required)</span>
                <select
                  value={form.customer_id}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      customer_id: e.target.value,
                      manager_id: "",
                    }))
                  }
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
                <span style={fieldLabelStyle}>Customer Contact (optional)</span>
                <select
                  value={form.manager_id}
                  onChange={(e) => setForm((p) => ({ ...p, manager_id: e.target.value }))}
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
                <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="subtle-button" onClick={openContactDrawer}>
                    Add new contact
                  </button>
                  {form.customer_id ? (
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      <Link to={`/customers/${form.customer_id}`}>Manage contacts</Link>
                    </div>
                  ) : null}
                </div>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>PO Number</span>
                  <input
                    value={form.purchase_order_number}
                    onChange={(e) => setForm((p) => ({ ...p, purchase_order_number: e.target.value }))}
                  />
                </label>

                <label>
                  <span style={fieldLabelStyle}>Project Name</span>
                  <input
                    value={form.project_name}
                    onChange={(e) => setForm((p) => ({ ...p, project_name: e.target.value }))}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Amount</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: formatCurrencyInput(e.target.value) }))}
                    placeholder="$112,268"
                  />
                </label>

                <label>
                  <span style={fieldLabelStyle}>Start Date</span>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                  />
                </label>

                <label>
                  <span style={fieldLabelStyle}>End Date</span>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                  />
                </label>
              </div>

              <label>
                <span style={fieldLabelStyle}>Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  style={{ minHeight: 110 }}
                />
              </label>

              {drawerMode === "new" ? (
                <div style={{ ...cardStyle, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>Documents</div>
                      <div style={{ fontSize: 12, color: theme.mutedText, marginTop: 4 }}>
                        Queue documents now and they will upload after the PO is created.
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: theme.mutedText }}>
                      {pendingDocs.length} queued
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={fieldLabelStyle}>Document file</span>
                      <input
                        key={docInputKey}
                        type="file"
                        onChange={(e) => setDocDraft((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))}
                      />
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
                      <label>
                        <span style={fieldLabelStyle}>Document type</span>
                        <select
                          value={docDraft.doc_type}
                          onChange={(e) => setDocDraft((prev) => ({ ...prev, doc_type: e.target.value }))}
                        >
                          <option value="PO">PO</option>
                          <option value="SOW">SOW</option>
                          <option value="CO">CO</option>
                          <option value="Other">Other</option>
                        </select>
                      </label>

                      <label>
                        <span style={fieldLabelStyle}>Note</span>
                        <input
                          value={docDraft.note}
                          onChange={(e) => setDocDraft((prev) => ({ ...prev, note: e.target.value }))}
                          placeholder="Optional note"
                        />
                      </label>
                    </div>

                    <label style={checkboxRowStyle}>
                      <input
                        type="checkbox"
                        style={checkboxInputStyle}
                        checked={!!docDraft.is_primary}
                        onChange={(e) => setDocDraft((prev) => ({ ...prev, is_primary: e.target.checked }))}
                      />
                      Primary document
                    </label>

                    <div>
                      <button type="button" className="subtle-button" onClick={addPendingDocument}>
                        Add document
                      </button>
                    </div>

                    {pendingDocs.length > 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {pendingDocs.map((doc) => (
                          <div
                            key={doc.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                              padding: "10px 12px",
                              borderRadius: 10,
                              background: theme.controlSurface || theme.surface,
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, color: theme.text }}>
                                {doc.filename}
                                {doc.is_primary ? " • Primary" : ""}
                              </div>
                              <div style={{ fontSize: 12, color: theme.mutedText, marginTop: 2 }}>
                                {doc.doc_type}
                                {doc.note ? ` • ${doc.note}` : ""}
                              </div>
                            </div>
                            <button type="button" className="subtle-button" onClick={() => removePendingDocument(doc.id)}>
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

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
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={savePoFromDrawer} disabled={saving}>
                {saving ? "Saving…" : drawerMode === "edit" ? "Save Purchase Order" : "Create Purchase Order"}
              </button>
              <button type="button" className="subtle-button" onClick={closeNewDrawer} disabled={saving}>
                Cancel
              </button>
            </div>
          </aside>
        </>
      )}

      {showContactDrawer && (
        <>
          <div style={drawerBackdropStyle} onClick={closeContactDrawer} />
          <aside style={drawerPanelStyle} aria-label="Add purchase order contact drawer">
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Add contact</h3>
                <div style={{ color: theme.mutedText, marginTop: 6 }}>{customerName || "Selected customer"}</div>
              </div>
              <button
                type="button"
                aria-label="Close add contact drawer"
                onClick={closeContactDrawer}
                disabled={creatingContact}
                style={iconButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              {contactErr ? (
                <div
                  style={{
                    ...cardStyle,
                    borderColor: theme.warningBorder,
                    background: theme.warningBg,
                    color: theme.warningText,
                    marginBottom: 4,
                  }}
                >
                  {contactErr}
                </div>
              ) : null}

              <div>
                <div style={fieldLabelStyle}>Contact type</div>
                <div role="group" aria-label="Contact type" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CONTACT_TYPE_OPTIONS.map((opt) => {
                    const active = contactForm.contact_type === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setContactForm((prev) => ({ ...prev, contact_type: opt.value }))}
                        style={{
                          height: 36,
                          minWidth: 110,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: "1px solid transparent",
                          background: active ? theme.text : theme.controlSurface,
                          color: active ? theme.surface : theme.text,
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: 500,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label>
                <span style={fieldLabelStyle}>Name (required)</span>
                <input
                  value={contactForm.manager_name}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, manager_name: e.target.value }))}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Email</span>
                  <input
                    value={contactForm.email}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Phone</span>
                  <input
                    value={contactForm.phone}
                    onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </label>
              </div>

              <label>
                <span style={fieldLabelStyle}>Title</span>
                <input
                  value={contactForm.title}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={!!contactForm.active}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, active: e.target.checked }))}
                />
                Active
              </label>

              <label>
                <span style={fieldLabelStyle}>Note</span>
                <textarea
                  value={contactForm.note}
                  onChange={(e) => setContactForm((prev) => ({ ...prev, note: e.target.value }))}
                  style={{ minHeight: 120 }}
                />
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={createContactFromDrawer} disabled={creatingContact}>
                {creatingContact ? "Saving…" : "Save contact"}
              </button>
              <button type="button" className="subtle-button" onClick={closeContactDrawer} disabled={creatingContact}>
                Cancel
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
