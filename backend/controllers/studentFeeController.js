const StudentFee = require("../models/StudentFee");
const Student = require("../models/Student");
const Class = require("../models/Class");
const AcademicYear = require("../models/AcademicYear");
const QRCode = require("qrcode");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { notifyStudentById } = require("../utils/pushNotification");
const { getIO } = require("../utils/socket");
const { canTeachersManageFees } = require("./settingController");

const SCHOOL_UPI_ID = process.env.SCHOOL_UPI_ID || "lemhs@kbl";
const SCHOOL_NAME = process.env.SCHOOL_NAME || "Loreto English Medium High School General Fees Account";
const TEST_UPI_VPA = process.env.TEST_UPI_VPA || SCHOOL_UPI_ID;

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

const buildUpiLink = ({ amount, reference, note, payeeVpa }) => {
  const params = new URLSearchParams({
    pa: payeeVpa || SCHOOL_UPI_ID,
    pn: SCHOOL_NAME,
    am: String(Number(amount || 0).toFixed(2)),
    tn: note || "Test Payment",
    tr: reference,
    cu: "INR"
  });

  return {
    upiLink: `upi://pay?${params.toString()}`,
    upiTrReference: reference
  };
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

    const amount = isBalancePayment ? Number(fee.totalDue || fee.totalAnnualFee || 0) : Number(term.amount || 0);
    if (amount <= 0) {
      return res.status(400).json({ message: "No balance due for UPI payment" });
    }

    const termLabel = isBalancePayment ? "BALANCE" : getTermLabel(term);
    const upiTrReference = isBalancePayment
      ? makeUpiReference(studentId, "BALANCE", String(fee._id || studentId))
      : await persistUpiReferenceIfNeeded(fee, term, studentId);
    const { upiLink } = buildUpiLink({
      amount,
      reference: upiTrReference,
      note: isBalancePayment ? "Balance Payment" : `Fee ${termLabel}`
    });

    const qrCodeDataUrl = await QRCode.toDataURL(upiLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280
    });

    res.json({
      upiLink,
      qrCodeDataUrl,
      upiTrReference,
      amount,
      term: isBalancePayment ? {
        _id: "overall",
        termNumber: 0,
        termName: "Balance Payment",
        amount,
        paymentStatus: "UNPAID",
        utrNumber: "",
        claimedAt: null,
        verifiedAt: null,
        rejectionReason: ""
      } : {
        _id: term._id,
        termNumber: term.termNumber,
        termName: term.termName,
        amount: term.amount,
        paymentStatus: term.paymentStatus || (term.status === "Paid" ? "PAID" : "UNPAID"),
        utrNumber: term.utrNumber || "",
        claimedAt: term.claimedAt || null,
        verifiedAt: term.verifiedAt || null,
        rejectionReason: term.rejectionReason || ""
      }
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};

exports.getTestUpiLink = async (req, res) => {
  try {
    const studentId = String(req.user?.id || "");
    const amount = Number(req.query?.amount || 0);
    const label = String(req.query?.label || "TEST PAYMENT").trim();

    if (!studentId) {
      return res.status(400).json({ message: "Student identity not found" });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Enter a valid amount" });
    }

    const termLabel = normalizeLabel(label || `TEST-${amount}`);
    const upiTrReference = makeUpiReference(studentId, "TEST", amount, termLabel);
    const { upiLink } = buildUpiLink({
      amount,
      reference: upiTrReference,
      note: label || "Test Payment",
      payeeVpa: TEST_UPI_VPA
    });

    const qrCodeDataUrl = await QRCode.toDataURL(upiLink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280
    });

    res.json({
      upiLink,
      qrCodeDataUrl,
      upiTrReference,
      payeeVpa: TEST_UPI_VPA,
      amount,
      term: {
        _id: "test",
        termNumber: 0,
        termName: label || "Test Payment",
        amount,
        paymentStatus: "UNPAID",
        utrNumber: "",
        claimedAt: null,
        verifiedAt: null,
        rejectionReason: ""
      }
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
};

exports.claimUpiPayment = async (req, res) => {
  try {
    const { studentId, termId } = req.params;
    const utrNumber = String(req.body?.utrNumber || "").trim();
    ensureStudentOwnership(req, studentId);

    if (!/^\d{10,12}$/.test(utrNumber)) {
      return res.status(400).json({ message: "UTR number must be 10 to 12 digits" });
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

    if (!term && isBalancePayment) {
      const balanceAmount = Number(fee.totalDue || fee.totalAnnualFee || 0);
      if (balanceAmount <= 0) {
        return res.status(400).json({ message: "No balance due" });
      }

      fee.terms.push({
        termNumber: (fee.terms || []).length + 1,
        termName: "Balance Payment",
        amount: balanceAmount,
        status: "Unpaid",
        paymentStatus: "PENDING_VERIFICATION",
        paidAmount: 0,
        upiTrReference: makeUpiReference(studentId, "BALANCE", String(fee._id || studentId)),
        utrNumber,
        claimedAt: new Date(),
        verifiedAt: null,
        verifiedByAdminId: null,
        rejectionReason: ""
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
          paymentStatus: term.paymentStatus,
          utrNumber: term.utrNumber,
          claimedAt: term.claimedAt,
          verifiedAt: term.verifiedAt,
          rejectionReason: term.rejectionReason,
          upiTrReference: term.upiTrReference
        }
      });
    }

    if (term.paymentStatus === "PAID" || term.status === "Paid") {
      return res.status(400).json({ message: "This term is already paid" });
    }

    if (term.paymentStatus === "PENDING_VERIFICATION") {
      return res.status(400).json({ message: "This payment is already pending verification" });
    }

    term.paymentStatus = "PENDING_VERIFICATION";
    term.status = "Unpaid";
    term.utrNumber = utrNumber;
    term.claimedAt = new Date();
    term.verifiedAt = null;
    term.verifiedByAdminId = null;
    term.rejectionReason = "";
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
        paymentStatus: term.paymentStatus,
        utrNumber: term.utrNumber,
        claimedAt: term.claimedAt,
        verifiedAt: term.verifiedAt,
        rejectionReason: term.rejectionReason,
        upiTrReference: term.upiTrReference
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
          claimedAt: term.claimedAt || null,
          upiTrReference: term.upiTrReference || "",
          paymentStatus: term.paymentStatus
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
      term.paymentStatus = "PAID";
      term.status = "Paid";
      term.paidAmount = Number(term.amount || 0);
      term.paidDate = now.toISOString().split("T")[0];
      term.method = "upi_manual";
      term.receiptNumber = `UPI-MAN-${Date.now()}`;
      term.receiptGeneratedAt = now;
      term.rejectionReason = "";
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
          method: term.method
        }
      });
    }

    term.paymentStatus = "REJECTED";
    term.status = "Unpaid";
    term.paidAmount = 0;
    term.paidDate = null;
    term.rejectionReason = rejectionReason || "Rejected by administrator";
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
        rejectionReason: term.rejectionReason
      }
    });
  } catch (e) {
    res.status(e.status || 400).json({ message: e.message });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const { studentFeeId, termNumber, amount, method, paidDate, note } = req.body;
    const fee = await StudentFee.findById(studentFeeId).populate("student", "satCode");
    
    if (!fee) return res.status(404).json({ message: "Fee record not found" });

    const term = fee.terms.find(t => t.termNumber === Number(termNumber));
    if (!term) return res.status(404).json({ message: "Term not found" });

    term.status = "Paid";
    term.paidAmount = Number(amount);
    term.method = method;
    term.paidDate = paidDate;
    term.receiptNumber = `RCP-LCS-${Date.now()}`;
    term.receiptGeneratedAt = new Date();

    await fee.save();
    await notifyStudentById(
      fee.student?._id || fee.student,
      "Fee payment recorded",
      `A payment of ₹${Number(amount)} has been recorded for your fee account.`,
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

    term.status = "Paid";
    term.paidAmount = term.amount;
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
      studentFeeId, amount, label, 
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
    fee.terms.push({
      termNumber: fee.terms.length + 1,
      termName: label,
      amount: Number(amount),
      status: "Paid",
      paidAmount: Number(amount),
      method: "Online",
      paidDate: new Date().toISOString().split('T')[0],
      receiptNumber: `RCP-FLEX-${Date.now()}`,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      receiptGeneratedAt: new Date()
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
    if (!amount || Number(amount) <= 0) return res.status(400).json({ message: "Enter a valid payment amount" });
    if (Number(amount) > fee.totalDue) return res.status(400).json({ message: "Payment amount cannot exceed total due" });

    // Create a manual paid record
    fee.terms.push({
      termNumber: fee.terms.length + 1,
      termName: note || "Manual Payment",
      amount: Number(amount),
      status: "Paid",
      paidAmount: Number(amount),
      method: method,
      paidDate: paidDate,
      receiptNumber: `RCP-MAN-${Date.now()}`,
      receiptGeneratedAt: new Date()
    });

    await fee.save();
    await notifyStudentById(
      fee.student?._id || fee.student,
      "Fee payment recorded",
      `A payment of ₹${Number(amount)} has been added to your fee account.`,
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
