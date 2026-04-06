import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { theme } from "../theme";

const CONSULTANT_TABS = [
  { key: "all", label: "All Consultants" },
  { key: "assigned", label: "Assigned" },
  { key: "needs_assignment", label: "Needs Assignment" },
  { key: "on_payroll", label: "On Active Payroll" },
  { key: "inactive", label: "Inactive Consultants" },
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

const EMPTY_ASSIGNMENT_FORM = {
  assignment_id: "",
  consultant_id: "",
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

function fmtTs(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(String(v) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatName(r) {
  const full = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  return (r.display_name && r.display_name.trim()) || full || r.kelly_worker_key || r.kelly_employee_unique_id || r.kelly_employee_code || "";
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

function payrollStatusLabel(status) {
  return status?.has_hours_in_active_run ? "On active payroll" : "Not on payroll";
}

function rosterFlagLabel(status) {
  return status?.is_active_flag ? "Active" : "Inactive";
}

function payrollTotalHours(hours) {
  return Number(hours?.total_hours ?? hours?.active_run_hours ?? 0);
}

function payrollRegHours(hours) {
  return Number(hours?.reg_hours ?? hours?.active_run_reg_hours ?? hours?.total_reg_hours ?? 0);
}

function payrollOtHours(hours) {
  return Number(hours?.ot_hours ?? hours?.active_run_ot_hours ?? hours?.total_ot_hours ?? 0);
}

function statusBadgeStyle(kind, positive) {
  if (kind === "roster") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      border: positive ? `1px solid ${theme.primarySoftBorder}` : `1px solid ${theme.warningBorder}`,
      background: positive ? theme.primarySoftBg : theme.warningBg,
      color: positive ? theme.primary : theme.warningText,
      whiteSpace: "nowrap",
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: positive ? `1px solid ${theme.successBorder}` : `1px solid ${theme.border}`,
    background: positive ? theme.successBg : theme.surfaceMuted,
    color: positive ? theme.successText : theme.mutedText,
    whiteSpace: "nowrap",
  };
}

const tableWrapStyle = {
  ...sectionCardStyle,
};
const tableScrollStyle = {
  position: "relative",
  maxHeight: "calc(100dvh - 430px)",
  minHeight: 320,
  overflowX: "auto",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarGutter: "stable",
  paddingBottom: 72,
};

const tableStyle = {
  borderCollapse: "collapse",
  width: "100%",
  fontVariantNumeric: "tabular-nums",
};
const assignedTableStyle = {
  ...tableStyle,
  tableLayout: "fixed",
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
const compactButtonStyle = {
  padding: "6px 10px",
};
const restoreIconButtonStyle = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  background: theme.primarySoftBg,
  color: theme.primary,
  border: `1px solid ${theme.primarySoftBorder}`,
  boxShadow: "none",
  fontSize: 16,
  lineHeight: 1,
  fontWeight: 700,
};
const groupRowCellStyle = {
  padding: "14px 12px 10px",
  background: "#fbfcfe",
  borderTop: "1px solid #eef1f5",
  borderBottom: "1px solid #eef1f5",
};
const checkboxRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 8,
  fontSize: 14,
  fontWeight: 500,
  color: "#111827",
};
const checkboxInputStyle = {
  width: 16,
  height: 16,
  margin: 0,
  padding: 0,
  flex: "0 0 auto",
};

export default function Consultants() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [assignMap, setAssignMap] = useState(new Map());
  const [payrollStatusMap, setPayrollStatusMap] = useState(new Map());
  const [payrollStatusRows, setPayrollStatusRows] = useState([]);
  const [payrollHoursMap, setPayrollHoursMap] = useState(new Map());
  const [payrollHoursRows, setPayrollHoursRows] = useState([]);
  const [latestPayrollRun, setLatestPayrollRun] = useState(null);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    const tab = searchParams.get("tab");
    return CONSULTANT_TABS.some((item) => item.key === tab) ? tab : "needs_assignment";
  });

  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingRosterId, setSavingRosterId] = useState(null);
  const [showAssignmentDrawer, setShowAssignmentDrawer] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentErr, setAssignmentErr] = useState(null);
  const [editingConsultant, setEditingConsultant] = useState(null);
  const [editingAssignmentMeta, setEditingAssignmentMeta] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState(EMPTY_ASSIGNMENT_FORM);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const nextTab = CONSULTANT_TABS.some((item) => item.key === tab) ? tab : "needs_assignment";
    setActiveTab(nextTab);
  }, [searchParams]);

  // Keep these fields, but we’ll show only the important ones in the form.
  const [newForm, setNewForm] = useState({
    display_name: "", // "Preferred name" (optional)
    first_name: "",
    last_name: "",
    kelly_employee_code: "",
    kelly_worker_key: "",
    // extra fields kept in case you want them later
    email: "",
    phone: "",
    kelly_employee_unique_id: "",
    legacy_consultant_id: "",
    is_active: true,
  });

  async function loadConsultantsPage(aliveRef = { alive: true }) {
      setErr(null);
      setLoading(true);

      const { data, error } = await supabase
        .schema("app")
        .from("consultants")
        .select(
          "consultant_id, first_name, last_name, display_name, kelly_employee_unique_id, kelly_employee_code, kelly_worker_key, is_active, created_at, updated_at"
        )
        .order("last_name", { ascending: true });

      if (!aliveRef.alive) return;
      if (error) {
        setErr(error.message);
        setRows([]);
        setAssignMap(new Map());
        setLoading(false);
        return;
      }

      const baseRows = data ?? [];
      setRows(baseRows);
      setAssignmentsLoaded(false);
      setPayrollStatusMap(new Map());
      setPayrollStatusRows([]);
      setPayrollHoursMap(new Map());
      setPayrollHoursRows([]);
      setLatestPayrollRun(null);

      // Fetch current assignments (active today) for these consultants
      const ids = baseRows.map((r) => r.consultant_id).filter(Boolean);
      if (ids.length > 0) {
        const aRes = await supabase
          .schema("app")
          .from("consultants_current_assignment_view")
          .select(
            "consultant_id, assignment_id, purchase_order_id, purchase_order_number, project_name, customer_name, assignment_start_date, assignment_end_date, bill_rate_regular, bill_rate_overtime"
          )
          .in("consultant_id", ids);

        if (!aliveRef.alive) return;

        if (aRes.error) {
          // non-fatal: show list without assignment columns
          setErr((prev) => prev ?? aRes.error.message);
          setAssignMap(new Map());
        } else {
          const m = new Map();
          for (const r of aRes.data ?? []) {
            // Treat only rows with a real assignment as assigned.
            if (r.assignment_id) m.set(r.consultant_id, r);
          }
          setAssignMap(m);
        }
        setAssignmentsLoaded(true);
      } else {
        setAssignMap(new Map());
        setAssignmentsLoaded(true);
      }

      const payrollRes = await supabase
        .schema("app")
        .from("consultants_active_payroll_status_view")
        .select("*");

      if (!aliveRef.alive) return;
      if (payrollRes.error) {
        setErr((prev) => prev ?? payrollRes.error.message);
      } else {
        const m = new Map();
        for (const r of payrollRes.data ?? []) {
          if (r.consultant_id) m.set(r.consultant_id, r);
        }
        setPayrollStatusMap(m);
        setPayrollStatusRows(payrollRes.data ?? []);
      }

      const latestRunRes = await supabase
        .schema("app")
        .from("latest_payroll_run_view")
        .select("*")
        .maybeSingle();

      if (!aliveRef.alive) return;
      if (latestRunRes.error) {
        setErr((prev) => prev ?? latestRunRes.error.message);
      } else {
        setLatestPayrollRun(latestRunRes.data ?? null);
      }

      const hoursRes = await supabase
        .schema("app")
        .from("consultant_payroll_hours_active_run_view")
        .select("*");

      if (!aliveRef.alive) return;
      if (hoursRes.error) {
        setErr((prev) => prev ?? hoursRes.error.message);
      } else {
        const m = new Map();
        for (const r of hoursRes.data ?? []) {
          if (r.consultant_id) m.set(r.consultant_id, r);
        }
        setPayrollHoursMap(m);
        setPayrollHoursRows(hoursRes.data ?? []);
      }

      setLoading(false);
  }

  useEffect(() => {
    const aliveRef = { alive: true };
    loadConsultantsPage(aliveRef);

    return () => {
      aliveRef.alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) =>
      [
        r.display_name,
        r.first_name,
        r.last_name,
        r.kelly_employee_unique_id,
        r.kelly_employee_code,
        r.kelly_worker_key,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [rows, q]);

  const getStatus = (consultantId) =>
    payrollStatusMap.get(consultantId) ?? {
      consultant_id: consultantId,
      is_active_flag: false,
      has_hours_in_active_run: false,
      active_run_hours: 0,
      active_run_reg_hours: 0,
      active_run_ot_hours: 0,
      active_import_run_id: null,
      period_begin: null,
      period_end: null,
    };

  const getHours = (consultantId) =>
    payrollHoursMap.get(consultantId) ?? {
      consultant_id: consultantId,
      reg_hours: 0,
      ot_hours: 0,
      ot2_hours: 0,
      total_hours: 0,
      service_days: 0,
    };

  const summary = useMemo(() => {
    const defaultVisibleRows = rows.filter((r) => {
      const status = getStatus(r.consultant_id);
      return !!status.is_active_flag || !!status.has_hours_in_active_run;
    });
    const assignedCount = defaultVisibleRows.filter((r) => assignMap.has(r.consultant_id)).length;
    const unassignedCount = assignmentsLoaded
      ? Math.max(defaultVisibleRows.filter((r) => !assignMap.has(r.consultant_id)).length, 0)
      : 0;
    const inactiveCount = rows.filter((r) => !getStatus(r.consultant_id).is_active_flag).length;
    const activePayrollConsultants = payrollStatusRows.filter((r) => r.consultant_id && r.has_hours_in_active_run).length;
    const activePayrollHours = payrollHoursRows.reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0);
    const inactiveWithHoursCount = payrollStatusRows.filter((r) => !r.is_active_flag && r.has_hours_in_active_run).length;
    const payrollPeriodLabel = latestPayrollRun
      ? `${fmtDate(latestPayrollRun.period_begin)} → ${fmtDate(latestPayrollRun.period_end)}`
      : "—";

    return {
      total: rows.length,
      assignedCount,
      unassignedCount,
      inactiveCount,
      activePayrollHours,
      activePayrollConsultants,
      inactiveWithHoursCount,
      payrollPeriodLabel,
    };
  }, [rows, assignMap, assignmentsLoaded, payrollStatusRows, payrollStatusMap, payrollHoursRows, latestPayrollRun]);

  const organized = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    const withAssignment = (r) => assignMap.get(r.consultant_id) ?? null;
    const byName = (a, b) => collator.compare(formatName(a), formatName(b));

    const defaultVisible = filtered.filter((r) => {
      const status = getStatus(r.consultant_id);
      return !!status.is_active_flag || !!status.has_hours_in_active_run;
    });
    const onPayroll = filtered
      .filter((r) => getStatus(r.consultant_id).has_hours_in_active_run)
      .sort(byName);
    const inactive = filtered
      .filter((r) => !getStatus(r.consultant_id).is_active_flag)
      .sort(byName);

    const unassigned = defaultVisible
      .filter((r) => !withAssignment(r))
      .sort(byName);

    const assignedRows = defaultVisible
      .filter((r) => withAssignment(r))
      .sort((a, b) => {
        const aa = withAssignment(a);
        const bb = withAssignment(b);
        const aGroup = `${aa?.customer_name ?? ""} ${aa?.purchase_order_number ?? ""} ${aa?.project_name ?? ""}`.trim();
        const bGroup = `${bb?.customer_name ?? ""} ${bb?.purchase_order_number ?? ""} ${bb?.project_name ?? ""}`.trim();
        const groupCmp = collator.compare(aGroup, bGroup);
        if (groupCmp !== 0) return groupCmp;
        return byName(a, b);
      });

    const assignedGroups = [];
    let currentGroup = null;
    for (const r of assignedRows) {
      const a = withAssignment(r);
      const groupKey = `${a?.purchase_order_id ?? ""}::${a?.purchase_order_number ?? ""}::${a?.project_name ?? ""}`;
      const groupLabel = a?.project_name || a?.purchase_order_number || "Current assignment";
      const groupSub = [a?.customer_name, a?.purchase_order_number ? `PO ${a.purchase_order_number}` : null]
        .filter(Boolean)
        .join(" • ");

      if (!currentGroup || currentGroup.key !== groupKey) {
        currentGroup = { key: groupKey, label: groupLabel, sub: groupSub, rows: [] };
        assignedGroups.push(currentGroup);
      }
      currentGroup.rows.push(r);
    }

    return { unassigned, assignedGroups, assignedRows, inactive, onPayroll, defaultVisible };
  }, [filtered, assignMap, payrollStatusMap]);

  const alphabeticalRows = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    return [...organized.defaultVisible].sort((a, b) => collator.compare(formatName(a), formatName(b)));
  }, [organized.defaultVisible]);

  const visibleCount =
    activeTab === "needs_assignment"
      ? organized.unassigned.length
      : activeTab === "assigned"
        ? organized.assignedRows.length
        : activeTab === "on_payroll"
          ? organized.onPayroll.length
        : activeTab === "inactive"
          ? organized.inactive.length
          : alphabeticalRows.length;

  async function createConsultant() {
    setCreating(true);
    setErr(null);

    // Trim inputs so uniqueness checks are cleaner
    const payload = {
      // Preferred name optional: if blank, DB trigger can default it to "First Last"
      display_name: newForm.display_name?.trim() || null,
      first_name: newForm.first_name?.trim() || null,
      last_name: newForm.last_name?.trim() || null,
      kelly_employee_code: newForm.kelly_employee_code?.trim() || null,
      kelly_worker_key: newForm.kelly_worker_key?.trim() || null,

      // extra fields (optional; kept for later)
      email: newForm.email?.trim() || null,
      phone: newForm.phone?.trim() || null,
      kelly_employee_unique_id: newForm.kelly_employee_unique_id?.trim() || null,
      legacy_consultant_id: newForm.legacy_consultant_id?.trim() || null,
      is_active: !!newForm.is_active,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("consultants")
      .insert(payload)
      .select(
        "consultant_id, first_name, last_name, display_name, kelly_employee_unique_id, kelly_employee_code, kelly_worker_key, is_active, created_at, updated_at"
      )
      .single();

    if (error) {
      setErr(error.message);
      setCreating(false);
      return;
    }

    // Add to top
    setRows((prev) => [data, ...prev]);

    // Reset minimal fields
    setNewForm({
      display_name: "",
      first_name: "",
      last_name: "",
      kelly_employee_code: "",
      kelly_worker_key: "",
      email: "",
      phone: "",
      kelly_employee_unique_id: "",
      legacy_consultant_id: "",
      is_active: true,
    });

    setShowNew(false);
    setCreating(false);
  }

  async function updateRosterFlag(consultantId, nextActive) {
    setSavingRosterId(consultantId);
    setErr(null);

    const { error } = await supabase
      .schema("app")
      .from("consultants")
      .update({ is_active: !!nextActive })
      .eq("consultant_id", consultantId);

    if (error) {
      setErr(error.message);
      setSavingRosterId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.consultant_id === consultantId ? { ...r, is_active: !!nextActive } : r)));
    setPayrollStatusMap((prev) => {
      const next = new Map(prev);
      const current = next.get(consultantId);
      if (current) next.set(consultantId, { ...current, is_active_flag: !!nextActive });
      return next;
    });
    setSavingRosterId(null);
  }

  function changeTab(nextTab) {
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  }

  function consultantDetailTo(consultantId) {
    return {
      pathname: `/consultants/${consultantId}`,
      search: `?tab=${encodeURIComponent(activeTab)}`,
    };
  }

  async function openAssignmentEditor(consultantRow) {
    const currentAssignment = assignMap.get(consultantRow.consultant_id);
    if (!currentAssignment?.assignment_id) return;

    setAssignmentErr(null);
    setEditingConsultant(consultantRow);
    setEditingAssignmentMeta(currentAssignment);
    setAssignmentLoading(true);
    setShowAssignmentDrawer(true);

    const res = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .select(
        "assignment_id, consultant_id, purchase_order_id, assignment_start_date, assignment_end_date, billing_end_date_override, pay_rate_regular, pay_rate_overtime, bill_rate_regular, bill_rate_overtime, benefits_cost, total_burden, pto_billable, notes"
      )
      .eq("assignment_id", currentAssignment.assignment_id)
      .is("deleted_at", null)
      .single();

    if (res.error) {
      setAssignmentErr(res.error.message);
      setAssignmentForm(EMPTY_ASSIGNMENT_FORM);
      setAssignmentLoading(false);
      return;
    }

    setAssignmentForm(normalizeAssignmentForm(res.data));
    setAssignmentLoading(false);
  }

  function closeAssignmentEditor() {
    if (assignmentSaving) return;
    setShowAssignmentDrawer(false);
    setAssignmentLoading(false);
    setAssignmentSaving(false);
    setAssignmentErr(null);
    setEditingConsultant(null);
    setEditingAssignmentMeta(null);
    setAssignmentForm(EMPTY_ASSIGNMENT_FORM);
  }

  async function saveAssignmentEdits() {
    if (!assignmentForm.assignment_id) return;

    setAssignmentSaving(true);
    setAssignmentErr(null);

    const payload = {
      assignment_start_date: assignmentForm.assignment_start_date || null,
      assignment_end_date: assignmentForm.assignment_end_date || null,
      billing_end_date_override: assignmentForm.billing_end_date_override || null,
      pay_rate_regular: assignmentForm.pay_rate_regular === "" ? null : Number(assignmentForm.pay_rate_regular),
      pay_rate_overtime: assignmentForm.pay_rate_overtime === "" ? null : Number(assignmentForm.pay_rate_overtime),
      bill_rate_regular: assignmentForm.bill_rate_regular === "" ? null : Number(assignmentForm.bill_rate_regular),
      bill_rate_overtime: assignmentForm.bill_rate_overtime === "" ? null : Number(assignmentForm.bill_rate_overtime),
      benefits_cost: assignmentForm.benefits_cost === "" ? null : Number(assignmentForm.benefits_cost),
      total_burden: assignmentForm.total_burden === "" ? null : Number(assignmentForm.total_burden),
      pto_billable: !!assignmentForm.pto_billable,
      notes: assignmentForm.notes || null,
    };

    const { error } = await supabase
      .schema("app")
      .from("consultant_po_assignments")
      .update(payload)
      .eq("assignment_id", assignmentForm.assignment_id);

    if (error) {
      setAssignmentErr(error.message);
      setAssignmentSaving(false);
      return;
    }

    await loadConsultantsPage({ alive: true });
    closeAssignmentEditor();
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, paddingBottom: 72, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <h2>Consultants</h2>

        <div style={{ color: "#666", marginTop: 4 }}>
          Browse consultants, review current assignment coverage, and jump into consultant detail records.
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
            <div style={{ color: "#666", fontSize: 12 }}>Active payroll period</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.payrollPeriodLabel}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Active payroll hours</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.activePayrollHours.toLocaleString()}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Total consultants</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.total}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>On active payroll</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{summary.activePayrollConsultants}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Inactive with hours</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: summary.inactiveWithHoursCount > 0 ? "#b45309" : "#111" }}>
              {summary.inactiveWithHoursCount}
            </div>
          </div>
        </div>

        {err && (
          <div
            style={{
              ...cardStyle,
              borderColor: "#fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              marginBottom: 12,
            }}
          >
            {err}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "12px 0" }}>
          <button onClick={() => setShowNew(true)}>New Consultant</button>

          <input
            placeholder="Search name, Kelly code, worker key…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 340, padding: 8 }}
          />
        </div>

      </div>

      <div style={{ maxWidth: "100%" }}>
        {loading && <div>Loading…</div>}
        <div style={tableWrapStyle}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {CONSULTANT_TABS.map((tab) => {
              const on = activeTab === tab.key;
              const count =
                tab.key === "needs_assignment"
                  ? organized.unassigned.length
                  : tab.key === "assigned"
                    ? organized.assignedGroups.reduce((sum, group) => sum + group.rows.length, 0)
                    : tab.key === "on_payroll"
                      ? organized.onPayroll.length
                    : tab.key === "inactive"
                      ? organized.inactive.length
                      : alphabeticalRows.length;
              const needsAttention = tab.key === "needs_assignment" && count > 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => changeTab(tab.key)}
                  style={{
                    height: 36,
                    padding: "0 4px",
                    borderRadius: 0,
                    border: "none",
                    borderBottom: "2px solid " + (
                      on
                        ? (needsAttention ? theme.warningText : theme.primary)
                        : "transparent"
                    ),
                    background: "transparent",
                    color: needsAttention
                      ? theme.warningText
                      : on
                        ? theme.primary
                        : "#111",
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <h3 style={sectionTitleStyle}>Consultant list</h3>
            <div style={{ color: "#666", fontSize: 12 }}>
              Showing {visibleCount} consultant{visibleCount === 1 ? "" : "s"}
            </div>
          </div>

          {activeTab === "needs_assignment" && organized.unassigned.length === 0 && (
            <div style={{ color: "#666" }}>No consultants currently need assignment.</div>
          )}

          {activeTab === "needs_assignment" && organized.unassigned.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, color: "#b45309" }}>Needs assignment</div>
                  <div style={{ color: theme.warningText, fontSize: 12 }}>
                    {organized.unassigned.length} consultant{organized.unassigned.length === 1 ? "" : "s"} ready for assignment cleanup
                  </div>
                </div>
              </div>

              <div style={tableScrollStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Consultant</th>
                    <th style={thStyle}>Roster</th>
                    <th style={thStyle}>Payroll</th>
                    <th style={thStyle}>Current Assignment</th>
                    <th style={thStyle}>Total Hrs</th>
                    <th style={thStyle}>Reg Hrs</th>
                    <th style={thStyle}>OT Hrs</th>
                    <th style={thStyle}>Kelly UID</th>
                    <th style={thStyle}>Kelly Code</th>
                    <th style={thStyle}>Updated</th>
                    <th style={{ ...thStyle, textAlign: "right" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {organized.unassigned.map((r) => {
                    const status = getStatus(r.consultant_id);
                    return (
                    <tr key={r.consultant_id}>
                      <td style={tdStyle}>
                        <Link to={consultantDetailTo(r.consultant_id)} style={rowLinkStyle}>
                          {formatName(r)}
                        </Link>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("roster", !!status.is_active_flag)}>
                          {rosterFlagLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("payroll", !!status.has_hours_in_active_run)}>
                          {payrollStatusLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {assignmentsLoaded ? (
                          <span style={{ color: "#b45309", fontWeight: 700 }}>Needs Assignment</span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>Loading assignment…</span>
                        )}
                      </td>
                      <td style={tdStyle}>{payrollTotalHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollRegHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollOtHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{r.kelly_employee_unique_id ?? ""}</td>
                      <td style={tdStyle}>{r.kelly_employee_code ?? ""}</td>
                      <td style={tdStyle}>{fmtTs(r.updated_at)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Link to={consultantDetailTo(r.consultant_id)}>
                          <button style={compactButtonStyle}>Fix →</button>
                        </Link>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {activeTab === "assigned" && organized.assignedRows.length === 0 && (
            <div style={{ color: "#666" }}>No currently assigned consultants match this view.</div>
          )}

          {activeTab === "assigned" && (
            <div style={tableScrollStyle}>
            <table style={assignedTableStyle}>
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>Consultant</th>
                  <th style={thStyle}>Assignment</th>
                  <th style={thStyle}>PO</th>
                  <th style={thStyle}>Roster</th>
                  <th style={thStyle}>Payroll</th>
                  <th style={thStyle}>Bill Reg</th>
                  <th style={thStyle}>Bill OT</th>
                  <th style={thStyle}>Total Hrs</th>
                  <th style={thStyle}>Reg Hrs</th>
                  <th style={thStyle}>OT Hrs</th>
                  <th style={{ ...thStyle, textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {organized.assignedRows.map((r) => {
                  const a = assignMap.get(r.consultant_id);
                  const status = getStatus(r.consultant_id);
                  const billReg = a?.bill_rate_regular;
                  const billOt = a?.bill_rate_overtime;
                  const dateLabel = a
                    ? (a.assignment_end_date
                        ? [fmtDate(a.assignment_start_date), fmtDate(a.assignment_end_date)].filter(Boolean).join(" → ")
                        : fmtDate(a.assignment_start_date))
                    : "";

                  return (
                    <tr key={r.consultant_id}>
                      <td style={tdStyle}>
                        <Link to={consultantDetailTo(r.consultant_id)} style={rowLinkStyle}>
                          {formatName(r)}
                        </Link>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: theme.text }}>
                          {a?.project_name || "Current assignment"}
                        </div>
                        <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                          {[a?.customer_name, dateLabel || null]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      </td>
                      <td style={tdStyle}>{a?.purchase_order_number ? `PO ${a.purchase_order_number}` : ""}</td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("roster", !!status.is_active_flag)}>
                          {rosterFlagLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("payroll", !!status.has_hours_in_active_run)}>
                          {payrollStatusLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>{billReg != null ? `$${Number(billReg).toFixed(2)}` : ""}</td>
                      <td style={tdStyle}>{billOt != null ? `$${Number(billOt).toFixed(2)}` : ""}</td>
                      <td style={tdStyle}>{payrollTotalHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollRegHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollOtHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {a ? (
                          <button type="button" style={compactButtonStyle} onClick={() => openAssignmentEditor(r)}>
                            Edit Assignment
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          {activeTab === "on_payroll" && organized.onPayroll.length === 0 && (
            <div style={{ color: "#666" }}>No consultants are on the active payroll run.</div>
          )}

          {activeTab === "on_payroll" && organized.onPayroll.length > 0 && (
            <div style={tableScrollStyle}>
            <table style={assignedTableStyle}>
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>Consultant</th>
                  <th style={thStyle}>Assignment</th>
                  <th style={thStyle}>PO</th>
                  <th style={thStyle}>Roster</th>
                  <th style={thStyle}>Payroll</th>
                  <th style={thStyle}>Bill Reg</th>
                  <th style={thStyle}>Bill OT</th>
                  <th style={thStyle}>Total Hrs</th>
                  <th style={thStyle}>Reg Hrs</th>
                  <th style={thStyle}>OT Hrs</th>
                  <th style={{ ...thStyle, textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {organized.onPayroll.map((r) => {
                  const a = assignMap.get(r.consultant_id);
                  const status = getStatus(r.consultant_id);
                  const billReg = a?.bill_rate_regular;
                  const billOt = a?.bill_rate_overtime;
                  const dateLabel = a
                    ? (a.assignment_end_date
                        ? [fmtDate(a.assignment_start_date), fmtDate(a.assignment_end_date)].filter(Boolean).join(" → ")
                        : fmtDate(a.assignment_start_date))
                    : "";

                  return (
                    <tr key={r.consultant_id}>
                      <td style={tdStyle}>
                        <Link to={consultantDetailTo(r.consultant_id)} style={rowLinkStyle}>
                          {formatName(r)}
                        </Link>
                      </td>
                      <td style={tdStyle}>
                        {a ? (
                          <>
                            <div style={{ fontWeight: 600, color: theme.text }}>
                              {a.project_name || "Current assignment"}
                            </div>
                            <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                              {[a.customer_name, dateLabel || null]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: theme.warningText, fontWeight: 700 }}>Needs Assignment</span>
                        )}
                      </td>
                      <td style={tdStyle}>{a?.purchase_order_number ? `PO ${a.purchase_order_number}` : ""}</td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("roster", !!status.is_active_flag)}>
                          {rosterFlagLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("payroll", !!status.has_hours_in_active_run)}>
                          {payrollStatusLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>{billReg != null ? `$${Number(billReg).toFixed(2)}` : ""}</td>
                      <td style={tdStyle}>{billOt != null ? `$${Number(billOt).toFixed(2)}` : ""}</td>
                      <td style={tdStyle}>{payrollTotalHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollRegHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollOtHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {a ? (
                          <button type="button" style={compactButtonStyle} onClick={() => openAssignmentEditor(r)}>
                            Edit Assignment
                          </button>
                        ) : (
                          <Link to={consultantDetailTo(r.consultant_id)}>
                            <button style={compactButtonStyle}>Fix →</button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          {activeTab === "all" && alphabeticalRows.length === 0 && (
            <div style={{ color: "#666" }}>No consultants match this view.</div>
          )}

          {activeTab === "all" && alphabeticalRows.length > 0 && (
            <div style={tableScrollStyle}>
            <table style={assignedTableStyle}>
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>Consultant</th>
                  <th style={thStyle}>Assignment</th>
                  <th style={thStyle}>PO</th>
                  <th style={thStyle}>Roster</th>
                  <th style={thStyle}>Payroll</th>
                  <th style={thStyle}>Bill Reg</th>
                  <th style={thStyle}>Bill OT</th>
                  <th style={thStyle}>Total Hrs</th>
                  <th style={thStyle}>Reg Hrs</th>
                  <th style={thStyle}>OT Hrs</th>
                  <th style={{ ...thStyle, textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {alphabeticalRows.map((r) => {
                  const a = assignMap.get(r.consultant_id);
                  const status = getStatus(r.consultant_id);
                  const billReg = a?.bill_rate_regular;
                  const billOt = a?.bill_rate_overtime;
                  const dateLabel = a
                    ? (a.assignment_end_date
                        ? [fmtDate(a.assignment_start_date), fmtDate(a.assignment_end_date)].filter(Boolean).join(" → ")
                        : fmtDate(a.assignment_start_date))
                    : "";

                  return (
                    <tr key={r.consultant_id}>
                      <td style={tdStyle}>
                        <Link to={consultantDetailTo(r.consultant_id)} style={rowLinkStyle}>
                          {formatName(r)}
                        </Link>
                      </td>
                      <td style={tdStyle}>
                        {a ? (
                          <>
                            <div style={{ fontWeight: 600, color: theme.text }}>
                              {a.project_name || "Current assignment"}
                            </div>
                            <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                              {[a.customer_name, dateLabel || null]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: theme.warningText, fontWeight: 700 }}>Needs Assignment</span>
                        )}
                      </td>
                      <td style={tdStyle}>{a?.purchase_order_number ? `PO ${a.purchase_order_number}` : ""}</td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("roster", !!status.is_active_flag)}>
                          {rosterFlagLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("payroll", !!status.has_hours_in_active_run)}>
                          {payrollStatusLabel(status)}
                        </span>
                      </td>
                      <td style={tdStyle}>{billReg != null ? `$${Number(billReg).toFixed(2)}` : ""}</td>
                      <td style={tdStyle}>{billOt != null ? `$${Number(billOt).toFixed(2)}` : ""}</td>
                      <td style={tdStyle}>{payrollTotalHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollRegHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollOtHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {a ? (
                          <button type="button" style={compactButtonStyle} onClick={() => openAssignmentEditor(r)}>
                            Edit Assignment
                          </button>
                        ) : (
                          <Link to={consultantDetailTo(r.consultant_id)}>
                            <button style={compactButtonStyle}>Fix →</button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}

          {activeTab === "inactive" && organized.inactive.length === 0 && (
            <div style={{ color: "#666" }}>No inactive consultants match this view.</div>
          )}

          {activeTab === "inactive" && organized.inactive.length > 0 && (
            <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Consultant</th>
                  <th style={thStyle}>Payroll</th>
                  <th style={thStyle}>Current Assignment</th>
                  <th style={thStyle}>Total Hrs</th>
                  <th style={thStyle}>Reg Hrs</th>
                  <th style={thStyle}>OT Hrs</th>
                  <th style={thStyle}>Kelly UID</th>
                  <th style={thStyle}>Kelly Code</th>
                  <th style={thStyle}>Updated</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Roster</th>
                </tr>
              </thead>
              <tbody>
                {organized.inactive.map((r) => {
                  const a = assignMap.get(r.consultant_id);
                  const status = getStatus(r.consultant_id);
                  const showRestore = !status.is_active_flag && !status.has_hours_in_active_run;
                  const assignLabel = a ? (a.project_name || a.purchase_order_number || "Current assignment") : "No active assignment";
                  const assignSub = a
                    ? [a.customer_name, a.purchase_order_number ? `PO ${a.purchase_order_number}` : null]
                        .filter(Boolean)
                        .join(" • ")
                    : "";

                  return (
                    <tr key={r.consultant_id}>
                      <td style={tdStyle}>
                        <Link to={consultantDetailTo(r.consultant_id)} style={rowLinkStyle}>
                          {formatName(r)}
                        </Link>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadgeStyle("payroll", !!getStatus(r.consultant_id).has_hours_in_active_run)}>
                          {payrollStatusLabel(getStatus(r.consultant_id))}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {a ? (
                          <>
                            <div style={rowLinkStyle}>{assignLabel}</div>
                            {assignSub ? <div style={{ color: "#64748b", fontSize: 12 }}>{assignSub}</div> : null}
                          </>
                        ) : (
                          <span style={{ color: "#64748b" }}>No active assignment</span>
                        )}
                      </td>
                      <td style={tdStyle}>{payrollTotalHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollRegHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{payrollOtHours(getHours(r.consultant_id)).toLocaleString()}</td>
                      <td style={tdStyle}>{r.kelly_employee_unique_id ?? ""}</td>
                      <td style={tdStyle}>{r.kelly_employee_code ?? ""}</td>
                      <td style={tdStyle}>{fmtTs(r.updated_at)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {showRestore ? (
                          <button
                            type="button"
                            title="Restore to roster"
                            aria-label="Restore to roster"
                            style={restoreIconButtonStyle}
                            onClick={() => updateRosterFlag(r.consultant_id, true)}
                            disabled={savingRosterId === r.consultant_id}
                          >
                            {savingRosterId === r.consultant_id ? "…" : "+"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {showAssignmentDrawer && (
        <>
          <div style={drawerBackdropStyle} onClick={closeAssignmentEditor} />
          <aside style={drawerPanelStyle} aria-label="Edit assignment drawer">
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Edit assignment</h3>
                <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>
                  {editingConsultant ? formatName(editingConsultant) : "Consultant"}
                </div>
                {editingAssignmentMeta ? (
                  <div style={{ color: theme.mutedText, fontSize: 12, marginTop: 6 }}>
                    {[
                      editingAssignmentMeta.project_name || null,
                      editingAssignmentMeta.customer_name || null,
                      editingAssignmentMeta.purchase_order_number
                        ? `PO ${editingAssignmentMeta.purchase_order_number}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeAssignmentEditor}
                style={iconButtonStyle}
                aria-label="Close assignment drawer"
                disabled={assignmentSaving}
              >
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              {assignmentErr ? (
                <div
                  style={{
                    ...cardStyle,
                    borderColor: theme.warningBorder,
                    background: theme.warningBg,
                    color: theme.warningText,
                  }}
                >
                  {assignmentErr}
                </div>
              ) : null}

              {assignmentLoading ? (
                <div style={{ color: theme.mutedText }}>Loading assignment…</div>
              ) : (
                <>
                  <div style={{ fontSize: 12 }}>
                    <Link to={consultantDetailTo(editingConsultant?.consultant_id || "")}>Open full detail</Link>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label>
                      <span style={fieldLabelStyle}>Start date</span>
                      <input
                        type="date"
                        value={assignmentForm.assignment_start_date ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, assignment_start_date: e.target.value })}
                      />
                    </label>
                    <label>
                      <span style={fieldLabelStyle}>End date</span>
                      <input
                        type="date"
                        value={assignmentForm.assignment_end_date ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, assignment_end_date: e.target.value })}
                      />
                    </label>
                  </div>

                  <label>
                    <span style={fieldLabelStyle}>Billing override through</span>
                    <input
                      type="date"
                      value={assignmentForm.billing_end_date_override ?? ""}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, billing_end_date_override: e.target.value })}
                    />
                    <div style={{ marginTop: 6, fontSize: 12, color: theme.mutedText }}>
                      Use this when billing should continue after the assignment end date through payroll close.
                    </div>
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <label>
                      <span style={fieldLabelStyle}>Bill rate (regular)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={assignmentForm.bill_rate_regular ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, bill_rate_regular: e.target.value })}
                      />
                    </label>
                    <label>
                      <span style={fieldLabelStyle}>Bill rate (overtime)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={assignmentForm.bill_rate_overtime ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, bill_rate_overtime: e.target.value })}
                      />
                    </label>
                    <label>
                      <span style={fieldLabelStyle}>Pay rate (regular)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={assignmentForm.pay_rate_regular ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, pay_rate_regular: e.target.value })}
                      />
                    </label>
                    <label>
                      <span style={fieldLabelStyle}>Pay rate (overtime)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={assignmentForm.pay_rate_overtime ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, pay_rate_overtime: e.target.value })}
                      />
                    </label>
                    <label>
                      <span style={fieldLabelStyle}>Benefits cost</span>
                      <input
                        type="number"
                        step="0.01"
                        value={assignmentForm.benefits_cost ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, benefits_cost: e.target.value })}
                      />
                    </label>
                    <label>
                      <span style={fieldLabelStyle}>Total burden</span>
                      <input
                        type="number"
                        step="0.01"
                        value={assignmentForm.total_burden ?? ""}
                        onChange={(e) => setAssignmentForm({ ...assignmentForm, total_burden: e.target.value })}
                      />
                    </label>
                  </div>

                  <label style={checkboxRowStyle}>
                    <input
                      type="checkbox"
                      style={checkboxInputStyle}
                      checked={!!assignmentForm.pto_billable}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, pto_billable: e.target.checked })}
                    />
                    PTO billable on this assignment
                  </label>

                  <label>
                    <span style={fieldLabelStyle}>Notes</span>
                    <textarea
                      value={assignmentForm.notes ?? ""}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                      style={{ minHeight: 120 }}
                    />
                  </label>
                </>
              )}
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={saveAssignmentEdits} disabled={assignmentSaving || assignmentLoading}>
                {assignmentSaving ? "Saving…" : "Save assignment"}
              </button>
              <button
                type="button"
                className="subtle-button"
                onClick={closeAssignmentEditor}
                disabled={assignmentSaving}
              >
                Cancel
              </button>
            </div>
          </aside>
        </>
      )}

      {showNew && (
        <>
          <div style={drawerBackdropStyle} onClick={() => setShowNew(false)} />
          <aside style={drawerPanelStyle} aria-label="Add consultant drawer">
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Add consultant</h3>
                <div style={{ color: theme.mutedText, fontSize: 13, marginTop: 4 }}>
                  Create a consultant record and add the key Kelly identifiers.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                style={iconButtonStyle}
                aria-label="Close add consultant drawer"
              >
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              <label>
                <span style={fieldLabelStyle}>Preferred name (optional)</span>
                <input
                  value={newForm.display_name}
                  onChange={(e) => setNewForm({ ...newForm, display_name: e.target.value })}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>First name</span>
                  <input
                    value={newForm.first_name}
                    onChange={(e) => setNewForm({ ...newForm, first_name: e.target.value })}
                  />
                </label>
                <label>
                  <span style={fieldLabelStyle}>Last name</span>
                  <input
                    value={newForm.last_name}
                    onChange={(e) => setNewForm({ ...newForm, last_name: e.target.value })}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Kelly unique ID</span>
                  <input
                    value={newForm.kelly_employee_unique_id}
                    onChange={(e) => setNewForm({ ...newForm, kelly_employee_unique_id: e.target.value })}
                  />
                </label>

                <label>
                  <span style={fieldLabelStyle}>Kelly employee code</span>
                  <input
                    value={newForm.kelly_employee_code}
                    onChange={(e) => setNewForm({ ...newForm, kelly_employee_code: e.target.value })}
                  />
                </label>

                <label>
                  <span style={fieldLabelStyle}>Kelly worker key</span>
                  <input
                    value={newForm.kelly_worker_key}
                    onChange={(e) => setNewForm({ ...newForm, kelly_worker_key: e.target.value })}
                  />
                </label>
              </div>

              <div style={{ color: theme.mutedText, fontSize: 12, marginTop: -4 }}>
                Use Kelly Unique ID whenever available. It is your strongest payroll matching identifier.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  <span style={fieldLabelStyle}>Email (optional)</span>
                  <input
                    value={newForm.email}
                    onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                  />
                </label>

                <label>
                  <span style={fieldLabelStyle}>Phone (optional)</span>
                  <input
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                  />
                </label>
              </div>

              <label>
                <span style={fieldLabelStyle}>Legacy consultant ID (optional)</span>
                <input
                  value={newForm.legacy_consultant_id}
                  onChange={(e) => setNewForm({ ...newForm, legacy_consultant_id: e.target.value })}
                />
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={!!newForm.is_active}
                  onChange={(e) => setNewForm({ ...newForm, is_active: e.target.checked })}
                />
                Active consultant
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button onClick={createConsultant} disabled={creating}>
                {creating ? "Creating…" : "Create Consultant"}
              </button>
              <button type="button" className="subtle-button" onClick={() => setShowNew(false)} disabled={creating}>
                Cancel
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
