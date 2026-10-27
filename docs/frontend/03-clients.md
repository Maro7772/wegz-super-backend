# 03 — العملاء (Clients) 🔥

**أهم صفحة في النظام.** اقرأ الملف ده كامل قبل ما تكتب سطر كود.

| | |
|---|---|
| القائمة | `/clients` — `clients:view` |
| إضافة | `/clients/new` — `clients:add` |
| التفاصيل | `/clients/:id` — `clients:view` |

---

## 0) الفكرة في 3 سطور

1. بتعمل **عميل** بـ `POST /api/admin/clients` → بيترجع `202` فورًا.
2. الـ backend بيبدأ **provisioning** في الخلفية (داتابيز + subdomains + ملفات + API key + SSL).
3. الفرونت **يعمل poll** على `provisioning-status` لحد ما يبقى `completed` أو `failed`.

> **مفيش** خطوة "إنشاء مستخدم" ولا "إنشاء داتابيز" ولا "إنشاء subdomain" منفصلة.
> كلهم بيحصلوا جوه الـ provisioning أوتوماتيك.

---

# 1) قائمة العملاء

## Endpoint

```http
GET /api/admin/clients?status=&section_id=&search=
Authorization: Bearer <token>
```

| Query | النوع | ملاحظات |
|---|---|---|
| `status` | `pending` \| `active` \| `suspended` | اختياري |
| `section_id` | ObjectId | اختياري — يفلتر العملاء اللي عندهم السيكشن ده |
| `search` | string | بيبحث في `company_name` + `email` + `subdomain` |

> ⚠️ **مفيش pagination.** الـ endpoint بيرجع **كل** العملاء.
> ⚠️ `category_id` و `subcategory_id` **مرفوضين** (`400`) — استخدم `sections` بس.

## Response — 200

```json
{
  "success": true,
  "message": "Clients retrieved",
  "data": {
    "clients": [
      {
        "_id": "66f2b3c4d5e6f7a8b9c0d1e2",
        "company_name": "مطعم النور",
        "email": "owner@alnoor.com",
        "subdomain": "alnoor",
        "subdomain_url": "https://alnoor.wegz.org",
        "backend_url": "https://api-alnoor.wegz.org",
        "db_name": "sc_66f2b3c4d5e6f7a8b9c0d1e2",
        "status": "pending",
        "logoBase64": null,
        "sections": [
          { "_id": "…", "key": "hero", "name": "Hero", "ar_name": "الهيرو", "status": "active", "order": 1 }
        ],
        "sections_count": 1,
        "total_sections": 8,
        "sales_agent_id": { "_id": "…", "name": "Sales Agent", "email": "sales1@wegz.org" },
        "sales_man_name": null,
        "sales_man_phone": null,
        "operation_status": "sales",
        "payment_cycle": "monthly",
        "payment_amount": 1500,
        "last_payment_date": null,
        "notes": [],
        "provisioning_status": "completed",
        "provisioning_error": null,
        "createdAt": "2026-10-25T09:12:00.000Z",
        "updatedAt": "2026-10-25T09:14:30.000Z"
      }
    ],
    "total_sections": 8
  }
}
```

> `password` **مش بيرجع أبدًا** (`select: false` في الموديل). لو لقيته في الـ response، فيه مشكلة — كلّمني.

## الأعمدة المقترحة

| العميل | Subdomain | الأقسام | الحالة | التجهيز | العملية | المبلغ | آخر دفعة | إجراءات |
|---|---|---|---|---|---|---|---|---|
| مطعم النور<br><small>owner@alnoor.com</small> | `alnoor` | `1/8` | 🟡 قيد الانتظار | 🟢 جاهز | `sales` | 1,500 EGP | — | 👁️ ✏️ ⋮ |

- **الأقسام**: `sections_count` / `total_sections`
- **الحالة** و **التجهيز** عمودين **منفصلين** (مش نفس الحاجة — اقرأ تحت)
- **إجراءات**: عرض · تعديل · تفعيل/إيقاف · حذف (كل واحد بـ صلاحيته)

## الحالة vs التجهيز

| `status` | معناها |
|---|---|
| `pending` | العميل اتسجل بس لسه ما دفعش / ما اتفعّلش |
| `active` | نشط (بيتحول `active` أوتوماتيك عند **اعتماد أول دفعة**) |
| `suspended` | موقوف يدويًا |

| `provisioning_status` | معناها |
|---|---|
| `pending` … `installing_ssl` | جاري التجهيز (اعرض Spinner) |
| `completed` | ✅ السيرفر جاهز |
| `failed` | ❌ فشل — اعرض `provisioning_error` |

> 🔴 **مهم جدًا:** العميل ممكن يكون `provisioning_status: "completed"` و `status: "pending"` في نفس الوقت.
> ده طبيعي: السيرفر جاهز، بس لسه ما دفعش. **متخلطهمش في عمود واحد.**

## فلاتر الواجهة

- Dropdown: الحالة (الكل / pending / active / suspended)
- Multi-select: الأقسام (من `GET /api/admin/sections`)
- Search box → debounce 400ms → `?search=`

> الـ search آمن مع أي حرف (`(`, `*`, `+`) — الـ backend بيهرّب الـ regex.

---

# 2) إضافة عميل

## Endpoint — الوحيد

```http
POST /api/admin/clients
Authorization: Bearer <token>
Content-Type: application/json
```

### الحقول

| الحقل | إجباري | النوع | القيود | ملاحظات |
|---|---|---|---|---|
| `company_name` | ✅ | string | | |
| `email` | ✅ | email | unique | **هو نفسه login العميل** |
| `password` | ✅ | string | **min 6** | باسورد admin العميل |
| `subdomain` | ✅ | string | lowercase + أرقام + `-` | **مش هيتغير بعد كده** |
| `sections` | ❌ | `string[]` | IDs موجودة | من `GET /api/admin/sections` |
| `logoBase64` | ❌ | string | | `data:image/png;base64,...` |
| `sales_agent_id` | ❌ | ObjectId | | من `GET /api/admin/admins` |
| `sales_man_name` | ❌ | string | | |
| `sales_man_phone` | ❌ | string | | |
| `operation_status` | ❌ | enum | `demo` `sales` `data` `delivered` | افتراضي `sales` |
| `payment_cycle` | ❌ | enum | `monthly` `quarterly` `half_yearly` `yearly` | |
| `payment_amount` | ❌ | number | ≥ 0 | افتراضي `0` |

### مثال

```json
{
  "company_name": "مطعم النور",
  "email": "owner@alnoor.com",
  "password": "Secret@123",
  "subdomain": "alnoor",
  "sections": ["66f2b3c4d5e6f7a8b9c0d1e2", "66f2b3c4d5e6f7a8b9c0d1e3"],
  "sales_agent_id": "66f1a2b3c4d5e6f7a8b9c0d2",
  "sales_man_name": "أحمد",
  "sales_man_phone": "01000000000",
  "operation_status": "sales",
  "payment_cycle": "monthly",
  "payment_amount": 1500
}
```

### Response — `202 Accepted`

```json
{
  "success": true,
  "message": "Client created. Provisioning will start shortly.",
  "data": {
    "client": { "id": "66f2b3c4d5e6f7a8b9c0d1e2", "status": "pending" },
    "provisioning_started": true
  }
}
```

> 🔴 **`202` مش `201`.** و`data.client.status` هنا هو **`provisioning_status`** (مش `status` العميل).
> متعتمدش عليه — اقرأ الحالة الحقيقية من `provisioning-status` (تحت).

### لو الـ provisioning مشتغلش

```json
{
  "success": true,
  "message": "Client created, but provisioning could not be started.",
  "data": {
    "client": { "id": "…", "status": "failed" },
    "provisioning_started": false
  }
}
```

**الفرونت:** اعرض Banner أصفر + زرار **Retry** (بيحتاج `provisioning:add`).

### الأخطاء

| كود | الرسالة | الفرونت |
|---|---|---|
| `400` | `company_name, email, password, subdomain are required` | حدد الحقول الناقصة |
| `400` | `password must be at least 6 characters` | تحت حقل الباسورد |
| `400` | `Invalid subdomain...` | تحت حقل الـ subdomain |
| `400` | `Invalid section id: ...` | السيكشن اتشال — أعد تحميل القائمة |
| `404` | `Section(s) not found: ...` | نفس الحالة |
| `409` | `Email or subdomain already exists` | "الإيميل أو الـ subdomain مستخدم" |

---

## 2.1) فورم الإضافة — تفاصيل UX

### حقل الـ Subdomain
- اعرضه كـ **Prefix** جاهز:
  ```
  [ alnoor ] . wegz.org
  ```
- **auto-fill** من `company_name` (slugify) وخلّيه قابل للتعديل.
- Validation في الفرونت: `/^[a-z0-9-]+$/` + مش يبدأ/ينتهي بـ `-`.
- تحته: `هيوفر رابط العميل: https://alnoor.wegz.org`
- **تحذير واضح**: ⚠️ "الـ Subdomain مش هيتغير بعد الإنشاء."

### حقل الباسورد
- min 6، وزرار 👁️ لإظهار/إخفاء.
- تحته: "ده باسورد الأدمن بتاع العميل — هيدخل بيه على لوحة تحكمه."

### حقل الـ Sections
- Multi-select (checkbox list) من `GET /api/admin/sections?status=active`.
- اعرض `name` + `ar_name` + `key`.
- مش إجباري — بس لو سيبته فاضي اعرض تحذير خفيف: "العميل مش هيكون عنده أي قسم مفعّل".

### باقي الحقول
- قسم "بيانات المبيعات" (collapsible): sales agent / اسم / تليفون / operation_status.
- قسم "بيانات مالية" (collapsible): payment_cycle / payment_amount.

### الأزرار
- **إضافة عميل** (Primary) → `POST`
- **إلغاء** → رجوع للقائمة

### بعد النجاح
```
1. Toast: "تم إنشاء العميل — جاري التجهيز…"
2. redirect → /clients/:id
3. ابدأ polling على provisioning-status
```

> **متخليش** المستخدم يضغط "إضافة" مرتين. عطّل الزرار أثناء الـ request.

---

# 3) تفاصيل العميل

## Endpoint

```http
GET /api/admin/clients/:id
Authorization: Bearer <token>
```

**200** → `data.client` بنفس شكل عنصر القائمة (sections populated + `sections_count` + `total_sections`).

**404** → `Client not found`

---

## 3.1) التابات المقترحة

### Tab 1 — البيانات (Overview)

**التعديل:** `PATCH /api/admin/clients/:id` — `clients:edit`

الحقول **المسموحة** فقط:

```
company_name · email · logoBase64 · sections · sales_agent_id
sales_man_name · sales_man_phone · operation_status
payment_cycle · payment_amount · last_payment_date · status
```

| ❌ مش مسموح | ليه |
|---|---|
| `password` | استخدم `reset-admin-password` |
| `subdomain` | ثابت بعد الإنشاء |
| `db_name` / `subdomain_url` / `backend_url` | بتتولد من الـ provisioning |
| `provisioning_status` / `provisioning_error` | الـ backend بس |
| `category_id` / `subcategory_id` | اتشالوا (`400`) |

> لو بعت حقل مش في القائمة → **بيتجاهله بصمت**. فمتعتمدش على إنه رفض.

**Response 200** → `data.client` (نسخة محدّثة)

**أخطاء:** `400` enum غلط · `404` · `409` الإيميل مستخدم

---

### Tab 2 — الأقسام (Sections)

```http
GET /api/admin/clients/:id/sections      → clients:view
PUT /api/admin/clients/:id/sections      → clients:edit
```

**GET 200**
```json
{
  "data": {
    "client_id": "…",
    "company_name": "مطعم النور",
    "sections": [ { "_id": "…", "key": "hero", "name": "Hero", "ar_name": "الهيرو", "status": "active", "order": 1 } ],
    "sections_count": 1,
    "total_sections": 8
  }
}
```

**PUT body**
```json
{ "sections": ["66f2...", "66f3..."] }
```
- **بيستبدل الكل.** `[]` = مسح كل الأقسام.
- `sections` إجباري ومصفوفة، وإلا `400`.
- Response → `data.sections` + `sections_count` + `total_sections`.

> ملاحظة: `PATCH /clients/:id` بيقبل `sections` كمان. استخدم `PUT /sections` لو التعديل **بس** على الأقسام (أسرع وأوضح).

---

### Tab 3 — التجهيز (Provisioning)

#### a) الحالة
```http
GET /api/admin/clients/:id/provisioning-status
```
```json
{
  "data": {
    "_id": "…",
    "provisioning_status": "deploying",
    "provisioning_error": null,
    "subdomain_url": "https://alnoor.wegz.org",
    "backend_url": "https://api-alnoor.wegz.org",
    "db_name": "sc_66f2..."
  }
}
```

#### b) الـ Stepper

```jsx
const STEPS = [
  { key: "creating_db",        label: "إنشاء قاعدة البيانات" },
  { key: "creating_subdomain", label: "إنشاء الـ Subdomains" },
  { key: "deploying",          label: "نشر الملفات" },
  { key: "generating_key",     label: "توليد API Key" },
  { key: "installing_ssl",     label: "تثبيت SSL" },
  { key: "completed",          label: "جاهز" },
];
```

- `pending` → كل الخطوات منتظرة
- خطوة الـ index الحالية = index الـ `provisioning_status` → "جاري"
- اللي قبلها → ✅
- `completed` → كله ✅
- `failed` → ❌ عند آخر خطوة + اعرض `provisioning_error` في `<code>` أحمر

#### c) Polling

```js
const { data } = useQuery({
  queryKey: ["provisioning", id],
  queryFn: () => api.get(`/api/admin/clients/${id}/provisioning-status`).then(r => r.data.data),
  refetchInterval: (q) => {
    const s = q.state.data?.provisioning_status;
    return s === "completed" || s === "failed" ? false : 4000;   // كل 4 ثواني
  },
});
```

> **لازم توقف الـ polling** عند `completed` أو `failed`. من غير كده هتفضل تضرب السيرفر للأبد.

#### d) إعادة التشغيل

```http
POST /api/admin/clients/:id/retry-provisioning     → provisioning:add
POST /api/admin/clients/:id/provision-now          → provisioning:add
```

- `202` → `{ data: { id, provisioning_status: "pending" } }`
- `400` لو `provisioning_status === "completed"` → "العميل متجهز بالفعل"
- `500` لو الـ task مشتغلتش → `{ data: { provisioning_status: "failed", error } }`

| الزرار | إمتى يظهر |
|---|---|
| **Retry provisioning** | لما `provisioning_status === "failed"` |
| **Provision now** | لما `provisioning_status` عالقة (`pending` من غير حركة) — أو `failed` |

> ⚠️ **الاتنين محتاجين `provisioning:add`** مش `clients:edit`.

#### e) اللوج
```http
GET /api/admin/clients/:id/logs      → clients:view
```
```json
{
  "data": {
    "path": "/var/www/vhosts/wegz.org/api-alnoor/startup-error.log",
    "content": "...",
    "size": 1234
  }
}
```
- اعرضه في `<pre>` مونوسبيس مع زرار **Copy** و **Download**.
- لو `content === "(no log file found)"` → "مفيش لوج لحد الآن".

---

### Tab 4 — API Key

```http
POST /api/admin/clients/:id/regenerate-api-key      → clients:edit
```

**200**
```json
{
  "success": true,
  "message": "API key regenerated. Store it securely — it will not be shown again.",
  "data": { "apiKey": "sk_9f2c...e41b" }
}
```

🔴 **المفتاح بيظهر مرة واحدة بس.** مفيش endpoint يرجّعه تاني.

**UX إجباري:**
1. `ConfirmDialog`: "المفتاح القديم هيتلغي فورًا وهيتوقف الاتصال بين لوحة العميل والسوبر — متأكد؟"
2. بعد النجاح → **Modal** فيه:
   - المفتاح في `<code>` + زرار **Copy**
   - تحذير أحمر: "لو قفلت الرسالة دي، المفتاح مش هيتعرض تاني. هتضطر تعمل regenerate."
   - زرار "نسخت، اقفل" — معطّل لحد ما يدوس Copy (اختياري).

---

### Tab 5 — المالية

```http
GET /api/admin/payments?client_id={id}     → payments:view
GET /api/admin/sales?client_id={id}        → sales:view
```

- جدول دفعات + جدول صفقات.
- KPI: `total_paid` (مجموع `approve`) · `pending_amount` · `last_payment_date`.
- زرار "إضافة دفعة" → `POST /api/admin/payments` (بـ `client_id` جاهز) — `payments:add`.

---

### Tab 6 — بيانات الدخول (Tenant Admin)

```http
POST /api/admin/clients/:id/reset-admin-password      → clients:edit
Content-Type: application/json

{ "new_password": "NewSecret@123" }
```

- `new_password` **min 6** وإلا `400`.
- `200` → "Tenant admin password reset"
- `404` → "No admin user found in the tenant database" (يعني الداتابيز لسه ما اتزرعتش)

**UX:**
- حقلين: New password + Confirm.
- تأكيد: "الباسورد القديم هيتوقف فورًا."
- **متخزّنهوش** ولا تعرضه في أي مكان.

> ملاحظة: ده بيغيّر باسورد **الأدمن بتاع العميل** (`owner@alnoor.com`) — مش باسورد الـ Super Admin.

---

### Tab 7 — SSL

```http
POST /api/admin/clients/:id/ssl/install      → clients:edit
```

**200**
```json
{
  "data": {
    "results": [
      { "subdomain": "alnoor.wegz.org",     "success": true },
      { "subdomain": "api-alnoor.wegz.org", "success": false, "error": "..." }
    ]
  }
}
```

- اعرض كل subdomain بحالته (✅ / ❌ + `error`).
- الزرار ده **مش** بيعيد التجهيز — بس بيحاول يجيب الشهادة.

---

### Tab 8 — إعادة بناء الفرونت

```http
POST /api/admin/clients/:id/rebuild-frontend      → clients:edit
```
- `200` → "Frontend rebuild initiated"
- بيحقن `backend_url` الجديد في bundles الفرونت.
- استخدمه لو الـ `backend_url` اتغيّر أو الفرونت بيكلم API غلط.
- **مش** بيعيد الـ provisioning.

---

# 4) تفعيل / إيقاف

```http
POST /api/admin/clients/:id/suspend     → clients:edit
POST /api/admin/clients/:id/activate    → clients:edit
```

- `200` → `data.client`
- **مش** بيوقف السيرفر — بيغيّر `status` بس.
- الـ tenant backend بيقرأ الحالة من `GET /api/tenant/verify` بالـ API key.

**UX:** Toggle في القائمة، مع تأكيد عند الإيقاف:
> "إيقاف العميل هيمنع لوحة تحكمه من العمل. متأكد؟"

---

# 5) الحذف — زرارين مختلفين تمامًا

| | `DELETE /api/admin/clients/:id` | `DELETE /api/admin/clients/:id/full` |
|---|---|---|
| الصلاحية | `clients:delete` | `clients:delete` |
| بيمسح | سجل العميل + يلغي الـ API keys | **كل حاجة** |
| الداتابيز | ✅ بتفضل | ❌ بتتمسح |
| الـ Subdomains | ✅ بتفضل شغالة | ❌ بتتمسح |
| الملفات | ✅ بتفضل | ❌ بتتمسح |
| Rollback | مفيش | **مفيش خالص** |

## 5.1) حذف السجل
```http
DELETE /api/admin/clients/:id
```
```json
{ "success": true, "message": "Client deleted" }
```
- العميل بيختفي من القائمة.
- السيرفر والـ DB بيفضلوا شغالين — **بيبقى يتيم** (orphan).
- استخدمه للأرشفة بس.

## 5.2) الحذف الكامل
```http
DELETE /api/admin/clients/:id/full
```
```json
{ "success": true, "message": "Client fully deleted" }
```

**UX إجباري:**
1. Modal أحمر.
2. يكتب المستخدم **اسم الشركة** أو الـ `subdomain` في input، والزرار يفضل معطّل لحد ما يطابق.
3. نص: "ده هيمسح قاعدة البيانات والملفات والـ Subdomains نهائيًا. مفيش رجوع."

> ⚠️ **الأزرار دي مش في نفس المكان.** حط "حذف السجل" في القائمة، و"حذف كامل" في **أسفل صفحة التفاصيل** في منطقة Danger Zone منفصلة.

---

# 6) جدول الصلاحيات — كل زرار

| الزرار / الإجراء | الصلاحية |
|---|---|
| دخول صفحة العملاء | `clients:view` |
| إضافة عميل | `clients:add` |
| تعديل البيانات | `clients:edit` |
| تعديل الأقسام | `clients:edit` |
| تفعيل / إيقاف | `clients:edit` |
| إعادة تعيين باسورد الأدمن | `clients:edit` |
| Regenerate API key | `clients:edit` |
| تثبيت SSL | `clients:edit` |
| Rebuild frontend | `clients:edit` |
| عرض اللوج | `clients:view` |
| **Retry provisioning** | **`provisioning:add`** |
| **Provision now** | **`provisioning:add`** |
| حذف السجل | `clients:delete` |
| حذف كامل | `clients:delete` |

---

# 7) ❌ 7 أخطاء شائعة — متعملهاش

1. **تعرض "نشط" بعد الإنشاء** → لأ، `status` بيفضل `pending` لحد اعتماد دفعة.
2. **تخلط `status` و `provisioning_status`** → عمودين منفصلين.
3. **تخلي الـ subdomain قابل للتعديل** → الـ backend بيتجاهله، فالفورم بيوهم المستخدم إنه حفظ.
4. **تفتكر `POST /clients` بيرجع العميل كامل** → بيرجع `id` + `provisioning_started` بس.
5. **تنسى توقف الـ polling** → لازم تتوقف عند `completed`/`failed`.
6. **تستخدم `approved` بدل `approve`** في فلتر المدفوعات → مفيش نتايج.
7. **تستخدم `clients:edit` لأزرار الـ provisioning** → هترجع `403`.

---

# 8) كود جاهز

```js
// api/clients.js
import { api } from "./axios";

const d = (r) => r.data.data;

export const listClients   = (params) => api.get("/api/admin/clients", { params }).then(d);
export const getClient     = (id)     => api.get(`/api/admin/clients/${id}`).then(d);
export const createClient  = (body)   => api.post("/api/admin/clients", body).then(d);
export const updateClient  = (id, b)  => api.patch(`/api/admin/clients/${id}`, b).then(d);

export const getClientSections = (id)      => api.get(`/api/admin/clients/${id}/sections`).then(d);
export const setClientSections = (id, arr) => api.put(`/api/admin/clients/${id}/sections`, { sections: arr }).then(d);

export const getProvisioningStatus = (id) => api.get(`/api/admin/clients/${id}/provisioning-status`).then(d);
export const retryProvisioning     = (id) => api.post(`/api/admin/clients/${id}/retry-provisioning`).then(d);
export const provisionNow          = (id) => api.post(`/api/admin/clients/${id}/provision-now`).then(d);

export const regenerateApiKey = (id) => api.post(`/api/admin/clients/${id}/regenerate-api-key`).then(d);
export const suspendClient    = (id) => api.post(`/api/admin/clients/${id}/suspend`).then(d);
export const activateClient   = (id) => api.post(`/api/admin/clients/${id}/activate`).then(d);
export const rebuildFrontend  = (id) => api.post(`/api/admin/clients/${id}/rebuild-frontend`).then(d);
export const getClientLogs    = (id) => api.get(`/api/admin/clients/${id}/logs`).then(d);
export const resetAdminPwd    = (id, pwd) => api.post(`/api/admin/clients/${id}/reset-admin-password`, { new_password: pwd }).then(d);
export const installSsl       = (id) => api.post(`/api/admin/clients/${id}/ssl/install`).then(d);
export const deleteClient     = (id) => api.delete(`/api/admin/clients/${id}`).then(d);
export const deleteClientFull = (id) => api.delete(`/api/admin/clients/${id}/full`).then(d);
```

---

**التالي:** [04-sections.md](./04-sections.md)
