import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { theme } from "../theme";

const PO_TABS = [
  { key: "assignments", label: "Assignments" },
  { key: "invoices", label: "Invoices" },
  { key: "documents", label: "Documents" },
];
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

function money(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function parseNum(v) {
  let s = String(v ?? "").trim();
  if (s === "") return null;

  // allow things like "$55.00" or "55/hr" while still rejecting nonsense
  s = s.replace(/,/g, "");
  s = s.replace(/[^0-9.\-]/g, ""); // keep digits, dot, minus

  if (s === "" || s === "-" || s === "." || s === "-.") return null;

  const n = Number(s);
  return Number.isNaN(n) ? NaN : n;
}

function isActive(start, end) {
  const today = new Date();
  const s = start ? new Date(start + "T00:00:00") : null;
  const e = end ? new Date(end + "T00:00:00") : null;
  if (s && today < s) return false;
  if (e && today > e) return false;
  return true;
}

function fmtDate(v) {
  if (!v) return "";
  // v is expected like "YYYY-MM-DD" from Postgres
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sanitizeFilename(name) {
  return String(name ?? "document")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

function normalizePoForm(po) {
  return {
    customer_id: po?.customer_id ?? "",
    manager_id: po?.manager_id ?? "",
    project_name: po?.project_name ?? "",
    purchase_order_number: po?.purchase_order_number ?? "",
    amount: po?.amount == null ? "" : String(po.amount),
    start_date: po?.start_date ?? "",
    end_date: po?.end_date ?? "",
    notes: po?.notes ?? "",
    pre_pay: !!po?.pre_pay,
    tracking_active: po?.tracking_active ?? true,
  };
}

const LINE_TYPE_LABELS = {
  REG: "Regular Hours",
  OT: "Overtime",
  OT2: "Double Time",
  EXP: "Expense Reimbursement",
  PP: "Prepay",
  ADJ: "Adjustment",
};

export default function PurchaseOrderDetail() {
  const { purchase_order_id } = useParams();
  const [activeTab, setActiveTab] = useState("assignments");

  const [po, setPo] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [consultants, setConsultants] = useState([]);
  const [consultantText, setConsultantText] = useState("");
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [savingPo, setSavingPo] = useState(false);
  const [poForm, setPoForm] = useState(normalizePoForm(null));
  const [poBaseline, setPoBaseline] = useState(normalizePoForm(null));
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docErr, setDocErr] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [openingDocId, setOpeningDocId] = useState(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [docInputKey, setDocInputKey] = useState(0);
  const [docForm, setDocForm] = useState({
    doc_type: "PO",
    note: "",
    is_primary: false,
  });
  const [showDocDrawer, setShowDocDrawer] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editDocForm, setEditDocForm] = useState({
    doc_type: "PO",
    note: "",
    is_primary: false,
  });
  const [replacementDocFile, setReplacementDocFile] = useState(null);
  const [replacementDocInputKey, setReplacementDocInputKey] = useState(0);
  const [savingDocEdit, setSavingDocEdit] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteAssignmentConfirm, setDeleteAssignmentConfirm] = useState(null);
  const [deleteAssignmentReason, setDeleteAssignmentReason] = useState("");
  const [deletingAssignmentId, setDeletingAssignmentId] = useState(null);
  const [editA, setEditA] = useState({
    assignment_start_date: "",
    assignment_end_date: "",
    billing_end_date_override: "",
    pay_rate_regular: "",
    pay_rate_overtime: "",
    bill_rate_regular: "",
    bill_rate_overtime: "",
    notes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [newA, setNewA] = useState({
    consultant_id: "",
    assignment_start_date: "",
    assignment_end_date: "",
    billing_end_date_override: "",
    pay_rate_regular: "",
    pay_rate_overtime: "",
    bill_rate_regular: "",
    bill_rate_overtime: "",
    notes: "",
  });

  // Load PO + assignments + consultants
  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      const customersRes = await supabase
        .schema("app")
        .from("customers")
        .select("customer_id, name")
        .order("name", { ascending: true });

      if (!alive) return;
      if (customersRes.error) {
        setErr(customersRes.error.message);
        setLoading(false);
        return;
      }
      setCustomers(customersRes.data ?? []);

      const poRes = await supabase
        .schema("app")
        .from("purchase_orders")
        .select(
          `
          *,
          customer:customers(name),
          manager:customer_contacts(manager_name, email, phone, title, contact_type)
        `
        )
        .eq("purchase_order_id", purchase_order_id)
        .single();

      if (!alive) return;
      if (poRes.error) {
        setErr(poRes.error.message);
        setLoading(false);
        return;
      }
      setPo(poRes.data);
      setPoForm(normalizePoForm(poRes.data));
      setPoBaseline(normalizePoForm(poRes.data));

      const dRes = await supabase
        .schema("app")
        .from("purchase_order_documents")
        .select("document_id, purchase_order_id, bucket, storage_path, filename, mime_type, file_size_bytes, doc_type, is_primary, note, uploaded_at")
        .eq("purchase_order_id", purchase_order_id)
        .order("is_primary", { ascending: false })
        .order("uploaded_at", { ascending: false });

      if (!alive) return;
      if (dRes.error) {
        setDocErr(dRes.error.message);
      } else {
        setDocuments(dRes.data ?? []);
      }

      const aRes = await supabase
        .schema("app")
        .from("consultant_po_assignments")
        .select(
          `
          assignment_id,
          consultant_id,
          purchase_order_id,
          assignment_start_date,
          assignment_end_date,
          billing_end_date_override,
          pay_rate_regular,
          pay_rate_overtime,
          bill_rate_regular,
          bill_rate_overtime,
          notes,
          created_at
        `
        )
        .eq("purchase_order_id", purchase_order_id)
        .is("deleted_at", null)
        .order("assignment_start_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (aRes.error) {
        setErr(aRes.error.message);
        setLoading(false);
        return;
      }
      setAssignments(aRes.data ?? []);

      const invRes = await supabase
        .schema("app")
        .from("invoices")
        .select(
          `
          invoice_id,
          invoice_no,
          status,
          period_begin,
          period_end,
          invoice_date,
          due_date,
          purchase_order_number_snapshot
        `
        )
        .eq("purchase_order_id", purchase_order_id)
        .order("period_end", { ascending: false })
        .order("invoice_date", { ascending: false });

      if (!alive) return;
      if (invRes.error) {
        setErr((prev) => prev ?? invRes.error.message);
      } else {
        setInvoices(invRes.data ?? []);
      }

      const lineRes = await supabase
        .schema("app")
        .from("invoice_lines")
        .select(
          `
          invoice_line_id,
          invoice_id,
          purchase_order_id,
          consultant_id,
          line_description,
          service_date,
          service_date_begin,
          service_date_end,
          reg_hours,
          ot_hours,
          ot2_hours,
          bill_rate_regular,
          bill_rate_overtime,
          amount,
          line_type,
          service_category
        `
        )
        .eq("purchase_order_id", purchase_order_id)
        .order("service_date", { ascending: false });

      if (!alive) return;
      if (lineRes.error) {
        setErr((prev) => prev ?? lineRes.error.message);
      } else {
        setInvoiceLines(lineRes.data ?? []);
      }

      // consultants for dropdown + display
      const cRes = await supabase
        .schema("app")
        .from("consultants")
        .select("consultant_id, first_name, last_name, display_name, kelly_employee_code, kelly_worker_key")
        .order("last_name", { ascending: true });

      if (!alive) return;
      if (cRes.error) {
        setErr(cRes.error.message);
        setLoading(false);
        return;
      }
      setConsultants(cRes.data ?? []);

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [purchase_order_id]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const customerId = poForm.customer_id;
      if (!customerId) {
        setContacts([]);
        return;
      }

      const { data, error } = await supabase
        .schema("app")
        .from("customer_contacts")
        .select("contact_id, manager_name, contact_type, active")
        .eq("customer_id", customerId)
        .eq("contact_type", "Manager")
        .order("active", { ascending: false })
        .order("manager_name", { ascending: true });

      if (!alive) return;
      if (error) {
        setErr((prev) => prev ?? error.message);
        setContacts([]);
        return;
      }

      setContacts(data ?? []);
    })();

    return () => {
      alive = false;
    };
  }, [poForm.customer_id]);

  const consultantNameById = useMemo(() => {
    const m = new Map();
    for (const c of consultants) {
      const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      const name =
        (c.display_name && c.display_name.trim()) ||
        full ||
        c.kelly_worker_key ||
        c.kelly_employee_code ||
        c.consultant_id;
      m.set(c.consultant_id, name);
    }
    
    return m;
  }, [consultants]);

  const poDrawerDirty =
    showEditDrawer &&
    JSON.stringify(normalizePoForm(poForm)) !== JSON.stringify(normalizePoForm(poBaseline));

  const customerName = useMemo(
    () => customers.find((c) => c.customer_id === poForm.customer_id)?.name ?? po?.customer?.name ?? "",
    [customers, poForm.customer_id, po]
  );

  const invoiceSummary = useMemo(() => {
    const totalAmount = invoiceLines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
    const totalReg = invoiceLines.reduce((sum, line) => sum + Number(line.reg_hours ?? 0), 0);
    const totalOt = invoiceLines.reduce((sum, line) => sum + Number(line.ot_hours ?? 0), 0);
    const totalOt2 = invoiceLines.reduce((sum, line) => sum + Number(line.ot2_hours ?? 0), 0);
    return {
      invoiceCount: invoices.length,
      lineCount: invoiceLines.length,
      totalAmount,
      totalReg,
      totalOt,
      totalOt2,
    };
  }, [invoices, invoiceLines]);

  const invoiceLinesByInvoice = useMemo(() => {
    const grouped = new Map();
    for (const line of invoiceLines) {
      const key = line.invoice_id || "unknown";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(line);
    }
    return grouped;
  }, [invoiceLines]);

  useEffect(() => {
    if (!showEditDrawer) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") requestCloseEditDrawer();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showEditDrawer, poDrawerDirty, savingPo]);

  function openEditDrawer() {
    setErr(null);
    const nextForm = normalizePoForm(po);
    setPoForm(nextForm);
    setPoBaseline(nextForm);
    setShowEditDrawer(true);
  }

  function closeEditDrawer() {
    setShowEditDrawer(false);
    setDiscardConfirm(false);
  }

  function requestCloseEditDrawer() {
    if (savingPo) return;
    if (poDrawerDirty) {
      setDiscardConfirm(true);
      return;
    }
    closeEditDrawer();
  }

  async function savePoEdits() {
    setSavingPo(true);
    setErr(null);

    const amountClean = String(poForm.amount ?? "").replace(/,/g, "").trim();
    const payload = {
      customer_id: poForm.customer_id || null,
      manager_id: poForm.manager_id || null,
      project_name: poForm.project_name || null,
      purchase_order_number: poForm.purchase_order_number || null,
      amount: amountClean === "" ? null : Number(amountClean),
      start_date: poForm.start_date || null,
      end_date: poForm.end_date || null,
      notes: poForm.notes?.trim() || null,
      pre_pay: !!poForm.pre_pay,
      tracking_active: !!poForm.tracking_active,
    };

    if (!payload.customer_id) {
      setErr("Customer is required.");
      setSavingPo(false);
      return;
    }

    if (amountClean !== "" && Number.isNaN(payload.amount)) {
      setErr("Amount must be a valid number (example: 112268.00).");
      setSavingPo(false);
      return;
    }

    const res = await supabase
      .schema("app")
      .from("purchase_orders")
      .update(payload)
      .eq("purchase_order_id", purchase_order_id)
      .select(
        `
        *,
        customer:customers(name),
        manager:customer_contacts(manager_name, email, phone, title, contact_type)
      `
      )
      .single();

    if (res.error) {
      setErr(res.error.message);
      setSavingPo(false);
      return;
    }

    setPo(res.data);
    setPoForm(normalizePoForm(res.data));
    setPoBaseline(normalizePoForm(res.data));
    closeEditDrawer();
    setSavingPo(false);
  }

  async function reloadDocuments() {
    const { data, error } = await supabase
      .schema("app")
      .from("purchase_order_documents")
      .select("document_id, purchase_order_id, bucket, storage_path, filename, mime_type, file_size_bytes, doc_type, is_primary, note, uploaded_at")
      .eq("purchase_order_id", purchase_order_id)
      .order("is_primary", { ascending: false })
      .order("uploaded_at", { ascending: false });

    if (error) {
      setDocErr(error.message);
      return;
    }

    setDocuments(data ?? []);
  }

  async function openDocument(doc) {
    setDocErr(null);
    setOpeningDocId(doc.document_id);

    const { data, error } = await supabase.storage
      .from(doc.bucket)
      .createSignedUrl(doc.storage_path, 60);

    if (error) {
      setDocErr(error.message);
      setOpeningDocId(null);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setOpeningDocId(null);
  }

  async function markDocumentPrimary(doc) {
    setDocErr(null);
    setSettingPrimaryId(doc.document_id);

    const clear = await supabase
      .schema("app")
      .from("purchase_order_documents")
      .update({ is_primary: false })
      .eq("purchase_order_id", purchase_order_id);

    if (clear.error) {
      setDocErr(clear.error.message);
      setSettingPrimaryId(null);
      return;
    }

    const setDoc = await supabase
      .schema("app")
      .from("purchase_order_documents")
      .update({ is_primary: true })
      .eq("document_id", doc.document_id);

    if (setDoc.error) {
      setDocErr(setDoc.error.message);
      setSettingPrimaryId(null);
      return;
    }

    const setPoRes = await supabase
      .schema("app")
      .from("purchase_orders")
      .update({ primary_document_path: doc.storage_path })
      .eq("purchase_order_id", purchase_order_id)
      .select("*")
      .single();

    if (setPoRes.error) {
      setDocErr(setPoRes.error.message);
      setSettingPrimaryId(null);
      return;
    }

    setPo(setPoRes.data);
    await reloadDocuments();
    setSettingPrimaryId(null);
  }

  async function uploadDocument() {
    setUploadingDoc(true);
    setDocErr(null);

    if (!docFile) {
      setDocErr("Please choose a file to upload.");
      setUploadingDoc(false);
      return;
    }

    const safeName = sanitizeFilename(docFile.name);
    const storagePath = `purchase_orders/${purchase_order_id}/${Date.now()}_${safeName}`;
    const shouldBePrimary = docForm.is_primary || documents.length === 0;

    const up = await supabase.storage.from("po-documents").upload(storagePath, docFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: docFile.type || undefined,
    });

    if (up.error) {
      setDocErr(up.error.message);
      setUploadingDoc(false);
      return;
    }

    if (shouldBePrimary) {
      const clear = await supabase
        .schema("app")
        .from("purchase_order_documents")
        .update({ is_primary: false })
        .eq("purchase_order_id", purchase_order_id);

      if (clear.error) {
        setDocErr(clear.error.message);
        setUploadingDoc(false);
        return;
      }
    }

    const ins = await supabase
      .schema("app")
      .from("purchase_order_documents")
      .insert({
        purchase_order_id,
        bucket: "po-documents",
        storage_path: storagePath,
        filename: docFile.name,
        mime_type: docFile.type || null,
        file_size_bytes: docFile.size || null,
        doc_type: docForm.doc_type || "PO",
        is_primary: shouldBePrimary,
        note: docForm.note.trim() || null,
      })
      .select("document_id, purchase_order_id, bucket, storage_path, filename, mime_type, file_size_bytes, doc_type, is_primary, note, uploaded_at")
      .single();

    if (ins.error) {
      setDocErr(ins.error.message);
      setUploadingDoc(false);
      return;
    }

    if (shouldBePrimary) {
      const setPoRes = await supabase
        .schema("app")
        .from("purchase_orders")
        .update({ primary_document_path: storagePath })
        .eq("purchase_order_id", purchase_order_id)
        .select("*")
        .single();

      if (setPoRes.error) {
        setDocErr(setPoRes.error.message);
        setUploadingDoc(false);
        return;
      }

      setPo(setPoRes.data);
    }

    setDocuments((prev) => [ins.data, ...prev.filter((d) => !(shouldBePrimary && d.is_primary))]);
    setDocForm({ doc_type: "PO", note: "", is_primary: false });
    setDocFile(null);
    setDocInputKey((k) => k + 1);
    await reloadDocuments();
    setUploadingDoc(false);
  }

  function openDocumentEditor(doc) {
    setDocErr(null);
    setEditingDoc(doc);
    setEditDocForm({
      doc_type: doc.doc_type ?? "PO",
      note: doc.note ?? "",
      is_primary: !!doc.is_primary,
    });
    setReplacementDocFile(null);
    setReplacementDocInputKey((k) => k + 1);
    setShowDocDrawer(true);
  }

  function closeDocumentEditor() {
    setShowDocDrawer(false);
    setEditingDoc(null);
    setReplacementDocFile(null);
  }

  async function saveDocumentEdits() {
    if (!editingDoc) return;

    setSavingDocEdit(true);
    setDocErr(null);

    let nextStoragePath = editingDoc.storage_path;
    let nextFilename = editingDoc.filename;
    let nextMimeType = editingDoc.mime_type;
    let nextFileSize = editingDoc.file_size_bytes;

    if (replacementDocFile) {
      const safeName = sanitizeFilename(replacementDocFile.name);
      nextStoragePath = `purchase_orders/${purchase_order_id}/${Date.now()}_${safeName}`;

      const up = await supabase.storage.from(editingDoc.bucket).upload(nextStoragePath, replacementDocFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: replacementDocFile.type || undefined,
      });

      if (up.error) {
        setDocErr(up.error.message);
        setSavingDocEdit(false);
        return;
      }

      nextFilename = replacementDocFile.name;
      nextMimeType = replacementDocFile.type || null;
      nextFileSize = replacementDocFile.size || null;
    }

    if (editDocForm.is_primary) {
      const clear = await supabase
        .schema("app")
        .from("purchase_order_documents")
        .update({ is_primary: false })
        .eq("purchase_order_id", purchase_order_id)
        .neq("document_id", editingDoc.document_id);

      if (clear.error) {
        setDocErr(clear.error.message);
        setSavingDocEdit(false);
        return;
      }
    }

    const upd = await supabase
      .schema("app")
      .from("purchase_order_documents")
      .update({
        storage_path: nextStoragePath,
        filename: nextFilename,
        mime_type: nextMimeType,
        file_size_bytes: nextFileSize,
        doc_type: editDocForm.doc_type || "PO",
        note: editDocForm.note.trim() || null,
        is_primary: !!editDocForm.is_primary,
      })
      .eq("document_id", editingDoc.document_id)
      .select("document_id, purchase_order_id, bucket, storage_path, filename, mime_type, file_size_bytes, doc_type, is_primary, note, uploaded_at")
      .single();

    if (upd.error) {
      setDocErr(upd.error.message);
      setSavingDocEdit(false);
      return;
    }

    const newPrimaryPath = editDocForm.is_primary
      ? nextStoragePath
      : po.primary_document_path === editingDoc.storage_path
        ? null
        : po.primary_document_path;

    const poRes = await supabase
      .schema("app")
      .from("purchase_orders")
      .update({ primary_document_path: newPrimaryPath })
      .eq("purchase_order_id", purchase_order_id)
      .select("*")
      .single();

    if (poRes.error) {
      setDocErr(poRes.error.message);
      setSavingDocEdit(false);
      return;
    }

    if (replacementDocFile && editingDoc.storage_path !== nextStoragePath) {
      await supabase.storage.from(editingDoc.bucket).remove([editingDoc.storage_path]);
    }

    setPo(poRes.data);
    await reloadDocuments();
    closeDocumentEditor();
    setSavingDocEdit(false);
  }

  function startEdit(a) {
    setErr(null);
    setEditingId(a.assignment_id);
    setEditA({
      assignment_start_date: a.assignment_start_date ?? "",
      assignment_end_date: a.assignment_end_date ?? "",
      billing_end_date_override: a.billing_end_date_override ?? "",
      pay_rate_regular: a.pay_rate_regular == null ? "" : String(a.pay_rate_regular),
      pay_rate_overtime: a.pay_rate_overtime == null ? "" : String(a.pay_rate_overtime),
      bill_rate_regular: a.bill_rate_regular == null ? "" : String(a.bill_rate_regular),
      bill_rate_overtime: a.bill_rate_overtime == null ? "" : String(a.bill_rate_overtime),
      notes: a.notes ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditA({
      assignment_start_date: "",
      assignment_end_date: "",
      billing_end_date_override: "",
      pay_rate_regular: "",
      pay_rate_overtime: "",
      bill_rate_regular: "",
      bill_rate_overtime: "",
      notes: "",
    });
  }

  async function createAssignment() {
    setSavingNew(true);
    setErr(null);

    if (!newA.consultant_id) {
      setErr("Consultant is required.");
      setSavingNew(false);
      return;
    }
    if (!newA.assignment_start_date) {
      setErr("Start date is required.");
      setSavingNew(false);
      return;
    }

    const pr = parseNum(newA.pay_rate_regular);
    const po = parseNum(newA.pay_rate_overtime);
    const br = parseNum(newA.bill_rate_regular);
    const bo = parseNum(newA.bill_rate_overtime);

    if ([pr, po, br, bo].some((x) => x !== null && Number.isNaN(x))) {
      setErr("One of the rate fields is not a valid number. Example: 55.00");
      setSavingNew(false);
      return;
    }

    const payload = {
      consultant_id: newA.consultant_id,
      purchase_order_id,
      assignment_start_date: newA.assignment_start_date,
      assignment_end_date: newA.assignment_end_date || null,
      billing_end_date_override: newA.billing_end_date_override || null,
      pay_rate_regular: pr,
      pay_rate_overtime: po,
      bill_rate_regular: br,
      bill_rate_overtime: bo,
      notes: newA.notes?.trim() || null,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .insert(payload)
      .select(
        "assignment_id, consultant_id, purchase_order_id, assignment_start_date, assignment_end_date, billing_end_date_override, pay_rate_regular, pay_rate_overtime, bill_rate_regular, bill_rate_overtime, notes, created_at"
      )
      .single();

    if (error) {
      setErr(error.message);
      setSavingNew(false);
      return;
    }

    setAssignments((prev) => [data, ...prev]);
    setNewA({
      consultant_id: "",
      assignment_start_date: "",
      assignment_end_date: "",
      billing_end_date_override: "",
      pay_rate_regular: "",
      pay_rate_overtime: "",
      bill_rate_regular: "",
      bill_rate_overtime: "",
      notes: "",
    });
    setShowNew(false);
    setSavingNew(false);
  }

  async function updateAssignment(assignment_id) {
    setSavingEdit(true);
    setErr(null);

    if (!editA.assignment_start_date) {
      setErr("Start date is required.");
      setSavingEdit(false);
      return;
    }

    const pr = parseNum(editA.pay_rate_regular);
    const po = parseNum(editA.pay_rate_overtime);
    const br = parseNum(editA.bill_rate_regular);
    const bo = parseNum(editA.bill_rate_overtime);

    if ([pr, po, br, bo].some((x) => x !== null && Number.isNaN(x))) {
      setErr("One of the rate fields is not a valid number. Example: 55.00");
      setSavingEdit(false);
      return;
    }

    const payload = {
      assignment_start_date: editA.assignment_start_date,
      assignment_end_date: editA.assignment_end_date || null,
      billing_end_date_override: editA.billing_end_date_override || null,
      pay_rate_regular: pr,
      pay_rate_overtime: po,
      bill_rate_regular: br,
      bill_rate_overtime: bo,
      notes: editA.notes?.trim() || null,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .update(payload)
      .eq("assignment_id", assignment_id)
      .select(
        "assignment_id, consultant_id, purchase_order_id, assignment_start_date, assignment_end_date, billing_end_date_override, pay_rate_regular, pay_rate_overtime, bill_rate_regular, bill_rate_overtime, notes, created_at"
      )
      .single();

    if (error) {
      setErr(error.message);
      setSavingEdit(false);
      return;
    }

    setAssignments((prev) => prev.map((a) => (a.assignment_id === assignment_id ? data : a)));
    setEditingId(null);
    setSavingEdit(false);
  }

  function requestDeleteAssignment(assignment) {
    setErr(null);
    setDeleteAssignmentReason("");
    setDeleteAssignmentConfirm(assignment);
  }

  function closeDeleteAssignmentConfirm() {
    if (deletingAssignmentId) return;
    setDeleteAssignmentConfirm(null);
    setDeleteAssignmentReason("");
  }

  async function confirmDeleteAssignment() {
    if (!deleteAssignmentConfirm?.assignment_id) return;

    setDeletingAssignmentId(deleteAssignmentConfirm.assignment_id);
    setErr(null);

    const { error } = await supabase.schema("app").rpc("soft_delete_consultant_assignment", {
      p_assignment_id: deleteAssignmentConfirm.assignment_id,
      p_delete_reason: deleteAssignmentReason.trim() || null,
    });

    if (error) {
      setErr(error.message);
      setDeletingAssignmentId(null);
      return;
    }

    setAssignments((prev) => prev.filter((a) => a.assignment_id !== deleteAssignmentConfirm.assignment_id));
    if (editingId === deleteAssignmentConfirm.assignment_id) {
      setEditingId(null);
    }
    setDeletingAssignmentId(null);
    setDeleteAssignmentConfirm(null);
    setDeleteAssignmentReason("");
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (err && !po) return <div style={{ padding: 24, color: "crimson" }}>{err}</div>;
  if (!po) return <div style={{ padding: 24 }}>Not found</div>;

  const mgr = po.manager;
  const mgrLineParts = [mgr?.title || null, mgr?.email || null, mgr?.phone || null].filter(Boolean);
  const activeAssignments = assignments.filter((a) => isActive(a.assignment_start_date, a.assignment_end_date)).length;
  const primaryDocument = documents.find((d) => d.is_primary) ?? null;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <Link to="/purchase-orders">← Back to POs</Link>
          <button type="button" onClick={openEditDrawer}>
            Edit Purchase Order
          </button>
        </div>

        <h2 style={{ marginBottom: 6 }}>{po.project_name ?? "(No project name)"}</h2>

        <div style={{ color: "#666", marginBottom: 8 }}>
          <b>{po.customer?.name ?? ""}</b>
          {po.purchase_order_number ? ` • PO ${po.purchase_order_number}` : ""}
        </div>

        <div style={{ color: "#666", marginBottom: 12 }}>
          <b>Contact:</b>{" "}
          {mgr?.manager_name ? mgr.manager_name : <span style={{ color: "#999" }}>None</span>}
          {mgrLineParts.length > 0 ? ` • ${mgrLineParts.join(" • ")}` : ""}
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
            <div style={{ color: "#666", fontSize: 12 }}>PO amount</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{money(po.amount) || "—"}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Tracking</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{po.tracking_active ? "On" : "Off"}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Pre-pay</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{po.pre_pay ? "Yes" : "No"}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Assignments</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{assignments.length}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Active assignments</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{activeAssignments}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Documents</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{documents.length}</div>
          </div>
        </div>

        {err && (
          <div
            style={{
              ...cardStyle,
              borderColor: "#fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
            }}
          >
            {err}
          </div>
        )}
      </div>

      <div style={{ maxWidth: "100%" }}>
        <div style={{ ...sectionCardStyle, marginBottom: 14 }}>
          <h3 style={sectionTitleStyle}>Purchase Order Details</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <b>Start:</b> {fmtDate(po.start_date)}
            </div>
            <div>
              <b>End:</b> {fmtDate(po.end_date)}
            </div>
            <div>
              <b>Contact type:</b> {mgr?.contact_type ?? "—"}
            </div>
          </div>
        </div>

        {po.notes && (
          <div style={{ ...sectionCardStyle, marginBottom: 14 }}>
            <h3 style={sectionTitleStyle}>Notes</h3>
            <div style={{ whiteSpace: "pre-wrap" }}>{po.notes}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18, marginBottom: 10 }}>
          {PO_TABS.map((tab) => {
            const on = activeTab === tab.key;
            const count =
              tab.key === "assignments"
                ? assignments.length
                : tab.key === "invoices"
                  ? invoices.length
                  : documents.length;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  height: 36,
                  padding: "0 4px",
                  borderRadius: 0,
                  border: "none",
                  borderBottom: `2px solid ${on ? theme.primary : "transparent"}`,
                  background: "transparent",
                  color: on ? theme.primary : "#111",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: on ? 700 : 600,
                }}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {activeTab === "assignments" && (
          <div style={{ ...sectionCardStyle, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <h3 style={sectionTitleStyle}>Assignments</h3>
              <div style={{ color: "#666", fontSize: 12 }}>
                Showing {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0" }}>
              <button
                onClick={() => {
                  setShowNew((v) => {
                    const next = !v;
                    if (next) {
                      setConsultantText("");
                      setNewA((p) => ({ ...p, consultant_id: "" }));
                    }
                    return next;
                  });
                }}
              >
                {showNew ? "Close" : "Add assignment"}
              </button>
            </div>

            {showNew && (
              <div style={{ ...cardStyle, borderColor: "#e6e8ee", maxWidth: 860 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>New Assignment</h4>
            <label>
              Consultant (required)
              <input
                list="consultant-options"
                value={consultantText}
                onChange={(e) => {
                  const v = e.target.value;
                  setConsultantText(v);

                  // If the typed value matches one of the option labels, set consultant_id.
                  // Otherwise keep consultant_id empty until they pick a valid value.
                  const match = consultants.find((c) => {
                    const label = consultantNameById.get(c.consultant_id) ?? "";
                    return label === v;
                  });

                  setNewA((p) => ({ ...p, consultant_id: match ? match.consultant_id : "" }));
                }}
                placeholder="Start typing a name…"
                style={{ width: "100%", padding: 8 }}
              />
              <datalist id="consultant-options">
                {consultants.map((c) => {
                  const label = consultantNameById.get(c.consultant_id) ?? "";
                  return <option key={c.consultant_id} value={label} />;
                })}
              </datalist>
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Tip: type a few letters, then pick a match from the dropdown.
              </div>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                Start date (required)
                <input
                  type="date"
                  value={newA.assignment_start_date}
                  onChange={(e) => setNewA((p) => ({ ...p, assignment_start_date: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
              <label>
                End date (optional)
                <input
                  type="date"
                  value={newA.assignment_end_date}
                  onChange={(e) => setNewA((p) => ({ ...p, assignment_end_date: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
            </div>

            <label>
              Billing override through
              <input
                type="date"
                value={newA.billing_end_date_override}
                onChange={(e) => setNewA((p) => ({ ...p, billing_end_date_override: e.target.value }))}
                style={{ width: "100%", padding: 8 }}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                Use this when billing should continue after the assignment end date through payroll close.
              </div>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                Bill rate (regular)
                <input
                  value={newA.bill_rate_regular}
                  onChange={(e) => setNewA((p) => ({ ...p, bill_rate_regular: e.target.value }))}
                  placeholder="e.g. 95.00"
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
              <label>
                Bill rate (overtime)
                <input
                  value={newA.bill_rate_overtime}
                  onChange={(e) => setNewA((p) => ({ ...p, bill_rate_overtime: e.target.value }))}
                  placeholder="e.g. 142.50"
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label>
                Pay rate (regular)
                <input
                  value={newA.pay_rate_regular}
                  onChange={(e) => setNewA((p) => ({ ...p, pay_rate_regular: e.target.value }))}
                  placeholder="e.g. 55.00"
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
              <label>
                Pay rate (overtime)
                <input
                  value={newA.pay_rate_overtime}
                  onChange={(e) => setNewA((p) => ({ ...p, pay_rate_overtime: e.target.value }))}
                  placeholder="e.g. 82.50"
                  style={{ width: "100%", padding: 8 }}
                />
              </label>
            </div>

            <label>
              Notes
              <textarea
                value={newA.notes}
                onChange={(e) => setNewA((p) => ({ ...p, notes: e.target.value }))}
                style={{ width: "100%", padding: 8, minHeight: 70 }}
              />
            </label>

            <button onClick={createAssignment} disabled={savingNew}>
              {savingNew ? "Saving…" : "Save assignment"}
            </button>
          </div>
              </div>
            )}

            {assignments.length === 0 ? (
              <div style={{ color: "#666" }}>No assignments yet.</div>
            ) : (
              <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th>Consultant</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Billing Override</th>
                    <th>Bill Reg</th>
                    <th>Bill OT</th>
                    <th>Pay Reg</th>
                    <th>Pay OT</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => {
                    const nm = consultantNameById.get(a.consultant_id) ?? a.consultant_id;
                    const active = isActive(a.assignment_start_date, a.assignment_end_date);
                    return (
                      <tr key={a.assignment_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td>{nm}</td>

                        {editingId === a.assignment_id ? (
                          <>
                            <td>
                              <input
                                type="date"
                                value={editA.assignment_start_date}
                                onChange={(e) => setEditA((p) => ({ ...p, assignment_start_date: e.target.value }))}
                                style={{ padding: 6 }}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={editA.assignment_end_date}
                                onChange={(e) => setEditA((p) => ({ ...p, assignment_end_date: e.target.value }))}
                                style={{ padding: 6 }}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={editA.billing_end_date_override}
                                onChange={(e) => setEditA((p) => ({ ...p, billing_end_date_override: e.target.value }))}
                                style={{ padding: 6 }}
                              />
                            </td>
                            <td>
                              <input
                                value={editA.bill_rate_regular}
                                onChange={(e) => setEditA((p) => ({ ...p, bill_rate_regular: e.target.value }))}
                                style={{ width: 100, padding: 6 }}
                              />
                            </td>
                            <td>
                              <input
                                value={editA.bill_rate_overtime}
                                onChange={(e) => setEditA((p) => ({ ...p, bill_rate_overtime: e.target.value }))}
                                style={{ width: 100, padding: 6 }}
                              />
                            </td>
                            <td>
                              <input
                                value={editA.pay_rate_regular}
                                onChange={(e) => setEditA((p) => ({ ...p, pay_rate_regular: e.target.value }))}
                                style={{ width: 100, padding: 6 }}
                              />
                            </td>
                            <td>
                              <input
                                value={editA.pay_rate_overtime}
                                onChange={(e) => setEditA((p) => ({ ...p, pay_rate_overtime: e.target.value }))}
                                style={{ width: 100, padding: 6 }}
                              />
                            </td>
                            <td>{active ? "Yes" : "No"}</td>
                            <td>
                              <button onClick={() => updateAssignment(a.assignment_id)} disabled={savingEdit}>
                                {savingEdit ? "Saving…" : "Save"}
                              </button>{" "}
                              <button onClick={cancelEdit} disabled={savingEdit}>
                                Cancel
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{fmtDate(a.assignment_start_date)}</td>
                            <td>{fmtDate(a.assignment_end_date)}</td>
                            <td>{fmtDate(a.billing_end_date_override) || "—"}</td>
                            <td>{money(a.bill_rate_regular)}</td>
                            <td>{money(a.bill_rate_overtime)}</td>
                            <td>{money(a.pay_rate_regular)}</td>
                            <td>{money(a.pay_rate_overtime)}</td>
                            <td>{active ? "Yes" : "No"}</td>
                            <td>
                              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                <button onClick={() => startEdit(a)}>Edit</button>
                                <button type="button" className="subtle-button" onClick={() => requestDeleteAssignment(a)}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "documents" && (
          <div style={{ ...sectionCardStyle, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
              <h3 style={sectionTitleStyle}>Documents</h3>
              <div style={{ color: "#666", fontSize: 12 }}>
                {documents.length} document{documents.length === 1 ? "" : "s"} on file
              </div>
            </div>

            {docErr && (
              <div
                style={{
                  ...cardStyle,
                  borderColor: "#fecaca",
                  background: "#fef2f2",
                  color: "#b91c1c",
                  marginBottom: 12,
                }}
              >
                {docErr}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) 160px 1fr auto", gap: 12, alignItems: "end", marginBottom: 16 }}>
              <label>
                File
                <input
                  key={docInputKey}
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Document type
                <select
                  value={docForm.doc_type}
                  onChange={(e) => setDocForm((prev) => ({ ...prev, doc_type: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                >
                  <option value="PO">PO</option>
                  <option value="SOW">SOW</option>
                  <option value="CO">CO</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label>
                Note
                <input
                  value={docForm.note}
                  onChange={(e) => setDocForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Optional note"
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={!!docForm.is_primary}
                    onChange={(e) => setDocForm((prev) => ({ ...prev, is_primary: e.target.checked }))}
                    style={{ width: 16, height: 16, margin: 0, padding: 0 }}
                  />
                  Primary document
                </label>
                <button type="button" onClick={uploadDocument} disabled={uploadingDoc}>
                  {uploadingDoc ? "Uploading…" : "Upload document"}
                </button>
              </div>
            </div>

            {primaryDocument && (
              <div style={{ ...cardStyle, marginBottom: 12 }}>
                <div style={{ color: "#666", fontSize: 12, marginBottom: 4 }}>Primary document</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{primaryDocument.filename || primaryDocument.storage_path}</div>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                  {primaryDocument.doc_type}
                  {primaryDocument.note ? ` • ${primaryDocument.note}` : ""}
                </div>
              </div>
            )}

            {documents.length === 0 ? (
              <div style={{ color: "#666" }}>No documents uploaded yet.</div>
            ) : (
              <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Primary</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.document_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{doc.filename || doc.storage_path}</div>
                        {doc.note ? <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>{doc.note}</div> : null}
                      </td>
                      <td>{doc.doc_type}</td>
                      <td>{doc.file_size_bytes ? `${Math.round(doc.file_size_bytes / 1024)} KB` : ""}</td>
                      <td>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : ""}</td>
                      <td>{doc.is_primary ? "Yes" : "No"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => openDocument(doc)} disabled={openingDocId === doc.document_id}>
                            {openingDocId === doc.document_id ? "Opening…" : "Open"}
                          </button>
                          <button type="button" onClick={() => openDocumentEditor(doc)}>
                            Edit
                          </button>
                          {!doc.is_primary && (
                            <button type="button" onClick={() => markDocumentPrimary(doc)} disabled={settingPrimaryId === doc.document_id}>
                              {settingPrimaryId === doc.document_id ? "Saving…" : "Make primary"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "invoices" && (
          <div style={{ ...sectionCardStyle, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
              <h3 style={sectionTitleStyle}>Related invoices</h3>
              <div style={{ color: "#666", fontSize: 12 }}>
                {invoiceSummary.invoiceCount} invoice{invoiceSummary.invoiceCount === 1 ? "" : "s"} • {invoiceSummary.lineCount} line{invoiceSummary.lineCount === 1 ? "" : "s"}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(140px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div style={cardStyle}>
                <div style={{ color: theme.mutedText, fontSize: 12 }}>Invoiced amount</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{money(invoiceSummary.totalAmount)}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: theme.mutedText, fontSize: 12 }}>Reg hours</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{invoiceSummary.totalReg}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: theme.mutedText, fontSize: 12 }}>OT hours</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{invoiceSummary.totalOt}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ color: theme.mutedText, fontSize: 12 }}>OT2 hours</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{invoiceSummary.totalOt2}</div>
              </div>
            </div>

            {invoices.length === 0 ? (
              <div style={{ color: "#666" }}>No invoices linked to this PO.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {invoices.map((inv) => {
                  const relatedLines = invoiceLinesByInvoice.get(inv.invoice_id) ?? [];
                  const invoiceAmount = relatedLines.reduce((sum, line) => sum + Number(line.amount ?? 0), 0);
                  const reg = relatedLines.reduce((sum, line) => sum + Number(line.reg_hours ?? 0), 0);
                  const ot = relatedLines.reduce((sum, line) => sum + Number(line.ot_hours ?? 0), 0);
                  const ot2 = relatedLines.reduce((sum, line) => sum + Number(line.ot2_hours ?? 0), 0);

                  return (
                    <details key={inv.invoice_id} style={cardStyle}>
                      <summary style={{ cursor: "pointer", listStyle: "none" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontSize: 17, fontWeight: 800 }}>
                              <Link to={`/invoices/${inv.invoice_id}`}>{inv.invoice_no || "(draft invoice)"}</Link>
                            </div>
                            <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>
                              {[
                                inv.period_begin && inv.period_end ? `${inv.period_begin} → ${inv.period_end}` : null,
                                inv.invoice_date ? `Invoiced ${fmtDate(inv.invoice_date)}` : null,
                                inv.status || null,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>{money(invoiceAmount)}</div>
                            <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>
                              {relatedLines.length} line{relatedLines.length === 1 ? "" : "s"} • Reg {reg} • OT {ot} • OT2 {ot2}
                            </div>
                          </div>
                        </div>
                      </summary>

                      <div style={{ marginTop: 14 }}>
                        {relatedLines.length === 0 ? (
                          <div style={{ color: theme.mutedText }}>No invoice lines imported for this invoice yet.</div>
                        ) : (
                          <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                            <thead>
                              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                                <th>Type</th>
                                <th>Description</th>
                                <th>Service Date</th>
                                <th>Reg</th>
                                <th>OT</th>
                                <th>OT2</th>
                                <th>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {relatedLines.map((line) => (
                                <tr key={line.invoice_line_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{LINE_TYPE_LABELS[line.line_type] || line.line_type || "—"}</div>
                                    {line.service_category ? (
                                      <div style={{ color: theme.mutedText, fontSize: 12 }}>{line.service_category}</div>
                                    ) : null}
                                  </td>
                                  <td>{line.line_description || "—"}</td>
                                  <td>
                                    {line.service_date ||
                                      (line.service_date_begin && line.service_date_end
                                        ? `${line.service_date_begin} → ${line.service_date_end}`
                                        : "")}
                                  </td>
                                  <td>{["EXP", "PP", "ADJ"].includes(line.line_type) ? "N/A" : line.reg_hours ?? 0}</td>
                                  <td>{["EXP", "PP", "ADJ"].includes(line.line_type) ? "N/A" : line.ot_hours ?? 0}</td>
                                  <td>{["EXP", "PP", "ADJ"].includes(line.line_type) ? "N/A" : line.ot2_hours ?? 0}</td>
                                  <td>{money(line.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showEditDrawer && (
        <>
          <div style={drawerBackdropStyle} onClick={requestCloseEditDrawer} />
          <div role="dialog" aria-modal="true" aria-label="Edit purchase order" style={drawerPanelStyle}>
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Edit purchase order</h3>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                  {customerName ? `${customerName} • ` : ""}
                  {poForm.project_name || poForm.purchase_order_number || "Purchase order"}
                </div>
              </div>
              <button type="button" aria-label="Close drawer" onClick={requestCloseEditDrawer} disabled={savingPo} style={iconButtonStyle}>
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              <label>
                Customer (required)
                <select
                  value={poForm.customer_id}
                  onChange={(e) =>
                    setPoForm((prev) => ({
                      ...prev,
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
                Customer Contact
                <select
                  value={poForm.manager_id}
                  onChange={(e) => setPoForm((prev) => ({ ...prev, manager_id: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                  disabled={!poForm.customer_id}
                >
                  <option value="">
                    {poForm.customer_id ? "-- Select contact --" : "Select a customer first"}
                  </option>
                  {contacts.map((m) => (
                    <option key={m.contact_id} value={m.contact_id}>
                      {m.manager_name}
                      {m.active ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
                {poForm.customer_id && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <Link to={`/customers/${poForm.customer_id}`}>Manage contacts</Link>
                  </div>
                )}
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  PO Number
                  <input
                    value={poForm.purchase_order_number}
                    onChange={(e) => setPoForm((prev) => ({ ...prev, purchase_order_number: e.target.value }))}
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  Project Name
                  <input
                    value={poForm.project_name}
                    onChange={(e) => setPoForm((prev) => ({ ...prev, project_name: e.target.value }))}
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
                    value={poForm.amount}
                    onChange={(e) => setPoForm((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="112268.00"
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  Start Date
                  <input
                    type="date"
                    value={poForm.start_date}
                    onChange={(e) => setPoForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  End Date
                  <input
                    type="date"
                    value={poForm.end_date}
                    onChange={(e) => setPoForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
              </div>

              <label>
                Notes
                <textarea
                  value={poForm.notes}
                  onChange={(e) => setPoForm((prev) => ({ ...prev, notes: e.target.value }))}
                  style={{ width: "100%", padding: 8, minHeight: 90 }}
                />
              </label>

              <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={!!poForm.tracking_active}
                    onChange={(e) => setPoForm((prev) => ({ ...prev, tracking_active: e.target.checked }))}
                    style={{ width: 16, height: 16, margin: 0, padding: 0 }}
                  />
                  Tracking active
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={!!poForm.pre_pay}
                    onChange={(e) => setPoForm((prev) => ({ ...prev, pre_pay: e.target.checked }))}
                    style={{ width: 16, height: 16, margin: 0, padding: 0 }}
                  />
                  Pre-pay
                </label>
              </div>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={savePoEdits} disabled={savingPo}>
                {savingPo ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {showDocDrawer && editingDoc && (
        <>
          <div style={drawerBackdropStyle} onClick={closeDocumentEditor} />
          <div role="dialog" aria-modal="true" aria-label="Edit document" style={drawerPanelStyle}>
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Edit document</h3>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{editingDoc.filename || editingDoc.storage_path}</div>
              </div>
              <button type="button" aria-label="Close drawer" onClick={closeDocumentEditor} disabled={savingDocEdit} style={iconButtonStyle}>
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              <label>
                Replace file
                <input
                  key={replacementDocInputKey}
                  type="file"
                  onChange={(e) => setReplacementDocFile(e.target.files?.[0] ?? null)}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Document type
                <select
                  value={editDocForm.doc_type}
                  onChange={(e) => setEditDocForm((prev) => ({ ...prev, doc_type: e.target.value }))}
                  style={{ width: "100%", padding: 8 }}
                >
                  <option value="PO">PO</option>
                  <option value="SOW">SOW</option>
                  <option value="CO">CO</option>
                  <option value="Other">Other</option>
                </select>
              </label>

              <label>
                Note
                <textarea
                  value={editDocForm.note}
                  onChange={(e) => setEditDocForm((prev) => ({ ...prev, note: e.target.value }))}
                  style={{ width: "100%", padding: 8, minHeight: 90 }}
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!!editDocForm.is_primary}
                  onChange={(e) => setEditDocForm((prev) => ({ ...prev, is_primary: e.target.checked }))}
                  style={{ width: 16, height: 16, margin: 0, padding: 0 }}
                />
                Primary document
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={saveDocumentEdits} disabled={savingDocEdit}>
                {savingDocEdit ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {discardConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Discard changes"
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e6e8ee",
              boxShadow: "0 24px 50px rgba(15, 23, 42, 0.2)",
              width: "min(460px, 100%)",
              padding: 22,
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Discard changes?</h3>
            <p style={{ marginBottom: 18, color: "#475569" }}>
              You have unsaved changes. If you leave now, your edits will be lost.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setDiscardConfirm(false)}>
                Keep editing
              </button>
              <button
                type="button"
                onClick={closeEditDrawer}
                style={{
                  background: "#fff",
                  color: "#111827",
                  border: "1px solid #d1d5db",
                  boxShadow: "none",
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteAssignmentConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.42)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete assignment"
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e6e8ee",
              boxShadow: "0 24px 50px rgba(15, 23, 42, 0.2)",
              width: "min(460px, 100%)",
              padding: 22,
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Soft delete assignment?</h3>
            <p style={{ marginBottom: 14, color: "#475569" }}>
              This assignment will be removed from normal assignment views but preserved for audit history.
            </p>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Reason (optional)</div>
              <textarea
                value={deleteAssignmentReason}
                onChange={(e) => setDeleteAssignmentReason(e.target.value)}
                style={{ width: "100%", padding: 8, minHeight: 90 }}
                placeholder="Why is this assignment being removed?"
              />
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className="subtle-button" onClick={closeDeleteAssignmentConfirm} disabled={!!deletingAssignmentId}>
                Cancel
              </button>
              <button type="button" onClick={confirmDeleteAssignment} disabled={!!deletingAssignmentId}>
                {deletingAssignmentId ? "Deleting…" : "Delete assignment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
