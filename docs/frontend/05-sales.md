# 05 — المبيعات (Sales)

**الصلاحية:** `sales:view` · `sales:add` · `sales:edit` · `sales:delete`
**المسار:** `/sales`

> **Sale = صفقة / عقد** مع العميل (مش دفعة).
> الـ Sale بيوصف الاتفاق (المبلغ، الخصم، الدورة)، والـ Payment هي الفلوس اللي اتدفعت فعلًا.
> ممكن Sale يكون ليه أكتر من Payment.

---

## 1) شكل الـ Sale

```json
{
  "_id": "66f4a1b2c3d4e5f6a7b8c9d0",
  "sale_no": "SAL-M3K9X2-427",
  "client_id": { "_id": "…", "company_name": "مطعم النور", "email": "…", "subdomain": "alnoor", "status": "active" },
  "amount": 3000,
  "discount": 500,
  "total": 2500,
  "currency": "EGP",
  "cycle": "quarterly",
  "sale_date": "2026-10-20T00:00:00.000Z",
  "status": "pending",
  "sales_agent_id": { "_id": "…", "name": "Sales Agent", "email": "sales1@wegz.org" },
  "sales_agent_name": "أحمد",
  "sales_agent_phone": "01000000000",
  "notes": "اتفاق تجديد ربع سنوي",
  "created_by": "…",
  "createdAt": "2026-10-20T09:00:00.000Z",
  "updatedAt": "2026-10-20T09:00:00.000Z"
}
```

| الحقل | ملاحظات |
|---|---|
| `sale_no` | **بيتولد أوتوماتيك** `SAL-XXXXXX-NNN` — متبعتهوش |
| `total` | **محسوب**: `max(0, amount - discount)` — متبعتهوش |
| `cycle` | لو مش بعت، بياخد `client.payment_cycle` أو `monthly` |
| `sales_agent_id` | لو مش بعت، بياخد `client.sales_agent_id` |

### Enums

```js
export const SALE_STATUS = ["pending", "paid", "cancelled", "refunded"];
export const SALE_CYCLE  = ["monthly", "quarterly", "half_yearly", "yearly", "custom"];
```

> ⚠️ الـ Sale عنده `custom` في الـ cycle، لكن الـ Client مش عنده. متخلطهمش.

---

## 2) القائمة

```http
GET /api/admin/sales?client_id=&status=&cycle=&sales_agent_id=&from=&to=&page=&limit=&sort=
Authorization: Bearer <token>
```

| Query | القيم | افتراضي |
|---|---|---|
| `client_id` | ObjectId | — |
| `status` | `pending` `paid` `cancelled` `refunded` | — |
| `cycle` | `monthly` `quarterly` `half_yearly` `yearly` `custom` | — |
| `sales_agent_id` | ObjectId | — |
| `from` / `to` | ISO date | — |
| `page` | number | `1` |
| `limit` | number (max **200**) | `20` |
| `sort` | string | `-sale_date` |

**200**
```json
{
  "success": true,
  "message": "Sales retrieved",
  "data": {
    "sales": [ /* ... */ ],
    "pagination": { "total": 42, "page": 1, "limit": 20, "pages": 3 }
  }
}
```

> ✅ ده الـ endpoint الوحيد **غير العملاء** اللي فيه pagination.

### الأعمدة

| # Sale | العميل | المبلغ | الخصم | الإجمالي | الدورة | الحالة | التاريخ | المندوب | إجراءات |
|---|---|---|---|---|---|---|---|---|---|
| `SAL-M3K9X2-427` | مطعم النور | 3,000 | 500 | **2,500** | ربع سنوي | 🟡 معلّق | 20 أكتوبر | أحمد | 👁️ ✏️ 🗑️ |

- اعرض `total` **bold** (هو الرقم المهم).
- لو `discount > 0` → اعرضه بـ `-500` أحمر صغير تحت المبلغ.

---

## 3) إحصائيات المبيعات

```http
GET /api/admin/sales/stats?from=&to=
```

**200**
```json
{
  "data": {
    "totals": { "count": 42, "amount": 120000, "discount": 8000, "total": 112000 },
    "by_status": [
      { "_id": "paid", "count": 30, "total": 80000 },
      { "_id": "pending", "count": 12, "total": 32000 }
    ],
    "by_sales_agent": [
      { "sales_agent_id": "…", "name": "Sales Agent", "count": 20, "total": 60000 }
    ],
    "monthly": [
      { "year": 2026, "month": 9, "count": 10, "total": 28000 }
    ],
    "currency": "EGP"
  }
}
```

### الـ Layout
- 4 KPI: عدد الصفقات · إجمالي قبل الخصم · إجمالي الخصم · **صافي الإجمالي**
- Bar chart: `by_status`
- Bar chart أفقية: `by_sales_agent` (top sellers)
- Line chart: `monthly` (`${year}-${month}`)

> `by_status` بيجي بـ `_id` مش `status`. حوّله في الفرونت.
> `monthly` ممكن تكون ناقصة شهور — املأ الفجوات بـ `0` في الشارت.

---

## 4) تفاصيل Sale

```http
GET /api/admin/sales/:id
```
**200** → `data.sale` (client + agent populated)

**404** → `Sale not found`

---

## 5) إضافة Sale

```http
POST /api/admin/sales          → sales:add
```

| الحقل | إجباري | نوع | ملاحظات |
|---|---|---|---|
| `client_id` | ✅ | ObjectId | لازم موجود |
| `amount` | ✅ | number ≥ 0 | |
| `discount` | ❌ | number ≥ 0 | افتراضي `0` |
| `currency` | ❌ | string | افتراضي `env.CURRENCY` |
| `cycle` | ❌ | enum | من `client.payment_cycle` |
| `sale_date` | ❌ | ISO date | افتراضي `now` |
| `status` | ❌ | enum | افتراضي `pending` |
| `sales_agent_id` | ❌ | ObjectId | من `client.sales_agent_id` |
| `sales_agent_name` / `sales_agent_phone` | ❌ | string | |
| `notes` | ❌ | string | |

```json
{
  "client_id": "66f2b3c4d5e6f7a8b9c0d1e2",
  "amount": 3000,
  "discount": 500,
  "cycle": "quarterly",
  "sale_date": "2026-10-20",
  "status": "pending",
  "sales_agent_id": "66f1a2b3c4d5e6f7a8b9c0d2",
  "notes": "اتفاق تجديد ربع سنوي"
}
```

**201** → `data.sale`

### UX
- **live preview** للإجمالي: `amount - discount` (بنفس منطق السيرفر، ولو سالب → `0`).
- `client_id` → Searchable select (مش dropdown طويل).
- لو العميل عنده `payment_cycle` → pre-fill الـ cycle.

### أخطاء
| كود | السبب |
|---|---|
| `400` | `client_id is required` |
| `400` | `amount is required and must be >= 0` |
| `404` | `Client not found` |

---

## 6) تعديل Sale

```http
PATCH /api/admin/sales/:id      → sales:edit
```

الحقول المسموحة:
```
amount · discount · currency · cycle · sale_date · status
sales_agent_id · sales_agent_name · sales_agent_phone · notes
```

- ❌ `client_id` مش قابل للتعديل (لو عايز تغيّره → احذف واعمل جديد).
- ❌ `sale_no` و `total` بيتحسبوا على السيرفر.
- `total` بيتعاد حسابه أوتوماتيك بعد التعديل.

**200** → `data.sale`

---

## 7) حذف Sale

```http
DELETE /api/admin/sales/:id     → sales:delete
```

**200**
```json
{ "success": true, "message": "Sale deleted" }
```

> 🧠 **الدفعات المرتبطة مش بتتمسح.** الـ backend بيفكّ الربط (`sale_id` بيتشال من الـ payments) عشان السجل المالي يفضل سليم.
> لو حابب توضّح للمستخدم: "الدفعات المرتبطة هتفضل موجودة بس هتتشال من الصفقة دي."

---

## 8) الصلاحيات

| الإجراء | الصلاحية |
|---|---|
| دخول الصفحة / القائمة / التفاصيل | `sales:view` |
| إضافة | `sales:add` |
| تعديل | `sales:edit` |
| حذف | `sales:delete` |
| الإحصائيات | `sales:view` |

---

## 9) كود

```js
// api/sales.js
import { api } from "./axios";
const d = (r) => r.data.data;

export const listSales  = (params) => api.get("/api/admin/sales", { params }).then(d);
export const salesStats = (params) => api.get("/api/admin/sales/stats", { params }).then(d);
export const getSale    = (id) => api.get(`/api/admin/sales/${id}`).then(d);
export const createSale = (body) => api.post("/api/admin/sales", body).then(d);
export const updateSale = (id, b) => api.patch(`/api/admin/sales/${id}`, b).then(d);
export const deleteSale = (id) => api.delete(`/api/admin/sales/${id}`).then(d);
```

---

## 10) ❌ أخطاء شائعة

1. **تبعث `total`** → السيرفر بيتجاهله ويحسبه.
2. **تبعث `sale_no`** → بيتجاهله.
3. **تستخدم `approved`** كـ status → الـ enum هو `paid`.
4. **تخلط `cycle` بتاع Sale بـ `payment_cycle` بتاع Client** → Sale عنده `custom` كمان.
5. **تفترض إن حذف Sale بيحذف الدفعات** → لأ، بيتفكّوا بس.

---

**التالي:** [06-payments.md](./06-payments.md)
