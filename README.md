# Super Backend (wego.org)

## المتطلبات

- Node.js >= 20
- MongoDB
- Plesk server (للتشغيل الكامل)

## التثبيت

```bash
npm install
cp .env.example .env   # أو أنشئ .env يدويًا
```

## التشغيل في التطوير

```bash
npm run dev
```

## البناء + التشغيل في الإنتاج

```bash
npm run build
npm start
```

## المسارات الأساسية

### Auth

- `POST /api/auth/login` — { email, password } → { token }
- `GET  /api/auth/me` — محمي بـ Bearer

### Super Admins

- `GET    /api/admin/admins`
- `POST   /api/admin/admins` — { name, email, password }
- `GET    /api/admin/admins/:id`
- `PATCH  /api/admin/admins/:id`
- `DELETE /api/admin/admins/:id`

### Permissions

- `GET /api/admin/permissions/catalog`
- `GET /api/admin/admins/:id/permissions`
- `PUT /api/admin/admins/:id/permissions` — Root فقط — { permissions: [] }

### Packages

- `GET    /api/admin/packages`
- `POST   /api/admin/packages`
- `GET    /api/admin/packages/:id`
- `PATCH  /api/admin/packages/:id`
- `DELETE /api/admin/packages/:id`

### Clients

- `GET    /api/admin/clients`
- `POST   /api/admin/clients` — { company_name, email, password, package_id, subdomain, logoBase64? }
- `GET    /api/admin/clients/:id`
- `GET    /api/admin/clients/:id/provisioning-status`
- `PATCH  /api/admin/clients/:id`
- `DELETE /api/admin/clients/:id`
- `POST   /api/admin/clients/:id/regenerate-api-key`

### Tenant (يُستدعى من Client Backend)

- `GET /api/tenant/verify` — header: `X-Tenant-Api-Key`

## أول تشغيل

1. اتأكد إن MongoDB شغال.
2. عدّل `.env` (على الأقل: `MONGO_URI`, `JWT_SECRET`, `SUPER_ADMIN_*`).
3. `npm run dev`
4. لازم تشوف:
   ```
   🌱 Seeded root admin: admin@wego.org
   🌱 Seeded default package: Basic Plan
   ✅ MongoDB connected
   🚀 Super Backend listening on http://localhost:3000
   ```
5. اعمل login:
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@wego.org","password":"Admin@12345"}'
   ```
