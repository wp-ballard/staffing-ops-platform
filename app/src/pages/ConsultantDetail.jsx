import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { theme } from "../theme";

const CONSULTANT_TABS = [
  { key: "profile", label: "Profile" },
  { key: "current_assignment", label: "Current Assignment" },
  { key: "assignment_history", label: "Assignment History" },
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
  background: theme.surfaceMuted,
  borderBottom: `1px solid ${theme.border}`,
};
const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f0f0",
  color: "#111",
  background: theme.surface,
  verticalAlign: "top",
};
const detailLabelStyle = {
  color: theme.mutedText,
  fontSize: 12,
  marginBottom: 4,
};
const detailValueStyle = {
  color: theme.text,
  fontSize: 15,
  fontWeight: 500,
};
const assignmentDetailValueStyle = {
  color: theme.text,
  fontSize: 17,
  fontWeight: 700,
};
const subtleBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  border: `1px solid ${theme.warningBorder}`,
  background: theme.warningBg,
  color: theme.warningText,
};
function statusPillStyle(active) {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    border: active ? `1px solid ${theme.primarySoftBorder}` : `1px solid ${theme.warningBorder}`,
    background: active ? theme.primarySoftBg : theme.warningBg,
    color: active ? theme.primary : theme.warningText,
    whiteSpace: "nowrap",
  };
}
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
  width: "min(460px, 100%)",
  padding: 22,
};
const fieldLabelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: theme.text,
  marginBottom: 6,
};

const EMPTY_ASSIGNMENT_FORM = {
  purchase_order_id: "",
  assignment_start_date: "",
  assignment_end_date: "",
  billing_end_date_override: "",
  bill_rate_regular: "",
  bill_rate_overtime: "",
  pay_rate_regular: "",
  pay_rate_overtime: "",
  benefits_cost: "",
  total_burden: "",
  pto_billable: false,
  notes: "",
};

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(String(d) + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function fmtTs(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function fmtMoney(v) {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `$${n.toFixed(2)}`;
}

function consultantDisplayName(form) {
  if (!form) return "Consultant";
  const full = `${form.first_name ?? ""} ${form.last_name ?? ""}`.trim();
  return (form.display_name && form.display_name.trim()) || full || "Consultant";
}

function poOptionLabel(po) {
  return (
    (po?.purchase_order_number ? `PO ${po.purchase_order_number}` : "PO (No number)") +
    (po?.project_name ? ` — ${po.project_name}` : "") +
    (po?.customer?.name ? ` — ${po.customer.name}` : "") +
    (po?.tracking_active === false ? " — Tracking Off" : "")
  );
}

function normalizeProfileForm(form) {
  return {
    display_name: form?.display_name ?? "",
    first_name: form?.first_name ?? "",
    last_name: form?.last_name ?? "",
    email: form?.email ?? "",
    phone: form?.phone ?? "",
    employment_start_date: form?.employment_start_date ?? "",
    employment_end_date: form?.employment_end_date ?? "",
    kelly_employee_unique_id: form?.kelly_employee_unique_id ?? "",
    kelly_employee_code: form?.kelly_employee_code ?? "",
    kelly_worker_key: form?.kelly_worker_key ?? "",
    legacy_consultant_id: form?.legacy_consultant_id ?? "",
    is_active: form?.is_active ?? true,
  };
}

function normalizeAssignmentForm(form) {
  return {
    assignment_id: form?.assignment_id ?? "",
    consultant_id: form?.consultant_id ?? "",
    purchase_order_id: form?.purchase_order_id ?? "",
    assignment_start_date: form?.assignment_start_date ?? "",
    assignment_end_date: form?.assignment_end_date ?? "",
    billing_end_date_override: form?.billing_end_date_override ?? "",
    bill_rate_regular: form?.bill_rate_regular ?? "",
    bill_rate_overtime: form?.bill_rate_overtime ?? "",
    pay_rate_regular: form?.pay_rate_regular ?? "",
    pay_rate_overtime: form?.pay_rate_overtime ?? "",
    benefits_cost: form?.benefits_cost ?? "",
    total_burden: form?.total_burden ?? "",
    pto_billable: form?.pto_billable ?? false,
    notes: form?.notes ?? "",
  };
}

export default function ConsultantDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { consultant_id } = useParams();
  const [activeTab, setActiveTab] = useState("profile");

  const [row, setRow] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [profileBaseline, setProfileBaseline] = useState(null);
  const [discardConfirm, setDiscardConfirm] = useState(null);

  const [assignment, setAssignment] = useState(null);
  const [assignForm, setAssignForm] = useState(null);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignErr, setAssignErr] = useState(null);
  const [showAssignmentDrawer, setShowAssignmentDrawer] = useState(false);
  const [assignmentDrawerMode, setAssignmentDrawerMode] = useState("edit");
  const [assignmentBaseline, setAssignmentBaseline] = useState(EMPTY_ASSIGNMENT_FORM);

  const [historyRows, setHistoryRows] = useState([]);
  const [poOptions, setPoOptions] = useState([]);
  const [newAssignForm, setNewAssignForm] = useState(EMPTY_ASSIGNMENT_FORM);
  const [poSearchText, setPoSearchText] = useState("");
  const [creatingAssign, setCreatingAssign] = useState(false);
  const [deleteAssignmentConfirm, setDeleteAssignmentConfirm] = useState(null);
  const [deleteAssignmentReason, setDeleteAssignmentReason] = useState("");
  const [deletingAssignmentId, setDeletingAssignmentId] = useState(null);

  async function loadConsultantPage(aliveRef = { alive: true }) {
    setErr(null);
    setAssignErr(null);
    setLoading(true);

    const { data, error } = await supabase
      .schema("app")
      .from("consultants")
      .select("*")
      .eq("consultant_id", consultant_id)
      .single();

    if (!aliveRef.alive) return;
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setRow(data);
    setForm(normalizeProfileForm(data));

    const poRes = await supabase
      .schema("app")
      .from("purchase_orders")
      .select("purchase_order_id, purchase_order_number, project_name, tracking_active, customer:customers(name)")
      .order("updated_at", { ascending: false });

    if (!aliveRef.alive) return;
    if (!poRes.error) setPoOptions(poRes.data ?? []);

    const cur = await supabase
      .schema("app")
      .from("consultants_current_assignment_view")
      .select(
        "consultant_id, consultant_name, assignment_id, purchase_order_id, purchase_order_number, project_name, customer_name, assignment_start_date, assignment_end_date, bill_rate_regular, bill_rate_overtime, pay_rate_regular, pay_rate_overtime"
      )
      .eq("consultant_id", consultant_id)
      .maybeSingle();

    if (!aliveRef.alive) return;
    if (cur.error) {
      setAssignErr(cur.error.message);
      setAssignment(null);
      setAssignForm(null);
    } else {
      const currentAssignment = cur.data?.assignment_id ? cur.data : null;
      setAssignment(currentAssignment);

      if (currentAssignment?.assignment_id) {
        const aRes = await supabase
          .schema("app")
          .from("consultant_po_assignments")
          .select(
            "assignment_id, consultant_id, purchase_order_id, assignment_start_date, assignment_end_date, billing_end_date_override, pay_rate_regular, pay_rate_overtime, bill_rate_regular, bill_rate_overtime, benefits_cost, total_burden, pto_billable, notes"
          )
          .eq("assignment_id", currentAssignment.assignment_id)
          .is("deleted_at", null)
          .single();

        if (!aliveRef.alive) return;
        if (aRes.error) {
          setAssignErr(aRes.error.message);
          setAssignForm(null);
        } else {
          setAssignment((prev) => ({ ...(prev ?? currentAssignment), ...aRes.data }));
          setAssignForm(normalizeAssignmentForm(aRes.data));
        }
      } else {
        setAssignForm(null);
      }
    }

    const historyRes = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .select(
        "assignment_id, purchase_order_id, assignment_start_date, assignment_end_date, billing_end_date_override, pay_rate_regular, pay_rate_overtime, bill_rate_regular, bill_rate_overtime, benefits_cost, total_burden, notes, created_at, purchase_order:purchase_orders(purchase_order_number, project_name, customer:customers(name))"
      )
      .eq("consultant_id", consultant_id)
      .is("deleted_at", null)
      .order("assignment_start_date", { ascending: false });

    if (!aliveRef.alive) return;
    if (historyRes.error) setAssignErr((prev) => prev ?? historyRes.error.message);
    else setHistoryRows(historyRes.data ?? []);

    setLoading(false);
  }

  useEffect(() => {
    const aliveRef = { alive: true };
    loadConsultantPage(aliveRef);
    return () => {
      aliveRef.alive = false;
    };
  }, [consultant_id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("edit_assignment") !== "1") return;

    setActiveTab("current_assignment");

    if (!assignment?.assignment_id || !assignForm || showAssignmentDrawer) return;

    openAssignmentDrawer("edit");
    params.delete("edit_assignment");
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true }
    );
  }, [
    location.pathname,
    location.search,
    assignment?.assignment_id,
    assignForm,
    showAssignmentDrawer,
    navigate,
  ]);

  const isProfileDrawerOpen = showProfileDrawer;
  const isAssignmentDrawerOpen = showAssignmentDrawer;
  const activeAssignmentForm = assignmentDrawerMode === "create" ? newAssignForm : assignForm;
  const profileDrawerDirty =
    isProfileDrawerOpen &&
    JSON.stringify(normalizeProfileForm(form)) !== JSON.stringify(normalizeProfileForm(profileBaseline));
  const assignmentDrawerDirty =
    isAssignmentDrawerOpen &&
    JSON.stringify(normalizeAssignmentForm(activeAssignmentForm)) !== JSON.stringify(normalizeAssignmentForm(assignmentBaseline));

  useEffect(() => {
    if (!isProfileDrawerOpen && !isAssignmentDrawerOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isProfileDrawerOpen) requestCloseProfileDrawer();
        if (isAssignmentDrawerOpen) requestCloseAssignmentDrawer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isProfileDrawerOpen, isAssignmentDrawerOpen, profileDrawerDirty, assignmentDrawerDirty, saving, assignSaving, creatingAssign]);

  const poSelectOptions = useMemo(() => {
    const arr = [...(poOptions ?? [])];
    arr.sort((a, b) => {
      const ak = `${a.project_name ?? ""} ${a.purchase_order_number ?? ""}`.toLowerCase();
      const bk = `${b.project_name ?? ""} ${b.purchase_order_number ?? ""}`.toLowerCase();
      return ak.localeCompare(bk);
    });
    return arr;
  }, [poOptions]);

  const poMetaMap = useMemo(() => {
    const m = new Map();
    for (const po of poOptions ?? []) {
      if (po.purchase_order_id) m.set(po.purchase_order_id, po);
    }
    return m;
  }, [poOptions]);

  const summary = useMemo(() => {
    const assignmentStatus = assignment?.assignment_id ? "Assigned" : "Needs Assignment";
    const consultantStatus = row?.is_active ? "Active" : "Inactive";
    const currentPO = assignment?.purchase_order_number ? `PO ${assignment.purchase_order_number}` : "—";
    const currentProject = assignment?.project_name || "—";
    const employmentStart = row?.employment_start_date ? fmtDate(row.employment_start_date) : "—";
    return { assignmentStatus, consultantStatus, currentPO, currentProject, employmentStart };
  }, [assignment, row]);

  const currentAssignmentTrackingOff =
    !!assignment?.purchase_order_id && poMetaMap.get(assignment.purchase_order_id)?.tracking_active === false;

  function openProfileDrawer() {
    setErr(null);
    setDiscardConfirm(null);
    const nextForm = normalizeProfileForm(row);
    setForm(nextForm);
    setProfileBaseline(nextForm);
    setShowProfileDrawer(true);
  }

  function closeProfileDrawer() {
    setShowProfileDrawer(false);
    setDiscardConfirm(null);
  }

  function requestCloseProfileDrawer() {
    if (saving) return;
    if (profileDrawerDirty) {
      setDiscardConfirm("profile");
      return;
    }
    closeProfileDrawer();
  }

  function openAssignmentDrawer(mode) {
    setAssignErr(null);
    setDiscardConfirm(null);
    setAssignmentDrawerMode(mode);

    if (mode === "create") {
      const nextForm = normalizeAssignmentForm(EMPTY_ASSIGNMENT_FORM);
      setNewAssignForm(nextForm);
      setAssignmentBaseline(nextForm);
      setPoSearchText("");
    } else {
      const nextForm = normalizeAssignmentForm(assignForm);
      setAssignForm(nextForm);
      setAssignmentBaseline(nextForm);
    }

    setShowAssignmentDrawer(true);
  }

  function closeAssignmentDrawer() {
    setShowAssignmentDrawer(false);
    setDiscardConfirm(null);
  }

  function requestCloseAssignmentDrawer() {
    if (assignSaving || creatingAssign) return;
    if (assignmentDrawerDirty) {
      setDiscardConfirm("assignment");
      return;
    }
    closeAssignmentDrawer();
  }

  function discardPendingChanges() {
    if (discardConfirm === "profile") closeProfileDrawer();
    if (discardConfirm === "assignment") closeAssignmentDrawer();
  }

  function closeDiscardConfirm() {
    setDiscardConfirm(null);
  }

  async function save() {
    setSaving(true);
    setErr(null);

    const payload = {
      display_name: form.display_name?.trim() || null,
      first_name: form.first_name?.trim() || null,
      last_name: form.last_name?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      employment_start_date: form.employment_start_date || null,
      employment_end_date: form.employment_end_date || null,
      kelly_employee_unique_id: form.kelly_employee_unique_id?.trim() || null,
      kelly_employee_code: form.kelly_employee_code?.trim() || null,
      kelly_worker_key: form.kelly_worker_key?.trim() || null,
      legacy_consultant_id: form.legacy_consultant_id?.trim() || null,
      is_active: !!form.is_active,
    };

    const { error } = await supabase
      .schema("app")
      .from("consultants")
      .update(payload)
      .eq("consultant_id", consultant_id);

    if (error) setErr(error.message);
    else {
      const nextRow = { ...row, ...payload };
      setRow(nextRow);
      setForm(normalizeProfileForm(payload));
      setProfileBaseline(normalizeProfileForm(payload));
      closeProfileDrawer();
    }

    setSaving(false);
  }

  async function saveAssignment() {
    if (!assignForm?.assignment_id) return;

    setAssignSaving(true);
    setAssignErr(null);

    const payload = {
      assignment_start_date: assignForm.assignment_start_date || null,
      assignment_end_date: assignForm.assignment_end_date || null,
      billing_end_date_override: assignForm.billing_end_date_override || null,
      pay_rate_regular: assignForm.pay_rate_regular === "" ? null : Number(assignForm.pay_rate_regular),
      pay_rate_overtime: assignForm.pay_rate_overtime === "" ? null : Number(assignForm.pay_rate_overtime),
      bill_rate_regular: assignForm.bill_rate_regular === "" ? null : Number(assignForm.bill_rate_regular),
      bill_rate_overtime: assignForm.bill_rate_overtime === "" ? null : Number(assignForm.bill_rate_overtime),
      benefits_cost: assignForm.benefits_cost === "" ? null : Number(assignForm.benefits_cost),
      total_burden: assignForm.total_burden === "" ? null : Number(assignForm.total_burden),
      pto_billable: !!assignForm.pto_billable,
      notes: assignForm.notes || null,
    };

    const { error } = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .update(payload)
      .eq("assignment_id", assignForm.assignment_id);

    if (error) {
      setAssignErr(error.message);
      setAssignSaving(false);
      return;
    }

    await loadConsultantPage({ alive: true });
    closeAssignmentDrawer();
    setAssignSaving(false);
  }

  async function createAssignment() {
    setCreatingAssign(true);
    setAssignErr(null);

    if (!newAssignForm.purchase_order_id) {
      setAssignErr("Purchase Order is required.");
      setCreatingAssign(false);
      return;
    }
    if (!newAssignForm.assignment_start_date) {
      setAssignErr("Start date is required.");
      setCreatingAssign(false);
      return;
    }

    const payload = {
      consultant_id,
      purchase_order_id: newAssignForm.purchase_order_id,
      assignment_start_date: newAssignForm.assignment_start_date,
      assignment_end_date: newAssignForm.assignment_end_date || null,
      billing_end_date_override: newAssignForm.billing_end_date_override || null,
      bill_rate_regular: newAssignForm.bill_rate_regular === "" ? null : Number(newAssignForm.bill_rate_regular),
      bill_rate_overtime: newAssignForm.bill_rate_overtime === "" ? null : Number(newAssignForm.bill_rate_overtime),
      pay_rate_regular: newAssignForm.pay_rate_regular === "" ? null : Number(newAssignForm.pay_rate_regular),
      pay_rate_overtime: newAssignForm.pay_rate_overtime === "" ? null : Number(newAssignForm.pay_rate_overtime),
      benefits_cost: newAssignForm.benefits_cost === "" ? null : Number(newAssignForm.benefits_cost),
      total_burden: newAssignForm.total_burden === "" ? null : Number(newAssignForm.total_burden),
      pto_billable: !!newAssignForm.pto_billable,
      notes: newAssignForm.notes || null,
    };

    const ins = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .insert(payload)
      .select("assignment_id")
      .single();

    if (ins.error) {
      setAssignErr(ins.error.message);
      setCreatingAssign(false);
      return;
    }

    await loadConsultantPage({ alive: true });
    setActiveTab("current_assignment");
    closeAssignmentDrawer();
    setPoSearchText("");
    setCreatingAssign(false);
  }

  function requestDeleteAssignment(item) {
    setAssignErr(null);
    setDeleteAssignmentReason("");
    setDeleteAssignmentConfirm(item);
  }

  function closeDeleteAssignmentConfirm() {
    if (deletingAssignmentId) return;
    setDeleteAssignmentConfirm(null);
    setDeleteAssignmentReason("");
  }

  async function confirmDeleteAssignment() {
    if (!deleteAssignmentConfirm?.assignment_id) return;

    setDeletingAssignmentId(deleteAssignmentConfirm.assignment_id);
    setAssignErr(null);

    const { error } = await supabase.schema("app").rpc("soft_delete_consultant_assignment", {
      p_assignment_id: deleteAssignmentConfirm.assignment_id,
      p_delete_reason: deleteAssignmentReason.trim() || null,
    });

    if (error) {
      setAssignErr(error.message);
      setDeletingAssignmentId(null);
      return;
    }

    setHistoryRows((prev) => prev.filter((item) => item.assignment_id !== deleteAssignmentConfirm.assignment_id));
    if (assignment?.assignment_id === deleteAssignmentConfirm.assignment_id) {
      setAssignment(null);
      setAssignForm(null);
    }

    setDeletingAssignmentId(null);
    setDeleteAssignmentConfirm(null);
    setDeleteAssignmentReason("");
  }

  if (loading || !form) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ marginBottom: 12 }}>
          <Link to={`/consultants${location.search || ""}`}>← Back to consultants</Link>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>{consultantDisplayName(form)}</h2>
          <span style={statusPillStyle(!!row?.is_active)}>{row?.is_active ? "Active" : "Inactive"}</span>
        </div>
        <div style={{ color: theme.mutedText }}>
          {[form.kelly_employee_code ? `Kelly Code ${form.kelly_employee_code}` : null, form.kelly_employee_unique_id ? `Kelly UID ${form.kelly_employee_unique_id}` : null]
            .filter(Boolean)
            .join(" • ") || "Consultant detail"}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
            gap: 12,
            marginTop: 14,
            marginBottom: 12,
          }}
        >
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Current PO</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.currentPO}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Current project</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.currentProject}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Assignment status</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: assignment ? theme.text : theme.warningText }}>{summary.assignmentStatus}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: theme.mutedText, fontSize: 12 }}>Employment start</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.employmentStart}</div>
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

      <div style={{ maxWidth: "100%" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18, marginBottom: 10 }}>
          {CONSULTANT_TABS.map((tab) => {
            const on = activeTab === tab.key;
            const count = tab.key === "assignment_history" ? historyRows.length : null;
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
                {tab.label}{count != null ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>

        {activeTab === "profile" && (
          <div style={{ ...sectionCardStyle, maxWidth: 860 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
              <h3 style={sectionTitleStyle}>Consultant Profile</h3>
              <button type="button" onClick={openProfileDrawer}>
                Edit Profile
              </button>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 0.2, marginBottom: 10 }}>Contact</div>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={detailLabelStyle}>Display name</div>
                    <div style={detailValueStyle}>{row?.display_name || consultantDisplayName(row)}</div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Email</div>
                    <div style={detailValueStyle}>{row?.email || "—"}</div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Phone</div>
                    <div style={detailValueStyle}>{row?.phone || "—"}</div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 0.2, marginBottom: 10 }}>Identity</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={detailLabelStyle}>First name</div>
                    <div style={detailValueStyle}>{row?.first_name || "—"}</div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Last name</div>
                    <div style={detailValueStyle}>{row?.last_name || "—"}</div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Legacy Consultant ID</div>
                    <div style={detailValueStyle}>{row?.legacy_consultant_id || "—"}</div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 0.2, marginBottom: 10 }}>Payroll IDs</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={detailLabelStyle}>Kelly Employee Unique ID</div>
                    <div style={detailValueStyle}>{row?.kelly_employee_unique_id || "—"}</div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Kelly Employee Code</div>
                    <div style={detailValueStyle}>{row?.kelly_employee_code || "—"}</div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Kelly Worker Key</div>
                    <div style={detailValueStyle}>{row?.kelly_worker_key || "—"}</div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ color: theme.mutedText, fontSize: 12, fontWeight: 700, letterSpacing: 0.2, marginBottom: 10 }}>Employment</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={detailLabelStyle}>Record status</div>
                    <div>
                      <span style={statusPillStyle(!!row?.is_active)}>{row?.is_active ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Employment start date</div>
                    <div style={detailValueStyle}>{row?.employment_start_date ? fmtDate(row.employment_start_date) : "—"}</div>
                  </div>
                  <div>
                    <div style={detailLabelStyle}>Employment end date</div>
                    <div style={detailValueStyle}>{row?.employment_end_date ? fmtDate(row.employment_end_date) : "Active"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "current_assignment" && (
          <div style={{ display: "grid", gap: 14, maxWidth: 920 }}>
            {assignErr && (
              <div
                style={{
                  ...cardStyle,
                  borderColor: "#fecaca",
                  background: "#fef2f2",
                  color: "#b91c1c",
                }}
              >
                {assignErr}
              </div>
            )}

            {!assignment?.assignment_id && (
              <div style={sectionCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
                  <h3 style={sectionTitleStyle}>No Active Assignment</h3>
                  <button type="button" onClick={() => openAssignmentDrawer("create")}>
                    Create Assignment
                  </button>
                </div>
                <div style={{ color: theme.mutedText, marginBottom: 14 }}>
                  This consultant does not have an active assignment for today. Create one from here, or add it from the purchase order side.
                </div>
              </div>
            )}

            {assignment?.assignment_id && (
              <>
                <div style={sectionCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={sectionTitleStyle}>{assignment.project_name || "(No project name)"}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ color: theme.mutedText }}>
                          {assignment.customer_name ? `${assignment.customer_name} • ` : ""}
                          PO {assignment.purchase_order_number || "(no number)"}
                        </div>
                        {currentAssignmentTrackingOff ? <span style={subtleBadgeStyle}>Tracking Off</span> : null}
                      </div>
                    </div>
                    <div>
                      <Link to={`/purchase-orders/${assignment.purchase_order_id}`}>Open PO →</Link>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(220px, 1fr))",
                      gap: 18,
                      marginTop: 18,
                      paddingTop: 18,
                      borderTop: `1px solid ${theme.border}`,
                    }}
                  >
                    <div>
                      <div style={detailLabelStyle}>Start</div>
                      <div style={assignmentDetailValueStyle}>{fmtDate(assignment.assignment_start_date) || "—"}</div>
                    </div>
                    <div>
                      <div style={detailLabelStyle}>End</div>
                      <div style={assignmentDetailValueStyle}>{assignment.assignment_end_date ? fmtDate(assignment.assignment_end_date) : "(open)"}</div>
                    </div>
                    <div>
                      <div style={detailLabelStyle}>Billing override through</div>
                      <div style={assignmentDetailValueStyle}>{assignment.billing_end_date_override ? fmtDate(assignment.billing_end_date_override) : "—"}</div>
                    </div>
                    <div>
                      <div style={detailLabelStyle}>Bill Reg</div>
                      <div style={assignmentDetailValueStyle}>{fmtMoney(assignment.bill_rate_regular) || "—"}</div>
                    </div>
                    <div>
                      <div style={detailLabelStyle}>Bill OT</div>
                      <div style={assignmentDetailValueStyle}>{fmtMoney(assignment.bill_rate_overtime) || "—"}</div>
                    </div>
                    <div>
                      <div style={detailLabelStyle}>Pay Reg</div>
                      <div style={assignmentDetailValueStyle}>{fmtMoney(assignment.pay_rate_regular) || "—"}</div>
                    </div>
                    <div>
                      <div style={detailLabelStyle}>Pay OT</div>
                      <div style={assignmentDetailValueStyle}>{fmtMoney(assignment.pay_rate_overtime) || "—"}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button type="button" onClick={() => openAssignmentDrawer("edit")}>
                      Edit Assignment
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "assignment_history" && (
          <div style={sectionCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <h3 style={sectionTitleStyle}>Assignment History</h3>
              <div style={{ color: theme.mutedText, fontSize: 12 }}>
                {historyRows.length} assignment{historyRows.length === 1 ? "" : "s"} on file
              </div>
            </div>

            {historyRows.length === 0 ? (
              <div style={{ color: theme.mutedText }}>No assignment history yet.</div>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Project</th>
                    <th style={thStyle}>PO</th>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>Start</th>
                    <th style={thStyle}>End</th>
                    <th style={thStyle}>Billing Override</th>
                    <th style={thStyle}>Bill Reg</th>
                    <th style={thStyle}>Bill OT</th>
                    <th style={{ ...thStyle, textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((item) => (
                    <tr key={item.assignment_id}>
                      <td style={tdStyle}>
                        {item.purchase_order_id ? (
                          <Link to={`/purchase-orders/${item.purchase_order_id}`}>{item.purchase_order?.project_name ?? "(No project)"}</Link>
                        ) : (
                          item.purchase_order?.project_name ?? "(No project)"
                        )}
                        {item.purchase_order_id && poMetaMap.get(item.purchase_order_id)?.tracking_active === false ? (
                          <div style={{ marginTop: 6 }}>
                            <span style={subtleBadgeStyle}>Tracking Off</span>
                          </div>
                        ) : null}
                        {item.notes ? <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>{item.notes}</div> : null}
                      </td>
                      <td style={tdStyle}>{item.purchase_order?.purchase_order_number ? `PO ${item.purchase_order.purchase_order_number}` : ""}</td>
                      <td style={tdStyle}>{item.purchase_order?.customer?.name ?? ""}</td>
                      <td style={tdStyle}>{fmtDate(item.assignment_start_date)}</td>
                      <td style={tdStyle}>{item.assignment_end_date ? fmtDate(item.assignment_end_date) : "(open)"}</td>
                      <td style={tdStyle}>{item.billing_end_date_override ? fmtDate(item.billing_end_date_override) : "—"}</td>
                      <td style={tdStyle}>{fmtMoney(item.bill_rate_regular)}</td>
                      <td style={tdStyle}>{fmtMoney(item.bill_rate_overtime)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <button type="button" className="subtle-button" onClick={() => requestDeleteAssignment(item)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {isProfileDrawerOpen && (
        <>
          <div style={drawerBackdropStyle} onClick={requestCloseProfileDrawer} />
          <div role="dialog" aria-modal="true" aria-label="Edit profile" style={drawerPanelStyle}>
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Edit profile</h3>
                <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>{consultantDisplayName(row)}</div>
              </div>
              <button type="button" aria-label="Close drawer" onClick={requestCloseProfileDrawer} disabled={saving} style={iconButtonStyle}>
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              <label>
                <span style={fieldLabelStyle}>Display name</span>
                <input value={form.display_name ?? ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} style={{ width: "100%", padding: 8 }} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>First name</span>
                  <input value={form.first_name ?? ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Last name</span>
                  <input value={form.last_name ?? ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Email</span>
                  <input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Phone</span>
                  <input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Employment start date</span>
                  <input type="date" value={form.employment_start_date ?? ""} onChange={(e) => setForm({ ...form, employment_start_date: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Employment end date</span>
                  <input type="date" value={form.employment_end_date ?? ""} onChange={(e) => setForm({ ...form, employment_end_date: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
              </div>

              <label>
                <span style={fieldLabelStyle}>Kelly Employee Unique ID</span>
                <input value={form.kelly_employee_unique_id ?? ""} onChange={(e) => setForm({ ...form, kelly_employee_unique_id: e.target.value })} style={{ width: "100%", padding: 8 }} />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Kelly Employee Code</span>
                  <input value={form.kelly_employee_code ?? ""} onChange={(e) => setForm({ ...form, kelly_employee_code: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Kelly Worker Key</span>
                  <input value={form.kelly_worker_key ?? ""} onChange={(e) => setForm({ ...form, kelly_worker_key: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
              </div>

              <label>
                <span style={fieldLabelStyle}>Legacy Consultant ID</span>
                <input value={form.legacy_consultant_id ?? ""} onChange={(e) => setForm({ ...form, legacy_consultant_id: e.target.value })} style={{ width: "100%", padding: 8 }} />
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={!!form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active consultant
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {isAssignmentDrawerOpen && (
        <>
          <div style={drawerBackdropStyle} onClick={requestCloseAssignmentDrawer} />
          <div role="dialog" aria-modal="true" aria-label={assignmentDrawerMode === "create" ? "Create assignment" : "Edit assignment"} style={drawerPanelStyle}>
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
                  {assignmentDrawerMode === "create" ? "Create assignment" : "Edit assignment"}
                </h3>
                <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>{consultantDisplayName(row)}</div>
              </div>
              <button type="button" aria-label="Close drawer" onClick={requestCloseAssignmentDrawer} disabled={assignSaving || creatingAssign} style={iconButtonStyle}>
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              {assignErr && (
                <div
                  style={{
                    ...cardStyle,
                    borderColor: theme.warningBorder,
                    background: theme.warningBg,
                    color: theme.warningText,
                  }}
                >
                  {assignErr}
                </div>
              )}

              {assignmentDrawerMode === "create" && (
                <label>
                  <span style={fieldLabelStyle}>Purchase Order (required)</span>
                  <input
                    list="consultant-po-options"
                    value={poSearchText}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPoSearchText(v);
                      const match = poSelectOptions.find((po) => poOptionLabel(po) === v);
                      setNewAssignForm((prev) => ({ ...prev, purchase_order_id: match ? match.purchase_order_id : "" }));
                    }}
                    placeholder="Search by PO number, project, or customer…"
                    style={{ width: "100%", padding: 8 }}
                  />
                  <datalist id="consultant-po-options">
                    {poSelectOptions.map((po) => (
                      <option key={po.purchase_order_id} value={poOptionLabel(po)} />
                    ))}
                  </datalist>
                  <div style={{ marginTop: 6, fontSize: 12, color: theme.mutedText }}>
                    Tip: type a PO number, project name, or customer, then choose a match from the dropdown.
                  </div>
                </label>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Start date</span>
                  <input
                    type="date"
                    value={activeAssignmentForm?.assignment_start_date ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, assignment_start_date: e.target.value })
                        : setAssignForm({ ...assignForm, assignment_start_date: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>End date</span>
                  <input
                    type="date"
                    value={activeAssignmentForm?.assignment_end_date ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, assignment_end_date: e.target.value })
                        : setAssignForm({ ...assignForm, assignment_end_date: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
              </div>

              <label>
                <span style={fieldLabelStyle}>Billing override through</span>
                <input
                  type="date"
                  value={activeAssignmentForm?.billing_end_date_override ?? ""}
                  onChange={(e) =>
                    assignmentDrawerMode === "create"
                      ? setNewAssignForm({ ...newAssignForm, billing_end_date_override: e.target.value })
                      : setAssignForm({ ...assignForm, billing_end_date_override: e.target.value })
                  }
                  style={{ width: "100%", padding: 8 }}
                />
                <div style={{ marginTop: 6, fontSize: 12, color: theme.mutedText }}>
                  Use this when billing should continue after the assignment end date through the payroll close.
                </div>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Bill rate (regular)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={activeAssignmentForm?.bill_rate_regular ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, bill_rate_regular: e.target.value })
                        : setAssignForm({ ...assignForm, bill_rate_regular: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Bill rate (overtime)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={activeAssignmentForm?.bill_rate_overtime ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, bill_rate_overtime: e.target.value })
                        : setAssignForm({ ...assignForm, bill_rate_overtime: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Pay rate (regular)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={activeAssignmentForm?.pay_rate_regular ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, pay_rate_regular: e.target.value })
                        : setAssignForm({ ...assignForm, pay_rate_regular: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Pay rate (overtime)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={activeAssignmentForm?.pay_rate_overtime ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, pay_rate_overtime: e.target.value })
                        : setAssignForm({ ...assignForm, pay_rate_overtime: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Benefits cost</span>
                  <input
                    type="number"
                    step="0.01"
                    value={activeAssignmentForm?.benefits_cost ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, benefits_cost: e.target.value })
                        : setAssignForm({ ...assignForm, benefits_cost: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Total burden</span>
                  <input
                    type="number"
                    step="0.01"
                    value={activeAssignmentForm?.total_burden ?? ""}
                    onChange={(e) =>
                      assignmentDrawerMode === "create"
                        ? setNewAssignForm({ ...newAssignForm, total_burden: e.target.value })
                        : setAssignForm({ ...assignForm, total_burden: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
              </div>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={!!activeAssignmentForm?.pto_billable}
                  onChange={(e) =>
                    assignmentDrawerMode === "create"
                      ? setNewAssignForm({ ...newAssignForm, pto_billable: e.target.checked })
                      : setAssignForm({ ...assignForm, pto_billable: e.target.checked })
                  }
                />
                PTO billable on this assignment
              </label>

              <label>
                <span style={fieldLabelStyle}>Notes</span>
                <textarea
                  value={activeAssignmentForm?.notes ?? ""}
                  onChange={(e) =>
                    assignmentDrawerMode === "create"
                      ? setNewAssignForm({ ...newAssignForm, notes: e.target.value })
                      : setAssignForm({ ...assignForm, notes: e.target.value })
                  }
                  style={{ width: "100%", padding: 8, minHeight: 90 }}
                />
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={assignmentDrawerMode === "create" ? createAssignment : saveAssignment} disabled={assignSaving || creatingAssign}>
                {assignmentDrawerMode === "create"
                  ? creatingAssign
                    ? "Creating…"
                    : "Create assignment"
                  : assignSaving
                    ? "Saving…"
                    : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {discardConfirm && (
        <div style={confirmOverlayStyle}>
          <div role="dialog" aria-modal="true" aria-label="Discard changes" style={confirmCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Discard changes?</h3>
              <p style={{ marginBottom: 18, color: theme.mutedText }}>
                You have unsaved changes. If you leave now, your edits will be lost.
              </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={closeDiscardConfirm}>
                Keep editing
              </button>
              <button
                type="button"
                onClick={discardPendingChanges}
                style={{
                  background: theme.surface,
                  color: theme.text,
                  border: `1px solid ${theme.borderStrong}`,
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
        <div style={confirmOverlayStyle}>
          <div role="dialog" aria-modal="true" aria-label="Delete assignment" style={confirmCardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Soft delete assignment?</h3>
            <p style={{ marginBottom: 14, color: theme.mutedText }}>
              This assignment will be removed from normal assignment views but preserved for audit history.
            </p>
            <label>
              <span style={fieldLabelStyle}>Reason (optional)</span>
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
