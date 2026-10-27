# 01 — الـ Shell: Layout + Sidebar + Routing

---

## 1) الـ Layout

```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (ثابت)   │   HEADER: اسم الأدمن · إشعارات · خروج │
│                   ├───────────────────────────────────────┤
│  🏠 Home          │                                        │
│  👥 Clients       │        PAGE CONTENT                    │
│  🧩 Sections      │        (scrollable)                    │
│  💰 Sales         │                                        │
│  💳 Payments      │                                        │
│  📊 Op. Reports   │                                        │
│  📈 Fin. Reports  │                                        │
│  🛡️ Admins        │                                        │
│  📜 Audit         │                                        │
└─────────────────────────────────────────────────────────┘
```

- السايدبار **RTL** (عربي) — الأيقونات على اليمين.
- على الموبايل: Drawer.
- الـ Sidebar يظهر فيه **بس** العناصر اللي عندك صلاحية عليها.

---

## 2) عناصر السايدبار

| الأيقونة | الاسم | المسار | الصلاحية المطلوبة | الـ endpoint |
|---|---|---|---|---|
| 🏠 | الرئيسية ولوحة التحكم | `/` | `dashboard:view` | `GET /api/admin/dashboard` |
| 👥 | العملاء | `/clients` | `clients:view` | `GET /api/admin/clients` |
| 🧩 | الأقسام | `/sections` | `sections:view` | `GET /api/admin/sections` |
| 💰 | المبيعات | `/sales` | `sales:view` | `GET /api/admin/sales` |
| 💳 | المدفوعات | `/payments` | `payments:view` | `GET /api/admin/payments` |
| 📊 | تقارير التشغيل | `/reports/operations` | `reports:view` | `GET /api/admin/reports/operations` |
| 📈 | التقارير المالية | `/reports/financial` | `financial_reports:view` | `GET /api/admin/financial-reports/summary` |
| 🛡️ | المشرفين | `/admins` | `admins:view` | `GET /api/admin/admins` |
| 📜 | سجل التدقيق | `/audit` | `audit:view` | `GET /api/admin/audit` |

### كود السايدبار

```jsx
import { usePermission } from "../lib/permissions";

const NAV = [
  { to: "/",                  icon: "🏠", label: "الرئيسية ولوحة التحكم", perm: "dashboard:view" },
  { to: "/clients",           icon: "👥", label: "العملاء",               perm: "clients:view" },
  { to: "/sections",          icon: "🧩", label: "الأقسام",               perm: "sections:view" },
  { to: "/sales",             icon: "💰", label: "المبيعات",              perm: "sales:view" },
  { to: "/payments",          icon: "💳", label: "المدفوعات",             perm: "payments:view" },
  { to: "/reports/operations",icon: "📊", label: "تقارير التشغيل",        perm: "reports:view" },
  { to: "/reports/financial", icon: "📈", label: "التقارير المالية",      perm: "financial_reports:view" },
  { to: "/admins",            icon: "🛡️", label: "المشرفين",              perm: "admins:view" },
  { to: "/audit",             icon: "📜", label: "سجل التدقيق",           perm: "audit:view" },
];

export function Sidebar() {
  const { hasPermission } = usePermission();
  const items = NAV.filter((item) => hasPermission(item.perm));
  // ...
}
```

> **مفيش** عنصر في السايدبار اسمه "Provisioning" أو "Permissions".
> Provisioning = أزرار جوه تفاصيل العميل. Permissions = تاب جوه تفاصيل المشرف.

---

## 3) حماية الصفحات (Route Guard)

```jsx
import { Navigate } from "react-router-dom";

function ProtectedRoute({ permission, children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) {
    return <ForbiddenPage />;   // صفحة 403 مش redirect
  }
  return children;
}
```

| المسار | الصلاحية |
|---|---|
| `/` | `dashboard:view` |
| `/clients` | `clients:view` |
| `/clients/new` | `clients:add` |
| `/clients/:id` | `clients:view` |
| `/sections` | `sections:view` |
| `/sales` | `sales:view` |
| `/payments` | `payments:view` |
| `/reports/operations` | `reports:view` |
| `/reports/operations/:id` | `reports:view` |
| `/reports/financial` | `financial_reports:view` |
| `/admins` | `admins:view` |
| `/admins/:id` | `admins:view` |
| `/audit` | `audit:view` |

### حالة مفيش أي صلاحية
لو admin عنده `permissions: []` (زي أي admin جديد قبل ما تديله صلاحيات):
- السايدبار هيفضل فاضي.
- لازم تعرض صفحة: **"حسابك مالوش صلاحيات — كلّم الـ Super Admin"**.
- **متخليهوش** يدخل `/` ويعمل redirect loop.

---

## 4) الـ Header

- اسم الأدمن + الإيميل (`user.name` / `user.email`).
- بادج **Root** لو `user.is_root === true`.
- زرار "تسجيل الخروج" → امسح التوكن → `/login`.
- (اختياري) زرار "تغيير كلمة المرور" → `PATCH /api/admin/admins/:id` بـ `{ password }` — بس **بس لو** `hasPermission("admins:edit")` أو إنه بيعدّل نفسه.
  > ملاحظة: الـ endpoint ده محمي بـ `admins:edit`، فمش كل حد يقدر يغيّر باسورده. لو محتاج تغيير باسورد للكل، ده محتاج endpoint جديد — كلّمني.

---

## 5) مكونات مشتركة اعملها مرة واحدة

### `StatusBadge`
```jsx
const CLIENT_STATUS_STYLE = {
  active:    { color: "green",  label: "نشط" },
  pending:   { color: "amber",  label: "قيد الانتظار" },
  suspended: { color: "red",    label: "موقوف" },
};

const PROVISIONING_STYLE = {
  pending: "جاري التجهيز…", creating_db: "إنشاء الداتابيز…",
  creating_subdomain: "إنشاء الـ subdomain…", deploying: "نشر الملفات…",
  generating_key: "توليد المفتاح…", installing_ssl: "تثبيت SSL…",
  completed: "جاهز", failed: "فشل",
};
```

### `PermissionGate`
```jsx
export function Can({ perm, children, fallback = null }) {
  const { hasPermission } = usePermission();
  return hasPermission(perm) ? children : fallback;
}

// <Can perm="clients:add"><Button>إضافة عميل</Button></Can>
```

### `ConfirmDialog`
استخدمه في كل عملية خطيرة: حذف، إيقاف، regenerate API key.

### `DataTable`
- Pagination من الـ `data.pagination` (لو موجود).
- Empty state واضح: "مفيش بيانات".
- Loading skeleton.

---

## 6) الـ Toasts / Errors — قاعدة موحّدة

```js
async function callApi(fn, { successMsg } = {}) {
  try {
    const res = await fn();
    if (successMsg) toast.success(successMsg);
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.message;

    if (status === 401) return;                       // الـ interceptor بيتصرف
    if (status === 403) toast.error("مش عندك صلاحية لهذا الإجراء");
    else if (status === 404) toast.error("العنصر مش موجود");
    else if (status === 409) toast.error(msg || "البيانات موجودة بالفعل");
    else toast.error(msg || "حصل خطأ، حاول تاني");

    throw err;
  }
}
```

---

**التالي:** [02-dashboard.md](./02-dashboard.md)
