const Class = require("../models/Class");
const Subject = require("../models/Subject");
const Teacher = require("../models/Teacher");

const toIdString = value => (value == null ? "" : value.toString());

// This helper exists because the codebase currently uses two different teacher-class
// ownership patterns:
// 1) Teacher.assignedClasses
// 2) Class.classTeacher
// New features should treat either as sufficient access.
const teacherCanAccessClass = async (teacherId, classId) => {
  if (!teacherId || !classId) return false;

  const [teacher, classDoc] = await Promise.all([
    Teacher.findById(teacherId).select("assignedClasses").lean(),
    Class.findById(classId).select("_id classTeacher").lean()
  ]);

  if (!teacher || !classDoc) return false;

  const assignedClassIds = (teacher.assignedClasses || []).map(toIdString);
  const classTeacherId = toIdString(classDoc.classTeacher);

  return assignedClassIds.includes(toIdString(classId)) || classTeacherId === toIdString(teacherId);
};

const teacherCanAccessSubject = async (teacherId, subjectId, classId = null) => {
  if (!teacherId || !subjectId) return false;

  const [teacher, subject] = await Promise.all([
    Teacher.findById(teacherId).select("assignedSubjects").lean(),
    Subject.findById(subjectId).select("_id class teacher").lean()
  ]);

  if (!teacher || !subject) return false;
  if (classId && toIdString(subject.class) !== toIdString(classId)) return false;

  const assignedSubjectIds = (teacher.assignedSubjects || []).map(toIdString);
  const subjectTeacherId = toIdString(subject.teacher);

  return assignedSubjectIds.includes(toIdString(subjectId)) || subjectTeacherId === toIdString(teacherId);
};

module.exports = {
  teacherCanAccessClass,
  teacherCanAccessSubject
};
