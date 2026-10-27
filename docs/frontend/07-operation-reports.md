# 07 — تقارير التشغيل (Operation Reports)

**الصلاحية:** `reports:view` — **لكل حاجة** (حتى تعديل الحالة وإضافة الملاحظات)
**المسار:** `/reports/operations`

> التقرير التشغيلي = نظرة 360 على العميل: حالته، وضعه التشغيلي، أقسامه، إجمالي المدفوع، المعلّق، وملاحظات الفريق.

> ⚠️ **ملحوظة صلاحيات:** كل الـ endpoints هنا محتاجة `reports:view` بس.
> مفيش `reports:edit` — يعني أي حد عنده `reports:view` يقدر يغيّر الحالة ويضيف/يمسح ملاحظات.
> لو عايز فصل الصلاحيات ده، **كلّمني** — محتاج تعديل في الـ backend.

---

## 1) قائمة التقارير

```http
GET /api/admin/reports/operations
Authorization: Bearer <token>
```

> مفيش query params. بيرجع **كل** العملاء.

**200**
```json
{
  "success": true,
  "message": "Operation reports retrieved",
  "data": {
    "reports": [
      {
        "_id": "66f2b3c4d5e6f7a8b9c0d1e2",
        "company_name": "مطعم النور",
        "email": "owner@alnoor.com",
        "subdomain": "alnoor",
        "status": "active",
        "operation_status": "sales",
        "sections": [ { "_id": "…", "key": "hero", "name": "Hero", "ar_name": "الهيرو", "status": "active", "order": 1 } ],
        "sections_count": 1,
        "total_sections": 8,
        "payment_cycle": "monthly",
        "payment_amount": 1500,
        "total_paid": 4500,
        "payments_count": 3,
        "pending_amount": 1500,
        "pending_count": 1,
        "last_payment_date": "2026-10-25T00:00:00.000Z"
      }
    ],
    "total_sections": 8
  }
}
```

| الحقل المحسوب | معناه |
|---|---|
| `total_paid` | مجموع المدفوعات `approve` |
| `payments_count` | عدد **كل** المدفوعات (مش المعتمدة بس) |
| `pending_amount` | مجموع المدفوعات `pending` |
| `pending_count` | عدد المدفوعات `pending` |
| `last_payment_date` | آخر دفعة معتمدة، أو `client.last_payment_date` |

### الأعمدة

| العميل | الحالة | العملية | الأقسام | إجمالي المدفوع | معلّق | آخر دفعة | إجراءات |
|---|---|---|---|---|---|---|---|
| مطعم النور<br><small>alnoor</small> | 🟢 نشط | `sales` | `1/8` | 4,500 EGP | 1,500 (1) | 25 أكتوبر | عرض |

### UX
- **فلترة في الفرونت** (مفيش فلترة في الـ endpoint): بالحالة / بـ `operation_status` / بالبحث.
- `operation_status` اعرضه كـ Badge بألوان مختلفة:

```js
const OPERATION_STATUS_LABEL = {
  demo:      { ar: "ديمو",     color: "purple" },
  sales:     { ar: "مبيعات",   color: "blue" },
  data:      { ar: "بيانات",   color: "amber" },
  delivered: { ar: "تم التسليم", color: "green" },
};
```

- KPI cards: إجمالي العملاء · إجمالي المدفوع · إجمالي المعلّق · عدد العملاء بلا أقسام.

---

## 2) تفاصيل تقرير عميل

```http
GET /api/admin/reports/operations/:id
```

**200**
```json
{
  "data": {
    "client": { /* كل بيانات العميل + sections + sections_count + total_sections */ },
    "payments": [ /* كل مدفوعات العميل، الأحدث أول */ ],
    "sales": [ /* كل صفقات العميل، الأحدث أول */ ],
    "totals": {
      "total_paid": 4500,
      "pending_amount": 1500,
      "payments_count": 3
    }
  }
}
```

> `payments` و `sales` **مش populated** — فيهم `client_id` كـ ObjectId. عادي، لأنك أصلًا في صفحة العميل.

**404** → `Client report not found`

### الـ Layout
- Header: اسم الشركة + subdomain + Badges (status / operation_status).
- 3 KPI: `total_paid` · `pending_amount` · `payments_count`.
- Tab: المدفوعات (جدول).
- Tab: الصفقات (جدول).
- Tab: الملاحظات (تحت).

---

## 3) تغيير الحالة / الوضع التشغيلي

```http
PATCH /api/admin/reports/operations/:id/status      → reports:view
Content-Type: application/json
```

**body** — لازم واحد منهم على الأقل:
```json
{ "status": "active" }
```
أو
```json
{ "operation_status": "delivered" }
```
أو الاتنين.

| الحقل | القيم |
|---|---|
| `status` | `active` \| `suspended` \| `pending` |
| `operation_status` | `demo` \| `sales` \| `data` \| `delivered` |

**200**
```json
{ "success": true, "message": "Status updated successfully", "data": { "client": { /* ... */ } } }
```

### أخطاء
| كود | السبب |
|---|---|
| `400` | `Nothing to update` — مفيش أي حقل |
| `400` | `status must be one of: active, suspended, pending` |
| `400` | `operation_status must be one of: demo, sales, data, delivered` |
| `404` | `Client not found` |

> 💡 ده نفس تأثير `POST /clients/:id/suspend` و `activate` — بس من غير صلاحية `clients:edit`.
> يعني اللي عنده `reports:view` بس **يقدر يوقف عميل** من هنا. خد بالك.

### UX
- Dropdowns inline في التقرير.
- تغيير `operation_status` → Save فوري (Optimistic UI + rollback لو فشل).

---

## 4) الملاحظات

### إضافة
```http
POST /api/admin/reports/operations/:id/notes      → reports:view

{ "text": "العميل طلب تأجيل التجديد أسبوع" }
```

**201**
```json
{
  "success": true,
  "message": "Note added successfully",
  "data": {
    "notes": [
      {
        "text": "العميل طلب تأجيل التجديد أسبوع",
        "created_at": "2026-10-27T09:00:00.000Z",
        "created_by": "66f1a2b3c4d5e6f7a8b9c0d2"
      }
    ]
  }
}
```

> `data.notes` = **كل** الملاحظات بعد الإضافة، مش الملاحظة الجديدة بس.

- `400` لو `text` فاضي: `Note text is required`
- `404` لو العميل مش موجود

### حذف
```http
DELETE /api/admin/reports/operations/:id/notes/:noteIndex      → reports:view
```

🔴 **`noteIndex` هو الـ index في المصفوفة (0-based)** — مش `_id`.
لأن الملاحظات معرّفة `{ _id: false }`.

```
notes[0] → noteIndex = 0
notes[1] → noteIndex = 1
```

> ⚠️ **خطر:** لو حد تاني ضاف ملاحظة، الـ indexes بتتغيّر. عشان كده بعد أي إضافة/حذف **اعتمد على `data.notes` الراجعة** وابني منها الـ UI، ومتعملش حذف بالـ index القديم.

**200** → `data.notes` (بعد الحذف)
**404** → `Note not found`
**400** → `noteIndex must be a non-negative integer`

### UX
- Timeline بالملاحظات، الأحدث تحت أو فوق (اختار واحد وثبّت عليه).
- كل ملاحظة: النص + التاريخ + اسم الكاتب (محتاج تجيب الأدمن من `GET /api/admin/admins` وتعمل map بالـ `created_by`).
- زرار 🗑️ لكل ملاحظة + تأكيد.

---

## 5) تقرير العملاء (ملخّص)

```http
GET /api/admin/reports/clients      → reports:view
```

**200**
```json
{
  "data": {
    "total": 48,
    "by_status": [
      { "_id": "active", "count": 31 },
      { "_id": "pending", "count": 13 },
      { "_id": "suspended", "count": 4 }
    ],
    "by_operation_status": [
      { "_id": "sales", "count": 20 },
      { "_id": "delivered", "count": 15 }
    ],
    "by_section": [
      { "section_id": "…", "key": "hero", "name": "Hero", "count": 30 }
    ],
    "clients_without_sections": 3
  }
}
```

- `_id` في `by_status` و `by_operation_status` هو القيمة نفسها.
- `clients_without_sections` = عملاء معندهمش أي سيكشن — **مهم**، اعرضهم كتنبيه.

### UX
- 3 donut charts + alert:
  > ⚠️ **3** عملاء مالهمش أقسام — [راجعهم](/clients)

---

## 6) الصلاحيات

| الإجراء | الصلاحية |
|---|---|
| كل حاجة في الملف ده | **`reports:view`** |

> مفيش granularity هنا. لو محتاج `reports:edit` منفصلة، اطلبها.

---

## 7) كود

```js
// api/reports.js
import { api } from "./axios";
const d = (r) => r.data.data;

export const listOperationReports = () => api.get("/api/admin/reports/operations").then(d);
export const getOperationReport   = (id) => api.get(`/api/admin/reports/operations/${id}`).then(d);
export const updateOperationStatus = (id, body) =>
  api.patch(`/api/admin/reports/operations/${id}/status`, body).then(d);
export const addOperationNote = (id, text) =>
  api.post(`/api/admin/reports/operations/${id}/notes`, { text }).then(d);
export const deleteOperationNote = (id, noteIndex) =>
  api.delete(`/api/admin/reports/operations/${id}/notes/${noteIndex}`).then(d);
export const getClientsReport = () => api.get("/api/admin/reports/clients").then(d);
```

---

## 8) ❌ أخطاء شائعة

1. **تبعث `noteIndex` = `_id`** → 404 أو حذف الملاحظة الغلط.
2. **تحفظ `notes` في state منفصل** بعد الإضافة → استخدم الـ `data.notes` الراجعة.
3. **تفتكر `payments_count` = عدد المعتمد** → لأ، عدد كل المدفوعات.
4. **تفلتر من السيرفر** — الـ endpoint مش بيقبل فلاتر. الفلترة في الفرونت.

---

**التالي:** [08-financial-reports.md](./08-financial-reports.md)
