# 02 — الرئيسية / لوحة التحكم

**الصلاحية:** `dashboard:view`
**المسار:** `/`

---

## Endpoint

```http
GET /api/admin/dashboard
Authorization: Bearer <token>
```

## Response — 200

```json
{
  "success": true,
  "message": "Dashboard stats retrieved",
  "data": {
    "clients": {
      "total": 48,
      "active": 31,
      "suspended": 4,
      "pending": 13,
      "failed_provisioning": 2
    },
    "admins":   { "total": 5 },
    "sections": { "total": 8 },
    "finance": {
      "currency": "EGP",
      "revenue_last_30_days": 42500,
      "pending_payments": { "count": 6, "total": 18000 }
    },
    "sales_last_30_days": { "count": 9, "total": 61500 },
    "recent_clients": [
      {
        "_id": "66f2b3c4d5e6f7a8b9c0d1e2",
        "company_name": "مطعم النور",
        "email": "owner@alnoor.com",
        "subdomain": "alnoor",
        "status": "pending",
        "createdAt": "2026-10-25T09:12:00.000Z"
      }
    ],
    "generated_at": "2026-10-27T08:00:00.000Z"
  }
}
```

> `recent_clients` بيرجع **آخر 5 عملاء** بس.

---

## الـ Layout المقترح

### الصف الأول — 4 KPI cards

| Card | القيمة | ملاحظة |
|---|---|---|
| إجمالي العملاء | `clients.total` | + sub-line: `active` نشط · `pending` قيد الانتظار |
| إيراد آخر 30 يوم | `finance.revenue_last_30_days` + `finance.currency` | |
| مبيعات آخر 30 يوم | `sales_last_30_days.total` | + sub-line: `sales_last_30_days.count` صفقة |
| مدفوعات معلّقة | `finance.pending_payments.total` | + sub-line: `count` دفعة — **لينك لـ `/payments?status=pending`** |

### الصف التاني

- **Donut**: حالة العملاء (`active` / `pending` / `suspended`).
- **Alert** (لو `clients.failed_provisioning > 0`):
  > ⚠️ فيه **{n}** عميل فشل تجهيزهم — [راجعهم](/clients?provisioning=failed)

### الصف التالت

- **جدول "أحدث العملاء"** — من `recent_clients`:

| الشركة | Subdomain | الحالة | تاريخ الإضافة | |
|---|---|---|---|---|
| مطعم النور | alnoor | 🟡 قيد الانتظار | 25 أكتوبر | [عرض](/clients/:id) |

- **روابط سريعة**: الأقسام · المدفوعات المعلّقة · تقارير التشغيل.

---

## ملاحظات مهمة

1. **مفيش فلترة بالتاريخ** في الـ dashboard — الـ `revenue_last_30_days` ثابتة على 30 يوم.
   لو عايز فترة مخصّصة → استخدم `/api/admin/financial-reports/summary?from=&to=`.
2. `sales_last_30_days` و `revenue_last_30_days` **مش نفس الحاجة**:
   - revenue = مدفوعات **معتمدة** (`status: "approve"`)
   - sales = عقود/صفقات بقيمة `total` (مش مدفوعات)
3. **الـ Dashboard مش scoped بـ warehouse** — ده super admin، بيشوف كل حاجة.
4. `generated_at` للكاش/التوقيت — اعرضه كـ "آخر تحديث".

---

## الكود

```js
// api/dashboard.js
import { api } from "./axios";
export const getDashboard = () =>
  api.get("/api/admin/dashboard").then((r) => r.data.data);
```

```jsx
function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard });
  if (isLoading) return <DashboardSkeleton />;
  // ...
}
```

> **متعملش poll** كل ثانية. `refetchInterval: 60_000` كفاية، أو زرار "تحديث".

---

**التالي:** [03-clients.md](./03-clients.md)
