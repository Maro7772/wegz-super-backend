# 06 — المدفوعات (Payments)

**الصلاحية:** `payments:view` · `payments:add` · `payments:edit` · `payments:delete`
**المسار:** `/payments`

> **Payment = فلوس اتدفعت فعلًا.** ممكن تكون مرتبطة بـ Sale أو لأ.
> اعتماد الدفعة (`approve`) هو اللي **بيفعّل العميل** ويحدّث بياناته المالية.

---

## 1) شكل الـ Payment

```json
{
  "_id": "66f5b2c3d4e5f6a7b8c9d0e1",
  "reference": "WEGZ-M3KA1B-583",
  "client_id": { "_id": "…", "company_name": "مطعم النور", "email": "…", "subdomain": "alnoor", "status": "pending" },
  "sale_id": { "_id": "…", "sale_no": "SAL-M3K9X2-427", "total": 2500, "status": "pending" },
  "amount": 1500,
  "currency": "EGP",
  "date": "2026-10-25T00:00:00.000Z",
  "status": "pending",
  "method": "bank_transfer",
  "payment_cycle": "monthly",
  "screenshot": null,
  "notes": "تحويل بنكي",
  "rejection_reason": null,
  "reviewed_by": null,
  "reviewed_at": null,
  "created_by": "…",
  "createdAt": "2026-10-25T10:00:00.000Z",
  "updatedAt": "2026-10-25T10:00:00.000Z"
}
```

| الحقل | ملاحظات |
|---|---|
| `reference` | **بيتولد أوتوماتيك** `${INVOICE_PREFIX}-XXXXXX-NNN` — متبعتهوش |
| `status` | `pending` \| **`approve`** \| **`reject`** |
| `method` | `cash` `bank_transfer` `card` `wallet` `cheque` `other` — افتراضي `bank_transfer` |
| `sale_id` | اختياري |

> 🔴 **`approve` و `reject` — مش `approved` و `rejected`.**
> لو كتبت `approved` في أي فلتر → مفيش نتايج، وفي الـ create → `400`.

---

## 2) القائمة

```http
GET /api/admin/payments?client_id=&status=&method=&from=&to=&search=&page=&limit=
Authorization: Bearer <token>
```

| Query | ملاحظات |
|---|---|
| `client_id` | ObjectId — بيتجاهل لو غلط |
| `status` | `pending` \| `approve` \| `reject` |
| `method` | enum فوق |
| `from` / `to` | ISO date — على `date` |
| `search` | بيدوّر في **`reference`** بس |
| `page` | افتراضي `1` |
| `limit` | افتراضي `20` — أقصى **200** |

**200**
```json
{
  "success": true,
  "message": "Payments retrieved",
  "data": {
    "payments": [ /* ... */ ],
    "summary": [
      { "_id": "pending", "count": 6, "total": 9000 },
      { "_id": "approve", "count": 24, "total": 42000 },
      { "_id": "reject",  "count": 1, "total": 1500 }
    ],
    "currency": "EGP",
    "pagination": { "total": 31, "page": 1, "limit": 20, "pages": 2 }
  }
}
```

> `summary` محسوب على **نفس الفلتر** — يعني لو فلترت `status=pending`، الـ summary هيبقى فيه صف واحد بس.

### الـ Layout
- **3 KPI cards** فوق من `summary`: معلّق / معتمد / مرفوض (count + total).
- **Tabs** أو **chips**: الكل · معلّق · معتمد · مرفوض.
- جدول:

| # Reference | العميل | المبلغ | الطريقة | الدورة | التاريخ | الحالة | مراجعة | إجراءات |
|---|---|---|---|---|---|---|---|---|
| `WEGZ-M3KA1B-583` | مطعم النور | 1,500 | تحويل بنكي | شهري | 25 أكتوبر | 🟡 معلّق | — | ✅ ❌ 🗑️ |

- للمعتمد: `reviewed_by.name` + `reviewed_at`.
- للمرفوض: `rejection_reason` في tooltip.

---

## 3) تفاصيل دفعة

```http
GET /api/admin/payments/:id
```
**200** → `data.payment` (client + sale + reviewed_by populated)

- اعرض `screenshot` لو موجود في Lightbox.
- `404` → `Payment not found`

---

## 4) إضافة دفعة

```http
POST /api/admin/payments          → payments:add
```

| الحقل | إجباري | نوع | ملاحظات |
|---|---|---|---|
| `client_id` | ✅ | ObjectId | لازم موجود |
| `amount` | ✅ | number ≥ 0 | |
| `sale_id` | ❌ | ObjectId | لازم موجود لو اتبعت |
| `currency` | ❌ | string | افتراضي `env.CURRENCY` |
| `date` | ❌ | ISO date | افتراضي `now` |
| `status` | ❌ | enum | افتراضي `pending` |
| `method` | ❌ | enum | افتراضي `bank_transfer` |
| `payment_cycle` | ❌ | enum | افتراضي `client.payment_cycle` أو `monthly` |
| `reference` | ❌ | string | **unique** — لو مش بعت بيتولد |
| `screenshot` | ❌ | string | Base64 أو URL |
| `notes` | ❌ | string | |

```json
{
  "client_id": "66f2b3c4d5e6f7a8b9c0d1e2",
  "sale_id": "66f4a1b2c3d4e5f6a7b8c9d0",
  "amount": 1500,
  "date": "2026-10-25",
  "method": "bank_transfer",
  "payment_cycle": "monthly",
  "notes": "تحويل بنكي — إيصال 4821"
}
```

**201** → `data.payment`

### ⚠️ لو بعت `status: "approve"` في الـ create
الـ backend **هيعتمدها فورًا** ويطبّق كل الآثار (تفعيل العميل + تحديث المالية + Sale → paid).
متعملهاش من فورم عادي إلا لو المستخدم **قاصد** — الأفضل دايمًا `pending` وبعدين approve منفصل.

### أخطاء
| كود | السبب |
|---|---|
| `400` | `client_id is required` |
| `400` | `amount is required and must be >= 0` |
| `400` | `status must be one of: pending, approve, reject` |
| `404` | `Client not found` / `Sale not found` |
| `409` | `reference` مكرر |

---

## 5) اعتماد دفعة (Approve) ⭐

```http
POST /api/admin/payments/:id/approve      → payments:edit
```

**200**
```json
{
  "success": true,
  "message": "Payment approved",
  "data": { "payment": { /* status: "approve" */ }, "client": { /* محدّث */ } }
}
```

### اللي بيحصل تلقائيًا
1. `payment.status = "approve"` + `reviewed_by` + `reviewed_at`
2. لو العميل `status === "pending"` → **بيتحول `active`**
3. `client.payment_cycle` = `payment.payment_cycle` (لو قيمة صالحة)
4. `client.payment_amount` = `payment.amount`
5. `client.last_payment_date` = `payment.date`
6. لو `sale_id` موجود → الـ Sale بيتحول **`paid`**

### قيود
- لو الدفعة **مش** `pending` → `400 Payment is already approve`
- مفيش "un-approve". الغلط = reject جديد أو refund يدوي.

### UX
- زرار ✅ في القائمة → ConfirmDialog:
  > "اعتماد دفعة **1,500 EGP** من **مطعم النور**؟
  > هيتفعّل العميل (لو معلّق) وهيتحدّث سجله المالي."
- بعد النجاح → Toast + refresh للقائمة والـ summary.
- **لو العميل كان `pending`** → Toast إضافي: "العميل اتفعّل ✅"

---

## 6) رفض دفعة (Reject)

```http
POST /api/admin/payments/:id/reject      → payments:edit
Content-Type: application/json

{ "reason": "الإيصال مش واضح" }
```

- `reason` اختياري (بيتقبل `reason` أو `rejection_reason`).
- `200` → `data.payment`
- `400` لو مش `pending`

### UX
- Modal فيه **textarea** للسبب (إجباري في الفرونت، اختياري في السيرفر).
- "السبب هيظهر للعميل" — عشان كده خليه واضح.

---

## 7) حذف دفعة

```http
DELETE /api/admin/payments/:id      → payments:delete
```

| حالة الدفعة | النتيجة |
|---|---|
| `pending` | ✅ بتتمسح |
| `reject` | ✅ بتتمسح |
| `approve` | ❌ `400 Approved payments cannot be deleted. Reject/refund instead.` |

> ⚠️ **الفرونت لازم يخفي زرار الحذف** للدفعات المعتمدة. لو ظهر → المستخدم هيدوس وياخد 400.

**200** → `{ "message": "Payment deleted" }`

---

## 8) الصلاحيات

| الإجراء | الصلاحية |
|---|---|
| دخول الصفحة / القائمة / التفاصيل | `payments:view` |
| إضافة دفعة | `payments:add` |
| **اعتماد / رفض** | **`payments:edit`** |
| حذف | `payments:delete` |

> مفيش `payments:approve` منفصلة — الاعتماد والرفض تحت `payments:edit`.

---

## 9) كود

```js
// api/payments.js
import { api } from "./axios";
const d = (r) => r.data.data;

export const listPayments   = (params) => api.get("/api/admin/payments", { params }).then(d);
export const getPayment     = (id) => api.get(`/api/admin/payments/${id}`).then(d);
export const createPayment  = (body) => api.post("/api/admin/payments", body).then(d);
export const approvePayment = (id) => api.post(`/api/admin/payments/${id}/approve`).then(d);
export const rejectPayment  = (id, reason) =>
  api.post(`/api/admin/payments/${id}/reject`, { reason }).then(d);
export const deletePayment  = (id) => api.delete(`/api/admin/payments/${id}`).then(d);
```

---

## 10) ❌ أخطاء شائعة

1. **`approved` بدل `approve`** → صفر نتايج / 400.
2. **تعرض زرار حذف للدفعة المعتمدة** → 400.
3. **تعرض زرار approve لدفعة مش pending** → 400 `already approve`.
4. **تفلتر الـ summary من الفرونت** بدل ما تستخدم `data.summary` → هيبقى غلط لو فيه pagination.
5. **تنسى تعمل refresh للعميل بعد approve** → هيفضل باين `pending` في صفحة العملاء.

---

**التالي:** [07-operation-reports.md](./07-operation-reports.md)
