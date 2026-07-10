const router = require("express").Router();
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const {
  getAll, getStats, getByStudentId, getUpiLink, getTestUpiLink, claimUpiPayment, getPendingUpiVerifications, verifyUpiPayment, recordPayment, 
  createRazorpayOrder, verifyRazorpay,
  createFlexibleOrder, verifyFlexiblePayment, recordFlexiblePayment, remove
} = require("../controllers/studentFeeController");

router.get("/", auth, roles("admin", "teacher"), getAll);
router.get("/stats", auth, roles("admin", "teacher"), getStats);
router.get("/student/:studentId", auth, roles("admin", "teacher", "student"), getByStudentId);
router.get("/:studentId/upi-link/:termId", auth, roles("admin", "teacher", "student"), getUpiLink);
router.get("/test-upi-link", auth, roles("student"), getTestUpiLink);
router.post("/:studentId/terms/:termId/claim-payment", auth, roles("student"), claimUpiPayment);
router.get("/pending-upi-verifications", auth, roles("admin"), getPendingUpiVerifications);
router.post("/:studentId/terms/:termId/verify-payment", auth, roles("admin"), verifyUpiPayment);
router.post("/record-payment", auth, roles("admin"), recordPayment);
router.post("/record-flexible-payment", auth, roles("admin", "teacher"), recordFlexiblePayment);
router.delete("/:id", auth, roles("admin"), remove);
router.post("/create-flexible-order", auth, roles("student"), createFlexibleOrder);
router.post("/verify-flexible-payment", auth, roles("student"), verifyFlexiblePayment);

module.exports = router;
