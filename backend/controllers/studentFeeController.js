const StudentFee = require("../models/StudentFee");
const Student = require("../models/Student");
const Class = require("../models/Class");
const AcademicYear = require("../models/AcademicYear");
const FeeStructure = require("../models/FeeStructure");
const QRCode = require("qrcode");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { notifyStudentById } = require("../utils/pushNotification");
const { getIO } = require("../utils/socket");
const { canTeachersManageFees } = require("./settingController");
const { escapeRegex, normalizeSearch } = require("../utils/query");
const { cloudinary, configureCloudinary } = require("../utils/cloudinary");

const SCHOOL_UPI_ID = process.env.SCHOOL_UPI_ID || "lemhs@kbl";
const SCHOOL_NAME = process.env.SCHOOL_NAME || "Loreto English Medium High School General Fees Account";
const configuredSchoolMcc = String(process.env.SCHOOL_MCC || "8211").trim();
// 8211 is the UPI merchant category for primary and secondary education.
const SCHOOL_MCC = /^\d{4}$/.test(configuredSchoolMcc) && configuredSchoolMcc !== "0000"
  ? configuredSchoolMcc
  : "8211";
const SCHOOL_URL = process.env.SCHOOL_URL || "";
const FEE_SCREENSHOT_FOLDER = "fee-payment-screenshots";
const INSTALLMENT_MODES = Object.freeze({
  HALF: "HALF",
  TERMWISE: "TERMWISE",
  CUSTOM: "CUSTOM",
  FULL: "FULL"
});
const INSTALLMENT_MODE_ALIASES = Object.freeze({
  THIRD: INSTALLMENT_MODES.TERMWISE,
  "1/3": INSTALLMENT_MODES.TERMWISE,
  "TERM WISE": INSTALLMENT_MODES.TERMWISE,
  "TERM-WISE": INSTALLMENT_MODES.TERMWISE,
  TERMWISE: INSTALLMENT_MODES.TERMWISE
});

const uploadBufferToCloudinary = (buffer, options) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
    if (error) reject(error);
    else resolve(result);
  });
  stream.end(buffer);
});

const hasRazorpayCredentials = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const getRazorpayClient = () => {
  if (!hasRazorpayCredentials()) {
    throw new Error("Online fee payment is not configured on the server");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

const toObjectIdString = value => String(value || "");

const getTeacherClassIds = async teacherId => {
  const classes = await Class.find({ classTeacher: teacherId }).select("_id").lean();
  return classes.map(cls => toObjectIdString(cls._id));
};

const ensureTeacherFeeAccess = async (req) => {
  if (req.user.role !== "teacher") return { allowed: true };

  const classIds = await getTeacherClassIds(req.user.id);
  return {
    allowed: true,
    classIds
  };
};

const getStudentIdsForClasses = async classIds => {
  if (!Array.isArray(classIds) || classIds.length === 0) return [];
  const students = await Student.find({ class: { $in: classIds } }).select("_id").lean();
  return students.map(student => student._id);
};

const getStudentScopeFilter = async ({ req, academicYear, classId, search }) => {
  const filter = { isActive: true };
  if (academicYear) filter.academicYear = academicYear;

  const teacherAccess = await ensureTeacherFeeAccess(req);
  if (req.user.role === "teacher") {
    if (classId) {
      if (!teacherAccess.classIds.includes(toObjectIdString(classId))) {
        const error = new Error("Access denied for this class");
        error.status = 403;
        throw error;
      }
      filter.class = classId;
    } else if (teacherAccess.classIds.length > 0) {
      filter.class = { $in: teacherAccess.classIds };
    } else {
      return { filter: null, teacherAccess };
    }
  } else if (classId) {
    filter.class = classId;
  }

  const normalizedSearch = normalizeSearch(search);
  if (normalizedSearch) {
    const regex = { $regex: escapeRegex(normalizedSearch), $options: "i" };
    filter.$or = [
      { name: regex },
      { satCode: regex },
      { penCode: regex },
      { mobile: regex },
      { alternateMobile: regex }
    ];
  }

  return { filter, teacherAccess };
};

const syncMissingFeeRecords = async ({ req, academicYear, classId, search }) => {
  const targetAcademicYear = academicYear || (await AcademicYear.findOne({ isActive: true }).select("_id").lean())?._id;
  if (!targetAcademicYear) {
    return { created: 0, skipped: 0 };
  }

  const { filter } = await getStudentScopeFilter({
    req,
    academicYear: targetAcademicYear,
    classId,
    search
  });

  if (!filter) {
    return { created: 0, skipped: 0 };
  }

  const students = await Student.find(filter).select("_id class academicYear").lean();
  if (students.length === 0) {
    return { created: 0, skipped: 0 };
  }

  const uniqueClassIds = [...new Set(students.map(student => toObjectIdString(student.class)).filter(Boolean))];
  const feeStructures = await FeeStructure.find({
    academicYear: targetAcademicYear,
    class: { $in: uniqueClassIds }
  }).select("_id class totalAnnualFee").lean();

  const feeStructureByClassId = new Map(
    feeStructures.map(structure => [toObjectIdString(structure.class), structure])
  );

  const existingFees = await StudentFee.find({
    academicYear: targetAcademicYear,
    student: { $in: students.map(student => student._id) }
  }).select("student").lean();
  const existingStudentIds = new Set(existingFees.map(fee => toObjectIdString(fee.student)));

  let created = 0;
  let skipped = 0;

  for (const student of students) {
    const studentId = toObjectIdString(student._id);
    if (existingStudentIds.has(studentId)) {
      skipped += 1;
      continue;
    }

    const structure = feeStructureByClassId.get(toObjectIdString(student.class));
    if (!structure) {
      skipped += 1;
      continue;
    }

    await StudentFee.findOneAndUpdate(
      { student: student._id, academicYear: targetAcademicYear },
      {
        $setOnInsert: {
          student: student._id,
          academicYear: targetAcademicYear,
          feeStructure: structure._id,
          totalAnnualFee: structure.totalAnnualFee,
          totalDue: structure.totalAnnualFee,
          totalPaid: 0,
          overallStatus: "Unpaid",
          terms: []
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    created += 1;
  }

  return { created, skipped };
};

const normalizeLabel = value =>
  String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .replace(/-+/g, "-");

const getTermLabel = term =>
  normalizeLabel(term?.termName || `TERM${term?.termNumber || ""}`);

const makeUpiReference = (...parts) => {
  const digest = crypto.createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 12).toUpperCase();
  return `UPI${digest}`;
};

const makeUpiRequestReference = ({ studentId, termId, amount, note }) => {
  return makeUpiReference(studentId, termId, amount, note, Date.now(), crypto.randomBytes(4).toString("hex"));
};

const buildUpiLink = ({ amount, note, transactionRef }) => {
  const params = new URLSearchParams({
    pa: SCHOOL_UPI_ID,
    pn: SCHOOL_NAME,
    tr: transactionRef || makeUpiReference(SCHOOL_UPI_ID, amount, note, Date.now()),
    am: String(Number(amount || 0).toFixed(2)),
    tn: note || "Test Payment",
    cu: "INR",
    mc: SCHOOL_MCC
  });

  if (SCHOOL_URL) {
    params.set("url", SCHOOL_URL);
  }

  return {
    upiLink: `upi://pay?${params.toString()}`,
    upiTrReference: params.get("tr") || ""
  };
};

const getTermConfirmedAmount = term => {
  const paidAmount = Number(term?.paidAmount || 0);
  if (paidAmount > 0) return paidAmount;
  if (term?.status === "Paid" || term?.paymentStatus === "PAID") {
    return Number(term?.amount || 0);
  }
  return 0;
};

const getTermRemainingAmount = term => {
  const amount = Number(term?.amount || 0);
  const remaining = amount - getTermConfirmedAmount(term);
  return Math.max(0, Number(remaining.toFixed(2)));
};

const getPendingClaimAmount = term => {
  const claimed = Number(term?.claimedAmount || 0);
  if (claimed > 0) return claimed;
  return getTermRemainingAmount(term);
};

const normalizeAmount = value => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
};

const normalizeInstallmentMode = value => {
  const mode = String(value || "").trim().toUpperCase();
  if (INSTALLMENT_MODE_ALIASES[mode]) return INSTALLMENT_MODE_ALIASES[mode];
  return Object.values(INSTALLMENT_MODES).includes(mode) ? mode : "";
};

const buildInstallmentModeField = value => {
  const mode = normalizeInstallmentMode(value);
  return mode ? { installmentMode: mode } : {};
};

const amountsMatch = (first, second) => Math.abs(normalizeAmount(first) - normalizeAmount(second)) < 0.01;

const getTermWiseInstallmentAmount = term => normalizeAmount(Number(term?.amount || 0) / 3);

const getHalfInstallmentAmount = term => normalizeAmount(Number(term?.amount || 0) / 2);

const inferInstallmentModeForAmount = ({ amount, remainingAmount, term }) => {
  if (amountsMatch(amount, remainingAmount)) return INSTALLMENT_MODES.FULL;
  if (amountsMatch(amount, getHalfInstallmentAmount(term))) return INSTALLMENT_MODES.HALF;
  if (amountsMatch(amount, getTermWiseInstallmentAmount(term))) return INSTALLMENT_MODES.TERMWISE;
  return INSTALLMENT_MODES.CUSTOM;
};

const resolveInstallmentMode = ({ term, amount, remainingAmount, requestedMode, existingMode }) => {
  const requested = normalizeInstallmentMode(requestedMode);
  if (requestedMode && !requested) {
    const error = new Error("Invalid installment mode");
    error.status = 400;
    throw error;
  }

  const resolved = requested || inferInstallmentModeForAmount({ amount, remainingAmount, term });
  const lockedMode = normalizeInstallmentMode(existingMode);
  const halfAmount = getHalfInstallmentAmount(term);
  const termWiseAmount = getTermWiseInstallmentAmount(term);

  if (lockedMode === INSTALLMENT_MODES.HALF) {
    const isHalf = amountsMatch(amount, halfAmount);
    const isFull = amountsMatch(amount, remainingAmount);
    if (!isHalf && !isFull) {
      const error = new Error("This term is on a half installment plan - please record a half payment or the full remaining balance instead");
      error.status = 400;
      throw error;
    }
  }

  if (lockedMode === INSTALLMENT_MODES.TERMWISE) {
    const isTermWise = amountsMatch(amount, termWiseAmount);
    const isFull = amountsMatch(amount, remainingAmount);
    if (!isTermWise && !isFull) {
      const error = new Error("This term is on a term-wise installment plan - please record the term-wise payment or the full remaining balance instead");
      error.status = 400;
      throw error;
    }
  }

  if (lockedMode === INSTALLMENT_MODES.FULL && !amountsMatch(amount, remainingAmount)) {
    const error = new Error("This term is already marked as full payment - please record the remaining balance instead");
    error.status = 400;
    throw error;
  }

  if (!lockedMode) {
    if (resolved === INSTALLMENT_MODES.HALF && !amountsMatch(amount, halfAmount)) {
      const error = new Error("Half payment must match the term's fixed half amount");
      error.status = 400;
      throw error;
    }

    if (resolved === INSTALLMENT_MODES.TERMWISE && !amountsMatch(amount, termWiseAmount)) {
      const error = new Error("Term-wise payment must match the term's fixed installment amount");
      error.status = 400;
      throw error;
    }

    if (resolved === INSTALLMENT_MODES.FULL && !amountsMatch(amount, remainingAmount)) {
      const error = new Error("Full payment must match the remaining balance");
      error.status = 400;
      throw error;
    }
  }

  return lockedMode || resolved;
};

const getOpenTermForFlexiblePayment = (fee, preferredTermId, preferredTermNumber) => {
  const terms = Array.isArray(fee?.terms) ? fee.terms : [];
  if (preferredTermId) {
    return terms.find(term => String(term._id) === String(preferredTermId));
  }
  if (preferredTermNumber != null && preferredTermNumber !== "") {
    return terms.find(term => Number(term.termNumber) === Number(preferredTermNumber));
  }

  const openTerms = terms.filter(term => getTermRemainingAmount(term) > 0 && term.paymentStatus !== "PENDING_VERIFICATION");
  if (openTerms.length === 1) return openTerms[0];
  return null;
};

const findStudentFeeRecord = async ({ studentId, academicYear }) => {
  const query = { student: studentId };
  if (academicYear) query.academicYear = academicYear;

  return StudentFee.findOne(query)
    .sort({ updatedAt: -1 })
    .populate({
      path: "student",
      select: "name satCode penCode class",
      populate: { path: "class", select: "name section" }
    })
    .populate("academicYear", "year")
    .populate({
      path: "feeStructure",
      populate: { path: "feeItems.feeType" }
    });
};

const findTermById = (fee, termId) =>
  (fee?.terms || []).find(term => String(term._id) === String(termId));

const ensureStudentOwnership = (req, studentId) => {
  if (req.user.role === "student" && String(req.user.id) !== String(studentId)) {
    const err = new Error("Unauthorized");
    err.status = 403;
    throw err;
  }
};

const ensureTeacherClassAccessForFee = async (req, fee) => {
  if (req.user.role !== "teacher") return;
  const teacherAccess = await ensureTeacherFeeAccess(req);
  const studentClassId = toObjectIdString(fee.student?.class?._id || fee.student?.class || "");
  if (!teacherAccess.classIds.includes(studentClassId)) {
    const err = new Error("Access denied for this student");
    err.status = 403;
    throw err;
  }
};

const persistUpiReferenceIfNeeded = async (fee, term, studentId) => {
  if (!term) return "";

  if (!term.upiTrReference) {
    term.upiTrReference = makeUpiReference(studentId, term._id || term.termNumber || term.termName || "", getTermLabel(term));
    await fee.save();
  }

  return term.upiTrReference;
};

const uploadClaimScreenshot = async ({ studentId, termId, file }) => {
  if (!file?.buffer) {
    const error = new Error("Payment screenshot is required");
    error.status = 400;
    throw error;
  }

  if (!configureCloudinary()) {
    const error = new Error("Screenshot upload is not configured on the server");
    error.status = 503;
    throw error;
  }

  const result = await uploadBufferToCloudinary(file.buffer, {
    folder: FEE_SCREENSHOT_FOLDER,
    public_id: `upi-claim-${studentId}-${termId}-${Date.now()}`,
    overwrite: false,
    resource_type: "image",
    transformation: [
      { width: 1400, crop: "limit", quality: "auto", fetch_format: "auto" }
    ]
  });

  return {
    screenshotUrl: result.secure_url,
    screenshotPublicId: result.public_id
  };
};

exports.getAll = async (req, res) => {
  try {
    const { classId, academicYear, status, search } = req.query;
    const filter = {};
    if (academicYear) filter.academicYear = academicYear;
    if (status) filter.overallStatus = status;

    const teacherAccess = await ensureTeacherFeeAccess(req);
    let studentIds = null;
    if (classId || search) {
      const sFilter = {};
      if (req.user.role === "teacher") {
        if (classId && !teacherAccess.classIds.includes(toObjectIdString(classId))) {
          return res.status(403).json({ message: "Access denied for this class" });
        }
        sFilter.class = classId || { $in: teacherAccess.classIds };
      } else if (classId) {
        sFilter.class = classId;
      }
      if (search) {
        const regex = { $regex: search, $options: "i" };
        sFilter.$or = [
          { name: regex },
          { satCode: regex },
          { penCode: regex },
          { mobile: regex },
          { alternateMobile: regex }
        ];
      }
      const students = await Student.find(sFilter).select("_id");
      studentIds = students.map(s => s._id);
      filter.student = { $in: studentIds };
    } else if (req.user.role === "teacher") {
      filter.student = { $in: await getStudentIdsForClasses(teacherAccess.classIds) };
    }

    const fees = await StudentFee.find(filter)
      .populate({
        path: "student",
        select: "name satCode penCode class",
        populate: { path: "class", select: "name section" }
      })
      .populate("academicYear", "year");
    res.json(fees);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const { academicYear, classId } = req.query;
    const filter = {};
    if (academicYear) filter.academicYear = academicYear;

    const teacherAccess = await ensureTeacherFeeAccess(req);
    if (classId) {
      if (req.user.role === "teacher" && !teacherAccess.classIds.includes(toObjectIdString(classId))) {
        return res.status(403).json({ message: "Access denied for this class" });
      }
      const students = await Student.find({ class: classId }).select("_id");
      filter.student = { $in: students.map(s => s._id) };
    } else if (req.user.role === "teacher") {
      filter.student = { $in: await getStudentIdsForClasses(teacherAccess.classIds) };
    }

    const fees = await StudentFee.find(filter);
    
    const stats = {
      totalStudents: fees.length,
      totalFeeExpected: fees.reduce((sum, f) => sum + f.totalAnnualFee, 0),
      totalCollected: fees.reduce((sum, f) => sum + f.totalPaid, 0),
      totalDue: fees.reduce((sum, f) => sum + f.totalDue, 0),
      paidCount: fees.filter(f => f.overallStatus === "Paid").length,
      partialCount: fees.filter(f => f.overallStatus === "Partial").length,
      unpaidCount: fees.filter(f => f.overallStatus === "Unpaid").length,
    };
    res.json(stats);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.syncMissing = async (req, res) => {
  try {
    const result = await syncMissingFeeRecords({
      req,
      academicYear: req.body?.academicYear || req.query?.academicYear,
      classId: req.body?.classId || req.query?.classId,
      search: req.body?.search || req.query?.search
    });

    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};

exports.getByStudentId = async (req, res) => {
  try {
    const filter = { student: req.params.studentId };
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;

    const fee = await StudentFee.findOne(filter)
      .populate({
        path: "student",
        select: "name satCode penCode class",
        populate: { path: "class", select: "name section" }
      })
      .populate("academicYear", "year")
      .populate({
        path: "feeStructure",
        populate: { path: "feeItems.feeType" }
      });
    
    if (!fee) return res.status(404).json({ message: "No fee record found" });
    
    // Authorization
    if (req.user.role === "student" && req.user.id !== req.params.studentId) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    if (req.user.role === "teacher") {
      const teacherAccess = await ensureTeacherFeeAccess(req);
      if (!teacherAccess.allowed) {
        return res.status(403).json({ message: teacherAccess.message });
      }
      const studentClassId = toObjectIdString(fee.student?.class?._id || fee.student?.class || "");
      if (!teacherAccess.classIds.includes(studentClassId)) {
        return res.status(403).json({ message: "Access denied for this student" });
      }
    }

    const payload = fee.toObject ? fee.toObject() : fee;
    payload.razorpayEnabled = hasRazorpayCredentials();
    res.json(payload);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getUpiLink = async (req, res) => {
  try {
    const { studentId, termId } = req.params;
    ensureStudentOwnership(req, studentId);

    const fee = await findStudentFeeRecord({
      studentId,
      academicYear: req.query.academicYear
    });

    if (!fee) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    if (req.user.role === "teacher") {
      await ensureTeacherClassAccessForFee(req, fee);
    }

    const isBalancePayment = termId === "overall";
    const term = isBalancePayment ? null : findTermById(fee, termId);
    if (!term && !isBalancePayment) {
      return res.status(404).json({ message: "Term not found" });
    }

    const remainingAmount = isBalancePayment ? Number(fee.totalDue || fee.totalAnnualFee || 0) : getTermRemainingAmount(term);
    const requestedAmount = normalizeAmount(req.query.amount || remainingAmount);
    const amount = requestedAmount > 0 ? requestedAmount : remainingAmount;

    if (amount <= 0) {
      return res.status(400).json({ message: "No balance due for UPI payment" });
    }
    if (amount > remainingAmount) {
      return res.status(400).json({ message: "Payment amount cannot exceed the remaining due" });
    }

    const termLabel = isBalancePayment ? "BALANCE" : getTermLabel(term);
    const upiTrReference = isBalancePayment
      ? makeUpiReference(studentId, "BALANCE", String(fee._id || studentId))
      : await persistUpiReferenceIfNeeded(fee, term, studentId);
    const transactionRef = makeUpiRequestReference({
      studentId,
      termId: termId || "overall",
      amount,
      note: isBalancePayment ? "Balance Payment" : `Fee ${termLabel}`
    });
    const { upiLink } = buildUpiLink({
      amount,
      note: isBalancePayment ? "Balance Payment" : `Fee ${termLabel}`,
      transactionRef
    });
    // A UPI merchant intent must carry the same merchant fields on mobile as QR.
    const liteUpiLink = upiLink;

    const qrCodeDataUrl = await QRCode.toDataURL(upiLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280
    });

    res.json({
      upiLink,
      liteUpiLink,
      qrCodeDataUrl,
      upiTrReference,
      transactionRef,
      payeeVpa: SCHOOL_UPI_ID,
      amount,
      remainingAmount,
      term: isBalancePayment ? {
        _id: "overall",
        termNumber: 0,
        termName: "Balance Payment",
        amount,
        remainingAmount,
        paymentStatus: "UNPAID",
        utrNumber: "",
        claimedAmount: 0,
        screenshotUrl: "",
        screenshotPublicId: "",
        claimedAt: null,
        verifiedAt: null,
        rejectionReason: "",
        installmentMode: null
      } : {
        _id: term._id,
        termNumber: term.termNumber,
        termName: term.termName,
        amount: term.amount,
        remainingAmount,
        paymentStatus: term.paymentStatus || (term.status === "Paid" ? "PAID" : "UNPAID"),
        utrNumber: term.utrNumber || "",
        claimedAmount: term.claimedAmount || 0,
        screenshotUrl: term.screenshotUrl || "",
        screenshotPublicId: term.screenshotPublicId || "",
        claimedAt: term.claimedAt || null,
        verifiedAt: term.verifiedAt || null,
        rejectionReason: term.rejectionReason || "",
        installmentMode: term.installmentMode || null
      }
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};

exports.claimUpiPayment = async (req, res) => {
  try {
    const { studentId, termId } = req.params;
    ensureStudentOwnership(req, studentId);
    const file = req.file;
    const requestedAmount = normalizeAmount(req.body?.amount || 0);
    const requestedInstallmentMode = req.body?.installmentMode;
    if (!file?.buffer) {
      return res.status(400).json({ message: "Payment screenshot is required" });
    }

    const fee = await findStudentFeeRecord({
      studentId,
      academicYear: req.query.academicYear
    });

    if (!fee) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    const isBalancePayment = termId === "overall";
    let term = isBalancePayment ? null : findTermById(fee, termId);
    if (!term && !isBalancePayment) {
      return res.status(404).json({ message: "Term not found" });
    }

    const remainingAmount = isBalancePayment
      ? Number(fee.totalDue || fee.totalAnnualFee || 0)
      : getTermRemainingAmount(term);
    const claimAmount = requestedAmount > 0 ? requestedAmount : remainingAmount;
    const installmentMode = resolveInstallmentMode({
      term: term || { amount: remainingAmount },
      amount: claimAmount,
      remainingAmount,
      requestedMode: requestedInstallmentMode,
      existingMode: term?.installmentMode
    });

    if (claimAmount <= 0) {
      return res.status(400).json({ message: "No balance due" });
    }
    if (claimAmount > remainingAmount) {
      return res.status(400).json({ message: "Payment amount cannot exceed the remaining due" });
    }

    if (!term && isBalancePayment) {
      const claimScreenshot = await uploadClaimScreenshot({ studentId, termId, file });

      fee.terms.push({
        termNumber: (fee.terms || []).length + 1,
        termName: "Balance Payment",
        amount: remainingAmount,
        status: "Unpaid",
        paymentStatus: "PENDING_VERIFICATION",
        paidAmount: 0,
        upiTrReference: makeUpiReference(studentId, "BALANCE", String(fee._id || studentId)),
        utrNumber: "",
        claimedAmount: claimAmount,
        screenshotUrl: claimScreenshot.screenshotUrl,
        screenshotPublicId: claimScreenshot.screenshotPublicId,
        claimedAt: new Date(),
        verifiedAt: null,
        verifiedByAdminId: null,
        rejectionReason: "",
        installmentMode
      });

      await fee.save();
      term = fee.terms[fee.terms.length - 1];

      return res.json({
        message: "Payment claim submitted for verification",
        term: {
          _id: term._id,
          termNumber: term.termNumber,
          termName: term.termName,
          amount: term.amount,
          claimedAmount: term.claimedAmount,
          paymentStatus: term.paymentStatus,
          utrNumber: term.utrNumber,
          screenshotUrl: term.screenshotUrl,
          screenshotPublicId: term.screenshotPublicId,
          claimedAt: term.claimedAt,
          verifiedAt: term.verifiedAt,
          rejectionReason: term.rejectionReason,
          upiTrReference: term.upiTrReference,
          installmentMode: term.installmentMode || null
        }
      });
    }

    if (term.paymentStatus === "PAID" || term.status === "Paid") {
      return res.status(400).json({ message: "This term is already paid" });
    }

    if (term.paymentStatus === "PENDING_VERIFICATION") {
      return res.status(400).json({ message: "This payment is already pending verification" });
    }

    if (term.screenshotPublicId) {
      cloudinary.uploader.destroy(term.screenshotPublicId).catch(() => {});
    }

    const claimScreenshot = await uploadClaimScreenshot({ studentId, termId, file });

    term.paymentStatus = "PENDING_VERIFICATION";
    term.status = "Unpaid";
    term.utrNumber = "";
    term.claimedAmount = claimAmount;
    term.screenshotUrl = claimScreenshot.screenshotUrl;
    term.screenshotPublicId = claimScreenshot.screenshotPublicId;
    term.claimedAt = new Date();
    term.verifiedAt = null;
    term.verifiedByAdminId = null;
    term.rejectionReason = "";
    if (!term.installmentMode) {
      term.installmentMode = installmentMode;
    }
    if (!term.upiTrReference) {
      term.upiTrReference = makeUpiReference(studentId, term._id || term.termNumber || term.termName || "", getTermLabel(term));
    }

    await fee.save();

    res.json({
      message: "Payment claim submitted for verification",
      term: {
        _id: term._id,
        termNumber: term.termNumber,
        termName: term.termName,
        amount: term.amount,
        claimedAmount: term.claimedAmount,
        paymentStatus: term.paymentStatus,
        utrNumber: term.utrNumber,
        screenshotUrl: term.screenshotUrl,
        screenshotPublicId: term.screenshotPublicId,
        claimedAt: term.claimedAt,
        verifiedAt: term.verifiedAt,
        rejectionReason: term.rejectionReason,
        upiTrReference: term.upiTrReference,
        installmentMode: term.installmentMode || null
      }
    });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};

exports.getPendingUpiVerifications = async (req, res) => {
  try {
    const fees = await StudentFee.find({
      terms: { $elemMatch: { paymentStatus: "PENDING_VERIFICATION" } }
    })
      .populate({
        path: "student",
        select: "name satCode class",
        populate: { path: "class", select: "name section" }
      })
      .populate("academicYear", "year")
      .lean();

    const pending = fees.flatMap(fee =>
      (fee.terms || [])
        .filter(term => term.paymentStatus === "PENDING_VERIFICATION")
        .map(term => ({
          studentFeeId: fee._id,
          studentId: fee.student?._id,
          studentName: fee.student?.name || "",
          satCode: fee.student?.satCode || "",
          className: fee.student?.class?.name || "",
          section: fee.student?.class?.section || "",
          academicYear: fee.academicYear?.year || "",
          termId: term._id,
          termNumber: term.termNumber,
          termName: term.termName,
          amount: term.amount,
          utrNumber: term.utrNumber || "",
          claimedAmount: term.claimedAmount || 0,
          screenshotUrl: term.screenshotUrl || "",
          screenshotPublicId: term.screenshotPublicId || "",
          claimedAt: term.claimedAt || null,
          upiTrReference: term.upiTrReference || "",
          paymentStatus: term.paymentStatus,
          installmentMode: term.installmentMode || null
        }))
    ).sort((a, b) => new Date(b.claimedAt || 0) - new Date(a.claimedAt || 0));

    res.json(pending);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.verifyUpiPayment = async (req, res) => {
  try {
    const { studentId, termId } = req.params;
    const action = String(req.body?.action || "").trim();
    const rejectionReason = String(req.body?.rejectionReason || "").trim();

    if (!["confirm", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const fee = await findStudentFeeRecord({
      studentId,
      academicYear: req.query.academicYear
    });

    if (!fee) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    const term = findTermById(fee, termId);
    if (!term) {
      return res.status(404).json({ message: "Term not found" });
    }

    if (term.paymentStatus !== "PENDING_VERIFICATION") {
      return res.status(400).json({ message: "This term is not pending verification" });
    }

    const now = new Date();
    term.verifiedAt = now;
    term.verifiedByAdminId = req.user.id;

    if (action === "confirm") {
      if (!term.installmentMode) {
        term.installmentMode = resolveInstallmentMode({
          term,
          amount: term.claimedAmount || term.amount || 0,
          remainingAmount: Number(term.amount || 0),
          existingMode: term.installmentMode
        });
      }

      const currentPaid = Number(term.paidAmount || 0);
      const claimAmount = Number(term.claimedAmount || term.amount || 0);
      const confirmedPaid = Math.min(Number(term.amount || 0), currentPaid + claimAmount);
      term.paidAmount = confirmedPaid;
      term.paymentStatus = confirmedPaid >= Number(term.amount || 0) ? "PAID" : "PARTIALLY_PAID";
      term.status = confirmedPaid >= Number(term.amount || 0) ? "Paid" : "Partial";
      term.paidDate = now.toISOString().split("T")[0];
      term.method = "upi_manual";
      term.receiptNumber = `UPI-MAN-${Date.now()}`;
      term.receiptGeneratedAt = now;
      term.rejectionReason = "";
      term.claimedAmount = 0;
      term.claimedAt = null;
      term.screenshotUrl = term.screenshotUrl || "";
      await fee.save();

      const studentIdString = String(fee.student?._id || fee.student || studentId);
      await notifyStudentById(
        studentIdString,
        "Fee payment confirmed",
        `Your UPI payment for ${term.termName} has been verified successfully.`,
        { url: "/student/fees" }
      ).catch(error => console.warn("UPI payment notification failed:", error.message));

      try {
        const io = getIO();
        const payload = {
          studentId: studentIdString,
          studentName: fee.student?.name || "",
          termName: term.termName,
          amount: Number(term.amount || 0),
          method: "upi_manual"
        };
        io.to(studentIdString).emit("fee-paid", payload);
        io.to("admin").emit("fee-paid", payload);
      } catch (socketError) {
        console.warn("UPI fee socket emit skipped:", socketError.message);
      }

      return res.json({
        message: "Payment confirmed",
        fee,
        term: {
          _id: term._id,
          termNumber: term.termNumber,
          termName: term.termName,
          amount: term.amount,
          paymentStatus: term.paymentStatus,
          paidAmount: term.paidAmount,
          paidDate: term.paidDate,
          method: term.method,
          claimedAmount: term.claimedAmount || 0,
          screenshotUrl: term.screenshotUrl || "",
          screenshotPublicId: term.screenshotPublicId || "",
          installmentMode: term.installmentMode || null
        }
      });
    }

    const hasConfirmedPaid = Number(term.paidAmount || 0) > 0;
    term.paymentStatus = hasConfirmedPaid ? "PARTIALLY_PAID" : "UNPAID";
    term.status = hasConfirmedPaid ? "Partial" : "Unpaid";
    term.paidDate = hasConfirmedPaid ? term.paidDate : null;
    term.claimedAmount = 0;
    term.claimedAt = null;
    term.rejectionReason = rejectionReason || "Rejected by administrator";
    if (!hasConfirmedPaid) {
      term.installmentMode = undefined;
    }
    await fee.save();

    res.json({
      message: "Payment rejected",
      fee,
      term: {
        _id: term._id,
        termNumber: term.termNumber,
        termName: term.termName,
        amount: term.amount,
        paymentStatus: term.paymentStatus,
        claimedAmount: term.claimedAmount || 0,
        screenshotUrl: term.screenshotUrl || "",
        screenshotPublicId: term.screenshotPublicId || "",
        rejectionReason: term.rejectionReason,
        installmentMode: term.installmentMode || null
      }
    });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const { studentFeeId, termNumber, amount, method, paidDate, note, installmentMode: requestedInstallmentMode } = req.body;
    const fee = await StudentFee.findById(studentFeeId).populate("student", "satCode");
    
    if (!fee) return res.status(404).json({ message: "Fee record not found" });

    const term = fee.terms.find(t => t.termNumber === Number(termNumber));
    if (!term) return res.status(404).json({ message: "Term not found" });

    const paymentAmount = normalizeAmount(amount);
    const remainingAmount = getTermRemainingAmount(term);
    if (paymentAmount > remainingAmount) {
      return res.status(400).json({ message: "Payment amount cannot exceed the remaining due for this term" });
    }
    const installmentMode = resolveInstallmentMode({
      term,
      amount: paymentAmount,
      remainingAmount,
      requestedMode: requestedInstallmentMode,
      existingMode: term.installmentMode
    });
    if (!term.installmentMode) {
      term.installmentMode = installmentMode;
    }

    const currentPaid = Number(term.paidAmount || 0);
    const confirmedPaid = Math.min(Number(term.amount || 0), currentPaid + paymentAmount);
    term.status = confirmedPaid >= Number(term.amount || 0) ? "Paid" : "Partial";
    term.paymentStatus = confirmedPaid >= Number(term.amount || 0) ? "PAID" : "PARTIALLY_PAID";
    term.paidAmount = confirmedPaid;
    term.method = method;
    term.paidDate = paidDate;
    term.receiptNumber = `RCP-LCS-${Date.now()}`;
    term.receiptGeneratedAt = new Date();

    await fee.save();
    await notifyStudentById(
      fee.student?._id || fee.student,
      "Fee payment recorded",
      `A payment of ₹${paymentAmount} has been recorded for your fee account.`,
      { url: "/student/fees" }
    ).catch(error => console.warn("Fee payment push failed:", error.message));
    res.json({ message: "Payment recorded", fee, receipt: term });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    if (!hasRazorpayCredentials()) {
      return res.status(503).json({
        message: "Online fee payment is not configured on the server. Please use UPI payment or contact the school office."
      });
    }

    const { studentFeeId, termNumber } = req.body;
    const fee = await StudentFee.findById(studentFeeId);
    const term = fee.terms.find(t => t.termNumber === Number(termNumber));

    const options = {
      amount: term.amount * 100, // in paise
      currency: "INR",
      receipt: `order_rcp_${Date.now()}`
    };

    const order = await getRazorpayClient().orders.create(options);
    res.json({ ...order, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.verifyRazorpay = async (req, res) => {
  try {
    const { studentFeeId, termNumber, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    const fee = await StudentFee.findById(studentFeeId);
    const term = fee.terms.find(t => t.termNumber === Number(termNumber));

    const paymentAmount = Number(term.amount || 0);
    const remainingAmount = getTermRemainingAmount(term);
    const installmentMode = resolveInstallmentMode({
      term,
      amount: paymentAmount,
      remainingAmount,
      requestedMode: INSTALLMENT_MODES.FULL,
      existingMode: term.installmentMode
    });
    if (!term.installmentMode) {
      term.installmentMode = installmentMode;
    }

    term.status = "Paid";
    term.paymentStatus = "PAID";
    term.paidAmount = Number(term.amount || 0);
    term.method = "Online";
    term.paidDate = new Date().toISOString().split('T')[0];
    term.receiptNumber = `RCP-LCS-ONL-${Date.now()}`;
    term.razorpayOrderId = razorpay_order_id;
    term.razorpayPaymentId = razorpay_payment_id;
    term.razorpaySignature = razorpay_signature;
    term.receiptGeneratedAt = new Date();

    await fee.save();
    await notifyStudentById(
      fee.student?._id || fee.student,
      "Fee payment confirmed",
      `Your online fee payment of ₹${Number(term.amount)} was verified successfully.`,
      { url: "/student/fees" }
    ).catch(error => console.warn("Fee verification push failed:", error.message));
    res.json({ message: "Payment verified and recorded", fee, receipt: term });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.createFlexibleOrder = async (req, res) => {
  try {
    if (!hasRazorpayCredentials()) {
      return res.status(503).json({
        message: "Online fee payment is not configured on the server. Please use UPI payment or contact the school office."
      });
    }

    const { amount } = req.body;
    const options = {
      amount: Math.round(amount * 100), // in paise
      currency: "INR",
      receipt: `order_flex_${Date.now()}`
    };

    const order = await getRazorpayClient().orders.create(options);
    res.json({ ...order, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.verifyFlexiblePayment = async (req, res) => {
  try {
    const { 
      studentFeeId, amount, label, installmentMode: requestedInstallmentMode,
      razorpay_order_id, razorpay_payment_id, razorpay_signature 
    } = req.body;
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    const fee = await StudentFee.findById(studentFeeId);
    
    // Create a "paid" term record for this payment
    const paymentAmount = normalizeAmount(amount);
    fee.terms.push({
      termNumber: fee.terms.length + 1,
      termName: label,
      amount: paymentAmount,
      status: "Paid",
      paymentStatus: "PAID",
      paidAmount: paymentAmount,
      method: "Online",
      paidDate: new Date().toISOString().split('T')[0],
      receiptNumber: `RCP-FLEX-${Date.now()}`,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      receiptGeneratedAt: new Date(),
      ...buildInstallmentModeField(requestedInstallmentMode)
    });
    await fee.save();
    await notifyStudentById(
      fee.student?._id || fee.student,
      "Fee payment confirmed",
      `Your online payment of ₹${Number(amount)} was verified successfully.`,
      { url: "/student/fees" }
    ).catch(error => console.warn("Fee verification push failed:", error.message));
    res.json({ message: "Payment verified", fee });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.recordFlexiblePayment = async (req, res) => {
  try {
    const { studentFeeId, amount, method, paidDate, note } = req.body;
    const fee = await StudentFee.findById(studentFeeId);
    const teacherAccess = await ensureTeacherFeeAccess(req);
    const canManageFees = await canTeachersManageFees();
    
    if (!fee) return res.status(404).json({ message: "Fee record not found" });
    if (req.user.role === "teacher" && !canManageFees) {
      return res.status(403).json({ message: "Fee entry is disabled for teachers" });
    }

    if (req.user.role === "teacher") {
      const student = await Student.findById(fee.student).select("class").lean();
      if (!teacherAccess.classIds.includes(toObjectIdString(student?.class))) {
        return res.status(403).json({ message: "Access denied for this student" });
      }
    }
    const paymentAmount = normalizeAmount(amount);
    if (!paymentAmount || paymentAmount <= 0) return res.status(400).json({ message: "Enter a valid payment amount" });
    if (paymentAmount > fee.totalDue) return res.status(400).json({ message: "Payment amount cannot exceed total due" });

    const requestedInstallmentMode = req.body?.installmentMode;
    const targetTerm = getOpenTermForFlexiblePayment(fee, req.body?.termId, req.body?.termNumber);

    if (targetTerm) {
      const remainingAmount = getTermRemainingAmount(targetTerm);
      if (paymentAmount > remainingAmount) {
        return res.status(400).json({ message: "Payment amount cannot exceed the remaining due for this term" });
      }
      const installmentMode = resolveInstallmentMode({
        term: targetTerm,
        amount: paymentAmount,
        remainingAmount,
        requestedMode: requestedInstallmentMode,
        existingMode: targetTerm.installmentMode
      });

      if (!targetTerm.installmentMode) {
        targetTerm.installmentMode = installmentMode;
      }

      const currentPaid = Number(targetTerm.paidAmount || 0);
      const confirmedPaid = Math.min(Number(targetTerm.amount || 0), currentPaid + paymentAmount);
      targetTerm.status = confirmedPaid >= Number(targetTerm.amount || 0) ? "Paid" : "Partial";
      targetTerm.paymentStatus = confirmedPaid >= Number(targetTerm.amount || 0) ? "PAID" : "PARTIALLY_PAID";
      targetTerm.paidAmount = confirmedPaid;
      targetTerm.method = method;
      targetTerm.paidDate = paidDate;
      targetTerm.receiptNumber = `RCP-MAN-${Date.now()}`;
      targetTerm.receiptGeneratedAt = new Date();
    } else {
      // Preserve the existing flexible-payment behavior when no explicit term is targeted.
      fee.terms.push({
        termNumber: fee.terms.length + 1,
        termName: note || "Manual Payment",
        amount: paymentAmount,
        status: "Paid",
        paymentStatus: "PAID",
        paidAmount: paymentAmount,
        method: method,
        paidDate: paidDate,
        receiptNumber: `RCP-MAN-${Date.now()}`,
        receiptGeneratedAt: new Date(),
        ...buildInstallmentModeField(requestedInstallmentMode)
      });
    }

    await fee.save();
    await notifyStudentById(
      fee.student?._id || fee.student,
      "Fee payment recorded",
      `A payment of ₹${paymentAmount} has been added to your fee account.`,
      { url: "/student/fees" }
    ).catch(error => console.warn("Fee payment push failed:", error.message));
    res.json({ message: "Payment recorded", fee });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const fee = await StudentFee.findByIdAndDelete(req.params.id);
    if (!fee) {
      return res.status(404).json({ message: "Fee record not found" });
    }

    res.json({ message: "Fee record deleted permanently" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
