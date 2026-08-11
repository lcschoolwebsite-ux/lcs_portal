const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const {
  getAll,
  create,
  update,
  remove,
  assignClass,
  setClasses,
  assignSubject,
  resetPassword,
  uploadTeacherPhoto,
  removeTeacherPhoto
} = require("../controllers/teacherController");

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

const handlePhotoUpload = (req, res, next) => {
  upload.single("photo")(req, res, err => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE" ? "Photo must be 2 MB or smaller" : err.message;
    return res.status(400).json({ message });
  });
};

router.get("/", auth, roles("admin"), getAll);
router.post("/", auth, roles("admin"), create);
router.post("/:id/photo", auth, roles("admin", "teacher"), handlePhotoUpload, uploadTeacherPhoto);
router.delete("/:id/photo", auth, roles("admin", "teacher"), removeTeacherPhoto);
router.put("/:id", auth, roles("admin"), update);
router.delete("/:id", auth, roles("admin"), remove);
router.post("/assign-class/:id", auth, roles("admin"), assignClass);
router.put("/:id/classes", auth, roles("admin"), setClasses);
router.post("/assign-subject/:id", auth, roles("admin"), assignSubject);
router.post("/reset-password/:id", auth, roles("admin"), resetPassword);

module.exports = router;
