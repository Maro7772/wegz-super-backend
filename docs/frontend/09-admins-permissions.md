# 09 — المشرفين والصلاحيات (Admins & Permissions)

**الصلاحية:** `admins:view` · `admins:add` · `admins:edit` · `admins:delete`
**المسار:** `/admins`

> **الصلاحيات بتتظبط من هنا بس** — مفيش صلاحيات في فورم إنشاء المستخدم.
> أي admin جديد بيتعمل بـ **صفر صلاحيات**، وبعدين تروح لتاب الصلاحيات وتديله اللي محتاجه.

---

## 1) قائمة المشرفين

```http
GET /api/admin/admins          → admins:view
Authorization: Bearer <token>
```

**200**
```json
{
  "success": true,
  "message": "Super Admins retrieved",
  "data": {
    "admins": [
      {
        "id": "66f1a2b3c4d5e6f7a8b9c0d1",
        "name": "Super Admin",
        "email": "wegz@gmail.com",
        "is_root": true,
        "status": "active",
        "permissions": [ /* 25 صلاحية */ ],
        "createdAt": "2026-09-01T00:00:00.000Z"
      },
      {
        "id": "66f1a2b3c4d5e6f7a8b9c0d2",
        "name": "Sales Agent",
        "email": "sales1@wegz.org",
        "is_root": false,
        "status": "active",
        "permissions": ["clients:view", "sales:view", "sales:add"],
        "createdAt": "2026-09-10T00:00:00.000Z"
      }
    ]
  }
}
```

> `id` مش `_id` هنا. خد بالك.

### الأعمدة

| الاسم | الإيميل | النوع | الحالة | الصلاحيات | تاريخ الإضافة | إجراءات |
|---|---|---|---|---|---|---|
| Super Admin | wegz@gmail.com | 👑 Root | 🟢 نشط | كل الصلاحيات | 1 سبتمبر | — |
| Sales Agent | sales1@wegz.org | مشرف | 🟢 نشط | 3 صلاحيات | 10 سبتمبر | ✏️ 🔐 🗑️ |

- **Root** → Badge مميز + **ممنوع** يظهر عليه تعديل/حذف (إلا لو أنت الـ root نفسه).
- **الصلاحيات** → `permissions.length` + tooltip بأول 3.

---

## 2) تفاصيل مشرف

```http
GET /api/admin/admins/:id      → admins:view
```

**200**
```json
{
  "data": {
    "admin": {
      "id": "…",
      "name": "Sales Agent",
      "email": "sales1@wegz.org",
      "is_root": false,
      "status": "active",
      "permissions": ["clients:view", "sales:view"]
    }
  }
}
```

**404** → `Super Admin not found`

---

## 3) إضافة مشرف

```http
POST /api/admin/admins          → admins:add
```

| الحقل | إجباري | قيود |
|---|---|---|
| `name` | ✅ | |
| `email` | ✅ | unique |
| `password` | ✅ | **min 6** |

```json
{ "name": "Sales Agent", "email": "sales1@wegz.org", "password": "Secret@123" }
```

**201**
```json
{
  "success": true,
  "message": "Super Admin created",
  "data": {
    "admin": {
      "id": "…", "name": "Sales Agent", "email": "sales1@wegz.org",
      "is_root": false, "status": "active"
    }
  }
}
```

> 🔴 **الـ response مابيرجعش `permissions`** — لأنها فاضية.
> بعد الإنشاء **لازم** توجّه المستخدم لتاب الصلاحيات، أو تعرض تنبيه:
> "المشرف اتعمل من غير أي صلاحية — اديله صلاحيات دلوقتي."

### أخطاء
| كود | السبب |
|---|---|
| `400` | `name, email, and password are required` |
| `400` | `password must be at least 6 characters` |
| `409` | `Email already in use` |

---

## 4) تعديل مشرف

```http
PATCH /api/admin/admins/:id     → admins:edit
```

| الحقل | ملاحظات |
|---|---|
| `name` | اختياري |
| `email` | اختياري · unique · بيتحول lowercase |
| `status` | `active` \| `inactive` — أي قيمة تانية → `400` |
| `password` | اختياري · **min 6** |

> ❌ `is_root` **مش** قابل للتعديل.
> ❌ `permissions` **مش** هنا — استخدم `PUT /admins/:id/permissions`.

### قيود
- الـ Root **مينفعش** يتعدل من حد تاني → `403 Cannot modify the root admin`
- **`status: "inactive"`** = المستخدم مش هيعرف يعمل login (`401 Account is not active`).

**200** → `data.admin`

---

## 5) حذف مشرف

```http
DELETE /api/admin/admins/:id    → admins:delete
```

| محاولة | النتيجة |
|---|---|
| حذف الـ Root | `403 Cannot delete the root admin` |
| حذف نفسك | `403 Cannot delete your own account` |
| حذف مشرف عادي | ✅ |

**200** → `{ "message": "Super Admin deleted" }`

> الحذف بيمسح صف الصلاحيات كمان. **مفيش rollback.**

### UX
- زرار الحذف مخفي للـ Root ولحسابك الحالي.
- ConfirmDialog: "حذف **Sales Agent** نهائيًا؟"

---

# 6) مصفوفة الصلاحيات ⭐

## 6.1) كتالوج الصلاحيات

```http
GET /api/admin/permissions/catalog      → admins:view
```

**200**
```json
{
  "success": true,
  "message": "Permissions catalog",
  "data": {
    "resources": [
      {
        "key": "clients",
        "label_en": "Clients",
        "label_ar": "العملاء",
        "actions": [
          { "key": "view",   "label_en": "View",   "label_ar": "عرض",  "permission": "clients:view" },
          { "key": "add",    "label_en": "Add",    "label_ar": "إضافة", "permission": "clients:add" },
          { "key": "edit",   "label_en": "Edit",   "label_ar": "تعديل", "permission": "clients:edit" },
          { "key": "delete", "label_en": "Delete", "label_ar": "حذف",   "permission": "clients:delete" }
        ],
        "permissions": ["clients:view", "clients:add", "clients:edit", "clients:delete"]
      }
    ],
    "all_permissions": [ /* الـ 25 مسطّحة */ ]
  }
}
```

> الـ `resources` بيرجع **10 موارد**. الـ `actions` بتختلف:
> - 4 موارد فيها 4 actions (`view/add/edit/delete`)
> - `reports` و `financial_reports` و `audit` و `dashboard` فيهم `view` بس
> - `provisioning` فيه `add` بس

**ابنِ الجدول من الـ `resources` ديناميكيًا** — متكتبش الـ 25 بيدك.

## 6.2) صلاحيات مشرف

```http
GET /api/admin/admins/:id/permissions      → admins:view
```

**200**
```json
{
  "data": {
    "admin": { "id": "…", "name": "Sales Agent", "email": "…", "is_root": false },
    "permissions": ["clients:view", "sales:view"]
  }
}
```

> لو `is_root: true` → بيرجع **كل الـ 25**.

## 6.3) حفظ الصلاحيات

```http
PUT /api/admin/admins/:id/permissions      → admins:edit
Content-Type: application/json

{ "permissions": ["clients:view", "sales:view", "sales:add"] }
```

- **بيستبدل الكل** (مش merge).
- `[]` = مسح كل الصلاحيات.
- السيرفر بيشيل التكرار أوتوماتيك.
- أي صلاحية غير معروفة → `400 Invalid permissions: x:y`

**200**
```json
{
  "data": { "admin_id": "…", "permissions": ["clients:view", "sales:view", "sales:add"] }
}
```

### قيود
| محاولة | النتيجة |
|---|---|
| تعديل صلاحيات **نفسك** | `403 You cannot modify your own permissions` |
| تعديل صلاحيات الـ Root (من حد تاني) | `403 Cannot modify the root admin permissions` |
| `permissions` مش مصفوفة | `400 permissions must be an array` |

> 🔴 **حتى الـ Root مينفعش يعدّل صلاحيات نفسه** من الـ endpoint ده (guard ضد privilege escalation).
> الـ Root أصلًا عنده كل حاجة ضمنيًا، فمش محتاج.

---

# 7) الـ UI المقترح — مصفوفة الصلاحيات

```
┌──────────────────────────────────────────────────────────────┐
│  صلاحيات: Sales Agent                          [Root? لا]     │
├──────────────────┬──────┬──────┬──────┬──────┬───────────────┤
│ المورد           │ عرض  │ إضافة│ تعديل│ حذف  │               │
├──────────────────┼──────┼──────┼──────┼──────┼───────────────┤
│ العملاء          │  ☑   │  ☐   │  ☐   │  ☐   │               │
│ الأقسام          │  ☐   │  ☐   │  ☐   │  ☐   │               │
│ المبيعات         │  ☑   │  ☑   │  ☐   │  ☐   │               │
│ المدفوعات        │  ☐   │  ☐   │  ☐   │  ☐   │               │
│ تقارير التشغيل   │  ☐   │  —   │  —   │  —   │               │
│ التقارير المالية │  ☐   │  —   │  —   │  —   │               │
│ المشرفين         │  ☐   │  ☐   │  ☐   │  ☐   │               │
│ سجل التدقيق      │  ☐   │  —   │  —   │  —   │               │
│ التجهيز          │  —   │  ☐   │  —   │  —   │               │
│ لوحة التحكم      │  ☐   │  —   │  —   │  —   │               │
├──────────────────┴──────┴──────┴──────┴──────┴───────────────┤
│  [تحديد الكل]  [مسح الكل]        [إلغاء]  [حفظ الصلاحيات]    │
└──────────────────────────────────────────────────────────────┘
```

### قواعد الـ UI
1. **Header row** = اتحاد كل الـ actions الموجودة (`view`, `add`, `edit`, `delete`).
2. الخانة اللي مش موجودة في المورد → **`—` مش checkbox معطّل**.
3. **مفيش "تحديد الكل" لكل الصف** (لأن مش كل مورد عنده نفس الـ actions) — "تحديد الكل" للجدول كله بس.
4. `view` **مش إجبارية** — تقدر تدّي `add` من غير `view`. الـ backend مش بيفرض تسلسل.
   > لكن ده هيخلي الـ UI غريب (يقدر يضيف ومش يقدر يشوف). **الأفضل** تحذير:
   > "المستخدم عنده إضافة من غير عرض — متأكد؟"
5. **Save** = `PUT` بالمصفوفة الكاملة المحددة.
6. بعد الحفظ → `toast` + حدّث الـ `permissions` في الـ state.

### Root
- لو `admin.is_root === true` → **الجدول read-only** وكل الـ checkboxes محددة ومعطّلة + Banner: "الـ Root عنده كل الصلاحيات تلقائيًا."

---

# 8) الصلاحيات

| الإجراء | الصلاحية |
|---|---|
| دخول صفحة المشرفين | `admins:view` |
| عرض مشرف / صلاحياته | `admins:view` |
| كتالوج الصلاحيات | `admins:view` |
| إضافة مشرف | `admins:add` |
| تعديل مشرف (بياناته / حالته / باسورده) | `admins:edit` |
| **تعديل الصلاحيات** | **`admins:edit`** |
| حذف مشرف | `admins:delete` |

---

# 9) كود

```js
// api/admins.js
import { api } from "./axios";
const d = (r) => r.data.data;

export const listAdmins    = () => api.get("/api/admin/admins").then(d);
export const getAdmin      = (id) => api.get(`/api/admin/admins/${id}`).then(d);
export const createAdmin   = (body) => api.post("/api/admin/admins", body).then(d);
export const updateAdmin   = (id, b) => api.patch(`/api/admin/admins/${id}`, b).then(d);
export const deleteAdmin   = (id) => api.delete(`/api/admin/admins/${id}`).then(d);

export const permissionsCatalog = () => api.get("/api/admin/permissions/catalog").then(d);
export const getAdminPermissions = (id) => api.get(`/api/admin/admins/${id}/permissions`).then(d);
export const setAdminPermissions = (id, permissions) =>
  api.put(`/api/admin/admins/${id}/permissions`, { permissions }).then(d);
```

---

# 10) ❌ أخطاء شائعة

1. **تضيف حقول الصلاحيات في فورم إنشاء المشرف** → الـ backend بيتجاهلها. لازم خطوة تانية.
2. **تفتكر المشرف الجديد عنده صلاحيات** → لأ، **صفر**.
3. **تستخدم `_id` بدل `id`** → الـ response بيرجع `id`.
4. **تعرض زرار "تعديل الصلاحيات" لنفسك** → `403`.
5. **تكتب الـ 25 صلاحية hardcoded** → ابنِ الجدول من `permissions/catalog`.
6. **تنسى إن `status: "inactive"` بيمنع الـ login** → `401`.

---

**التالي:** [10-audit.md](./10-audit.md)
