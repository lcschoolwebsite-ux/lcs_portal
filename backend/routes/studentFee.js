const router = require("express").Router();
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const { 
  getAll, getStats, getByStudentId, recordPayment, 
  createRazorpayOrder, verifyRazorpay,
  createFlexibleOrder, verifyFlexiblePayment, recordFlexiblePayment, remove
} = require("../controllers/studentFeeController");

router.get("/", auth, roles("admin", "teacher"), getAll);
router.get("/stats", auth, roles("admin", "teacher"), getStats);
router.get("/student/:studentId", auth, roles("admin", "teacher", "student"), getByStudentId);
router.post("/record-payment", auth, roles("admin"), recordPayment);
router.post("/record-flexible-payment", auth, roles("admin", "teacher"), recordFlexiblePayment);
router.delete("/:id", auth, roles("admin"), remove);
router.post("/create-flexible-order", auth, roles("student"), createFlexibleOrder);
router.post("/verify-flexible-payment", auth, roles("student"), verifyFlexiblePayment);

module.exports = router;
