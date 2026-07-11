const router = require("express").Router();
const multer = require("multer");
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const {
  getAll, getStats, getByStudentId, getUpiLink, claimUpiPayment, getPendingUpiVerifications, verifyUpiPayment, recordPayment, 
  createRazorpayOrder, verifyRazorpay,
  createFlexibleOrder, verifyFlexiblePayment, recordFlexiblePayment, remove
} = require("../controllers/studentFeeController");

const claimScreenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPG or PNG screenshots are allowed"));
    }
    cb(null, true);
  }
});

const handleClaimScreenshotUpload = (req, res, next) => {
  claimScreenshotUpload.single("screenshot")(req, res, err => {
    if (!err) return next();
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Screenshot must be 5 MB or smaller"
      : err.message;
    return res.status(400).json({ message });
  });
};

router.get("/", auth, roles("admin", "teacher"), getAll);
router.get("/stats", auth, roles("admin", "teacher"), getStats);
router.get("/student/:studentId", auth, roles("admin", "teacher", "student"), getByStudentId);
router.get("/:studentId/upi-link/:termId", auth, roles("admin", "teacher", "student"), getUpiLink);
router.post("/:studentId/terms/:termId/claim-payment", auth, roles("student"), handleClaimScreenshotUpload, claimUpiPayment);
router.get("/pending-upi-verifications", auth, roles("admin"), getPendingUpiVerifications);
router.post("/:studentId/terms/:termId/verify-payment", auth, roles("admin"), verifyUpiPayment);
router.post("/record-payment", auth, roles("admin"), recordPayment);
router.post("/record-flexible-payment", auth, roles("admin", "teacher"), recordFlexiblePayment);
router.delete("/:id", auth, roles("admin"), remove);
router.post("/create-flexible-order", auth, roles("student"), createFlexibleOrder);
router.post("/verify-flexible-payment", auth, roles("student"), verifyFlexiblePayment);

module.exports = router;
