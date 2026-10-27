# 04 — الأقسام (Sections)

**الصلاحية:** `sections:view` (عرض) · `sections:add` · `sections:edit` · `sections:delete`
**المسار:** `/sections`

> الـ Section = مكوّن في موقع العميل (Hero / Header / Footer / Announcement / Testimonials / Contact ...).
> العميل بيتخصص له **أكتر من Section**، وكل Section ممكن يكون عند أكتر من عميل.

---

## 1) شكل الـ Section

```json
{
  "_id": "66f2b3c4d5e6f7a8b9c0d1e2",
  "key": "hero",
  "name": "Hero",
  "ar_name": "الهيرو",
  "description": "السيكشن الرئيسي في أعلى الصفحة",
  "icon": "layout-top",
  "status": "active",
  "order": 1,
  "clients_count": 12,
  "createdAt": "2026-09-01T00:00:00.000Z",
  "updatedAt": "2026-09-01T00:00:00.000Z"
}
```

| الحقل | نوع | ملاحظات |
|---|---|---|
| `key` | string | **unique** · lowercase · بيتولد أوتوماتيك من `name` لو مش بعته |
| `name` | string | إجباري |
| `ar_name` | string | اختياري |
| `description` | string | اختياري |
| `icon` | string | اختياري (اسم أيقونة أو emoji) |
| `status` | `active` \| `inactive` | افتراضي `active` |
| `order` | number | للترتيب · افتراضي `آخر order + 1` |
| `clients_count` | number | **محسوب** — عدد العملاء اللي عندهم السيكشن ده |

---

## 2) القائمة

```http
GET /api/admin/sections?status=&search=&with_counts=true
Authorization: Bearer <token>
```

| Query | ملاحظات |
|---|---|
| `status` | `active` \| `inactive` |
| `search` | في `name` + `ar_name` + `key` |
| `with_counts` | `true` أو `1` → يضيف `clients_count` لكل سيكشن |

**200**
```json
{
  "success": true,
  "message": "Sections retrieved",
  "data": {
    "sections": [ /* ... */ ],
    "total": 8
  }
}
```

- الترتيب: `order` تصاعدي، ثم `name`.
- **مفيش pagination** — العدد صغير بطبيعته.

### الأعمدة

| # | الأيقونة | الاسم | الـ Key | الحالة | العملاء | ترتيب | إجراءات |
|---|---|---|---|---|---|---|---|
| 1 | 🧩 | الهيرو<br><small>Hero</small> | `hero` | 🟢 نشط | 12 | 1 | ✏️ 🗑️ |

### UX
- **Drag & drop** لإعادة الترتيب → `PATCH /:id` بـ `{ order }` لكل عنصر متغيّر.
- Toggle الحالة → `PATCH /:id` بـ `{ status: "active" | "inactive" }`.
- `clients_count` قابل للضغط → `/sections/:id` (قائمة العملاء).

---

## 3) تفاصيل سيكشن

```http
GET /api/admin/sections/:id?include_clients=true
```

**200**
```json
{
  "data": {
    "section": { /* ... */ },
    "clients_count": 12,
    "clients": [
      { "_id": "…", "company_name": "مطعم النور", "email": "…", "subdomain": "alnoor", "status": "active", "operation_status": "sales" }
    ]
  }
}
```

> `clients` بترجع **بس** لو `include_clients=true` أو `1`.

### قائمة عملاء السيكشن (endpoint منفصل)

```http
GET /api/admin/sections/:id/clients
```
```json
{
  "data": {
    "section": { /* ... */ },
    "clients": [ /* ... + sections populated */ ],
    "count": 12
  }
}
```

---

## 4) إضافة سيكشن

```http
POST /api/admin/sections          → sections:add
Content-Type: application/json
```

```json
{
  "name": "المنتجات",
  "key": "products",
  "ar_name": "المنتجات",
  "description": "سيكشن عرض المنتجات",
  "icon": "shopping-bag",
  "status": "active",
  "order": 5
}
```

| الحقل | إجباري |
|---|---|
| `name` | ✅ |
| `key` | ❌ — بيتولد من `name` |
| `ar_name`, `description`, `icon`, `status`, `order` | ❌ |

**201**
```json
{ "success": true, "message": "Section created", "data": { "section": { /* ... */ } } }
```

### الـ key بيتولد إزاي
```
name = "المنتجات"  →  key = "المنتجات"  (بيسمح عربي)
name = "My Section!" → key = "my-section"
name = "!!!"        → key = "section"
```

> لو `key` مستخدم → `409 Section key already exists`.

### UX
- حقل `key` فيه placeholder: "هيتولد تلقائيًا من الاسم".
- لو المستخدم كتبه، اعرضه lowercase وأزل أي حرف مش `a-z0-9-` قبل الإرسال (تحسين UX بس — السيرفر بيعملها كمان).

---

## 5) تعديل سيكشن

```http
PATCH /api/admin/sections/:id     → sections:edit
```

نفس الحقول، كلهم اختياريين.

- `key` لو اتبعت → بيتعمل له slugify تاني + فحص التكرار (`409`)
- `name` لو اتبعت فاضي → `400 name cannot be empty`
- `ar_name: null` أو `""` → بيمسح القيمة
- `order` → `Number(order) || 0`

**200** → `data.section`

---

## 6) حذف سيكشن

```http
DELETE /api/admin/sections/:id            → sections:delete
DELETE /api/admin/sections/:id?force=true → sections:delete
```

### لو السيكشن مستخدم
```json
{
  "success": false,
  "message": "Section is used by 12 client(s). Pass force=true to remove it from them."
}
```
→ `409`

### لو `force=true`
- بيشيل السيكشن من **كل** العملاء الأول (`$pull`)
- ثم بيحذفه

**200**
```json
{
  "success": true,
  "message": "Section deleted",
  "data": { "clients_affected": 12 }
}
```

### UX إجباري
1. لو `409` → اعرض Dialog:
   > "السيكشن ده مستخدم في **12 عميل**. لو حذفته هيشيل من كلهم. متأكد؟"
   > [إلغاء] [حذف وإزالته من 12 عميل]
2. لو المستخدم أكّد → نفس الـ request بـ `?force=true`.
3. بعد النجاح → Toast: "اتحذف، واتشال من 12 عميل".

> ⚠️ **متخليش** الحذف بـ `force=true` من أول ضغطة. لازم تأكيد صريح بعد ما تعرف العدد.

---

## 7) جدول الصلاحيات

| الإجراء | الصلاحية |
|---|---|
| دخول الصفحة | `sections:view` |
| إضافة | `sections:add` |
| تعديل / تغيير الحالة / الترتيب | `sections:edit` |
| حذف | `sections:delete` |
| عرض عملاء السيكشن | `sections:view` |

---

## 8) كود

```js
// api/sections.js
import { api } from "./axios";
const d = (r) => r.data.data;

export const listSections   = (params) => api.get("/api/admin/sections", { params }).then(d);
export const getSection     = (id, params) => api.get(`/api/admin/sections/${id}`, { params }).then(d);
export const sectionClients = (id) => api.get(`/api/admin/sections/${id}/clients`).then(d);
export const createSection  = (body) => api.post("/api/admin/sections", body).then(d);
export const updateSection  = (id, b) => api.patch(`/api/admin/sections/${id}`, b).then(d);
export const deleteSection  = (id, force = false) =>
  api.delete(`/api/admin/sections/${id}`, { params: force ? { force: true } : {} }).then(d);
```

---

## 9) ❌ أخطاء شائعة

1. **تنسى `with_counts=true`** → `clients_count` هيفضل `0` لكل سيكشن.
2. **تحذف بـ `force=true` من أول مرة** → المستخدم مش هيعرف إنه أثّر على عملاء.
3. **تعرض `key` بالعربي** — مسموح، بس اللوجو/الـ URL بيحتاج ASCII، فخلّي الـ `key` إنجليزي في الفورم.
4. **تستخدم `status: "inactive"` كفلتر في صفحة العملاء** — ده فلتر للحالة بس، مش للسيكشن.

---

**التالي:** [05-sales.md](./05-sales.md)
