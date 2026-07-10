const StudentFee = require("../models/StudentFee");
const Student = require("../models/Student");
const Class = require("../models/Class");
const AcademicYear = require("../models/AcademicYear");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { notifyStudentById } = require("../utils/pushNotification");
const { canTeachersManageFees } = require("./settingController");

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

    res.json(fee);
  } catch (e) {
    res.status(500).json({ message: e.message });
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
