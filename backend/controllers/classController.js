const Class = require("../models/Class");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const Exam = require("../models/Exam");
const Attendance = require("../models/Attendance");
const FeeStructure = require("../models/FeeStructure");
const Teacher = require("../models/Teacher");
const {
  syncClassTeacher,
  syncClassTeacherSubjectAssignment
} = require("../utils/classAssignmentSync");

const normalizeClassPayload = body => {
  const payload = { ...body };
  if (typeof payload.name === "string") payload.name = payload.name.trim();
  if (typeof payload.section === "string") payload.section = payload.section.trim();
  return payload;
};

const duplicateClassMessage = () =>
  "A class with the same academic year, name, and section already exists.";

const populateClass = query =>
  query
    .populate("academicYear", "year")
    .populate("classTeacher", "name phone username")
    .populate("classTeacherSubject", "name");

const normalizeOptionalObjectId = value => {
  if (value === "" || value === null || typeof value === "undefined") return undefined;
  return value;
};

const validateClassTeacherSubject = async (classId, subjectId) => {
  if (!subjectId) return null;
  const subject = await Subject.findById(subjectId).select("_id class").lean();
  if (!subject) {
    return "Selected subject was not found.";
  }
  if (String(subject.class) !== String(classId)) {
    return "Selected subject must belong to this class.";
  }
  return null;
};

exports.getAll = async (req, res) => {
  const { academicYear } = req.query;
  const includeStats = String(req.query.includeStats || "").toLowerCase() === "true";
  const q = academicYear ? { academicYear } : {};

  const classes = await populateClass(Class.find(q).lean());

  if (!includeStats || classes.length === 0) {
    return res.json(classes);
  }

  const classIds = classes.map(cls => cls._id);
  const [studentCounts, examCounts] = await Promise.all([
    Student.aggregate([
      { $match: { class: { $in: classIds } } },
      { $group: { _id: "$class", count: { $sum: 1 } } }
    ]),
    Exam.aggregate([
      { $match: { class: { $in: classIds } } },
      { $group: { _id: "$class", count: { $sum: 1 } } }
    ])
  ]);

  const studentCountMap = new Map(studentCounts.map(row => [String(row._id), row.count]));
  const examCountMap = new Map(examCounts.map(row => [String(row._id), row.count]));

  return res.json(classes.map(cls => ({
    ...cls,
    studentCount: studentCountMap.get(String(cls._id)) || 0,
    examCount: examCountMap.get(String(cls._id)) || 0
  })));
};

exports.getManagement = async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id)
      .populate("academicYear", "year")
      .populate("classTeacher", "name phone username")
      .populate("classTeacherSubject", "name")
      .lean();

    if (!classDoc) {
      return res.status(404).json({ message: "Class not found" });
    }

    const [subjects, teachers] = await Promise.all([
      Subject.find({ class: classDoc._id })
        .populate("teacher", "name phone")
        .sort({ name: 1 })
        .lean(),
      Teacher.find({ isActive: true })
        .select("name phone username assignedClasses assignedSubjects")
        .sort({ name: 1 })
        .lean()
    ]);

    res.json({
      class: classDoc,
      subjects,
      teachers
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = normalizeClassPayload(req.body);
    if (payload.classTeacher === "") delete payload.classTeacher;
    if (payload.classTeacherSubject === "") delete payload.classTeacherSubject;
    const created = await Class.create(payload);
    if (created.classTeacher) {
      await syncClassTeacher(created._id, created.classTeacher);
    }
    if (created.classTeacherSubject && created.classTeacher) {
      await syncClassTeacherSubjectAssignment(created._id, created.classTeacher, created.classTeacherSubject);
    }
    res.status(201).json(await populateClass(Class.findById(created._id)));
  }
  catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: duplicateClassMessage() });
    }
    res.status(400).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = normalizeClassPayload(req.body);
    const setPayload = {};
    const unsetPayload = {};

    ["name", "section", "academicYear", "classTeacher", "classTeacherSubject"].forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
      const value = normalizeOptionalObjectId(payload[field]);
      if (value === undefined) {
        unsetPayload[field] = "";
      } else {
        setPayload[field] = value;
      }
    });

    if (Object.prototype.hasOwnProperty.call(setPayload, "classTeacherSubject")) {
      const validationError = await validateClassTeacherSubject(req.params.id, setPayload.classTeacherSubject);
      if (validationError) {
        return res.status(400).json({ message: validationError });
      }
    }

    if (Object.prototype.hasOwnProperty.call(unsetPayload, "classTeacher")) {
      unsetPayload.classTeacherSubject = "";
    }

    const existing = await Class.findById(req.params.id).select("classTeacher classTeacherSubject");
    if (!existing) return res.status(404).json({ message: "Class not found" });

    const update = {};
    if (Object.keys(setPayload).length > 0) update.$set = setPayload;
    if (Object.keys(unsetPayload).length > 0) update.$unset = unsetPayload;

    const updated = await Class.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });

    if (!updated) return res.status(404).json({ message: "Class not found" });
    if (Object.prototype.hasOwnProperty.call(setPayload, "classTeacher")) {
      await syncClassTeacher(updated._id, setPayload.classTeacher || null, existing.classTeacher || null);
    } else if (Object.prototype.hasOwnProperty.call(unsetPayload, "classTeacher")) {
      await syncClassTeacher(updated._id, null, existing.classTeacher || null);
    } else if (updated.classTeacher) {
      await syncClassTeacher(updated._id, updated.classTeacher, existing.classTeacher || null);
    }

    await syncClassTeacherSubjectAssignment(
      updated._id,
      updated.classTeacher,
      updated.classTeacherSubject,
      existing.classTeacher,
      existing.classTeacherSubject
    );

    const refreshed = await populateClass(Class.findById(updated._id));

    res.json(refreshed);
  }
  catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: duplicateClassMessage() });
    }
    res.status(400).json({ message: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const classDoc = await Class.findById(req.params.id);
    if (!classDoc) return res.status(404).json({ message: "Class not found" });

    const [
      studentCount,
      subjectCount,
      examCount,
      attendanceCount,
      feeStructureCount
    ] = await Promise.all([
      Student.countDocuments({ class: classDoc._id }),
      Subject.countDocuments({ class: classDoc._id }),
      Exam.countDocuments({ class: classDoc._id }),
      Attendance.countDocuments({ class: classDoc._id }),
      FeeStructure.countDocuments({ class: classDoc._id })
    ]);

    const blockingRefs = [
      [studentCount, "students"],
      [subjectCount, "subjects"],
      [examCount, "exams"],
      [attendanceCount, "attendance records"],
      [feeStructureCount, "fee structures"]
    ].filter(([count]) => count > 0);

    if (blockingRefs.length > 0) {
      const labels = blockingRefs.map(([count, label]) => `${count} ${label}`).join(", ");
      return res.status(409).json({
        message: `This class cannot be deleted because it is still used by ${labels}.`
      });
    }

    await Teacher.updateMany(
      { assignedClasses: classDoc._id },
      { $pull: { assignedClasses: classDoc._id } }
    );

    if (classDoc.classTeacherSubject) {
      await Teacher.updateMany(
        { assignedSubjects: classDoc.classTeacherSubject },
        { $pull: { assignedSubjects: classDoc.classTeacherSubject } }
      );
    }

    if (classDoc.classTeacher) {
      await Teacher.findByIdAndUpdate(classDoc.classTeacher, {
        $pull: { assignedClasses: classDoc._id }
      });
    }

    await Class.findByIdAndDelete(classDoc._id);
    res.json({ message: "Deleted" });
  }
  catch (e) { res.status(500).json({ message: e.message }); }
};
