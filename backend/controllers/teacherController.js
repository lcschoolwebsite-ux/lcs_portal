const Teacher = require("../models/Teacher");
const Class = require("../models/Class");
const Subject = require("../models/Subject");
const { randomUUID } = require("crypto");
const {
  normalizeIdList,
  syncTeacherAssignments,
  syncTeacherClassAccess
} = require("../utils/classAssignmentSync");
const { cloudinary, configureCloudinary } = require("../utils/cloudinary");

const compactRefs = value => (Array.isArray(value) ? value.filter(Boolean) : value);
const TEACHER_PHOTO_FOLDER = "lcsms/teachers";

const uploadBufferToCloudinary = (buffer, options) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
    if (error) reject(error);
    else resolve(result);
  });
  stream.end(buffer);
});

const ensureCloudinaryFolder = async (folder) => {
  try {
    await cloudinary.api.create_folder(folder);
  } catch (error) {
    const message = String(error?.message || "");
    if (error?.http_code === 409 || /already exists/i.test(message)) return;
    throw error;
  }
};

const extractCloudinaryPublicIdFromUrl = (photoUrl) => {
  if (!photoUrl) return "";

  try {
    const { pathname } = new URL(photoUrl);
    const uploadIndex = pathname.indexOf("/upload/");
    if (uploadIndex === -1) return "";

    let publicPath = pathname.slice(uploadIndex + "/upload/".length);
    publicPath = publicPath.replace(/^v\d+\//, "");
    return publicPath.replace(/\.[^.\/]+$/, "");
  } catch (_) {
    return "";
  }
};

const getTeacherPhotoPublicId = (teacher) =>
  teacher?.photoPublicId || extractCloudinaryPublicIdFromUrl(teacher?.photoUrl);

const populateTeacherForResponse = (query) =>
  query.select("-password").populate("assignedClasses", "name section classTeacher").populate("assignedSubjects", "name");

const assertCanManageTeacherPhoto = async (req, teacherId) => {
  const teacher = await Teacher.findById(teacherId).select("photoPublicId photoUrl");
  if (!teacher) {
    const error = new Error("Teacher not found");
    error.status = 404;
    throw error;
  }

  if (req.user.role === "teacher" && String(req.user.id) !== String(teacherId)) {
    const error = new Error("You can only manage your own photo");
    error.status = 403;
    throw error;
  }

  return teacher;
};

const hydrateTeacher = teacher => {
  if (!teacher) return teacher;
  const data = teacher.toObject ? teacher.toObject() : { ...teacher };
  data.assignedClasses = compactRefs(data.assignedClasses);
  data.assignedSubjects = compactRefs(data.assignedSubjects);
  return data;
};

const normalizeTeacherPayload = body => {
  const payload = { ...body };

  ["name", "username", "password", "email", "phone"].forEach(field => {
    if (typeof payload[field] === "string") payload[field] = payload[field].trim();
  });

  if (!payload.password) delete payload.password;
  return payload;
};

exports.getAll = async (req, res) =>
  res.json(
    (await Teacher.find({ isActive: true })
      .select("-password")
      .populate("assignedClasses", "name section")
      .populate("assignedSubjects", "name")).map(hydrateTeacher)
  );

exports.create = async (req, res) => {
  try {
    const payload = normalizeTeacherPayload(req.body);
    if (!payload.password || payload.password.length < 6) {
      return res.status(400).json({ message: "Teacher password must be at least 6 characters" });
    }

    const t = await Teacher.create(payload);
    res.status(201).json({ ...t.toObject(), password: undefined });
  } catch (e) {
    const message = e.code === 11000 ? "Teacher username already exists" : e.message;
    res.status(400).json({ message });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = normalizeTeacherPayload(req.body);
    if (payload.password && payload.password.length < 6) {
      return res.status(400).json({ message: "Teacher password must be at least 6 characters" });
    }

    if (payload.password) {
      const t = await Teacher.findById(req.params.id);
      if (!t) return res.status(404).json({ message: "Teacher not found" });
      t.set(payload);
      await t.save();
      const updated = await Teacher.findById(t._id).select("-password").populate("assignedClasses","name section").populate("assignedSubjects","name");
      return res.json(hydrateTeacher(updated));
    }
    const t = await Teacher.findByIdAndUpdate(req.params.id, payload, { new: true }).select("-password").populate("assignedClasses","name section").populate("assignedSubjects","name");
    if (!t) return res.status(404).json({ message: "Teacher not found" });
    res.json(hydrateTeacher(t));
  } catch (e) {
    const message = e.code === 11000 ? "Teacher username already exists" : e.message;
    res.status(400).json({ message });
  }
};

exports.remove = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id).select("_id").lean();
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    await Promise.all([
      Class.updateMany(
        { classTeacher: teacher._id },
        { $unset: { classTeacher: "", classTeacherSubject: "" } }
      ),
      Subject.updateMany(
        { teacher: teacher._id },
        { $unset: { teacher: "" } }
      )
    ]);

    await Teacher.findByIdAndDelete(teacher._id);
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.assignClass = async (req, res) => {
  try {
    const t = await Teacher.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Teacher not found" });

    const classIds = normalizeIdList(req.body.classIds || req.body.classId);
    const existingIds = normalizeIdList(t.assignedClasses);
    const mergedIds = [...new Set([...existingIds, ...classIds])];

    t.assignedClasses = mergedIds;
    await t.save();
    await syncTeacherAssignments(t._id, mergedIds);

    const updated = await Teacher.findById(t._id)
      .select("-password")
      .populate("assignedClasses", "name section")
      .populate("assignedSubjects", "name");
    res.json({ message: "Classes assigned", teacher: hydrateTeacher(updated) });
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.setClasses = async (req, res) => {
  try {
    const classIds = normalizeIdList(req.body.classIds);
    const teacher = await Teacher.findById(req.params.id);

    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    teacher.assignedClasses = classIds;
    await teacher.save();
    await syncTeacherAssignments(teacher._id, classIds);

    const t = await Teacher.findById(teacher._id)
      .select("-password")
      .populate("assignedClasses", "name section")
      .populate("assignedSubjects", "name");

    res.json({ message: "Class assignments updated", teacher: hydrateTeacher(t) });
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.assignSubject = async (req, res) => {
  try {
    const t = await Teacher.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Teacher not found" });
    if (!t.assignedSubjects.includes(req.body.subjectId))
      t.assignedSubjects.push(req.body.subjectId);
    await t.save();
    await syncTeacherClassAccess(t._id);
    res.json({ message: "Subject assigned" });
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.resetPassword = async (req, res) => {
  try {
    if (!req.body.password || req.body.password.trim().length < 6) {
      return res.status(400).json({ message: "Teacher password must be at least 6 characters" });
    }
    const t = await Teacher.findById(req.params.id);
    if (!t) return res.status(404).json({ message: "Teacher not found" });
    t.password = req.body.password.trim();
    await t.save();
    res.json({ message: "Password reset successful" });
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.uploadTeacherPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please choose an image to upload" });
    }

    if (!configureCloudinary()) {
      return res.status(503).json({
        message: "Photo upload is not configured yet. Add Cloudinary credentials on the server."
      });
    }

    const teacher = await assertCanManageTeacherPhoto(req, req.params.id);
    const previousPhotoPublicId = getTeacherPhotoPublicId(teacher);
    await ensureCloudinaryFolder(TEACHER_PHOTO_FOLDER);

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: TEACHER_PHOTO_FOLDER,
      public_id: `teacher-${req.params.id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      overwrite: false,
      resource_type: "image",
      transformation: [
        { width: 600, height: 600, crop: "fill", gravity: "face" },
        { quality: "auto", fetch_format: "auto" }
      ]
    });

    const updatedTeacher = await populateTeacherForResponse(
      Teacher.findByIdAndUpdate(
        req.params.id,
        { photoUrl: result.secure_url, photoPublicId: result.public_id },
        { new: true }
      )
    );

    if (previousPhotoPublicId && previousPhotoPublicId !== result.public_id) {
      cloudinary.uploader.destroy(previousPhotoPublicId, { resource_type: "image" }).catch(() => {});
    }

    res.json({ photoUrl: updatedTeacher.photoUrl, teacher: hydrateTeacher(updatedTeacher) });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};

exports.removeTeacherPhoto = async (req, res) => {
  try {
    const teacher = await assertCanManageTeacherPhoto(req, req.params.id);
    const publicId = getTeacherPhotoPublicId(teacher);

    if (publicId) {
      if (!configureCloudinary()) {
        return res.status(503).json({
          message: "Photo removal is not configured yet. Add Cloudinary credentials on the server."
        });
      }

      await cloudinary.uploader.destroy(publicId, { resource_type: "image" }).catch(() => {});
    }

    const updatedTeacher = await populateTeacherForResponse(
      Teacher.findByIdAndUpdate(
        req.params.id,
        { photoUrl: "", photoPublicId: "" },
        { new: true }
      )
    );

    res.json({ message: "Photo removed", teacher: hydrateTeacher(updatedTeacher) });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};
