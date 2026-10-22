# Wegz Super Backend

Backend مركزي (Super Admin) لمنصة Wegz:
**Admins + Permissions + Sections + Clients (Provisioning) + Sales + Payments + Reports + Financial Reports**.

> مفيش Packages ولا Subscriptions — كل عميل بيتسند له **Sections** (Hero / Header / Footer / ...)،
> وقواعد بيانات العملاء بتتعمل على **MongoDB الموجود على سيرفر Plesk** (مش Atlas).

---

## OpenAPI

ملف `openAPI.json` في جذر المشروع يحتوي على **كل الراوتس** مع الـ request bodies والـ examples والـ responses — جاهز للفرونت (Swagger UI / Redoc / Postman Import).

```
https://superback.wegz.org/health   ← للتأكد إن السيرفر شغال
```

## المتطلبات

- Node.js >= 20
- MongoDB (الـ Super DB — ممكن يكون Atlas)
- MongoDB على سيرفر Plesk (لقواعد بيانات العملاء)
- Plesk server (للـ provisioning الكامل)

## التشغيل

```bash
npm install
cp .env.example .env
npm run dev      # تطوير
npm run build    # إنتاج (tsup)
npm start        # node dist/server.js
```

عند أول تشغيل يتم إنشاء **Root Admin** من `SUPER_ADMIN_*` وإعطاؤه كل الصلاحيات.

---

## المتغيرات البيئية

| المتغير | إلزامي | الوصف |
|---|---|---|
| `NODE_ENV` | لا | `production` / `development` |
| `PORT` | لا | افتراضي `3000` |
| `MONGO_URI` | ✅ | قاعدة بيانات الـ Super (على Plesk: `.../SuperWegz`، أو Atlas) |
| `JWT_SECRET` | ✅ | توقيع توكن الأدمن |
| `JWT_EXPIRES_IN` | لا | افتراضي `1d` |
| `SUPER_ADMIN_EMAIL` | ✅ | إيميل الـ Root |
| `SUPER_ADMIN_PASSWORD` | ✅ | باسورد الـ Root |
| `SUPER_ADMIN_NAME` | لا | اسم الـ Root |
| `PLESK_MONGO_URI` | ✅ | MongoDB بتاع سيرفر Plesk، على السيرفر الحالي `mongodb://127.0.0.1:32768` |
| `PLESK_MONGO_USER` | لا | لو الـ Mongo محتاج auth |
| `PLESK_MONGO_PASS` | لا | باسورد الـ Mongo |
| `TENANT_DB_PREFIX` | لا | بادئة اسم DB العميل، افتراضي `sc_` |
| `PLESK_HOST` / `PLESK_PORT` / `PLESK_API_KEY` | للـ provisioning | بيانات Plesk |
| `PLESK_PARENT_DOMAIN` | للـ provisioning | مثال `wegz.org` |
| `PLESK_VHOSTS_DIR` | للـ provisioning | مسار الـ subdomains |
| `MASTER_FRONTEND_DIR` / `MASTER_BACKEND_DIR` | للـ provisioning | نسخ الـ build الجاهزة |
| `PLESK_SYSTEM_USER` | لا | مستخدم تشغيل الملفات |
| `SUPER_SYSTEGO_URL` | لا | رابط Super backend |
| `SUPER_FRONTEND_URL` | لا | رابط لوحة الـ Super (CORS) |
| `VERSION_UPDATER_*` | لا | خدمة تحديث النسخ |
| `SSL_ADMIN_EMAIL` | لا | إيميل Let's Encrypt |
| `CURRENCY` | لا | افتراضي `EGP` |
| `TIMEZONE` | لا | افتراضي `Africa/Cairo` |
| `INVOICE_PREFIX` | لا | بادئة أرقام المدفوعات، افتراضي `WEGZ` |

> `TENANT_MONGO_URI` القديم أصبح **legacy** وغير مستخدم. قواعد بيانات العملاء
> بتتصل بـ `PLESK_MONGO_URI` فقط.

---

## Provisioning — إيه اللي بيحصل عند إضافة عميل؟

`POST /api/admin/clients` بينشئ العميل ويشغّل `provisionClient` في الخلفية:

1. **إنشاء DB للعميل على Plesk Mongo** باسم `sc_<clientId>` (أو `TENANT_DB_PREFIX` + id).
   - `metadata` collection + `users` collection (admin user بنفس إيميل/باسورد العميل).
   - الداتابيز بتتعمل على نفس Mongo الموجود على سيرفر Plesk عن طريق `PLESK_MONGO_URI`.
2. إنشاء Subdomains: `<subdomain>` و `api-<subdomain>`.
3. نسخ الماستر frontend/backend + `.htaccess` + `node_modules` + تشغيل Node.js على Plesk.
4. توليد `X-Tenant-Api-Key` وتخزين الـ hash فقط.
5. كتابة `.env` الخاص بالـ tenant backend (فيه `PLESK_MONGO_URI` + اسم DB + المفتاح).
6. تثبيت SSL (best-effort).
7. تحديث `provisioning_status` → `completed` و `status` → `active`.

متابعة الحالة: `GET /api/admin/clients/:id/provisioning-status`.

**لو MongoDB على Plesk محتاج يوزر:**
```env
PLESK_MONGO_URI=mongodb://127.0.0.1:32768
PLESK_MONGO_USER=admin
PLESK_MONGO_PASS=********
```

**ملاحظة:** لو بتستخدم Plesk MongoDB extension وبتعمل DB user لكل عميل،
ممكن تضيفه يدويًا أو نوسّع الـ provisioner بعدين — حاليًا كل الـ DBs بتستخدم
نفس بيانات الاتصال.

---

## نقل الـ Super DB من Atlas إلى Plesk MongoDB

السيرفر الحالي (نفس سيرفر `superback.systego.net`) عليه MongoDB محلي على
`127.0.0.1:32768`. لنقل كل البيانات مرة واحدة:

1. وقّف تطبيق Node من Plesk.
2. من مجلد المشروع على السيرفر:

```bash
# للتأكد من الخطة بدون كتابة
SOURCE_MONGO_URI="$(grep -m1 '^# MONGO_URI=' .env | sed 's/^# MONGO_URI=//')" \
  DRY_RUN=1 node scripts/migrate-to-plesk.cjs

# التنفيذ الفعلي
SOURCE_MONGO_URI="$(grep -m1 '^# MONGO_URI=' .env | sed 's/^# MONGO_URI=//')" \
  CONFIRM=YES node scripts/migrate-to-plesk.cjs
```

> لو السطر المشروح مش موجود في `.env` على السيرفر، حط رابط Atlas مكان
> `SOURCE_MONGO_URI="..."` يدويًا.

- المصدر الافتراضي: DB `test` (اللي فيها `superadmins` و`clients`).
- الهدف: `SuperWegz` على `PLESK_MONGO_URI`.
- بينقل DBs العملاء `sc_*` المربوطة بعملاء موجودين فقط (ويتخطى الـ orphan).
- بيتخطى `packages` و`subscriptions` (اتشالوا من النظام).
- بيضيف `db_name` لكل عميل ويشيل `package_id` القديم.
- مش محتاج `mongodump` — بيستخدم `mongodb` driver الموجود مع المشروع.

3. بعد النجاح، في `.env`:

```env
MONGO_URI=mongodb://admin:MONGO%403030@127.0.0.1:32768/SuperWegz?authSource=admin
```

4. شغّل التطبيق.
5. للعميل القديم: `POST /api/admin/clients/:id/retry-provisioning`
   (بقى idempotent ومش بيمسح DB موجودة).
6. تأكد من الاتصال: `GET /api/admin/diagnostics/mongo` (Root فقط).

---

## البنية

```
src/
├── config/        env, db, tenantDb
├── controllers/   auth, superAdmin, permissions, section, client,
│                  sale, payment, report, financialReport, dashboard,
│                  audit, tenant
├── middlewares/   auth, permission, tenantAuth, errorHandler
├── models/        SuperAdmin, SuperAdminPermission, Section, Client,
│                  Sale, Payment, TenantApiKey, AuditLog
├── routes/
├── services/      plesk, provisioner, rebuild, seed
├── utils/         jwt, audit, response, errors
└── server.ts
```

---

## Authentication

مسارات `/api/admin/*`:
```
Authorization: Bearer <JWT>
```

مسارات `/api/tenant/*`:
```
X-Tenant-Api-Key: <raw key>
```

---

## 1) Auth

| Method | Route | الوصف |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ token, admin }` |
| GET | `/api/auth/me` | بيانات الأدمن الحالي + صلاحياته |

## 2) Admins + Permissions

| Method | Route | Permission |
|---|---|---|
| GET | `/api/admin/admins` | `admins:read` |
| POST | `/api/admin/admins` | `admins:create` |
| GET | `/api/admin/admins/:id` | `admins:read` |
| PATCH | `/api/admin/admins/:id` | `admins:update` |
| DELETE | `/api/admin/admins/:id` | `admins:delete` |
| GET | `/api/admin/permissions/catalog` | `admins:read` |
| GET | `/api/admin/admins/:id/permissions` | `admins:read` |
| PUT | `/api/admin/admins/:id/permissions` | `admins:update_permissions` |

**الصلاحيات:**
```
clients:read/create/update/delete
sections:read/create/update/delete
sales:read/create/update/delete
payments:read/create/approve/delete
reports:read
financial_reports:read
admins:read/create/update/delete/update_permissions
audit:read
provisioning:run
```

## 3) Sections

بدل شجرة Categories/Subcategories، السكاشن بقت مستوى واحد مسطّح. كل عميل بيتسند له
أكتر من Section من إجمالي السكاشن (Hero / Header / Footer / ...)، وبكده تقدر تعرض
لكل عميل: عنده كام سيكشن من أصل كام.

| Method | Route | Permission |
|---|---|---|
| GET | `/api/admin/sections` | `sections:read` |
| POST | `/api/admin/sections` | `sections:create` |
| GET | `/api/admin/sections/:id` | `sections:read` |
| PATCH | `/api/admin/sections/:id` | `sections:update` |
| DELETE | `/api/admin/sections/:id` | `sections:delete` |
| GET | `/api/admin/sections/:id/clients` | `sections:read` |

**Query:** `?status=active&search=...&with_counts=true` — `with_counts` بترجع `clients_count` لكل سيكشن.

```json
{ "name": "Hero", "key": "hero", "ar_name": "الهيرو", "order": 1 }
```

- `key` لازم يكون فريد، ولو مش مبعوت بيتولّد تلقائيًا من الاسم.
- الحذف مرفوض لو السيكشن مسند لعملاء، إلا بـ `?force=true` (بيشيله منهم الأول).

**السكاشن الافتراضية (seed):**
`announcement, header, hero, info, info2, testimonials, contact, footer`

```bash
npm run seed:sections      # يضيف الافتراضي الناقص فقط (آمن)
npm run migrate:sections   # يحوّل Categories القديمة إلى Sections
```

## 4) Clients (+ Provisioning)

| Method | Route | Permission |
|---|---|---|
| GET | `/api/admin/clients` | `clients:read` |
| POST | `/api/admin/clients` | `clients:create` |
| GET | `/api/admin/clients/:id` | `clients:read` |
| PATCH | `/api/admin/clients/:id` | `clients:update` |
| DELETE | `/api/admin/clients/:id` | `clients:delete` |
| GET | `/api/admin/clients/:id/sections` | `clients:read` |
| PUT | `/api/admin/clients/:id/sections` | `clients:update` |
| GET | `/api/admin/clients/:id/provisioning-status` | `clients:read` |
| POST | `/api/admin/clients/:id/retry-provisioning` | `clients:update` |
| POST | `/api/admin/clients/:id/regenerate-api-key` | `clients:update` |
| POST | `/api/admin/clients/:id/suspend` | `clients:update` |
| POST | `/api/admin/clients/:id/activate` | `clients:update` |
| POST | `/api/admin/clients/:id/rebuild-frontend` | `clients:update` |
| GET | `/api/admin/clients/:id/logs` | `clients:read` |
| POST | `/api/admin/clients/:id/reset-admin-password` | `clients:update` |
| POST | `/api/admin/clients/:id/ssl/install` | `clients:update` |
| DELETE | `/api/admin/clients/:id/full` | `clients:delete` |

**إنشاء عميل:**

```json
{
  "company_name": "Acme",
  "email": "owner@acme.com",
  "password": "Secret@123",
  "subdomain": "acme",
  "logoBase64": "data:image/png;base64,...",
  "sections": ["<sectionId>", "<sectionId>"],
  "sales_agent_id": "<adminId>",
  "sales_man_name": "Mohamed",
  "sales_man_phone": "01000000000",
  "operation_status": "sales",
  "payment_cycle": "monthly",
  "payment_amount": 500
}
```

**تعيين سكاشن عميل (استبدال كامل):**

```http
PUT /api/admin/clients/:id/sections
{ "sections": ["<sectionId>", "<sectionId>"] }
```

**استجابة العميل** بتحتوي على:
`sections` (مفصّلة) + `sections_count` + `total_sections` — جاهزة لعرض «3 من 8».

**Filters:** `?status=active&section_id=...&search=...`

## 5) Sales

| Method | Route | Permission |
|---|---|---|
| GET | `/api/admin/sales` | `sales:read` |
| GET | `/api/admin/sales/stats` | `sales:read` |
| POST | `/api/admin/sales` | `sales:create` |
| GET | `/api/admin/sales/:id` | `sales:read` |
| PATCH | `/api/admin/sales/:id` | `sales:update` |
| DELETE | `/api/admin/sales/:id` | `sales:delete` |

**Filters:** `client_id`, `status`, `cycle`, `sales_agent_id`, `from`, `to`, `page`, `limit`.

```json
{
  "client_id": "<clientId>",
  "amount": 1000,
  "discount": 100,
  "cycle": "quarterly",
  "status": "pending",
  "sale_date": "2026-10-20",
  "sales_agent_id": "<adminId>",
  "notes": "Renewal deal"
}
```

`total` = `amount - discount` (تلقائي).

## 6) Payments

| Method | Route | Permission |
|---|---|---|
| GET | `/api/admin/payments` | `payments:read` |
| POST | `/api/admin/payments` | `payments:create` |
| GET | `/api/admin/payments/:id` | `payments:read` |
| POST | `/api/admin/payments/:id/approve` | `payments:approve` |
| POST | `/api/admin/payments/:id/reject` | `payments:approve` |
| DELETE | `/api/admin/payments/:id` | `payments:delete` |

**اعتماد الدفعة:**

1. الحالة → `approve` + `reviewed_by` / `reviewed_at`.
2. العميل لو `pending` → `active` (الـ `suspended` لا يتغير).
3. تحديث `payment_amount` / `payment_cycle` / `last_payment_date`.
4. لو الدفعة مرتبطة بـ Sale → يتحول إلى `paid`.

## 7) Reports (تشغيلية)

| Method | Route | Permission |
|---|---|---|
| GET | `/api/admin/reports/operations` | `reports:read` |
| GET | `/api/admin/reports/operations/:id` | `reports:read` |
| PATCH | `/api/admin/reports/operations/:id/status` | `reports:read` |
| POST | `/api/admin/reports/operations/:id/notes` | `reports:read` |
| DELETE | `/api/admin/reports/operations/:id/notes/:noteIndex` | `reports:read` |
| GET | `/api/admin/reports/clients` | `reports:read` |

- `operations`: كل العملاء + السكاشن + الحالة + إجمالي المدفوع + المعلّق + آخر دفعة.
- `operations/:id`: تفاصيل العميل + كل المدفوعات + كل المبيعات + الـ notes.
- `clients`: ملخّص حسب الحالة / السيكشن / operation_status (مع `clients_without_sections`).

## 8) Financial Reports

| Method | Route |
|---|---|
| GET | `/api/admin/financial-reports/summary` |
| GET | `/api/admin/financial-reports/monthly?year=2026` |
| GET | `/api/admin/financial-reports/by-section` |
| GET | `/api/admin/financial-reports/by-sales-agent` |
| GET | `/api/admin/financial-reports/pending` |

كلها تدعم `?from=&to=` (ما عدا `monthly` يدعم `year` أو `from/to`).

## 9) Dashboard / Audit

| Method | Route | Permission |
|---|---|---|
| GET | `/api/admin/dashboard` | authenticated |
| GET | `/api/admin/audit` | `audit:read` |
| GET | `/api/admin/audit/stats` | `audit:read` |

## 10) Tenant API

| Method | Route | الوصف |
|---|---|---|
| GET | `/api/tenant/verify` | حالة العميل (active / suspended / pending) |
| POST | `/api/tenant/payments` | العميل يرفع إثبات دفع → `pending` |
| GET | `/api/tenant/payments` | مدفوعات العميل |

```json
{
  "amount": 500,
  "method": "bank_transfer",
  "payment_cycle": "monthly",
  "reference": "TRX-123",
  "screenshot": "https://.../receipt.jpg",
  "notes": "Renewal"
}
```

الدفعة تظهر فورًا في `GET /api/admin/payments?status=pending`.

---

## ملاحظات

- العميل لا يستطيع تحديد `client_id` أو `status` في `/api/tenant/payments` — بيتحددوا من الـ API Key.
- الـ Payment المعتمد لا يمكن حذفه.
- `DELETE /api/admin/clients/:id/full` بيحذف Plesk + DB + API keys + العميل.
- الـ provisioning بيشتغل في الخلفية، تابع بـ `provisioning-status`.
