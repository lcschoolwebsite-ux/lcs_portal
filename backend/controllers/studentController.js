const Student = require("../models/Student");
const Class = require("../models/Class");
const AcademicYear = require("../models/AcademicYear");
const FeeStructure = require("../models/FeeStructure");
const Teacher = require("../models/Teacher");
const { randomUUID } = require("crypto");
const ExcelJS = require("exceljs");
const { assignFeeStructureToStudents } = require("./feeStructureController");
const { canTeachersCreateStudents } = require("./settingController");
const { escapeRegex, normalizeSearch, parsePagination } = require("../utils/query");
const { cloudinary, configureCloudinary } = require("../utils/cloudinary");

const uploadBufferToCloudinary = (buffer, options) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
    if (error) reject(error);
    else resolve(result);
  });
  stream.end(buffer);
});

const sanitizeFolderSegment = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "student";

const buildStudentPhotoFolder = async (student) => {
  const classDoc = await Class.findById(student.class).select("name section").lean();
  const classLabel = [classDoc?.name, classDoc?.section].filter(Boolean).join("-");
  return `lcsms/student-photos/${sanitizeFolderSegment(classLabel || student.class?.toString?.() || "student")}`;
};

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

const getStudentPhotoPublicId = (student) =>
  student?.photoPublicId || extractCloudinaryPublicIdFromUrl(student?.photoUrl);

const assertCanManageStudent = async (req, studentId) => {
  const student = await Student.findById(studentId).select("class photoPublicId photoUrl");
  if (!student) {
    const error = new Error("Student not found");
    error.status = 404;
    throw error;
  }

  if (req.user.role === "student" && String(req.user.id) !== String(studentId)) {
    const error = new Error("You can only manage your own photo");
    error.status = 403;
    throw error;
  }

  if (req.user.role === "teacher") {
    const teacher = await Teacher.findById(req.user.id).select("assignedClasses");
    const assignedClassIds = teacher?.assignedClasses?.map(id => id.toString()) || [];
    if (!assignedClassIds.includes(student.class.toString())) {
      const error = new Error("Student class not assigned to teacher");
      error.status = 403;
      throw error;
    }
  }

  return student;
};

const populateStudentForResponse = (query) =>
  query.populate("class", "name section").populate("academicYear", "year").lean();

const requiredStudentFields = ["name", "fatherName", "motherName", "mobile", "satCode"];

const studentImportColumns = {
  name: ["name", "full name", "student name", "studentname", "student name mandatory"],
  dob: ["dob", "date of birth"],
  fatherName: ["father name", "father's name", "fathername", "fathers name"],
  motherName: ["mother name", "mother's name", "mothername", "mothers name"],
  mobile: ["mobile", "mobile number", "mobile no", "mobile no.", "phone"],
  alternateMobile: ["alternate mobile", "second mobile", "second mobile number", "mobile 2", "mobile no 2", "mobile no. 2"],
  email: ["email", "email address"],
  address: ["address", "residential address"],
  satCode: ["sat code", "satcode", "sats no", "sats no.", "sats number", "sats"],
  penCode: ["pen code", "pencode"]
};

const normalizeStudentPayload = (payload) => {
  const { primaryMobile, secondaryMobile } = splitMobileNumbers(payload.mobile);
  const normalized = {
    ...payload,
    name: normalizeCell(payload.name),
    dob: normalizeCell(payload.dob),
    fatherName: normalizeCell(payload.fatherName),
    motherName: normalizeCell(payload.motherName),
    mobile: primaryMobile,
    alternateMobile: normalizeCell(payload.alternateMobile || payload.mobile2) || secondaryMobile,
    email: normalizeCell(payload.email),
    address: normalizeCell(payload.address),
    satCode: normalizeCell(payload.satCode),
    penCode: normalizeCell(payload.penCode)
  };

  if (!normalized.penCode) delete normalized.penCode;
  return normalized;
};

const normalizeHeader = value => String(value || "").trim().toLowerCase();
const normalizeCell = value => {
  if (value == null) return "";
  if (value.text) return String(value.text).trim();
  if (value.result != null) return String(value.result).trim();
  return String(value).trim();
};

const splitMobileNumbers = value => {
  const raw = normalizeCell(value);
  if (!raw) return { primaryMobile: "", secondaryMobile: "" };

  const parts = raw
    .split(/(?:\s*(?:,|\/|\\|\||;|\band\b|\bor\b)\s*)|[\r\n]+|\s{2,}/i)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    const phoneLikeParts = raw.match(/\+?\d[\d-]{7,}\d/g) || [];
    if (phoneLikeParts.length > 1) {
      return {
        primaryMobile: phoneLikeParts[0],
        secondaryMobile: phoneLikeParts[1]
      };
    }
  }

  return {
    primaryMobile: parts[0] || raw,
    secondaryMobile: parts[1] || ""
  };
};

const buildHeaderMap = (row) => {
  const rawHeaders = row.values || [];
  return Object.entries(studentImportColumns).reduce((acc, [field, labels]) => {
    const index = rawHeaders.findIndex(header => labels.includes(normalizeHeader(header)));
    if (index > 0) acc[field] = index;
    return acc;
  }, {});
};

const getAddedByTeacherId = (user) => (user?.role === "teacher" ? user.id : undefined);
const incrementCount = (map, key) => {
  map.set(key, (map.get(key) || 0) + 1);
};

exports.getAll = async (req, res) => {
  try {
    const { classId, academicYear } = req.query;
    const search = normalizeSearch(req.query.search);
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    const q = { isActive: true };

    if (req.user.role === "teacher") {
      const teacher = await Teacher.findById(req.user.id).select("assignedClasses");
      const assignedClassIds = teacher?.assignedClasses?.map(id => id.toString()) || [];

      if (classId) {
        if (!assignedClassIds.includes(classId)) return res.status(403).json({ message: "Class not assigned to teacher" });
        q.class = classId;
      } else {
        q.class = { $in: assignedClassIds };
      }
    } else if (classId) {
      q.class = classId;
    }

    if (academicYear) q.academicYear = academicYear;
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: "i" };
      q.$or = [{ name: regex }, { satCode: regex }, { penCode: regex }, { mobile: regex }, { alternateMobile: regex }];
    }

    const query = Student.find(q)
      .select("name dob fatherName motherName mobile alternateMobile email address satCode penCode class academicYear photoUrl isActive createdAt")
      .populate("class","name section")
      .populate("academicYear","year")
      .sort({ name: sortOrder })
      .lean();

    if (req.query.page || req.query.limit) {
      const { page, limit, skip } = parsePagination(req.query);
      const [data, total] = await Promise.all([
        query.skip(skip).limit(limit),
        Student.countDocuments(q)
      ]);

      return res.json({
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(Math.ceil(total / limit), 1)
        }
      });
    }

    res.json(await query.limit(1000));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const s = await Student.findById(req.params.id).populate("class","name section").populate("academicYear","year").populate("addedBy","name").lean();
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const ay = await AcademicYear.findOne({ isActive: true });
    if (!ay) return res.status(400).json({ message: "No active academic year. Ask admin to set one." });

    if (req.user.role === "teacher") {
      const teacherCreateAllowed = await canTeachersCreateStudents();
      if (!teacherCreateAllowed) {
        return res.status(403).json({ message: "Teacher student registration is disabled by admin" });
      }

      const teacher = await Teacher.findById(req.user.id).select("assignedClasses");
      const assignedClassIds = teacher?.assignedClasses?.map(id => id.toString()) || [];
      if (!assignedClassIds.includes(req.body.class)) {
        return res.status(403).json({ message: "Class not assigned to teacher" });
      }
    }

    const payload = normalizeStudentPayload(req.body);
    const missingFields = requiredStudentFields.filter(field => !payload[field]);
    if (missingFields.length) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(", ")}` });
    }

    const student = await Student.create({
      ...payload,
      academicYear: ay._id,
      addedBy: getAddedByTeacherId(req.user)
    });
    const structure = await FeeStructure.findOne({ class: student.class, academicYear: ay._id });
    if (structure) await assignFeeStructureToStudents(structure._id);

    res.status(201).json(student);
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.bulkUpload = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admins can bulk upload students" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Please upload an Excel file" });
    }

    const classId = req.body.class;
    if (!classId) {
      return res.status(400).json({ message: "Please select a class before uploading" });
    }

    const ay = await AcademicYear.findOne({ isActive: true });
    if (!ay) return res.status(400).json({ message: "No active academic year. Ask admin to set one." });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return res.status(400).json({ message: "The Excel file has no student rows" });
    }

    const headerMap = buildHeaderMap(worksheet.getRow(1));
    const missingHeaders = requiredStudentFields.filter(field => !headerMap[field]);
    if (missingHeaders.length) {
      return res.status(400).json({
        message: `Missing required columns: ${missingHeaders.join(", ")}`
      });
    }

    const results = { created: 0, failed: 0, errors: [] };
    const rowsToCreate = [];
    const satCodeCounts = new Map();
    const penCodeCounts = new Map();

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const rowValues = Object.keys(studentImportColumns).reduce((acc, field) => {
        acc[field] = headerMap[field] ? normalizeCell(row.getCell(headerMap[field]).value) : "";
        return acc;
      }, {});

      const isBlank = Object.values(rowValues).every(value => !value);
      if (isBlank) continue;

      const rowPayload = normalizeStudentPayload(rowValues);
      const missingValues = requiredStudentFields.filter(field => !rowPayload[field]);
      if (missingValues.length) {
        results.failed += 1;
        results.errors.push({ row: rowNumber, message: `Missing values: ${missingValues.join(", ")}` });
        continue;
      }

      rowsToCreate.push({ rowNumber, rowPayload });
      incrementCount(satCodeCounts, rowPayload.satCode);
      if (rowPayload.penCode) incrementCount(penCodeCounts, rowPayload.penCode);
    }

    const satCodes = [...satCodeCounts.keys()];
    const penCodes = [...penCodeCounts.keys()];
    const existingStudents = satCodes.length || penCodes.length
      ? await Student.find({
          $or: [
            satCodes.length ? { satCode: { $in: satCodes } } : null,
            penCodes.length ? { penCode: { $in: penCodes } } : null
          ].filter(Boolean)
        })
          .select("name satCode penCode")
          .lean()
      : [];

    const existingBySatCode = new Map();
    const existingByPenCode = new Map();

    existingStudents.forEach(student => {
      if (student.satCode) existingBySatCode.set(student.satCode, student);
      if (student.penCode) existingByPenCode.set(student.penCode, student);
    });

    const structure = await FeeStructure.findOne({ class: classId, academicYear: ay._id }).select("_id");

    for (const { rowNumber, rowPayload } of rowsToCreate) {
      if ((satCodeCounts.get(rowPayload.satCode) || 0) > 1) {
        results.failed += 1;
        results.errors.push({
          row: rowNumber,
          message: `Duplicate SAT code in upload file: ${rowPayload.satCode}`
        });
        continue;
      }

      const existingStudent = existingBySatCode.get(rowPayload.satCode);
      if (existingStudent) {
        results.failed += 1;
        results.errors.push({
          row: rowNumber,
          message: `SAT code already exists for student "${existingStudent.name}": ${rowPayload.satCode}`
        });
        continue;
      }

      if (rowPayload.penCode && (penCodeCounts.get(rowPayload.penCode) || 0) > 1) {
        results.failed += 1;
        results.errors.push({
          row: rowNumber,
          message: `Duplicate PEN code in upload file: ${rowPayload.penCode}`
        });
        continue;
      }

      const existingPenStudent = rowPayload.penCode ? existingByPenCode.get(rowPayload.penCode) : null;
      if (existingPenStudent) {
        results.failed += 1;
        results.errors.push({
          row: rowNumber,
          message: `PEN code already exists for student "${existingPenStudent.name}": ${rowPayload.penCode}`
        });
        continue;
      }

      try {
        const student = await Student.create({
          ...rowPayload,
          class: classId,
          academicYear: ay._id,
          addedBy: getAddedByTeacherId(req.user)
        });
        existingBySatCode.set(student.satCode, { name: student.name, satCode: student.satCode });
        if (student.penCode) existingByPenCode.set(student.penCode, { name: student.name, penCode: student.penCode });
        results.created += 1;
      } catch (e) {
        results.failed += 1;
        results.errors.push({ row: rowNumber, message: e.message });
      }
    }

    if (structure && results.created > 0) {
      await assignFeeStructureToStudents(structure._id);
    }
    res.status(201).json(results);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    if (req.user.role === "teacher") {
      const [teacher, student] = await Promise.all([
        Teacher.findById(req.user.id).select("assignedClasses"),
        Student.findById(req.params.id).select("class")
      ]);
      const assignedClassIds = teacher?.assignedClasses?.map(id => id.toString()) || [];
      const currentClassAllowed = student && assignedClassIds.includes(student.class.toString());
      const nextClassAllowed = !req.body.class || assignedClassIds.includes(req.body.class);

      if (!currentClassAllowed || !nextClassAllowed) {
        return res.status(403).json({ message: "Student class not assigned to teacher" });
      }
    }

    const payload = normalizeStudentPayload(req.body);
    const missingFields = requiredStudentFields.filter(field => !payload[field]);
    if (missingFields.length) {
      return res.status(400).json({ message: `Missing required fields: ${missingFields.join(", ")}` });
    }

    const s = await Student.findByIdAndUpdate(req.params.id, payload, { new: true });
    res.json(s);
  } catch (e) { res.status(400).json({ message: e.message }); }
};

exports.uploadStudentPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please choose an image to upload" });
    }

    if (!configureCloudinary()) {
      return res.status(503).json({
        message: "Photo upload is not configured yet. Add Cloudinary credentials on the server."
      });
    }

    const student = await assertCanManageStudent(req, req.params.id);
    const previousPhotoPublicId = getStudentPhotoPublicId(student);
    const folder = await buildStudentPhotoFolder(student);
    await ensureCloudinaryFolder(folder);
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder,
      public_id: `student-${req.params.id}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      overwrite: false,
      resource_type: "image",
      transformation: [
        { width: 600, height: 600, crop: "fill", gravity: "face" },
        { quality: "auto", fetch_format: "auto" }
      ]
    });

    const updatedStudent = await populateStudentForResponse(
      Student.findByIdAndUpdate(
        req.params.id,
        { photoUrl: result.secure_url, photoPublicId: result.public_id },
        { new: true }
      )
    );

    if (previousPhotoPublicId && previousPhotoPublicId !== result.public_id) {
      cloudinary.uploader.destroy(previousPhotoPublicId, { resource_type: "image" }).catch(() => {});
    }

    res.json({ photoUrl: updatedStudent.photoUrl, student: updatedStudent });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};

exports.removeStudentPhoto = async (req, res) => {
  try {
    const student = await assertCanManageStudent(req, req.params.id);
    const publicId = getStudentPhotoPublicId(student);

    if (publicId) {
      if (!configureCloudinary()) {
        return res.status(503).json({
          message: "Photo removal is not configured yet. Add Cloudinary credentials on the server."
        });
      }

      await cloudinary.uploader.destroy(publicId, { resource_type: "image" }).catch(() => {});
    }

    const updatedStudent = await populateStudentForResponse(
      Student.findByIdAndUpdate(
        req.params.id,
        { photoUrl: "", photoPublicId: "" },
        { new: true }
      )
    );

    res.json({ message: "Photo removed", student: updatedStudent });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};

exports.deactivate = async (req, res) => {
  try {
    await Student.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ message: "Student deactivated" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
