# 08 — التقارير المالية (Financial Reports)

**الصلاحية:** `financial_reports:view` — لكل الـ endpoints
**المسار:** `/reports/financial`

> كل الأرقام هنا مبنية على **المدفوعات المعتمدة** (`status: "approve"`) إلا لو مكتوب غير كده.
> كل الـ endpoints بتقبل `from` / `to` (ISO date) اختياريين.

---

## 0) الـ Endpoints — نظرة سريعة

| Endpoint | بيرجع إيه |
|---|---|
| `GET /summary` | ملخّص عام: إيراد، معلّق، مرفوض، collection rate |
| `GET /monthly` | الإيراد الشهري |
| `GET /by-section` | توزيع الإيراد على الأقسام |
| `GET /by-sales-agent` | توزيع الإيراد على مندوبي المبيعات |
| `GET /pending` | الدفعات المعلّقة + عمرها بالأيام |
| `GET /by-category` | ⚠️ **deprecated** — نفس `/by-section` بالظبط |

> استخدم `/by-section`. `/by-category` موجود للتوافق القديم بس.

---

## 1) الملخّص

```http
GET /api/admin/financial-reports/summary?from=&to=
```

**200**
```json
{
  "success": true,
  "message": "Financial summary retrieved",
  "data": {
    "currency": "EGP",
    "revenue": {
      "approved": 42000,
      "pending": 9000,
      "rejected": 1500,
      "total_invoiced": 51000
    },
    "payments": {
      "approved_count": 24,
      "pending_count": 6,
      "rejected_count": 1,
      "average_payment": 1750
    },
    "collection_rate": 82.35,
    "mrr_last_30_days": 12500,
    "active_clients": 31,
    "total_clients": 48,
    "pending_payments": { "count": 6, "total": 9000 },
    "range": { "from": "2026-01-01", "to": "2026-10-27" }
  }
}
```

### معاني الحقول

| الحقل | الحساب |
|---|---|
| `revenue.approved` | مجموع `amount` للمدفوعات `approve` |
| `revenue.pending` | مجموع `amount` للمدفوعات `pending` |
| `revenue.rejected` | مجموع `amount` للمدفوعات `reject` |
| `revenue.total_invoiced` | `approved + pending` |
| `payments.average_payment` | `approved / approved_count` (0 لو مفيش) |
| `collection_rate` | `approved / (approved + pending) × 100` — نسبة التحصيل % |
| `mrr_last_30_days` | إيراد **آخر 30 يوم** معتمد — **مش متأثر بـ from/to** |
| `pending_payments` | كل المدفوعات المعلّقة في النظام (مش متأثرة بالفلتر) |
| `range` | الفلتر اللي اتبعت (أو `null`) |

> ⚠️ `mrr_last_30_days` و `pending_payments` **ثابتين** ومش متأثرين بـ `from`/`to`.
> لو عايزهم ضمن الفترة → استخدم `/monthly` أو `/pending`.

### UX
- 4 KPI: الإيراد المعتمد · المعلّق · نسبة التحصيل · متوسط الدفعة
- Progress bar لنسبة التحصيل.
- Date range picker فوق → يغذّي كل التابات.

---

## 2) الإيراد الشهري

```http
GET /api/admin/financial-reports/monthly?year=2026&from=&to=
```

| Query | ملاحظات |
|---|---|
| `year` | لو موجود، **بيتغلب** على `from`/`to` |
| `from` / `to` | لو مفيش `year` |

**200**
```json
{
  "data": {
    "currency": "EGP",
    "months": [
      { "month": "2026-08", "count": 5, "total": 7500 },
      { "month": "2026-09", "count": 8, "total": 14000 },
      { "month": "2026-10", "count": 6, "total": 9000 }
    ]
  }
}
```

- `month` بصيغة `YYYY-MM`.
- الشهور اللي مفيهاش بيانات **مش بترجع** — املأ الفجوات بـ `0` في الشارت.
- بيرجع `approve` بس.

### UX
- Line/Bar chart.
- Dropdown للسنة (آخر 3 سنين).

---

## 3) الإيراد حسب القسم

```http
GET /api/admin/financial-reports/by-section?from=&to=
```

**200**
```json
{
  "data": {
    "currency": "EGP",
    "sections": [
      {
        "section_id": "66f2b3c4d5e6f7a8b9c0d1e2",
        "key": "hero",
        "name": "Hero",
        "clients_count": 10,
        "payments_count": 20,
        "total": 25000
      },
      {
        "section_id": null,
        "key": null,
        "name": "No section",
        "clients_count": 2,
        "payments_count": 3,
        "total": 3000
      }
    ]
  }
}
```

### ⚠️ تحذير مهم للعرض
> **مجموع الصفوف مش لازم يساوي الإيراد الكلي.**
> العميل اللي عنده أكتر من سيكشن بيتحسب في **كل** واحد منهم.
> لازم تحط ملاحظة صغيرة تحت الشارت: "العميل اللي عنده أكتر من قسم بيتحسب في كل قسم."

- `name: "No section"` و `section_id: null` → عملاء مالهمش أقسام. اعرضهم بلون رمادي.

---

## 4) الإيراد حسب مندوب المبيعات

```http
GET /api/admin/financial-reports/by-sales-agent?from=&to=
```

**200**
```json
{
  "data": {
    "currency": "EGP",
    "sales_agents": [
      {
        "sales_agent_id": "66f1a2b3c4d5e6f7a8b9c0d2",
        "name": "Sales Agent",
        "count": 12,
        "total": 24000
      },
      {
        "sales_agent_id": null,
        "name": "Unassigned",
        "count": 4,
        "total": 6000
      }
    ]
  }
}
```

- المصدر: `client.sales_agent_id` (مش `sale.sales_agent_id`).
- `name: "Unassigned"` → عملاء من غير مندوب.

### UX
- Horizontal bar chart، مرتب تنازلي (السيرفر مرتب أصلًا).

---

## 5) الدفعات المعلّقة

```http
GET /api/admin/financial-reports/pending
```

> **مفيش `from`/`to`** — بيرجع كل المعلّق.

**200**
```json
{
  "data": {
    "currency": "EGP",
    "count": 6,
    "total": 9000,
    "payments": [
      {
        "_id": "…",
        "reference": "WEGZ-M3KA1B-583",
        "client_id": { "_id": "…", "company_name": "مطعم النور", "email": "…", "subdomain": "alnoor", "status": "pending" },
        "amount": 1500,
        "date": "2026-10-20T00:00:00.000Z",
        "method": "bank_transfer",
        "payment_cycle": "monthly",
        "notes": "…",
        "age_days": 7
      }
    ]
  }
}
```

### UX
- جدول مرتب بـ `date` تصاعدي (الأقدم الأول).
- عمود **العمر**: `age_days` مع لون:
  - `0–7` 🟢
  - `8–30` 🟡
  - `31+` 🔴
- زرار "اعتماد" لكل صف → `POST /api/admin/payments/:id/approve` (لو عنده `payments:edit`).

---

## 6) الفلاتر المشتركة

```
[ من تاريخ ] [ إلى تاريخ ]  [ السنة ▾ ]  [ تحديث ]
```

- `from` / `to` بيأثروا على: `summary` · `monthly` · `by-section` · `by-sales-agent`
- **مش** بيأثروا على: `mrr_last_30_days` · `pending_payments` (في summary) · `pending`
- `year` بيأثر على `monthly` بس وبيتغلب على `from`/`to`.

---

## 7) الصلاحيات

| الإجراء | الصلاحية |
|---|---|
| كل حاجة في الملف ده | `financial_reports:view` |

---

## 8) كود

```js
// api/financial.js
import { api } from "./axios";
const d = (r) => r.data.data;

export const financialSummary = (params) =>
  api.get("/api/admin/financial-reports/summary", { params }).then(d);
export const monthlyRevenue = (params) =>
  api.get("/api/admin/financial-reports/monthly", { params }).then(d);
export const revenueBySection = (params) =>
  api.get("/api/admin/financial-reports/by-section", { params }).then(d);
export const revenueByAgent = (params) =>
  api.get("/api/admin/financial-reports/by-sales-agent", { params }).then(d);
export const pendingPayments = () =>
  api.get("/api/admin/financial-reports/pending").then(d);
```

---

## 9) ❌ أخطاء شائعة

1. **تجمع صفوف `by-section` وتقول ده الإيراد الكلي** → غلط (double counting).
2. **تستخدم `/by-category`** → deprecated، استخدم `/by-section`.
3. **تفتكر `mrr_last_30_days` بيتأثر بالفلتر** → لأ.
4. **تنسى تملأ الشهور الناقصة** في `monthly` → الشارت هيبان مقطوع.
5. **تستخدم `client.sales_agent_id` كـ مندوب الـ Sale** → التقارير المالية بتعتمد على مندوب العميل مش الصفقة.

---

**التالي:** [09-admins-permissions.md](./09-admins-permissions.md)
