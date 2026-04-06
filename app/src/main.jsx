import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";
import "./app.css";

import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";

import Shell from "./App";
import Login from "./pages/Login";
import Customers from "./pages/Customers";
import Invoices from "./pages/Invoices";
import InvoicesDetail from "./pages/InvoicesDetail";
import Consultants from "./pages/Consultants";
import ConsultantDetail from "./pages/ConsultantDetail";
import PurchaseOrders from "./pages/PurchaseOrders";
import PurchaseOrderDetail from "./pages/PurchaseOrderDetail";
import PurchaseOrderForm from "./pages/PurchaseOrderForm";
import CustomerForm from "./pages/CustomerForm";
import CustomerDetail from "./pages/CustomerDetail";
import ImportRuns from "./pages/ImportRuns";
import ImportRunDetail from "./pages/ImportRunDetail";
import ImportRunBillable from "./pages/ImportRunBillable.jsx";
import ImportRunBillablePo from "./pages/ImportRunBillablePo";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <Shell>
                  <Navigate to="/customers" replace />
                </Shell>
              </RequireAuth>
            }
          />

          <Route
            path="/customers"
            element={
              <RequireAuth>
                <Shell>
                  <Customers />
                </Shell>
              </RequireAuth>
            }
          />

          <Route
  path="/invoices"
  element={
    <RequireAuth>
      <Shell>
        <Invoices />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/invoices/:invoice_id"
  element={
    <RequireAuth>
      <Shell>
        <InvoicesDetail />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/consultants"
  element={
    <RequireAuth>
      <Shell>
        <Consultants />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/consultants/:consultant_id"
  element={
    <RequireAuth>
      <Shell>
        <ConsultantDetail />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/purchase-orders"
  element={
    <RequireAuth>
      <Shell>
        <PurchaseOrders />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/purchase-orders/new"
  element={
    <RequireAuth>
      <Shell>
        <PurchaseOrderForm />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/purchase-orders/:purchase_order_id"
  element={
    <RequireAuth>
      <Shell>
        <PurchaseOrderDetail />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/purchase-orders/:purchase_order_id/edit"
  element={
    <RequireAuth>
      <Shell>
        <PurchaseOrderForm />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/customers/new"
  element={
    <RequireAuth>
      <Shell>
        <CustomerForm />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/customers/:customer_id/edit"
  element={
    <RequireAuth>
      <Shell>
        <CustomerForm />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/customers/:customer_id"
  element={
    <RequireAuth>
      <Shell>
        <CustomerDetail />
      </Shell>
    </RequireAuth>
  }
/>

<Route path="/import-runs" element={<RequireAuth><Shell><ImportRuns /></Shell></RequireAuth>} />
<Route path="/import-runs/:import_run_id" element={<RequireAuth><Shell><ImportRunDetail /></Shell></RequireAuth>} />

<Route
  path="/import-runs/:import_run_id/billable"
  element={
    <RequireAuth>
      <Shell>
        <ImportRunBillable />
      </Shell>
    </RequireAuth>
  }
/>

<Route
  path="/import-runs/:import_run_id/billable/po/:purchase_order_id"
  element={
    <RequireAuth>
      <Shell>
        <ImportRunBillablePo />
      </Shell>
    </RequireAuth>
  }
/>


          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
