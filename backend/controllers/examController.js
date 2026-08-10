const Exam = require("../models/Exam");
const Mark = require("../models/Mark");
const Student = require("../models/Student");
const { canViewExam, canEditExam } = require("../utils/teacherAccess");

exports.getAll = async (req, res) => {
  try {
    const { classId, subjectId, academicYear, examType } = req.query;
    const q = {};

    if (req.user.role === "teacher") {
      if (classId) {
        const allowed = await canViewExam(req, { class: classId, subject: subjectId || null });
        if (!allowed) return res.status(403).json({ message: "Class not assigned to teacher" });
        q.class = classId;
      } else {
        const exams = await Exam.find({}).select("class subject").lean();
        const visibleIds = [];
        for (const exam of exams) {
          if (await canViewExam(req, exam)) visibleIds.push(exam._id);
        }
        q._id = { $in: visibleIds };
      }
    } else {
      if (classId)   q.class = classId;
      if (subjectId) q.subject = subjectId;
    }

    if (academicYear) q.academicYear = academicYear;
    if (examType)     q.examType = examType;
    res.json(await Exam.find(q).populate("subject","name").populate("class","name section").sort({ date: -1 }));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const userRole = String(req.user?.role || "").trim().toLowerCase();

    if (!["admin", "teacher"].includes(userRole)) {
      return res.status(403).json({ message: `Access denied for role: ${userRole || "unknown"}` });
    }

    if (userRole === "teacher") {
      const allowed = await canEditExam(req, req.body);
      if (!allowed) {
        return res.status(403).json({ message: "Class or subject not assigned to teacher" });
      }
    }

    res.status(201).json(await Exam.create(req.body));
  }
  catch (e) { res.status(400).json({ message: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
      .populate("subject", "name")
      .populate("class", "name section");

    if (!exam) return res.status(404).json({ message: "Exam not found" });

    res.json(exam);
  }
  catch (e) { res.status(400).json({ message: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    const examId = req.params.id;
    const exam = await Exam.findByIdAndDelete(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    await Mark.deleteMany({ exam: examId });
    res.json({ message: "Exam and related marks deleted" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getStats = async (req, res) => {
    try {
    const exam = await Exam.findById(req.params.id).populate("subject", "name").populate("class", "name section");
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    if (req.user.role === "teacher" && !(await canViewExam(req, exam))) {
      return res.status(403).json({ message: "Exam not assigned to teacher" });
    }

    const [students, marks] = await Promise.all([
      Student.find({ class: exam.class._id || exam.class, isActive: true }).select("name satCode penCode").sort({ name: 1 }),
      Mark.find({ exam: req.params.id }).populate("student", "name satCode penCode").populate("enteredBy", "name")
    ]);

    const studentIds = new Set(students.map(student => student._id.toString()));
    const classMarks = marks.filter(mark => mark.student?._id && studentIds.has(mark.student._id.toString()));
    const totalStudents = students.length;
    const uploaded = classMarks.length;
    const missing = Math.max(totalStudents - uploaded, 0);
    const marksByStudent = new Map(classMarks.map(mark => [mark.student?._id?.toString(), mark]));
    const uploadedMarks = classMarks.filter(mark => !mark.isAbsent);
    const marksList = uploadedMarks.map(m => Number(m.marksObtained || 0));
    const avg = marksList.length ? marksList.reduce((a,b) => a+b, 0) / marksList.length : 0;
    const highest = marksList.length ? Math.max(...marksList) : 0;
    const lowest = marksList.length ? Math.min(...marksList) : 0;
    const passed = classMarks.filter(m => !m.isAbsent && Number(m.marksObtained || 0) >= Number(exam.passMark || 0)).length;
    const failed = classMarks.filter(m => m.isAbsent || Number(m.marksObtained || 0) < Number(exam.passMark || 0)).length;
    const isUploaded = totalStudents > 0 && missing === 0;
    const uploadedBy = [...new Map(
      classMarks
        .filter(mark => mark.enteredBy)
        .map(mark => [mark.enteredBy._id.toString(), { id: mark.enteredBy._id, name: mark.enteredBy.name }])
    ).values()];

    const gradeDistribution = classMarks.reduce((acc, m) => {
      acc[m.grade] = (acc[m.grade] || 0) + 1;
      return acc;
    }, {});

    const studentResults = students.map(student => {
      const mark = marksByStudent.get(student._id.toString());
      const hasMarks = Boolean(mark);
      const hasPassed = hasMarks && !mark.isAbsent && Number(mark.marksObtained || 0) >= Number(exam.passMark || 0);

      return {
        studentId: student._id,
        name: student.name,
        satCode: student.satCode,
        penCode: student.penCode,
        marksObtained: hasMarks ? mark.marksObtained : null,
        isAbsent: hasMarks ? mark.isAbsent : false,
        grade: hasMarks ? mark.grade : "",
        status: hasMarks ? (hasPassed ? "Pass" : "Fail") : "Not Uploaded",
        uploaded: hasMarks
      };
    });

    res.json({
      exam: {
        id: exam._id,
        title: exam.title,
        class: exam.class,
        subject: exam.subject,
        maxMarks: exam.maxMarks,
        passMark: exam.passMark
      },
      isUploaded,
      uploadedBy,
      avg,
      highest,
      lowest,
      passed,
      failed,
      uploaded,
      missing,
      total: totalStudents,
      gradeDistribution,
      students: studentResults
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
