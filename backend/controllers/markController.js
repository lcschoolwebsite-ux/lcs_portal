const Mark = require("../models/Mark");
const Student = require("../models/Student");
const Exam = require("../models/Exam");
const ExamType = require("../models/ExamType");
const { notifyClassStudents, notifyStudentById } = require("../utils/pushNotification");
const { canViewExam, canEditExam } = require("../utils/teacherAccess");

const calculateGrade = (marksObtained, maxMarks, isAbsent) => {
  if (isAbsent) return "AB";
  const percentage = maxMarks > 0 ? (Number(marksObtained || 0) / maxMarks) * 100 : 0;
  if      (percentage >= 90) return "A+";
  else if (percentage >= 80) return "A";
  else if (percentage >= 70) return "B+";
  else if (percentage >= 60) return "B";
  else if (percentage >= 50) return "C";
  else if (percentage >= 35) return "D";
  return "F";
};

exports.getExamMarks = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const canEdit = req.user.role !== "teacher" ? true : await canEditExam(req, exam);
    if (req.user.role === "teacher" && !(await canViewExam(req, exam))) {
      return res.status(403).json({ message: "Exam not assigned to teacher" });
    }

    const students = await Student.find({ class: exam.class, isActive: true })
      .select("name satCode")
      .sort({ name: 1 })
      .lean();
    const existingMarks = await Mark.find({ exam: exam._id })
      .select("student marksObtained isAbsent grade")
      .lean();
    const marksByStudent = new Map(existingMarks.map(mark => [mark.student.toString(), mark]));

    const result = students.map(s => {
      const m = marksByStudent.get(s._id.toString());
      return {
        studentId:     s._id,
        name:          s.name,
        satCode:       s.satCode,
        marksObtained: m ? m.marksObtained : "",
        isAbsent:      m ? m.isAbsent : false,
        grade:         m ? m.grade : ""
      };
    });

    res.json({
      canEdit,
      students: result
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.saveMarks = async (req, res) => {
  try {
    const { examId, records } = req.body;
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    if (req.user.role === "teacher" && !(await canEditExam(req, exam))) {
      return res.status(403).json({ message: "Exam not assigned to teacher" });
    }

    const bulkOps = records.map(r => ({
      updateOne: {
        filter: { student: r.studentId, exam: examId, subject: exam.subject },
        update: {
          student:       r.studentId,
          exam:          examId,
          subject:       exam.subject,
          academicYear:  exam.academicYear,
          marksObtained: r.marksObtained || 0,
          isAbsent:      r.isAbsent || false,
          grade:         calculateGrade(r.marksObtained, exam.maxMarks, r.isAbsent),
          enteredBy:     req.user.id
        },
        upsert: true
      }
    }));

    if (bulkOps.length) await Mark.bulkWrite(bulkOps);
    
    // Send individual push notifications to each student about their marks
    if (records && records.length > 0) {
      try {
        const examTitle = exam.title || "Exam";
        const subjectName = exam.subject?.name || "Subject";
        
        // Populate subject name if it's just an ID
        const populatedExam = await Exam.findById(examId).populate("subject", "name");
        const subjectDisplayName = populatedExam?.subject?.name || subjectName;

        for (const record of records) {
          try {
            const isAbsent = record.isAbsent || false;
            const grade = calculateGrade(record.marksObtained, exam.maxMarks, isAbsent);
            
            let notificationBody;
            if (isAbsent) {
              notificationBody = `Your ${examTitle} (${subjectDisplayName}) result is available. Status: Absent`;
            } else {
              notificationBody = `Your ${examTitle} (${subjectDisplayName}) result is available. Grade: ${grade}`;
            }

            await notifyStudentById(
              record.studentId,
              "Exam Results Published",
              notificationBody,
              { 
                url: "/student/marks",
                type: "marks",
                examId: examId,
                grade: grade
              }
            );
          } catch (notifyErr) {
            console.warn(`Failed to notify student ${record.studentId}:`, notifyErr.message);
          }
        }
      } catch (err) {
        console.warn("Push notification to students failed:", err.message);
      }
    }

    // Also send general notification to entire class
    await notifyClassStudents(
      exam.class,
      "Results updated",
      `${exam.title || "An exam"} results have been updated for your class.`,
      { url: "/student/marks" }
    ).catch(error => console.warn("Results push failed:", error.message));
    res.json({ message: "Marks saved successfully" });
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.getReportCard = async (req, res) => {
  try {
    const { studentId, academicYear, examType } = req.query;
    const query = { student: studentId };
    if (academicYear) query.academicYear = academicYear;

    const marks = await Mark.find(query).populate("exam").populate("subject", "name");
    let filteredMarks = examType ? marks.filter(m => m.exam?.examType === examType) : marks;

    if (req.user?.role === "student") {
      const publishedTypes = await ExamType.find({ isPublished: true }).select("name").lean();
      const publishedTypeNames = new Set(publishedTypes.map(type => type.name));
      filteredMarks = filteredMarks.filter(mark => publishedTypeNames.has(mark.exam?.examType));
    }

    const subjects = filteredMarks.reduce((acc, m) => {
      const sName = m.subject?.name || "Subject";
      if (!acc[sName]) acc[sName] = [];
      acc[sName].push({
        examTitle:     m.exam?.title || "Exam",
        examType:      m.exam?.examType || "Exam",
        marksObtained: m.marksObtained,
        maxMarks:      m.exam?.maxMarks || 0,
        grade:         m.grade,
        percentage:    m.exam?.maxMarks ? (m.marksObtained / m.exam.maxMarks) * 100 : 0
      });
      return acc;
    }, {});

    res.json({ subjects });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.getAdminOverview = async (req, res) => {
  try {
    const { classId, examType, search, teacherId } = req.query;
    const examQuery = {};
    if (classId) examQuery.class = classId;
    if (examType) examQuery.examType = examType;

    const exams = await Exam.find(examQuery)
      .populate("class", "name section")
      .populate("subject", "name")
      .sort({ date: -1 })
      .lean();

    const examIds = exams.map(exam => exam._id);
    if (!examIds.length) {
      return res.json({
        summary: {
          totalStudents: 0,
          totalExams: 0,
          totalMarks: 0,
          passedCount: 0,
          failedCount: 0,
          absentCount: 0,
          teacherCount: 0
        },
        teachers: [],
        marks: [],
        students: [],
        failedBreakdown: [],
        exams: []
      });
    }

    const marks = await Mark.find({ exam: { $in: examIds } })
      .populate({
        path: "exam",
        populate: [
          { path: "class", select: "name section" },
          { path: "subject", select: "name" }
        ]
      })
      .populate("subject", "name")
      .populate("student", "name satCode penCode class")
      .populate({
        path: "student",
        populate: { path: "class", select: "name section" }
      })
      .populate("enteredBy", "name")
      .lean();

    const normalizedSearch = String(search || "").trim().toLowerCase();
    const searchedMarks = normalizedSearch
      ? marks.filter(mark => {
          const studentName = mark.student?.name || "";
          const satCode = mark.student?.satCode || "";
          const penCode = mark.student?.penCode || "";
          return [studentName, satCode, penCode]
            .some(value => String(value).toLowerCase().includes(normalizedSearch));
        })
      : marks;

    const selectedTeacherId = String(teacherId || "").trim();
    const visibleMarks = selectedTeacherId
      ? searchedMarks.filter(mark => String(mark.enteredBy?._id || "") === selectedTeacherId)
      : searchedMarks;

    const teacherMap = new Map();
    searchedMarks.forEach(mark => {
      const enteredTeacherId = mark.enteredBy?._id?.toString();
      if (!enteredTeacherId) return;

      const current = teacherMap.get(enteredTeacherId) || {
        id: enteredTeacherId,
        name: mark.enteredBy?.name || "Teacher",
        marksCount: 0,
        exams: new Set(),
        classes: new Set(),
        subjects: new Set()
      };

      current.marksCount += 1;
      if (mark.exam?._id) current.exams.add(mark.exam._id.toString());
      const classNameValue = mark.exam?.class ? [mark.exam.class.name, mark.exam.class.section].filter(Boolean).join(" ") : "";
      const subjectNameValue = mark.subject?.name || mark.exam?.subject?.name || "";
      if (classNameValue) current.classes.add(classNameValue);
      if (subjectNameValue) current.subjects.add(subjectNameValue);
      teacherMap.set(enteredTeacherId, current);
    });

    const studentMap = new Map();
    const failedBreakdown = [];
    const marksList = visibleMarks.map(mark => {
      const studentClass = mark.student?.class;
      const className = studentClass ? [studentClass.name, studentClass.section].filter(Boolean).join(" ") : "N/A";
      const classId = studentClass?._id?.toString() || mark.exam?.class?._id?.toString() || "";
      const examId = mark.exam?._id?.toString() || "";
      const examPassMark = Number(mark.exam?.passMark || 0);
      const examMaxMarks = Number(mark.exam?.maxMarks || 0);
      const marksObtained = Number(mark.marksObtained || 0);
      const isAbsent = Boolean(mark.isAbsent);
      const isPass = !isAbsent && marksObtained >= examPassMark;

      return {
        studentId: mark.student?._id?.toString() || "",
        name: mark.student?.name || "Student",
        satCode: mark.student?.satCode || "",
        penCode: mark.student?.penCode || "",
        classId,
        examId,
        className,
        teacherId: mark.enteredBy?._id?.toString() || "",
        examTitle: mark.exam?.title || "Exam",
        examType: mark.exam?.examType || "Exam",
        subjectName: mark.subject?.name || mark.exam?.subject?.name || "Subject",
        date: mark.exam?.date || "",
        marksObtained: isAbsent ? "AB" : marksObtained,
        maxMarks: examMaxMarks,
        passMark: examPassMark,
        grade: mark.grade || "",
        status: isAbsent ? "Absent" : isPass ? "Pass" : "Fail",
        teacherName: mark.enteredBy?.name || "N/A"
      };
    });

    visibleMarks.forEach(mark => {
      const studentId = mark.student?._id?.toString();
      if (!studentId) return;

      const examPassMark = Number(mark.exam?.passMark || 0);
      const examMaxMarks = Number(mark.exam?.maxMarks || 0);
      const marksObtained = Number(mark.marksObtained || 0);
      const isAbsent = Boolean(mark.isAbsent);
      const isPass = !isAbsent && marksObtained >= examPassMark;
      const studentClass = mark.student?.class;
      const className = studentClass ? [studentClass.name, studentClass.section].filter(Boolean).join(" ") : "N/A";

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          studentId,
          name: mark.student?.name || "Student",
          satCode: mark.student?.satCode || "",
          penCode: mark.student?.penCode || "",
          className,
          passes: 0,
          fails: 0,
          absent: 0,
          totalMarks: 0,
          examsTaken: 0,
          average: 0,
          results: []
        });
      }

      const studentRow = studentMap.get(studentId);
      studentRow.examsTaken += 1;
      studentRow.totalMarks += isAbsent ? 0 : marksObtained;
      if (isAbsent) studentRow.absent += 1;
      else if (isPass) studentRow.passes += 1;
      else studentRow.fails += 1;

      studentRow.results.push({
        examId: mark.exam?._id || mark.exam,
        examTitle: mark.exam?.title || "Exam",
        examType: mark.exam?.examType || "Exam",
        subjectName: mark.subject?.name || mark.exam?.subject?.name || "Subject",
        date: mark.exam?.date || "",
        marksObtained: isAbsent ? "AB" : marksObtained,
        maxMarks: examMaxMarks,
        passMark: examPassMark,
        grade: mark.grade || "",
        status: isAbsent ? "Absent" : isPass ? "Pass" : "Fail",
        teacherName: mark.enteredBy?.name || "N/A"
      });

      if (!isPass || isAbsent) {
        failedBreakdown.push({
          studentId,
          name: mark.student?.name || "Student",
          satCode: mark.student?.satCode || "",
          className,
          examTitle: mark.exam?.title || "Exam",
          examType: mark.exam?.examType || "Exam",
          subjectName: mark.subject?.name || mark.exam?.subject?.name || "Subject",
          marksObtained: isAbsent ? "AB" : marksObtained,
          maxMarks: examMaxMarks,
          passMark: examPassMark,
          grade: mark.grade || "",
          teacherName: mark.enteredBy?.name || "N/A"
        });
      }
    });

    const students = [...studentMap.values()].map(student => ({
      ...student,
      average: student.examsTaken && (student.examsTaken - student.absent) > 0
        ? Number((student.totalMarks / (student.examsTaken - student.absent)).toFixed(1))
        : 0,
      results: student.results.sort((a, b) => {
        if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
        return String(a.examTitle).localeCompare(String(b.examTitle));
      })
    })).sort((a, b) => a.name.localeCompare(b.name));

    const summary = {
      totalStudents: students.length,
      totalExams: exams.length,
      totalMarks: visibleMarks.length,
      passedCount: students.reduce((sum, student) => sum + student.passes, 0),
      failedCount: failedBreakdown.filter(row => row.marksObtained !== "AB").length,
      absentCount: failedBreakdown.filter(row => row.marksObtained === "AB").length,
      teacherCount: teacherMap.size
    };

    res.json({
      summary,
      teachers: [...teacherMap.values()].map(teacher => ({
        id: teacher.id,
        name: teacher.name,
        marksCount: teacher.marksCount,
        examCount: teacher.exams.size,
        classes: [...teacher.classes].sort((a, b) => a.localeCompare(b)),
        subjects: [...teacher.subjects].sort((a, b) => a.localeCompare(b))
      })).sort((a, b) => b.marksCount - a.marksCount),
      marks: marksList.sort((a, b) => {
        if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1;
        if (a.teacherName !== b.teacherName) return a.teacherName.localeCompare(b.teacherName);
        if (a.className !== b.className) return a.className.localeCompare(b.className);
        return a.name.localeCompare(b.name);
      }),
      students,
      failedBreakdown: failedBreakdown.sort((a, b) => a.name.localeCompare(b.name)),
      exams: exams.map(exam => ({
        id: exam._id,
        title: exam.title,
        examType: exam.examType,
        className: exam.class ? [exam.class.name, exam.class.section].filter(Boolean).join(" ") : "N/A",
        subjectName: exam.subject?.name || "Subject",
        date: exam.date,
        maxMarks: exam.maxMarks,
        passMark: exam.passMark
      }))
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
