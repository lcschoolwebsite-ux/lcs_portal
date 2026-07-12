const router = require("express").Router();

router.use("/auth",           require("./auth"));
router.use("/academic-years", require("./academicYear"));
router.use("/classes",        require("./class"));
router.use("/subjects",       require("./subject"));
router.use("/teachers",       require("./teacher"));
router.use("/students",       require("./student"));
router.use("/settings",       require("./setting"));
router.use("/attendance",     require("./attendance"));
router.use("/holidays",       require("./holiday"));
router.use("/exam-types",     require("./examType"));
router.use("/exams",          require("./exam"));
router.use("/marks",          require("./mark"));
router.use("/fees",           require("./fee"));
router.use("/fee-types",     require("./feeType"));
router.use("/fee-structure", require("./feeStructure"));
router.use("/student-fees",  require("./studentFee"));
router.use("/homework",      require("./homework"));
router.use("/announcements",  require("./announcement"));
router.use("/dashboard",      require("./dashboard"));
router.use("/analytics",      require("./analytics"));
router.use("/student-logins", require("./studentLoginLog"));
router.use("/export",         require("./export"));
router.use("/reports",        require("./report"));
router.use("/search",         require("./search"));
router.use("/student-notices", require("./studentNotice"));

module.exports = router;
