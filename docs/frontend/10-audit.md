# 10 — سجل التدقيق (Audit Log)

**الصلاحية:** `audit:view`
**المسار:** `/audit`

> كل عملية مهمة في النظام بتتسجل هنا أوتوماتيك من الـ backend.
> الفرونت **بيقرأ بس** — مفيش إضافة أو حذف أو تعديل.

---

## 1) شكل السجل

```json
{
  "_id": "66f6c3d4e5f6a7b8c9d0e1f2",
  "admin_id": { "_id": "66f1a2b3c4d5e6f7a8b9c0d2", "name": "Sales Agent", "email": "sales1@wegz.org" },
  "action": "client.create",
  "target_type": "Client",
  "target_id": "66f2b3c4d5e6f7a8b9c0d1e2",
  "metadata": { "email": "owner@alnoor.com", "subdomain": "alnoor" },
  "ip": "197.45.12.8",
  "createdAt": "2026-10-25T09:12:00.000Z"
}
```

| الحقل | ملاحظات |
|---|---|
| `admin_id` | **populated** بـ `name` + `email`. ممكن يكون `null` لو العملية من النظام |
| `action` | `resource.verb` — مثال `client.create` |
| `target_type` | `Client` · `Section` · `Sale` · `Payment` · `SuperAdmin` |
| `target_id` | ObjectId للعنصر |
| `metadata` | object حر — **مختلف لكل action** |
| `ip` | IP اللي عمل العملية |
| `createdAt` | وقت العملية |

---

## 2) القائمة

```http
GET /api/admin/audit?admin_id=&action=&target_type=&target_id=&from=&to=&page=&limit=
Authorization: Bearer <token>
```

| Query | ملاحظات |
|---|---|
| `admin_id` | ObjectId |
| `action` | **prefix match** — `client` هيرجع `client.create` + `client.delete` + ... |
| `target_type` | مطابقة تامة |
| `target_id` | ObjectId |
| `from` / `to` | ISO date — على `createdAt` |
| `page` | افتراضي `1` |
| `limit` | افتراضي **`50`** — أقصى **200** |

**200**
```json
{
  "success": true,
  "message": "Audit logs retrieved",
  "data": {
    "logs": [ /* ... */ ],
    "pagination": { "page": 1, "limit": 50, "total": 1240, "totalPages": 25 }
  }
}
```

> ⚠️ اسم الحقل `totalPages` (camelCase) — مش `pages` زي باقي الـ endpoints.

### الأعمدة

| التاريخ | المشرف | العملية | العنصر | IP | التفاصيل |
|---|---|---|---|---|---|
| 25 أكتوبر 09:12 | Sales Agent | `client.create` | Client | 197.45.12.8 | ▸ |

- **العملية**: Badge بلون حسب النوع (`create` أخضر · `update` أزرق · `delete` أحمر).
- **التفاصيل**: زرار يفتح Modal فيه `metadata` كـ pretty JSON.

---

## 3) كل الـ actions المسجّلة

استخدم الجدول ده للفلتر أو للألوان:

| Action | معناه |
|---|---|
| `auth.login` | تسجيل دخول |
| `client.create` | إنشاء عميل |
| `client.update` | تعديل عميل |
| `client.delete` | حذف سجل عميل |
| `client.suspend` | إيقاف عميل |
| `client.activate` | تفعيل عميل |
| `client.apikey.regenerate` | تجديد API key |
| `client.reset_admin_password` | إعادة تعيين باسورد الأدمن |
| `client.rebuild_frontend` | إعادة بناء الفرونت |
| `client.retry_provisioning` | إعادة تشغيل التجهيز |
| `section.create` / `.update` / `.delete` | الأقسام |
| `sale.create` / `.update` / `.delete` | المبيعات |
| `payment.create` / `.approve` / `.reject` / `.delete` | المدفوعات |
| `operation_report.update_status` | تغيير حالة من تقارير التشغيل |
| `admin.create` / `.update` / `.delete` | المشرفين |
| `admin.permissions.update` | تعديل الصلاحيات |

> ⚠️ **مفيش تسجيل لـ SSL install ولا لـ provision-now.** لو محتاجهم، اطلب إضافتهم.

---

## 4) إحصائيات

```http
GET /api/admin/audit/stats      → audit:view
```

**200**
```json
{
  "data": {
    "total": 1240,
    "last24h": 37,
    "byAction": [
      { "_id": "payment.approve", "count": 120 },
      { "_id": "client.update", "count": 85 }
    ]
  }
}
```

- `byAction` = **أعلى 20** action بعدد مراتها.
- `last24h` = عمليات آخر 24 ساعة.

### UX
- 3 KPI فوق: إجمالي · آخر 24 ساعة · أكتر عملية.
- (اختياري) Bar chart لـ `byAction`.

---

## 5) UX التفاصيل

- **فلتر سريع** فوق الجدول:
  - المشرف (dropdown من `GET /api/admin/admins`)
  - النوع (Client / Section / Sale / Payment / SuperAdmin)
  - الفترة (from/to)
  - بحث في الـ action (نص)
- **زرار "تصدير"** (CSV) — اعمله في الفرونت من الصفحة الحالية.
- **مفيش تعديل/حذف** — السجل للقراءة بس. لو محتاج تحذف، ده على مستوى الداتابيز.

---

## 6) الصلاحيات

| الإجراء | الصلاحية |
|---|---|
| القائمة + الإحصائيات | `audit:view` |

---

## 7) كود

```js
// api/audit.js
import { api } from "./axios";
const d = (r) => r.data.data;

export const listAuditLogs = (params) => api.get("/api/admin/audit", { params }).then(d);
export const auditStats    = () => api.get("/api/admin/audit/stats").then(d);
```

---

## 8) ❌ أخطاء شائعة

1. **تستخدم `data.pagination.pages`** → اسمه `totalPages` هنا.
2. **تفلتر `action` بـ `=` تام** — السيرفر بيعمل prefix match، فالفلتر بـ `client` أوسع.
3. **تفتكر `admin_id` دايماً موجود** → ممكن يكون `null` — اعرض "النظام".
4. **تحاول تعمل edit/delete** → مفيش endpoints.

---

**التالي:** [99-checklist.md](./99-checklist.md)
