# 00 — الأساسيات (اقرأ ده الأول)

كل حاجة هنا مشتركة بين كل الصفحات. لو مش فاهم الجزء ده، باقي الملفات مش هتنفع.

---

## 1) Base URL

| البيئة | URL |
|---|---|
| Production | `https://superback.wegz.org` |
| Local | `http://localhost:3000` |

حطها في `.env` بتاع الفرونت:

```env
VITE_API_URL=https://superback.wegz.org
```

> مفيش prefix زي `/api/v1`. المسارات كلها بتبدأ بـ `/api/...` ما عدا `/health`.

---

## 2) الـ Authentication

### Login
```http
POST /api/auth/login
Content-Type: application/json

{ "email": "wegz@gmail.com", "password": "123456" }
```

**200**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOi...",
    "admin": { "id": "...", "name": "Super Admin", "email": "wegz@gmail.com", "is_root": true }
  }
}
```

> ⚠️ **الـ login مابيرجعش `permissions`.** لازم تنادي `/me` بعده.

| كود | السبب |
|---|---|
| `400` | `email` أو `password` ناقص |
| `401` | بيانات غلط **أو** الحساب `status !== "active"` |

### Me (بعد الـ login وبعد كل refresh)
```http
GET /api/auth/me
Authorization: Bearer <token>
```

**200**
```json
{
  "success": true,
  "message": "Current admin",
  "data": {
    "admin": {
      "id": "...",
      "name": "Sales Agent",
      "email": "sales1@wegz.org",
      "is_root": false,
      "permissions": ["clients:view", "sales:view", "sales:add"]
    }
  }
}
```

### قواعد مهمة

- مفيش refresh token، ومفيش logout endpoint. الـ JWT عمره `JWT_EXPIRES_IN` (افتراضي **1 يوم**).
- الـ logout = امسح التوكن من الـ storage + روح `/login`.
- **الصلاحيات بتتقرأ من الداتابيز مع كل request**، يعني لو حد غيّر صلاحيات admin، التغيير بيسري فورًا من غير re-login. بس الفرونت لازم يعمل refresh لـ `/me` عشان يحدّث السايدبار.
- الـ superadmin (`is_root: true`) عنده **كل الصلاحيات** ضمنيًا. الـ backend بيرجّعه كل الـ 25 في `/me`.

---

## 3) شكل الـ Response (ثابت في كل الـ endpoints)

### نجاح
```json
{ "success": true, "message": "...", "data": { ... } }
```
- `data` مش موجودة دايمًا (مثلاً `DELETE` بيرجع `message` بس).

### خطأ
```json
{ "success": false, "message": "Client not found" }
```
- في غير الـ production بيضيف `stack`. **متعرضهوش للمستخدم.**

### أكواد HTTP اللي هتقابلك

| كود | معناها | الفرونت يعمل إيه |
|---|---|---|
| `400` | Input غلط / ObjectId غلط / enum غلط / JSON غلط | اعرض `message` تحت الحقل أو في Toast |
| `401` | توكن ناقص/منتهي/غلط | امسح التوكن → `/login` |
| `403` | مش عندك الصلاحية | Toast: "مش عندك صلاحية" + **متخفيهاش** لو الصفحة مفتوحة |
| `404` | العنصر مش موجود (اتحذف من حد تاني؟) | Toast + رجّع للقائمة |
| `409` | تكرار (email / subdomain / section key) | رسالة واضحة: "موجود بالفعل" |
| `413` | الـ body كبير (لوجو Base64 ضخم) | "الملف كبير جدًا" |
| `500` | مشكلة سيرفر | Toast عام + `console.error` |

> كل رسائل الخطأ **إنجليزي** من الـ backend. لو عايز عربي، اعمل map للأكواد + fallback على `message`.

---

## 4) helper الصلاحيات

```js
// src/lib/permissions.js
import { useAuth } from "../context/AuthContext";

export function usePermission() {
  const { user } = useAuth();           // { id, name, email, is_root, permissions: [] }

  const hasPermission = (perm) => {
    if (!user) return false;
    if (user.is_root) return true;      // ← أهم سطر
    const list = Array.isArray(perm) ? perm : [perm];
    return list.every((p) => user.permissions.includes(p));
  };

  // لو عايز "أي واحدة من"
  const hasAny = (perms) => {
    if (!user) return false;
    if (user.is_root) return true;
    return perms.some((p) => user.permissions.includes(p));
  };

  return { hasPermission, hasAny };
}
```

**الاستخدام:**
```jsx
{hasPermission("clients:add") && <Button>إضافة عميل</Button>}
```

> ⚠️ **مهم:** الـ frontend gate تجميلي بس. الـ backend بيرفض بـ `403` لو حاول حد يضرب الـ endpoint مباشرة. عشان كده لازم تعالج `403` كمان.

---

## 5) الصلاحيات الكاملة (25 صلاحية / 10 موارد)

| Resource | Permissions | الـ label العربي |
|---|---|---|
| `clients` | `view` `add` `edit` `delete` | العملاء |
| `sections` | `view` `add` `edit` `delete` | الأقسام |
| `sales` | `view` `add` `edit` `delete` | المبيعات |
| `payments` | `view` `add` `edit` `delete` | المدفوعات |
| `reports` | `view` | تقارير التشغيل |
| `financial_reports` | `view` | التقارير المالية |
| `admins` | `view` `add` `edit` `delete` | المشرفين |
| `audit` | `view` | سجل التدقيق |
| `provisioning` | `add` | التجهيز |
| `dashboard` | `view` | لوحة التحكم |

الصيغة دايمًا: `resource:action` — مثال `clients:edit`.

> 🔴 **`provisioning:add` مش `clients:edit`.** أزرار `retry-provisioning` و `provision-now` محتاجة `provisioning:add` تحديدًا.

---

## 6) الـ Enums (متكتبهاش بيدك، استخدم الـ constants دي)

### Client

```js
export const CLIENT_STATUS = ["pending", "active", "suspended"];

export const OPERATION_STATUS = ["demo", "sales", "data", "delivered"];

export const PAYMENT_CYCLE = ["monthly", "quarterly", "half_yearly", "yearly"];

export const PROVISIONING_STATUS = [
  "pending",            // في الطابور
  "creating_db",        // بيعمل الداتابيز
  "creating_subdomain", // بيعمل الـ subdomains
  "deploying",          // بينسخ الملفات
  "generating_key",     // بيعمل API key
  "installing_ssl",     // بيجيب الشهادة
  "completed",          // ✅ جاهز
  "failed",             // ❌ فشل — اقرأ provisioning_error
];
```

### Sale
```js
export const SALE_STATUS = ["pending", "paid", "cancelled", "refunded"];
export const SALE_CYCLE  = ["monthly", "quarterly", "half_yearly", "yearly", "custom"];
```

### Payment
```js
export const PAYMENT_STATUS = ["pending", "approve", "reject"];   // ← approve مش approved
export const PAYMENT_METHOD = ["cash", "bank_transfer", "card", "wallet", "cheque", "other"];
```

> ⚠️ `Payment.status` قيمته **`approve`** مش `approved`، و **`reject`** مش `rejected`. لو كتبت `approved` الـ API هيرفض.

### Admin
```js
export const ADMIN_STATUS = ["active", "inactive"];
```

---

## 7) قواعد عامة للـ IDs والتواريخ

- كل الـ IDs دي **MongoDB ObjectId** (24 hex char). لو بعت ID غلط → `400` مش `500`.
- كل التواريخ **ISO 8601**: `2026-10-27T10:00:00.000Z`.
- باراميترات الفلترة بالتاريخ: `from` / `to` (اختياريين).
- العملة بتيجي من السيرفر في `data.currency` (افتراضي `EGP`). **متحطهاش ثابتة في الفرونت.**

---

## 8) هيكل مقترح للفرونت

```
src/
├── api/
│   ├── axios.js          # interceptor: Bearer + 401 handling
│   ├── auth.js
│   ├── clients.js
│   ├── sections.js
│   ├── sales.js
│   ├── payments.js
│   ├── reports.js
│   ├── financial.js
│   ├── admins.js
│   └── audit.js
├── lib/
│   ├── permissions.js    # usePermission()
│   └── enums.js          # الـ constants فوق
├── components/
│   ├── Sidebar.jsx
│   ├── DataTable.jsx
│   ├── StatusBadge.jsx
│   ├── PermissionGate.jsx
│   └── ConfirmDialog.jsx
└── pages/ ...
```

### axios interceptor (جاهز)

```js
import axios from "axios";

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    if (status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
```

---

**التالي:** [01-shell.md](./01-shell.md)
