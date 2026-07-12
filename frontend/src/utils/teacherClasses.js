export const formatClassLabel = cls => [cls?.name, cls?.section].filter(Boolean).join(" ") || "Class";

const getClassId = cls => cls?._id || cls?.id || cls;

const uniqueById = items => {
  const seen = new Set();
  return items.filter(item => {
    const id = getClassId(item);
    if (!id) return false;
    const key = String(id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getTeacherAssignedClassIds = user => {
  const directIds = Array.isArray(user?.assignedClasses)
    ? user.assignedClasses.map(getClassId).filter(Boolean)
    : [];

  const subjectClassIds = Array.isArray(user?.assignedSubjects)
    ? user.assignedSubjects
        .map(subject => subject?.class?._id || subject?.class || subject?.classId)
        .filter(Boolean)
        .map(String)
    : [];

  return [...new Set([...directIds.map(String), ...subjectClassIds])];
};

export const getTeacherAssignedClasses = (user, classes = []) => {
  const assignedIds = new Set(getTeacherAssignedClassIds(user));
  const classList = Array.isArray(classes) && classes.length > 0
    ? classes
    : Array.isArray(user?.assignedClasses)
      ? user.assignedClasses.filter(Boolean)
      : [];

  return uniqueById(classList.filter(cls => assignedIds.has(String(getClassId(cls)))));
};

export const isClassTeacher = (user, cls) =>
  String(cls?.classTeacher?._id || cls?.classTeacher || "") === String(user?.id || user?._id || "");

export const getTeacherSubjectForClass = (user, classId, subjects = [], classes = []) => {
  const normalizedClassId = String(classId || "");
  const classInfo = Array.isArray(classes)
    ? classes.find(cls => String(getClassId(cls)) === normalizedClassId)
    : null;
  const subjectList = Array.isArray(subjects) && subjects.length > 0
    ? subjects
    : Array.isArray(user?.assignedSubjects)
      ? user.assignedSubjects
      : [];

  const classTeacherSubjectId = String(classInfo?.classTeacherSubject?._id || classInfo?.classTeacherSubject || "");
  if (classTeacherSubjectId) {
    const directMatch = subjectList.find(subject =>
      String(subject?._id || subject?.id || subject) === classTeacherSubjectId
    );
    if (directMatch) return directMatch;
    return { _id: classTeacherSubjectId, name: classInfo?.classTeacherSubject?.name || "" };
  }

  const matches = subjectList.filter(subject => {
    const subjectClassId = String(subject?.class?._id || subject?.class || subject?.classId || "");
    const teacherId = String(subject?.teacher?._id || subject?.teacher || "");
    const userId = String(user?.id || user?._id || "");
    return subjectClassId === normalizedClassId && (!teacherId || teacherId === userId);
  });

  return matches[0] || null;
};

export const getTeacherSubjectsForClass = (user, classId, subjects = []) => {
  const normalizedClassId = String(classId || "");
  const userId = String(user?.id || user?._id || "");
  const subjectList = Array.isArray(subjects) ? subjects : [];
  const assignedSubjectIds = new Set(
    Array.isArray(user?.assignedSubjects)
      ? user.assignedSubjects.map(subject => String(subject?._id || subject?.id || subject)).filter(Boolean)
      : []
  );

  return subjectList.filter(subject => {
    const subjectClassId = String(subject?.class?._id || subject?.class || subject?.classId || "");
    const teacherId = String(subject?.teacher?._id || subject?.teacher || "");
    const subjectId = String(subject?._id || subject?.id || "");
    return subjectClassId === normalizedClassId && (
      assignedSubjectIds.has(subjectId) || teacherId === userId
    );
  });
};
