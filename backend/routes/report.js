const router = require("express").Router();
const auth = require("../middleware/auth");
const Student = require("../models/Student");
const Mark = require("../models/Mark");
const { generateReportCard } = require("../utils/pdfGenerator");
const { calculateGrade } = require("../utils/grade");

router.get("/report-card/:studentId", auth, async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).populate("class");
    
    // Fetch marks (reusing logic from markController)
    const marks = await Mark.find({ student: student._id }).populate("exam").populate("subject", "name");
    const subjects = marks.reduce((acc, m) => {
      const sName = m.subject.name;
      if (!acc[sName]) acc[sName] = [];
      acc[sName].push({
        marksObtained: m.marksObtained,
        maxMarks:      m.exam?.maxMarks || 0,
        grade:         calculateGrade(m.marksObtained, m.exam?.maxMarks, m.isAbsent)
      });
      return acc;
    }, {});

    generateReportCard(student, { subjects }, res);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
