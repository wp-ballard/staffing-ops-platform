import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { US_STATE_OPTIONS } from "../lib/usStates";
import { theme } from "../theme";

const CONTACT_TYPE_OPTIONS = [
  { value: "Manager", label: "Manager" },
  { value: "AP", label: "AP" },
  { value: "Billing", label: "Billing" },
  { value: "Project", label: "Project" },
  { value: "Operations", label: "Operations" },
  { value: "Other", label: "Other" },
];

const CUSTOMER_TABS = [
  { key: "contacts", label: "Contacts" },
  { key: "locations", label: "Locations" },
  { key: "invoice_rules", label: "Invoice rules" },
];
const EMPTY_CONTACT_FORM = {
  contact_type: "Manager",
  manager_name: "",
  email: "",
  phone: "",
  title: "",
  active: true,
  note: "",
};
const EMPTY_LOCATION_FORM = {
  location_name: "",
  tax_id: "",
  street_address_line_1: "",
  street_address_line_2: "",
  city: "",
  state: "",
  zip: "",
  note: "",
  active: true,
};
const EMPTY_CUSTOMER_FORM = {
  name: "",
  street_address_line_1: "",
  street_address_line_2: "",
  city: "",
  state: "",
  zip: "",
  note: "",
  active: true,
};

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
const rowLinkStyle = {
  color: theme.link,
  fontWeight: 500,
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

function normalizeContactForm(form) {
  return {
    contact_type: form.contact_type ?? "Manager",
    manager_name: form.manager_name ?? "",
    email: form.email ?? "",
    phone: form.phone ?? "",
    title: form.title ?? "",
    active: !!form.active,
    note: form.note ?? "",
  };
}

function normalizeLocationForm(form) {
  return {
    location_name: form.location_name ?? "",
    tax_id: form.tax_id ?? "",
    street_address_line_1: form.street_address_line_1 ?? "",
    street_address_line_2: form.street_address_line_2 ?? "",
    city: form.city ?? "",
    state: form.state ?? "",
    zip: form.zip ?? "",
    note: form.note ?? "",
    active: !!form.active,
  };
}

function normalizeCustomerForm(form) {
  return {
    name: form.name ?? "",
    street_address_line_1: form.street_address_line_1 ?? "",
    street_address_line_2: form.street_address_line_2 ?? "",
    city: form.city ?? "",
    state: form.state ?? "",
    zip: form.zip ?? "",
    note: form.note ?? "",
    active: !!form.active,
  };
}

export default function CustomerDetail() {
  const { customer_id } = useParams();

  const [customer, setCustomer] = useState(null);
  const [contacts, setContacts] = useState([]);

  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCustomerDrawer, setShowCustomerDrawer] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [customerDrawerBaseline, setCustomerDrawerBaseline] = useState(EMPTY_CUSTOMER_FORM);

  const [showNewMgr, setShowNewMgr] = useState(false);
  const [creatingMgr, setCreatingMgr] = useState(false);
  const [mgrForm, setMgrForm] = useState(EMPTY_CONTACT_FORM);
  const [editingContactId, setEditingContactId] = useState(null);
  const [savingContact, setSavingContact] = useState(false);
  const [editContactForm, setEditContactForm] = useState(EMPTY_CONTACT_FORM);
  const [contactDrawerBaseline, setContactDrawerBaseline] = useState(EMPTY_CONTACT_FORM);

  const [activeTab, setActiveTab] = useState("contacts");

  const [locations, setLocations] = useState([]);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION_FORM);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [editLocationForm, setEditLocationForm] = useState(EMPTY_LOCATION_FORM);
  const [locationDrawerBaseline, setLocationDrawerBaseline] = useState(EMPTY_LOCATION_FORM);
  const [discardConfirm, setDiscardConfirm] = useState(null);

  const [invoiceRules, setInvoiceRules] = useState(null);
  const [savingRules, setSavingRules] = useState(false);
  const [rulesForm, setRulesForm] = useState({
    ap_email: "",
    ap_phone: "",
    remit_to_name: "Accounts Payable",
    remit_to_address_line_1: "",
    remit_to_address_line_2: "",
    remit_to_city: "",
    remit_to_state: "",
    remit_to_zip: "",
    requires_po_number: true,
    notes: "",
    active: true,
  });

  const isContactDrawerOpen = showNewMgr || !!editingContactId;
  const isLocationDrawerOpen = showNewLocation || !!editingLocationId;
  const isCustomerDrawerOpen = showCustomerDrawer;
  const activeContactForm = showNewMgr ? mgrForm : editContactForm;
  const activeLocationForm = showNewLocation ? locationForm : editLocationForm;
  const customerDrawerDirty =
    isCustomerDrawerOpen &&
    JSON.stringify(normalizeCustomerForm(editCustomerForm)) !== JSON.stringify(normalizeCustomerForm(customerDrawerBaseline));
  const contactDrawerDirty =
    isContactDrawerOpen &&
    JSON.stringify(normalizeContactForm(activeContactForm)) !== JSON.stringify(normalizeContactForm(contactDrawerBaseline));
  const locationDrawerDirty =
    isLocationDrawerOpen &&
    JSON.stringify(normalizeLocationForm(activeLocationForm)) !== JSON.stringify(normalizeLocationForm(locationDrawerBaseline));

  const contactSummary = useMemo(() => {
    const total = contacts.length;
    const active = contacts.filter((c) => c.active).length;
    const withEmail = contacts.filter((c) => (c.email ?? "").trim() !== "").length;
    const withPhone = contacts.filter((c) => (c.phone ?? "").trim() !== "").length;

    const byType = new Map();
    for (const c of contacts) {
      const t = (c.contact_type ?? "Other").trim() || "Other";
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }

    const typePairs = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);
    const topType = typePairs[0]?.[0] ?? "—";

    return { total, active, withEmail, withPhone, topType, typePairs };
  }, [contacts]);

  const sortedContacts = useMemo(() => {
    const norm = (s) => String(s ?? "").trim().toLowerCase();
    const lastToken = (name) => {
      const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
      return parts.length ? parts[parts.length - 1].toLowerCase() : "";
    };

    return [...contacts].sort((a, b) => {
      // Active first
      const aAct = a.active ? 1 : 0;
      const bAct = b.active ? 1 : 0;
      if (aAct !== bAct) return bAct - aAct;

      // Type (alphabetical)
      const at = norm(a.contact_type);
      const bt = norm(b.contact_type);
      if (at !== bt) return at.localeCompare(bt);

      // Last name-ish
      const al = lastToken(a.manager_name);
      const bl = lastToken(b.manager_name);
      if (al !== bl) return al.localeCompare(bl);

      // Full name fallback
      return norm(a.manager_name).localeCompare(norm(b.manager_name));
    });
  }, [contacts]);

  const customerSummary = useMemo(() => {
    const locationCount = locations.length;
    const hasInvoiceRules = !!invoiceRules;
    const requiresPO = invoiceRules ? !!invoiceRules.requires_po_number : null;
    return { locationCount, hasInvoiceRules, requiresPO };
  }, [locations, invoiceRules]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      setLoading(true);

      const custRes = await supabase
        .schema("app")
        .from("customers")
        .select("*")
        .eq("customer_id", customer_id)
        .single();

      if (!alive) return;
      if (custRes.error) {
        setErr(custRes.error.message);
        setLoading(false);
        return;
      }
      setCustomer(custRes.data);

      const mgrRes = await supabase
        .schema("app")
        .from("customer_contacts")
        .select("contact_id, manager_name, email, phone, title, active, contact_type, note")
        .eq("customer_id", customer_id)
        .order("active", { ascending: false })
        .order("contact_type", { ascending: true })
        .order("manager_name", { ascending: true });

      if (!alive) return;
      if (mgrRes.error) setErr(mgrRes.error.message);
      else setContacts(mgrRes.data ?? []);

      const locRes = await supabase
        .schema("app")
        .from("customer_locations")
        .select("location_id, location_name, tax_id, street_address_line_1, street_address_line_2, city, state, zip, note, active")
        .eq("customer_id", customer_id)
        .order("active", { ascending: false })
        .order("location_name", { ascending: true });

      if (!alive) return;
      if (locRes.error) setErr(locRes.error.message);
      else setLocations(locRes.data ?? []);

      const rulesRes = await supabase
        .schema("app")
        .from("customer_invoice_rules")
        .select("invoice_rules_id, customer_id, location_id, ap_contact_id, ap_email, ap_phone, remit_to_name, remit_to_address_line_1, remit_to_address_line_2, remit_to_city, remit_to_state, remit_to_zip, requires_po_number, notes, active")
        .eq("customer_id", customer_id)
        .is("location_id", null)
        .maybeSingle();

      if (!alive) return;
      if (rulesRes.error) setErr(rulesRes.error.message);
      else {
        setInvoiceRules(rulesRes.data ?? null);
        if (rulesRes.data) {
          setRulesForm({
            ap_email: rulesRes.data.ap_email ?? "",
            ap_phone: rulesRes.data.ap_phone ?? "",
            remit_to_name: rulesRes.data.remit_to_name ?? "Accounts Payable",
            remit_to_address_line_1: rulesRes.data.remit_to_address_line_1 ?? "",
            remit_to_address_line_2: rulesRes.data.remit_to_address_line_2 ?? "",
            remit_to_city: rulesRes.data.remit_to_city ?? "",
            remit_to_state: rulesRes.data.remit_to_state ?? "",
            remit_to_zip: rulesRes.data.remit_to_zip ?? "",
            requires_po_number: rulesRes.data.requires_po_number ?? true,
            notes: rulesRes.data.notes ?? "",
            active: rulesRes.data.active ?? true,
          });
        }
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [customer_id]);

  useEffect(() => {
    if (!isCustomerDrawerOpen && !isContactDrawerOpen && !isLocationDrawerOpen) return undefined;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isCustomerDrawerOpen) requestCloseCustomerDrawer();
        if (isContactDrawerOpen) requestCloseContactDrawer();
        if (isLocationDrawerOpen) requestCloseLocationDrawer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCustomerDrawerOpen, isContactDrawerOpen, isLocationDrawerOpen, customerDrawerDirty, contactDrawerDirty, locationDrawerDirty]);

  function openCustomerDrawer() {
    setErr(null);
    setDiscardConfirm(null);
    const nextForm = normalizeCustomerForm(customer ?? EMPTY_CUSTOMER_FORM);
    setEditCustomerForm(nextForm);
    setCustomerDrawerBaseline(nextForm);
    setShowCustomerDrawer(true);
  }

  function closeCustomerDrawer() {
    setShowCustomerDrawer(false);
    setDiscardConfirm(null);
  }

  function requestCloseCustomerDrawer() {
    if (savingCustomer) return;
    if (customerDrawerDirty) {
      setDiscardConfirm("customer");
      return;
    }
    closeCustomerDrawer();
  }

  function openNewContactDrawer() {
    setErr(null);
    setDiscardConfirm(null);
    setEditingContactId(null);
    setMgrForm(EMPTY_CONTACT_FORM);
    setContactDrawerBaseline(EMPTY_CONTACT_FORM);
    setShowNewMgr(true);
  }

  function closeContactDrawer() {
    setShowNewMgr(false);
    setEditingContactId(null);
    setDiscardConfirm(null);
  }

  function requestCloseContactDrawer() {
    if (creatingMgr || savingContact) return;
    if (contactDrawerDirty) {
      setDiscardConfirm("contact");
      return;
    }
    closeContactDrawer();
  }

  function openNewLocationDrawer() {
    setErr(null);
    setDiscardConfirm(null);
    setEditingLocationId(null);
    setLocationForm(EMPTY_LOCATION_FORM);
    setLocationDrawerBaseline(EMPTY_LOCATION_FORM);
    setShowNewLocation(true);
  }

  function closeLocationDrawer() {
    setShowNewLocation(false);
    setEditingLocationId(null);
    setDiscardConfirm(null);
  }

  function requestCloseLocationDrawer() {
    if (creatingLocation || savingLocation) return;
    if (locationDrawerDirty) {
      setDiscardConfirm("location");
      return;
    }
    closeLocationDrawer();
  }

  function discardPendingChanges() {
    if (discardConfirm === "customer") closeCustomerDrawer();
    if (discardConfirm === "contact") closeContactDrawer();
    if (discardConfirm === "location") closeLocationDrawer();
  }

  function closeDiscardConfirm() {
    setDiscardConfirm(null);
  }

  async function createManager() {
    setCreatingMgr(true);
    setErr(null);

    if (!mgrForm.manager_name.trim()) {
      setErr("Manager name is required.");
      setCreatingMgr(false);
      return;
    }

    const payload = {
      customer_id,
      contact_type: mgrForm.contact_type || "Manager",
      manager_name: mgrForm.manager_name.trim(),
      email: mgrForm.email.trim() || null,
      phone: mgrForm.phone.trim() || null,
      title: mgrForm.title.trim() || null,
      active: !!mgrForm.active,
      note: mgrForm.note.trim() || null,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("customer_contacts")
      .insert(payload)
      .select("contact_id, manager_name, email, phone, title, active, contact_type, note")
      .single();

    if (error) {
      setErr(error.message);
      setCreatingMgr(false);
      return;
    }

    setContacts((prev) => [data, ...prev]);
    setMgrForm(EMPTY_CONTACT_FORM);
    setContactDrawerBaseline(EMPTY_CONTACT_FORM);
    setShowNewMgr(false);
    setCreatingMgr(false);
  }

  function startEditContact(row) {
    setErr(null);
    setDiscardConfirm(null);
    setShowNewMgr(false);
    setEditingContactId(row.contact_id);
    const nextForm = normalizeContactForm({
      contact_type: row.contact_type ?? "Manager",
      manager_name: row.manager_name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      title: row.title ?? "",
      active: !!row.active,
      note: row.note ?? "",
    });
    setEditContactForm(nextForm);
    setContactDrawerBaseline(nextForm);
  }

  function cancelEditContact() {
    closeContactDrawer();
  }

  async function saveContactEdits() {
    if (!editingContactId) return;
    setSavingContact(true);
    setErr(null);

    if (!editContactForm.manager_name.trim()) {
      setErr("Name is required.");
      setSavingContact(false);
      return;
    }

    const payload = {
      contact_type: editContactForm.contact_type || "Manager",
      manager_name: editContactForm.manager_name.trim(),
      email: editContactForm.email.trim() || null,
      phone: editContactForm.phone.trim() || null,
      title: editContactForm.title.trim() || null,
      active: !!editContactForm.active,
      note: editContactForm.note.trim() || null,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("customer_contacts")
      .update(payload)
      .eq("contact_id", editingContactId)
      .select("contact_id, manager_name, email, phone, title, active, contact_type, note")
      .single();

    if (error) {
      setErr(error.message);
      setSavingContact(false);
      return;
    }

    setContacts((prev) => prev.map((c) => (c.contact_id === editingContactId ? data : c)));
    setContactDrawerBaseline(normalizeContactForm(data));
    closeContactDrawer();
    setSavingContact(false);
  }

  async function createLocation() {
    setCreatingLocation(true);
    setErr(null);

    if (!locationForm.location_name.trim()) {
      setErr("Location name is required.");
      setCreatingLocation(false);
      return;
    }

    const payload = {
      customer_id,
      location_name: locationForm.location_name.trim(),
      tax_id: locationForm.tax_id.trim() || null,
      street_address_line_1: locationForm.street_address_line_1.trim() || null,
      street_address_line_2: locationForm.street_address_line_2.trim() || null,
      city: locationForm.city.trim() || null,
      state: locationForm.state.trim() || null,
      zip: locationForm.zip.trim() || null,
      note: locationForm.note.trim() || null,
      active: !!locationForm.active,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("customer_locations")
      .insert(payload)
      .select("location_id, location_name, tax_id, street_address_line_1, street_address_line_2, city, state, zip, note, active")
      .single();

    if (error) {
      setErr(error.message);
      setCreatingLocation(false);
      return;
    }

    setLocations((prev) => [data, ...prev]);
    setLocationForm(EMPTY_LOCATION_FORM);
    setLocationDrawerBaseline(EMPTY_LOCATION_FORM);
    setShowNewLocation(false);
    setCreatingLocation(false);
  }

  function startEditLocation(row) {
    setErr(null);
    setDiscardConfirm(null);
    setShowNewLocation(false);
    setEditingLocationId(row.location_id);
    const nextForm = normalizeLocationForm({
      location_name: row.location_name ?? "",
      tax_id: row.tax_id ?? "",
      street_address_line_1: row.street_address_line_1 ?? "",
      street_address_line_2: row.street_address_line_2 ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      zip: row.zip ?? "",
      note: row.note ?? "",
      active: !!row.active,
    });
    setEditLocationForm(nextForm);
    setLocationDrawerBaseline(nextForm);
  }

  function cancelEditLocation() {
    closeLocationDrawer();
  }

  async function saveLocationEdits() {
    if (!editingLocationId) return;
    setSavingLocation(true);
    setErr(null);

    if (!editLocationForm.location_name.trim()) {
      setErr("Location name is required.");
      setSavingLocation(false);
      return;
    }

    const payload = {
      location_name: editLocationForm.location_name.trim(),
      tax_id: editLocationForm.tax_id.trim() || null,
      street_address_line_1: editLocationForm.street_address_line_1.trim() || null,
      street_address_line_2: editLocationForm.street_address_line_2.trim() || null,
      city: editLocationForm.city.trim() || null,
      state: editLocationForm.state.trim() || null,
      zip: editLocationForm.zip.trim() || null,
      note: editLocationForm.note.trim() || null,
      active: !!editLocationForm.active,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("customer_locations")
      .update(payload)
      .eq("location_id", editingLocationId)
      .select("location_id, location_name, tax_id, street_address_line_1, street_address_line_2, city, state, zip, note, active")
      .single();

    if (error) {
      setErr(error.message);
      setSavingLocation(false);
      return;
    }

    setLocations((prev) => prev.map((l) => (l.location_id === editingLocationId ? data : l)));
    setLocationDrawerBaseline(normalizeLocationForm(data));
    closeLocationDrawer();
    setSavingLocation(false);
  }

  async function saveCustomerEdits() {
    setSavingCustomer(true);
    setErr(null);

    if (!editCustomerForm.name.trim()) {
      setErr("Customer name is required.");
      setSavingCustomer(false);
      return;
    }

    const payload = {
      name: editCustomerForm.name.trim(),
      street_address_line_1: editCustomerForm.street_address_line_1.trim() || null,
      street_address_line_2: editCustomerForm.street_address_line_2.trim() || null,
      city: editCustomerForm.city.trim() || null,
      state: editCustomerForm.state.trim() || null,
      zip: editCustomerForm.zip.trim() || null,
      note: editCustomerForm.note.trim() || null,
      active: !!editCustomerForm.active,
    };

    const { data, error } = await supabase
      .schema("app")
      .from("customers")
      .update(payload)
      .eq("customer_id", customer_id)
      .select("*")
      .single();

    if (error) {
      setErr(error.message);
      setSavingCustomer(false);
      return;
    }

    const nextForm = normalizeCustomerForm(data);
    setCustomer(data);
    setEditCustomerForm(nextForm);
    setCustomerDrawerBaseline(nextForm);
    closeCustomerDrawer();
    setSavingCustomer(false);
  }

  async function saveInvoiceRules() {
    setSavingRules(true);
    setErr(null);

    const payload = {
      customer_id,
      location_id: null,
      ap_email: rulesForm.ap_email.trim() || null,
      ap_phone: rulesForm.ap_phone.trim() || null,
      remit_to_name: rulesForm.remit_to_name.trim() || null,
      remit_to_address_line_1: rulesForm.remit_to_address_line_1.trim() || null,
      remit_to_address_line_2: rulesForm.remit_to_address_line_2.trim() || null,
      remit_to_city: rulesForm.remit_to_city.trim() || null,
      remit_to_state: rulesForm.remit_to_state.trim() || null,
      remit_to_zip: rulesForm.remit_to_zip.trim() || null,
      requires_po_number: !!rulesForm.requires_po_number,
      notes: rulesForm.notes.trim() || null,
      active: !!rulesForm.active,
    };

    let res;
    if (invoiceRules?.invoice_rules_id) {
      res = await supabase
        .schema("app")
        .from("customer_invoice_rules")
        .update(payload)
        .eq("invoice_rules_id", invoiceRules.invoice_rules_id)
        .select("invoice_rules_id, customer_id, location_id, ap_contact_id, ap_email, ap_phone, remit_to_name, remit_to_address_line_1, remit_to_address_line_2, remit_to_city, remit_to_state, remit_to_zip, requires_po_number, notes, active")
        .single();
    } else {
      res = await supabase
        .schema("app")
        .from("customer_invoice_rules")
        .insert(payload)
        .select("invoice_rules_id, customer_id, location_id, ap_contact_id, ap_email, ap_phone, remit_to_name, remit_to_address_line_1, remit_to_address_line_2, remit_to_city, remit_to_state, remit_to_zip, requires_po_number, notes, active")
        .single();
    }

    if (res.error) {
      setErr(res.error.message);
      setSavingRules(false);
      return;
    }

    setInvoiceRules(res.data ?? null);
    setSavingRules(false);
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!customer) return <div style={{ padding: 24 }}>Not found</div>;

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, background: pageBg, minHeight: "100vh" }}>
      <div style={stickyHeaderStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link to="/customers">← Back to customers</Link>
          <button type="button" onClick={openCustomerDrawer}>
            Edit Customer
          </button>
        </div>

        <h2 style={{ marginTop: 12, marginBottom: 6 }}>{customer.name}</h2>

        <div style={{ color: "#666" }}>
          {[customer.street_address_line_1, customer.city, customer.state, customer.zip].filter(Boolean).join(", ")}
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
            <div style={{ color: "#666", fontSize: 12 }}>Total contacts</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{contactSummary.total}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Active contacts</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{contactSummary.active}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>With email</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{contactSummary.withEmail}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Top type</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{contactSummary.topType}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Locations</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{customerSummary.locationCount}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ color: "#666", fontSize: 12 }}>Invoice rules</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{customerSummary.hasInvoiceRules ? "Yes" : "No"}</div>
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

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {activeTab === "contacts" && (
            <button onClick={openNewContactDrawer}>Add Contact</button>
          )}
          {activeTab === "locations" && (
            <button onClick={openNewLocationDrawer}>Add Location</button>
          )}
          {activeTab === "invoice_rules" && (
            <button onClick={saveInvoiceRules} disabled={savingRules}>
              {savingRules ? "Saving…" : "Save Invoice Rules"}
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: "100%" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18, marginBottom: 10 }}>
          {CUSTOMER_TABS.map((t) => {
            const on = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
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
                {t.label}
              </button>
            );
          })}
        </div>

        {activeTab === "contacts" && (
          <>
            {sortedContacts.length === 0 ? (
              <div style={{ color: "#666" }}>No contacts yet.</div>
            ) : (
              <div style={{ ...sectionCardStyle, width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <h3 style={sectionTitleStyle}>Contact list</h3>
                  <div style={{ color: "#666", fontSize: 12 }}>
                    Showing {sortedContacts.length} contact{sortedContacts.length === 1 ? "" : "s"}
                  </div>
                </div>

                <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Note</th>
                      <th>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedContacts.map((m) => (
                      <tr
                        key={m.contact_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => startEditContact(m)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            startEditContact(m);
                          }
                        }}
                        style={{
                          borderBottom: "1px solid #f0f0f0",
                          cursor: "pointer",
                        }}
                      >
                        <td style={rowLinkStyle}>{m.manager_name}</td>
                        <td>{m.title ?? ""}</td>
                        <td>{m.contact_type ?? ""}</td>
                        <td>{m.email ?? ""}</td>
                        <td>{m.phone ?? ""}</td>
                        <td>{m.note ?? ""}</td>
                        <td>{m.active ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {activeTab === "locations" && (
          <div style={{ display: "grid", gap: 14 }}>
            {locations.length === 0 ? (
              <div style={{ color: "#666" }}>No locations yet.</div>
            ) : (
              <div style={sectionCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <h3 style={sectionTitleStyle}>Locations</h3>
                  <div style={{ color: "#666", fontSize: 12 }}>Showing {locations.length} location{locations.length === 1 ? "" : "s"}</div>
                </div>
                <table cellPadding="8" style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                      <th>Name</th>
                      <th>Tax ID</th>
                      <th>Address</th>
                      <th>Note</th>
                      <th>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((l) => (
                      <tr
                        key={l.location_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => startEditLocation(l)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            startEditLocation(l);
                          }
                        }}
                        style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                      >
                        <td style={rowLinkStyle}>{l.location_name}</td>
                        <td>{l.tax_id ?? ""}</td>
                        <td>{[l.street_address_line_1, l.city, l.state, l.zip].filter(Boolean).join(", ")}</td>
                        <td>{l.note ?? ""}</td>
                        <td>{l.active ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "invoice_rules" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={sectionCardStyle}>
              <h3 style={sectionTitleStyle}>Invoice rules (default)</h3>
              <div style={{ color: "#666", fontSize: 13, marginBottom: 10 }}>
                These rules apply to invoices for this customer unless a location-specific rule is added later.
              </div>

              <div style={{ display: "grid", gap: 12, maxWidth: 820 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label>
                    AP email
                    <input value={rulesForm.ap_email} onChange={(e) => setRulesForm({ ...rulesForm, ap_email: e.target.value })} style={{ width: "100%", padding: 8 }} />
                  </label>
                  <label>
                    AP phone
                    <input value={rulesForm.ap_phone} onChange={(e) => setRulesForm({ ...rulesForm, ap_phone: e.target.value })} style={{ width: "100%", padding: 8 }} />
                  </label>
                </div>

                <label>
                  Remit-to name
                  <input value={rulesForm.remit_to_name} onChange={(e) => setRulesForm({ ...rulesForm, remit_to_name: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>

                <label>
                  Remit-to address line 1
                  <input value={rulesForm.remit_to_address_line_1} onChange={(e) => setRulesForm({ ...rulesForm, remit_to_address_line_1: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>
                <label>
                  Remit-to address line 2
                  <input value={rulesForm.remit_to_address_line_2} onChange={(e) => setRulesForm({ ...rulesForm, remit_to_address_line_2: e.target.value })} style={{ width: "100%", padding: 8 }} />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px", gap: 12 }}>
                  <label>
                    City
                    <input value={rulesForm.remit_to_city} onChange={(e) => setRulesForm({ ...rulesForm, remit_to_city: e.target.value })} style={{ width: "100%", padding: 8 }} />
                  </label>
                  <label>
                    State
                    <select value={rulesForm.remit_to_state} onChange={(e) => setRulesForm({ ...rulesForm, remit_to_state: e.target.value })} style={{ width: "100%", padding: 8 }}>
                      <option value="">Select state</option>
                      {US_STATE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Zip
                    <input value={rulesForm.remit_to_zip} onChange={(e) => setRulesForm({ ...rulesForm, remit_to_zip: e.target.value })} style={{ width: "100%", padding: 8 }} />
                  </label>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!rulesForm.requires_po_number} onChange={(e) => setRulesForm({ ...rulesForm, requires_po_number: e.target.checked })} />
                  Requires PO number on invoice
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!rulesForm.active} onChange={(e) => setRulesForm({ ...rulesForm, active: e.target.checked })} />
                  Active
                </label>

                <label>
                  Notes
                  <textarea value={rulesForm.notes} onChange={(e) => setRulesForm({ ...rulesForm, notes: e.target.value })} style={{ width: "100%", padding: 8, minHeight: 110 }} />
                </label>

                <button onClick={saveInvoiceRules} disabled={savingRules}>
                  {savingRules ? "Saving…" : "Save Invoice Rules"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isContactDrawerOpen && (
        <>
          <div style={drawerBackdropStyle} onClick={requestCloseContactDrawer} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={showNewMgr ? "Add contact" : "Edit contact"}
            style={drawerPanelStyle}
          >
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{showNewMgr ? "Add contact" : "Edit contact"}</h3>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{customer.name}</div>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={requestCloseContactDrawer}
                disabled={creatingMgr || savingContact}
                style={iconButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              <div>
                <div style={fieldLabelStyle}>Contact type</div>
                <div role="group" aria-label="Contact type" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CONTACT_TYPE_OPTIONS.map((opt) => {
                    const active = (showNewMgr ? mgrForm.contact_type : editContactForm.contact_type) === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          showNewMgr
                            ? setMgrForm({ ...mgrForm, contact_type: opt.value })
                            : setEditContactForm({ ...editContactForm, contact_type: opt.value })
                        }
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
                Name (required)
                <input
                  value={showNewMgr ? mgrForm.manager_name : editContactForm.manager_name}
                  onChange={(e) =>
                    showNewMgr
                      ? setMgrForm({ ...mgrForm, manager_name: e.target.value })
                      : setEditContactForm({ ...editContactForm, manager_name: e.target.value })
                  }
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label>
                  Email
                  <input
                    value={showNewMgr ? mgrForm.email : editContactForm.email}
                    onChange={(e) =>
                      showNewMgr
                        ? setMgrForm({ ...mgrForm, email: e.target.value })
                        : setEditContactForm({ ...editContactForm, email: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={showNewMgr ? mgrForm.phone : editContactForm.phone}
                    onChange={(e) =>
                      showNewMgr
                        ? setMgrForm({ ...mgrForm, phone: e.target.value })
                        : setEditContactForm({ ...editContactForm, phone: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
              </div>

              <label>
                Title
                <input
                  value={showNewMgr ? mgrForm.title : editContactForm.title}
                  onChange={(e) =>
                    showNewMgr
                      ? setMgrForm({ ...mgrForm, title: e.target.value })
                      : setEditContactForm({ ...editContactForm, title: e.target.value })
                  }
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={showNewMgr ? !!mgrForm.active : !!editContactForm.active}
                  onChange={(e) =>
                    showNewMgr
                      ? setMgrForm({ ...mgrForm, active: e.target.checked })
                      : setEditContactForm({ ...editContactForm, active: e.target.checked })
                  }
                />
                Active
              </label>

              <label>
                Note
                <textarea
                  value={showNewMgr ? mgrForm.note : editContactForm.note}
                  onChange={(e) =>
                    showNewMgr
                      ? setMgrForm({ ...mgrForm, note: e.target.value })
                      : setEditContactForm({ ...editContactForm, note: e.target.value })
                  }
                  style={{ width: "100%", padding: 8, minHeight: 120 }}
                />
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={showNewMgr ? createManager : saveContactEdits} disabled={creatingMgr || savingContact}>
                {showNewMgr ? (creatingMgr ? "Saving…" : "Save contact") : savingContact ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {isCustomerDrawerOpen && (
        <>
          <div style={drawerBackdropStyle} onClick={requestCloseCustomerDrawer} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit customer"
            style={drawerPanelStyle}
          >
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Edit customer</h3>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{customer.name}</div>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={requestCloseCustomerDrawer}
                disabled={savingCustomer}
                style={iconButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              <label>
                Name (required)
                <input
                  value={editCustomerForm.name}
                  onChange={(e) => setEditCustomerForm({ ...editCustomerForm, name: e.target.value })}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Street address line 1
                <input
                  value={editCustomerForm.street_address_line_1}
                  onChange={(e) => setEditCustomerForm({ ...editCustomerForm, street_address_line_1: e.target.value })}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Street address line 2
                <input
                  value={editCustomerForm.street_address_line_2}
                  onChange={(e) => setEditCustomerForm({ ...editCustomerForm, street_address_line_2: e.target.value })}
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(220px, 220px) 140px", gap: 12 }}>
                <label>
                  City
                  <input
                    value={editCustomerForm.city}
                    onChange={(e) => setEditCustomerForm({ ...editCustomerForm, city: e.target.value })}
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  State
                  <select
                    value={editCustomerForm.state}
                    onChange={(e) => setEditCustomerForm({ ...editCustomerForm, state: e.target.value })}
                    style={{ width: "100%", padding: 8 }}
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
                  Zip
                  <input
                    value={editCustomerForm.zip}
                    onChange={(e) => setEditCustomerForm({ ...editCustomerForm, zip: e.target.value })}
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
              </div>

              <label>
                Note
                <textarea
                  value={editCustomerForm.note}
                  onChange={(e) => setEditCustomerForm({ ...editCustomerForm, note: e.target.value })}
                  style={{ width: "100%", padding: 8, minHeight: 110 }}
                />
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={!!editCustomerForm.active}
                  onChange={(e) => setEditCustomerForm({ ...editCustomerForm, active: e.target.checked })}
                />
                Active
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={saveCustomerEdits} disabled={savingCustomer}>
                {savingCustomer ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {isLocationDrawerOpen && (
        <>
          <div style={drawerBackdropStyle} onClick={requestCloseLocationDrawer} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={showNewLocation ? "Add location" : "Edit location"}
            style={drawerPanelStyle}
          >
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{showNewLocation ? "Add location" : "Edit location"}</h3>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>{customer.name}</div>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={requestCloseLocationDrawer}
                disabled={creatingLocation || savingLocation}
                style={iconButtonStyle}
              >
                ×
              </button>
            </div>

            <div style={drawerBodyStyle}>
              <label>
                Location name (required)
                <input
                  value={showNewLocation ? locationForm.location_name : editLocationForm.location_name}
                  onChange={(e) =>
                    showNewLocation
                      ? setLocationForm({ ...locationForm, location_name: e.target.value })
                      : setEditLocationForm({ ...editLocationForm, location_name: e.target.value })
                  }
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Tax ID / EIN
                <input
                  value={showNewLocation ? locationForm.tax_id : editLocationForm.tax_id}
                  onChange={(e) =>
                    showNewLocation
                      ? setLocationForm({ ...locationForm, tax_id: e.target.value })
                      : setEditLocationForm({ ...editLocationForm, tax_id: e.target.value })
                  }
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Address line 1
                <input
                  value={showNewLocation ? locationForm.street_address_line_1 : editLocationForm.street_address_line_1}
                  onChange={(e) =>
                    showNewLocation
                      ? setLocationForm({ ...locationForm, street_address_line_1: e.target.value })
                      : setEditLocationForm({ ...editLocationForm, street_address_line_1: e.target.value })
                  }
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <label>
                Address line 2
                <input
                  value={showNewLocation ? locationForm.street_address_line_2 : editLocationForm.street_address_line_2}
                  onChange={(e) =>
                    showNewLocation
                      ? setLocationForm({ ...locationForm, street_address_line_2: e.target.value })
                      : setEditLocationForm({ ...editLocationForm, street_address_line_2: e.target.value })
                  }
                  style={{ width: "100%", padding: 8 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px", gap: 12 }}>
                <label>
                  City
                  <input
                    value={showNewLocation ? locationForm.city : editLocationForm.city}
                    onChange={(e) =>
                      showNewLocation
                        ? setLocationForm({ ...locationForm, city: e.target.value })
                        : setEditLocationForm({ ...editLocationForm, city: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
                <label>
                  State
                  <select
                    value={showNewLocation ? locationForm.state : editLocationForm.state}
                    onChange={(e) =>
                      showNewLocation
                        ? setLocationForm({ ...locationForm, state: e.target.value })
                        : setEditLocationForm({ ...editLocationForm, state: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
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
                  Zip
                  <input
                    value={showNewLocation ? locationForm.zip : editLocationForm.zip}
                    onChange={(e) =>
                      showNewLocation
                        ? setLocationForm({ ...locationForm, zip: e.target.value })
                        : setEditLocationForm({ ...editLocationForm, zip: e.target.value })
                    }
                    style={{ width: "100%", padding: 8 }}
                  />
                </label>
              </div>

              <label>
                Note
                <textarea
                  value={showNewLocation ? locationForm.note : editLocationForm.note}
                  onChange={(e) =>
                    showNewLocation
                      ? setLocationForm({ ...locationForm, note: e.target.value })
                      : setEditLocationForm({ ...editLocationForm, note: e.target.value })
                  }
                  style={{ width: "100%", padding: 8, minHeight: 120 }}
                />
              </label>

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  style={checkboxInputStyle}
                  checked={showNewLocation ? !!locationForm.active : !!editLocationForm.active}
                  onChange={(e) =>
                    showNewLocation
                      ? setLocationForm({ ...locationForm, active: e.target.checked })
                      : setEditLocationForm({ ...editLocationForm, active: e.target.checked })
                  }
                />
                Active
              </label>
            </div>

            <div style={drawerFooterStyle}>
              <button type="button" onClick={showNewLocation ? createLocation : saveLocationEdits} disabled={creatingLocation || savingLocation}>
                {showNewLocation ? (creatingLocation ? "Saving…" : "Save location") : savingLocation ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </>
      )}

      {discardConfirm && (
        <div style={confirmOverlayStyle}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Discard changes"
            style={confirmCardStyle}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8, fontSize: 20 }}>Discard changes?</h3>
            <p style={{ marginBottom: 18, color: "#475569" }}>
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
    </div>
  );
}
