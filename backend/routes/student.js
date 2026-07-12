const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const {
  getAll,
  getOne,
  create,
  bulkUpload,
  update,
  deactivate,
  uploadStudentPhoto,
  removeStudentPhoto
} = require("../controllers/studentController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  }
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const hasExcelExtension = /\.(xlsx|xls)$/i.test(file.originalname || "");
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];
    if (!allowedTypes.includes(file.mimetype) && !hasExcelExtension) {
      return cb(new Error("Only Excel files are allowed"));
    }
    cb(null, true);
  }
});

const handlePhotoUpload = (req, res, next) => {
  upload.single("photo")(req, res, err => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "Photo must be 2 MB or smaller" : err.message;
    return res.status(400).json({ message });
  });
};

const handleExcelUpload = (req, res, next) => {
  excelUpload.single("file")(req, res, err => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "Excel file must be 5 MB or smaller" : err.message;
    return res.status(400).json({ message });
  });
};

router.get("/", auth, getAll);
router.post("/bulk-upload", auth, roles("admin"), handleExcelUpload, bulkUpload);
router.post("/:id/photo", auth, roles("admin", "teacher", "student"), handlePhotoUpload, uploadStudentPhoto);
router.delete("/:id/photo", auth, roles("admin", "teacher", "student"), removeStudentPhoto);
router.get("/:id", auth, getOne);
router.post("/", auth, roles("admin", "teacher"), create);
router.put("/:id", auth, roles("admin", "teacher"), update);
router.delete("/:id", auth, roles("admin"), deactivate);

module.exports = router;
