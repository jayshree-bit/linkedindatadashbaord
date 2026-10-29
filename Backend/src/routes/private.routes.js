import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import * as users from "../controllers/user.controller.js";
import * as data from "../controllers/data.controller.js";
import multer from 'multer';
import { importProspectsExcel, getImportStatus, getDashboard } from '../controllers/data.controller.js';
import { importCompaniesExcel, getCompanyImportStatus } from '../controllers/companyImport.controller.js';
const r = Router();
r.use(authenticate); // everything below needs a valid token

// User manager (needs "user" permission)
r.get("/users", authorize("user", "view"), users.getUsers);
r.get("/roles", authorize("user", "view"), users.getRoles);
r.post("/users", authorize("user", "edit"), users.addUser);
r.put("/users/:id", authorize("user", "edit"), users.editUser);
r.delete("/users/:id", authorize("user", "edit"), users.removeUser);
r.put("/roles/:id", authorize("user", "edit"), users.editRole);

// Prospect / company: GET => view permission, other methods => edit permission
const resource = (req) => req.params.resource;
const action = (req) => (req.method === "GET" ? "view" : "edit");
r.get("/data/:resource", authorize(resource, action), data.getAll);
r.get("/data/:resource/export", authorize(resource, action), data.exportExcel);
r.get("/data/:resource/export-start", authorize(resource, action), data.startExport);
r.get("/data/:resource/export-status/:jobId", authorize(resource, action), data.exportStatus);
r.get("/data/:resource/export-file/:jobId", authorize(resource, action), data.exportFile);
r.post("/data/:resource", authorize(resource, action), data.add);
r.put("/data/:resource/:id", authorize(resource, action), data.edit);
r.delete("/data/:resource/:id", authorize(resource, action), data.del);
r.get(
  "/data/:resource/distinct/:field",
  authorize(resource, action),
  data.distinctValues
);
r.get(
  "/dashboard-stats",
  authorize("prospect", "view"),
  data.getProspectDashboardStats
);
r.get(
  "/dashboard",
  authorize("prospect", "view"),
  getDashboard
);

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      return cb(new Error("Upload an .xlsx file."));
    }
    cb(null, true);
  },
});
r.post('/data/prospect/company-list', excelUpload.single('file'), data.uploadCompanyList);
r.get('/prospect/company-list/sample', data.companyListSample);

r.post(
  "/data/prospect/import-excel",
  authorize("prospect", "edit"),
  excelUpload.single("file"),
  importProspectsExcel,
);

r.get(
  "/data/prospect/import-excel/:jobId",
  authorize("prospect", "edit"),
  getImportStatus,
);

r.post(
  '/data/company/import-excel',
  authorize('company', 'edit'),
  excelUpload.single('file'),
  importCompaniesExcel
);

r.get(
  '/data/company/import-excel/:jobId',
  authorize('company', 'edit'),
  getCompanyImportStatus
);

export default r;
