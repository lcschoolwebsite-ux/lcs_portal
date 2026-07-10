const router = require("express").Router();
const auth = require("../middleware/auth");
const roles = require("../middleware/roles");
const {
  getStudentRegistrationSettings,
  updateStudentRegistrationSettings,
  getTeacherFeeSettings,
  updateTeacherFeeSettings
} = require("../controllers/settingController");

router.get("/student-registration", auth, getStudentRegistrationSettings);
router.put("/student-registration", auth, roles("admin"), updateStudentRegistrationSettings);
router.get("/teacher-fees", auth, getTeacherFeeSettings);
router.put("/teacher-fees", auth, roles("admin"), updateTeacherFeeSettings);

module.exports = router;
