const Homework = require("../models/Homework");
const Student = require("../models/Student");
const Subject = require("../models/Subject");
const path = require("path");
const { teacherCanAccessClass, teacherCanAccessSubject } = require("../utils/teacherClassAccess");
const { uploadFile, getFileStream, deleteFile } = require("../utils/fileStorage");
const { notifyClassStudents } = require("../utils/pushNotification");

const toIdString = value => (value == null ? "" : value.toString());

const isAdmin = req => String(req.user?.role || "").toLowerCase() === "admin";
const isTeacher = req => String(req.user?.role || "").toLowerCase() === "teacher";
const isStudent = req => String(req.user?.role || "").toLowerCase() === "student";

const getStudentClassId = async studentId => {
  const student = await Student.findById(studentId).select("class").lean();
  return toIdString(student?.class);
};

const canStudentAccessClass = async (req, classId) => {
  if (!isStudent(req)) return false;
  return toIdString(await getStudentClassId(req.user.id)) === toIdString(classId);
};

const canAccessHomeworkClass = async (req, classId) => {
  if (isAdmin(req)) return true;
  if (isTeacher(req)) return teacherCanAccessClass(req.user.id, classId);
  if (isStudent(req)) return canStudentAccessClass(req, classId);
  return false;
};

const populateHomework = query =>
  query
    .populate("subjectId", "name teacher class")
    .populate("uploadedBy", "name")
    .populate("classId", "name section")
    .populate("academicYear", "year");

const buildDownloadName = homework => {
  const rawName = String(homework?.fileName || homework?.title || "homework.pdf")
    .trim()
    .replace(/"/g, "'");
  return rawName;
};

const getDownloadContentType = homework => {
  const mimeType = String(homework?.fileMimeType || "").trim().toLowerCase();
  if (mimeType) return mimeType;
  const ext = path.extname(String(homework?.fileName || "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
};

const canTeacherManageHomework = async (req, classId, subjectId) => {
  if (isAdmin(req)) return true;
  if (!isTeacher(req)) return false;

  const [classAccess, subjectAccess] = await Promise.all([
    teacherCanAccessClass(req.user.id, classId),
    teacherCanAccessSubject(req.user.id, subjectId, classId)
  ]);

  return classAccess && subjectAccess;
};

exports.create = async (req, res) => {
  try {
    if (!isTeacher(req)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { classId, subjectId, title, description = "" } = req.body;
    const file = req.file;

    if (!classId || !subjectId || !title?.trim()) {
      return res.status(400).json({ message: "Class, subject, and title are required" });
    }

    if (!file?.buffer) {
      return res.status(400).json({ message: "Homework file is required" });
    }

    const subject = await Subject.findOne({
      _id: subjectId,
      class: classId
    }).select("_id class academicYear name").lean();

    if (!subject) {
      return res.status(400).json({ message: "Subject does not belong to the selected class" });
    }

    if (!(await canTeacherManageHomework(req, classId, subjectId))) {
      return res.status(403).json({ message: "Subject not assigned to teacher" });
    }

    let storage = null;
    let homework = null;

    try {
      storage = await uploadFile(file.buffer, file.originalname, file.mimetype);
      homework = await Homework.create({
        classId,
        subjectId,
        title: title.trim(),
        description: String(description || "").trim(),
        storageId: storage.storageId,
        fileName: file.originalname || "",
        fileMimeType: file.mimetype || "",
        fileUrl: storage.url || "",
        uploadedBy: req.user.id,
        academicYear: subject.academicYear
      });
    } catch (error) {
      if (storage?.storageId) {
        await deleteFile(storage.storageId).catch(() => {});
      }
      throw error;
    }

    await notifyClassStudents(
      classId,
      "New homework posted",
      `${title.trim()} has been posted for your class.`,
      { url: "/student/homework", homeworkId: homework._id.toString() }
    ).catch(error => console.warn("Homework notification failed:", error.message));

    const populated = await populateHomework(Homework.findById(homework._id));
    res.status(201).json({
      message: "Homework uploaded",
      homework: populated
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

exports.getByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { subjectId } = req.query;
    const { academicYear } = req.query;

    if (!(await canAccessHomeworkClass(req, classId))) {
      return res.status(403).json({ message: "Access denied for this class" });
    }

    const filter = { classId };
    if (subjectId) filter.subjectId = subjectId;
    if (academicYear) filter.academicYear = academicYear;

    const homework = await populateHomework(
      Homework.find(filter).sort({ createdAt: -1 }).lean()
    );

    res.json(homework);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id).select("_id classId subjectId storageId fileName fileMimeType fileUrl title description academicYear").lean();

    if (!homework) {
      return res.status(404).json({ message: "Homework not found" });
    }

    const nextClassId = req.body.classId || homework.classId;
    const nextSubjectId = req.body.subjectId || homework.subjectId;
    const nextTitle = String(req.body.title ?? homework.title ?? "").trim();
    const nextDescription = String(req.body.description ?? homework.description ?? "").trim();
    const file = req.file;

    if (!nextClassId || !nextSubjectId || !nextTitle) {
      return res.status(400).json({ message: "Class, subject, and title are required" });
    }

    if (!(await canTeacherManageHomework(req, nextClassId, nextSubjectId))) {
      return res.status(403).json({ message: "Access denied for this homework" });
    }

    const subject = await Subject.findOne({
      _id: nextSubjectId,
      class: nextClassId
    }).select("_id class academicYear name").lean();

    if (!subject) {
      return res.status(400).json({ message: "Subject does not belong to the selected class" });
    }

    let storage = null;
    if (file?.buffer) {
      storage = await uploadFile(file.buffer, file.originalname, file.mimetype);
    }

    const update = {
      classId: nextClassId,
      subjectId: nextSubjectId,
      title: nextTitle,
      description: nextDescription,
      academicYear: subject.academicYear
    };

    if (storage) {
      update.storageId = storage.storageId;
      update.fileName = file.originalname || homework.fileName || "";
      update.fileMimeType = file.mimetype || homework.fileMimeType || "";
      update.fileUrl = storage.url || "";
    }

    const updatedHomework = await Homework.findByIdAndUpdate(req.params.id, update, { new: true });

    if (storage && homework.storageId) {
      await deleteFile(homework.storageId).catch(() => {});
    }

    const populated = await populateHomework(Homework.findById(updatedHomework._id));
    res.json({
      message: "Homework updated",
      homework: populated
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
};

exports.download = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate("classId", "_id")
      .lean();

    if (!homework) {
      return res.status(404).json({ message: "Homework not found" });
    }

    if (!(await canAccessHomeworkClass(req, homework.classId?._id || homework.classId))) {
      return res.status(403).json({ message: "Access denied for this homework" });
    }

    res.setHeader("Content-Type", getDownloadContentType(homework));
    res.setHeader("Content-Disposition", `attachment; filename="${buildDownloadName(homework)}"`);

    const fileStream = getFileStream(homework.storageId);
    fileStream.on("error", error => {
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
        return;
      }
      res.destroy(error);
    });

    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id).select("_id classId storageId").lean();

    if (!homework) {
      return res.status(404).json({ message: "Homework not found" });
    }

    if (!isAdmin(req)) {
      if (!isTeacher(req) || !(await teacherCanAccessClass(req.user.id, homework.classId))) {
        return res.status(403).json({ message: "Access denied for this homework" });
      }
    }

    await deleteFile(homework.storageId);
    await Homework.findByIdAndDelete(req.params.id);

    res.json({ message: "Homework deleted" });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};
