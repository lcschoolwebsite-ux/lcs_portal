const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const { create, getByClass, download, remove, update } = require("../controllers/homeworkController");

const homeworkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf";
    const isImage = String(file.mimetype || "").startsWith("image/");

    if (!isPdf && !isImage) {
      return cb(new Error("Only PDF or image files are allowed"));
    }

    cb(null, true);
  }
});

const handleHomeworkUpload = (req, res, next) => {
  homeworkUpload.single("file")(req, res, err => {
    if (!err) return next();

    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Homework file must be 15 MB or smaller"
      : err.message;

    return res.status(400).json({ message });
  });
};

router.post("/", auth, roles("teacher"), handleHomeworkUpload, create);
router.get("/class/:classId", auth, roles("admin", "teacher", "student"), getByClass);
router.get("/:id/download", auth, roles("admin", "teacher", "student"), download);
router.put("/:id", auth, roles("admin", "teacher"), handleHomeworkUpload, update);
router.delete("/:id", auth, roles("admin", "teacher"), remove);

module.exports = router;
