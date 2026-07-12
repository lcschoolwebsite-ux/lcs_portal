const generateToken = require("../utils/generateToken");
const { canTeachersCreateStudents } = require("./settingController");

const compactRefs = value => (Array.isArray(value) ? value.filter(Boolean) : value);

const computeTeacherAccessFlags = async (teacherDoc) => {
  const teacherId = String(teacherDoc?._id || "");
  const assignedClasses = Array.isArray(teacherDoc?.assignedClasses) ? teacherDoc.assignedClasses : [];
  const canTakeAttendance = assignedClasses.some(cls =>
    String(cls?.classTeacher?._id || cls?.classTeacher || "") === teacherId
  );

  return {
    canTakeAttendance,
    canCreateStudents: await canTeachersCreateStudents()
  };
};

exports.login = async (req, res) => {
  const { role, username, password } = req.body;

  try {
    // ── ADMIN LOGIN ──────────────────────────
    if (role === "admin") {
      const adminUser = process.env.ADMIN_USERNAME?.trim();
      const adminPass = process.env.ADMIN_PASSWORD?.trim();

      if (!adminUser || !adminPass) {
        return res.status(500).json({
          message: "Admin login is not configured on the server"
        });
      }

      if (username !== adminUser || password !== adminPass) {
        return res.status(401).json({ 
          message: "Invalid admin credentials" 
        });
      }

      const token = generateToken({ 
        id: "admin", 
        role: "admin", 
        name: "Administrator" 
      });

      return res.json({
        token,
        user: { 
          id: "admin", 
          role: "admin", 
          name: "Administrator" 
        }
      });
    }

    // ── TEACHER LOGIN ─────────────────────────
    if (role === "teacher") {
      const Teacher = require("../models/Teacher");
      const teacher = await Teacher.findOne({ 
        username, 
        isActive: true 
      }).populate("assignedClasses", "name section classTeacher")
        .populate("assignedSubjects", "name");

      if (!teacher) {
        return res.status(401).json({ 
          message: "Teacher not found" 
        });
      }

      const isMatch = await teacher.matchPassword(password);
      if (!isMatch) {
        return res.status(401).json({ 
          message: "Invalid password" 
        });
      }

      const token = generateToken({ 
        id: teacher._id, 
        role: "teacher", 
        name: teacher.name 
      });
      const accessFlags = await computeTeacherAccessFlags(teacher);

      return res.json({
        token,
        user: { 
          id: teacher._id, 
          role: "teacher", 
          name: teacher.name,
          assignedClasses: compactRefs(teacher.assignedClasses),
          assignedSubjects: compactRefs(teacher.assignedSubjects),
          ...accessFlags
        }
      });
    }

    // ── STUDENT LOGIN ─────────────────────────
    if (role === "student") {
      const Student = require("../models/Student");
      const StudentLoginLog = require("../models/StudentLoginLog");
      const student = await Student.findOne({ 
        satCode: username, 
        isActive: true 
      }).populate("class", "name section")
        .populate("academicYear", "year");

      if (!student) {
        return res.status(401).json({ 
          message: "Student not found" 
        });
      }

      if (student.mobile !== password) {
        return res.status(401).json({ 
          message: "Invalid student credentials" 
        });
      }

      const token = generateToken({ 
        id: student._id, 
        role: "student", 
        name: student.name 
      });

      StudentLoginLog.create({
        studentId: student._id,
        studentName: student.name,
        satCode: student.satCode,
        className: student.class ? `${student.class.name || ""}${student.class.section ? ` ${student.class.section}` : ""}`.trim() : "",
        academicYear: student.academicYear?.year || ""
      }).catch(err => {
        console.error("Student login log error:", err.message);
      });

      return res.json({
        token,
        user: { 
          id: student._id, 
          role: "student", 
          name: student.name,
          dob: student.dob,
          fatherName: student.fatherName,
          motherName: student.motherName,
          mobile: student.mobile,
          alternateMobile: student.alternateMobile,
          email: student.email,
          address: student.address,
          satCode: student.satCode,
          penCode: student.penCode,
          class: student.class,
          academicYear: student.academicYear,
          photoUrl: student.photoUrl
        }
      });
    }

    return res.status(400).json({ message: "Invalid role" });

  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error: " + err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const { role, id } = req.user;

    if (role === "admin") {
      return res.json({ 
        id: "admin", 
        role: "admin", 
        name: "Administrator" 
      });
    }

    if (role === "teacher") {
      const Teacher = require("../models/Teacher");
      const teacher = await Teacher.findById(id)
        .select("-password")
        .populate("assignedClasses", "name section classTeacher")
        .populate("assignedSubjects");
      if (!teacher) return res.status(404).json({ message: "Teacher not found" });
      const teacherData = teacher.toObject();
      teacherData.assignedClasses = compactRefs(teacherData.assignedClasses);
      teacherData.assignedSubjects = compactRefs(teacherData.assignedSubjects);
      Object.assign(teacherData, await computeTeacherAccessFlags(teacherData));
      return res.json({ ...teacherData, role: "teacher" });
    }

    if (role === "student") {
      const Student = require("../models/Student");
      const student = await Student.findById(id)
        .populate("class")
        .populate("academicYear");
      if (!student) return res.status(404).json({ message: "Student not found" });
      return res.json({ ...student.toObject(), role: "student" });
    }

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
