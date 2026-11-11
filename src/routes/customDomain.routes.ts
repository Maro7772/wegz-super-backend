import { Router } from "express";
import {
  getServerDnsInfoHandler,
  listCustomDomainsHandler,
  assignCustomDomainHandler,
  removeCustomDomainHandler,
  verifyCustomDomainDnsHandler,
  installCustomDomainSslHandler,
} from "../controllers/customDomain.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { requirePermission } from "../middlewares/permission.middleware";

const router = Router();

router.use(authenticate);

// 1. بيانات السيرفر وسجلات الـ DNS المطلوبة (A, CNAME)
router.get("/server-info", requirePermission("clients:view"), getServerDnsInfoHandler);

// 2. قائمة جميع النطاقات المخصصة المسجلة
router.get("/", requirePermission("clients:view"), listCustomDomainsHandler);

// 3. ربط دومين مخصص بـ subdomain معين
router.post("/", requirePermission("clients:edit"), assignCustomDomainHandler);

// 4. حذف الدومين المخصص
router.delete("/:id", requirePermission("clients:edit"), removeCustomDomainHandler);

// 5. فحص انتشار الـ DNS للدومين
router.post("/:id/verify-dns", requirePermission("clients:edit"), verifyCustomDomainDnsHandler);

// 6. إصدار شهادة SSL للدومين عبر Plesk
router.post("/:id/ssl", requirePermission("clients:edit"), installCustomDomainSslHandler);

export default router;
