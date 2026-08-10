import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import Modal from "../../components/Modal";
import MonthDatePicker from "../../components/MonthDatePicker";
import { useAuth } from "../../context/useAuth";

export default function Exams() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [exams, setExams] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [classFilter, setClassFilter] = useState(searchParams.get("classId") || "");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("examType") || "");
  const [newExamType, setNewExamType] = useState("");
  const [creatingType, setCreatingType] = useState(false);
  const [launchingTypeId, setLaunchingTypeId] = useState("");
  const [launchingAll, setLaunchingAll] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [statsModal, setStatsModal] = useState({ open: false, loading: false, exam: null, data: null });
  const [editingExam, setEditingExam] = useState(null);
  const [savingExam, setSavingExam] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [form, setForm] = useState({ title: "", class: "", subjects: [], maxMarks: 100, passMark: 35, examType: "Periodic Test", date: "" });
  const isEditing = Boolean(editingExam?._id);
  const selectedClass = classes.find(c => c._id === classFilter);
  const selectedExamType = examTypes.find(type => type.name === typeFilter);
  const examTypeByName = new Map(examTypes.map(type => [type.name, type]));
  const examTypeNames = examTypes.map(type => type.name);
  const groupedExams = exams.reduce((acc, exam) => {
    const type = exam.examType || "Untyped";
    if (!acc[type]) acc[type] = [];
    acc[type].push(exam);
    return acc;
  }, {});
  const visibleExamTypes = typeFilter
    ? [typeFilter]
    : [...new Set([...examTypeNames, ...Object.keys(groupedExams)])];
  const classSubjects = subjects.filter(subject => (subject.class?._id || subject.class) === form.class);
  const selectedSubjectNames = classSubjects
    .filter(subject => form.subjects.includes(subject._id))
    .map(subject => subject.name);
  const visibleStatsStudents = (statsModal.data?.students || []).filter(student => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return true;
    return [student.name, student.satCode, student.penCode]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(query));
  });

  const getSubjectYearId = subjectId => {
    const selectedSubject = subjects.find(subject => subject._id === subjectId);
    return selectedSubject?.academicYear?._id || selectedSubject?.academicYear || "";
  };

  const resetForm = () => {
    setForm(f => ({ title: "", class: "", subjects: [], maxMarks: 100, passMark: 35, examType: typeFilter || examTypeNames[0] || "Periodic Test", date: "", academicYear: f.academicYear }));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eRes, typeRes, cRes, sRes, yRes] = await Promise.all([
        api.get("/exams", { params: { ...(classFilter ? { classId: classFilter } : {}), ...(typeFilter ? { examType: typeFilter } : {}) } }),
        api.get("/exam-types"),
        api.get("/classes"),
        api.get("/subjects"),
        api.get("/academic-years/active")
      ]);
      setExams(eRes.data);
      setExamTypes(typeRes.data);
      setClasses(cRes.data);
      setSubjects(sRes.data);
      if (yRes.data) setForm(f => ({ ...f, academicYear: yRes.data._id, examType: f.examType || typeRes.data[0]?.name || "Periodic Test" }));
    } catch (e) {
      console.error("Error fetching data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [classFilter, typeFilter]);

  useEffect(() => {
    if (searchParams.get("action") === "create" && classes.length > 0) {
      setForm(f => ({ ...f, class: f.class || classFilter || classes[0]._id, examType: f.examType || typeFilter || examTypeNames[0] || "Periodic Test" }));
      setIsModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, classes, classFilter, typeFilter, setSearchParams]);

  const handleClassFilterChange = (value) => {
    setClassFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("classId", value);
    else next.delete("classId");
    setSearchParams(next, { replace: true });
  };

  const handleTypeFilterChange = (value) => {
    setTypeFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set("examType", value);
    else next.delete("examType");
    setSearchParams(next, { replace: true });
  };

  const handleCreateExamType = async () => {
    const name = newExamType.trim();
    if (!name) return;

    setCreatingType(true);
    try {
      const { data } = await api.post("/exam-types", { name });
      setExamTypes(prev => prev.some(type => type._id === data._id || type.name === data.name) ? prev : [...prev, data]);
      setTypeFilter(data.name);
      setForm(f => ({ ...f, examType: data.name }));
      const next = new URLSearchParams(searchParams);
      next.set("examType", data.name);
      setSearchParams(next, { replace: true });
      setNewExamType("");
      openScheduleModal(data.name);
    } catch (e) {
      alert(e.response?.data?.message || "Exam type creation failed");
    } finally {
      setCreatingType(false);
    }
  };

  const handleToggleLaunch = async (typeName) => {
    const type = examTypeByName.get(typeName);
    if (!type?._id) return alert("Please create this exam type before launching marks.");

    const isPublished = !type.isPublished;
    const confirmed = isPublished
      ? window.confirm(`Launch "${type.name}" marks to students? Students will be able to open this marks card.`)
      : window.confirm(`Hide "${type.name}" marks from students?`);
    if (!confirmed) return;

    setLaunchingTypeId(type._id);
    try {
      const { data } = await api.put(`/exam-types/${type._id}/launch`, { isPublished });
      setExamTypes(prev => prev.map(item => item._id === data._id ? data : item));
    } catch (e) {
      alert(e.response?.data?.message || "Launch update failed");
    } finally {
      setLaunchingTypeId("");
    }
  };

  const handleLaunchAll = async () => {
    const unpublished = examTypes.filter(type => !type.isPublished);
    if (!unpublished.length) return alert("All exam categories are already launched.");
    if (!window.confirm(`Launch ${unpublished.length} exam categor${unpublished.length === 1 ? "y" : "ies"} to students?`)) return;

    setLaunchingAll(true);
    try {
      const launched = await Promise.all(
        unpublished.map(type => api.put(`/exam-types/${type._id}/launch`, { isPublished: true }).then(res => res.data))
      );
      const launchedById = new Map(launched.map(type => [type._id, type]));
      setExamTypes(prev => prev.map(type => launchedById.get(type._id) || type));
    } catch (e) {
      alert(e.response?.data?.message || "Launch all failed");
    } finally {
      setLaunchingAll(false);
    }
  };

  const openScheduleModal = (examTypeName = typeFilter) => {
    setEditingExam(null);
    setForm(f => ({
      ...f,
      class: classFilter || f.class || classes[0]?._id || "",
      subjects: classFilter && f.class !== classFilter ? [] : f.subjects,
      examType: examTypeName || f.examType || examTypeNames[0] || "Periodic Test"
    }));
    setIsModalOpen(true);
  };

  const closeScheduleModal = () => {
    setIsModalOpen(false);
    setEditingExam(null);
    resetForm();
  };

  const openEditModal = (exam) => {
    const classId = exam.class?._id || exam.class || "";
    const subjectId = exam.subject?._id || exam.subject || "";

    setEditingExam(exam);
    setForm(f => ({
      ...f,
      title: exam.title || "",
      class: classId,
      subjects: subjectId ? [subjectId] : [],
      maxMarks: exam.maxMarks ?? 100,
      passMark: exam.passMark ?? 35,
      examType: exam.examType || typeFilter || examTypeNames[0] || "Periodic Test",
      date: exam.date || "",
      academicYear: exam.academicYear?._id || exam.academicYear || f.academicYear
    }));
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (user?.role !== "admin") {
        alert(`Please log in as admin before ${isEditing ? "editing" : "creating"} an exam.`);
        return;
      }

      if (!form.subjects.length) {
        alert("Please select at least one subject.");
        return;
      }

      if (!form.examType) {
        alert("Please select an exam type.");
        return;
      }

      const activeAcademicYear = form.academicYear || getSubjectYearId(form.subjects[0]);

      if (!activeAcademicYear) {
        alert(`Please set an active academic year before ${isEditing ? "editing" : "creating"} an exam.`);
        return;
      }

      const basePayload = {
        title: form.title,
        class: form.class,
        maxMarks: form.maxMarks,
        passMark: form.passMark,
        examType: form.examType,
        date: form.date,
        academicYear: activeAcademicYear
      };

      setSavingExam(true);

      if (isEditing) {
        await api.put(`/exams/${editingExam._id}`, {
          ...basePayload,
          subject: form.subjects[0]
        });
      } else {
        await Promise.all(form.subjects.map(subjectId => api.post("/exams", {
          ...basePayload,
          subject: subjectId
        })));
      }

      closeScheduleModal();
      fetchData();
    } catch (e) {
      alert(e.response?.data?.message || (isEditing ? "Update failed" : "Creation failed"));
    } finally {
      setSavingExam(false);
    }
  };

  const toggleSubject = subjectId => {
    setForm(prev => ({
      ...prev,
      subjects: isEditing
        ? [subjectId]
        : (prev.subjects.includes(subjectId)
          ? prev.subjects.filter(id => id !== subjectId)
          : [...prev.subjects, subjectId]),
      academicYear: prev.academicYear || getSubjectYearId(subjectId)
    }));
  };

  const handleViewStats = async (exam) => {
    setStudentSearch("");
    setStatsModal({ open: true, loading: true, exam, data: null });
    try {
      const { data } = await api.get(`/exams/${exam._id}/stats`);
      setStatsModal({ open: true, loading: false, exam, data });
    } catch (e) {
      alert(e.response?.data?.message || "Failed to load exam stats");
      setStatsModal({ open: false, loading: false, exam: null, data: null });
    }
  };

  const closeStatsModal = () => setStatsModal({ open: false, loading: false, exam: null, data: null });

  const handleDelete = async (exam) => {
    const subjectName = exam.subject?.name ? ` - ${exam.subject.name}` : "";
    const confirmed = window.confirm(
      `Delete "${exam.title}${subjectName}"? This will also remove marks uploaded for this exam.`
    );

    if (!confirmed) return;

    setDeletingId(exam._id);
    try {
      await api.delete(`/exams/${exam._id}`);
      setExams(prev => prev.filter(item => item._id !== exam._id));
    } catch (e) {
      alert(e.response?.data?.message || "Delete failed");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Examination Schedules</h1>
          <p style={s.sub}>Create exam types, schedule exams inside them, and review marks by class.</p>
        </div>
        <button style={s.btnPrimary} onClick={openScheduleModal}>
          <i className="fa-solid fa-plus" style={{marginRight: '8px'}}></i> Schedule New Exam
        </button>
      </div>

      <div style={s.typePanel}>
        <div>
          <h2 style={s.panelTitle}>Exam Types</h2>
          <p style={s.panelSub}>Create a section such as FA 1, SA 1, Pre-Board, or Weekly Test.</p>
        </div>
        <div style={s.typeCreate}>
          <button style={s.launchAllBtn} onClick={handleLaunchAll} disabled={launchingAll || !examTypes.length}>
            <i className={`fa-solid ${launchingAll ? "fa-circle-notch fa-spin" : "fa-rocket"}`}></i>
            {launchingAll ? "Launching..." : "Launch All"}
          </button>
          <input
            style={s.typeInput}
            placeholder="New exam type"
            value={newExamType}
            onChange={e => setNewExamType(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleCreateExamType();
            }}
          />
          <button style={s.typeCreateBtn} onClick={handleCreateExamType} disabled={creatingType}>
            <i className={`fa-solid ${creatingType ? "fa-circle-notch fa-spin" : "fa-plus"}`}></i>
            {creatingType ? "Creating..." : "Create Type"}
          </button>
        </div>
        <div style={s.typeTabs}>
          <button
            type="button"
            style={{...s.typeTab, ...(!typeFilter ? s.typeTabActive : {})}}
            onClick={() => handleTypeFilterChange("")}
          >
            All Types
          </button>
          {examTypes.map(type => (
            <button
              key={type._id}
              type="button"
              style={{...s.typeTab, ...(typeFilter === type.name ? s.typeTabActive : {})}}
              onClick={() => handleTypeFilterChange(type.name)}
            >
              {type.name}
              <span style={{...s.launchDot, ...(type.isPublished ? s.launchDotOn : {})}}></span>
            </button>
          ))}
        </div>
      </div>

      <div style={s.classToolbar}>
        <div style={s.classPicker}>
          <label style={s.toolbarLabel}>Class</label>
          <select style={s.toolbarSelect} value={classFilter} onChange={e => handleClassFilterChange(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name}{c.section}</option>)}
          </select>
        </div>
        <div style={s.toolbarMeta}>
          <strong>{loading ? "Loading..." : `${exams.length} exam${exams.length === 1 ? "" : "s"}`}</strong>
          <span>
            {selectedClass ? `Class ${selectedClass.name}${selectedClass.section}` : "All classes"}
            {selectedExamType ? ` inside ${selectedExamType.name}` : " across all exam types"}
          </span>
        </div>
        <button style={s.toolbarBtn} onClick={openScheduleModal}>
          <i className="fa-solid fa-calendar-plus"></i>
          Schedule inside {typeFilter || "Type"}
        </button>
      </div>

      {!loading && exams.length === 0 && (
        <div style={s.emptyState}>
          No exams scheduled {selectedClass ? `for Class ${selectedClass.name}${selectedClass.section}` : "yet"}.
        </div>
      )}

      <div style={s.typeSections}>
        {visibleExamTypes.map(typeName => {
          const typeExams = groupedExams[typeName] || [];
          const typeMeta = examTypeByName.get(typeName);
          const isLaunched = Boolean(typeMeta?.isPublished);
          if (!typeExams.length && typeFilter) return null;

          return (
            <section key={typeName} style={s.typeSection}>
              <div style={s.typeSectionHeader}>
                <div>
                  <div style={s.typeTitleRow}>
                    <h2 style={s.typeSectionTitle}>{typeName}</h2>
                    <span style={{...s.launchPill, ...(isLaunched ? s.launchPillOn : {})}}>
                      {isLaunched ? "Launched to students" : "Not launched"}
                    </span>
                  </div>
                  <p style={s.typeSectionSub}>{typeExams.length} exam{typeExams.length === 1 ? "" : "s"} scheduled</p>
                </div>
                <div style={s.typeActions}>
                  <button
                    style={{...s.launchBtn, ...(isLaunched ? s.unlaunchBtn : {})}}
                    onClick={() => handleToggleLaunch(typeName)}
                    disabled={!typeMeta?._id || launchingTypeId === typeMeta?._id}
                  >
                    <i className={`fa-solid ${launchingTypeId === typeMeta?._id ? "fa-circle-notch fa-spin" : isLaunched ? "fa-eye-slash" : "fa-rocket"}`}></i>
                    {launchingTypeId === typeMeta?._id ? "Updating..." : isLaunched ? "Hide from Students" : "Launch Marks"}
                  </button>
                  <button style={s.sectionScheduleBtn} onClick={() => openScheduleModal(typeName)}>
                    <i className="fa-solid fa-plus"></i>
                    Create Exam
                  </button>
                </div>
              </div>
              {typeExams.length === 0 ? (
                <div style={s.typeEmpty}>No exams inside this type yet.</div>
              ) : (
                <div style={s.grid}>
                  {typeExams.map(e => (
                    <div key={e._id} style={s.examCard}>
                      <div style={s.examHeader}>
                        <span style={s.examType}>{e.examType}</span>
                        <span style={s.examDate}><i className="fa-solid fa-calendar-days"></i> {e.date}</span>
                      </div>
                      <h3 style={s.examTitle}>{e.title}</h3>
                      <p style={s.examInfo}><strong>Subject:</strong> {e.subject?.name}</p>
                      <p style={s.examInfo}><strong>Class:</strong> {e.class?.name}{e.class?.section}</p>
                      <div style={s.examFooter}>
                        <span style={s.passMark}><i className="fa-solid fa-check-circle"></i> {e.passMark}/{e.maxMarks} Pass</span>
                        <div style={s.cardActions}>
                          <button style={s.statsBtn} onClick={() => handleViewStats(e)}>View Marks</button>
                          <button
                            type="button"
                            style={s.editBtn}
                            onClick={() => openEditModal(e)}
                            title="Edit exam"
                          >
                            <i className="fa-solid fa-pen-to-square"></i>
                            Edit
                          </button>
                          <button
                            type="button"
                            style={s.deleteBtn}
                            onClick={() => handleDelete(e)}
                            disabled={deletingId === e._id}
                            title="Delete exam"
                          >
                            <i className={`fa-solid ${deletingId === e._id ? "fa-circle-notch fa-spin" : "fa-trash"}`}></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <Modal
        isOpen={statsModal.open}
        onClose={closeStatsModal}
        title="Exam Stats"
        subtitle={statsModal.exam ? `${statsModal.exam.title} - ${statsModal.exam.class?.name || ""}${statsModal.exam.class?.section || ""}` : ""}
        maxWidth="920px"
      >
        {statsModal.loading && <div style={s.loadingBox}>Loading stats...</div>}

        {!statsModal.loading && statsModal.data && (
          <div style={s.statsWrap}>
            <div style={s.uploadBanner}>
              <div>
                <div style={s.bannerLabel}>Marks upload status</div>
                <div style={s.bannerTitle}>
                  {statsModal.data.isUploaded ? "Teacher has uploaded marks for the full class" : "Marks are not fully uploaded yet"}
                </div>
                <div style={s.bannerMeta}>
                  Uploaded {statsModal.data.uploaded} of {statsModal.data.total} students
                  {statsModal.data.uploadedBy?.length ? ` by ${statsModal.data.uploadedBy.map(t => t.name).join(", ")}` : ""}
                </div>
              </div>
              <span style={{
                ...s.statusPill,
                ...(statsModal.data.isUploaded ? s.statusDone : s.statusPending)
              }}>
                {statsModal.data.isUploaded ? "Complete" : `${statsModal.data.missing} Missing`}
              </span>
            </div>

            <div style={s.statGrid}>
              <div style={s.statTile}>
                <span style={s.statLabel}>Pass</span>
                <strong style={{...s.statValue, color: "var(--success-text)"}}>{statsModal.data.passed}</strong>
              </div>
              <div style={s.statTile}>
                <span style={s.statLabel}>Fail</span>
                <strong style={{...s.statValue, color: "var(--danger-text)"}}>{statsModal.data.failed}</strong>
              </div>
              <div style={s.statTile}>
                <span style={s.statLabel}>Average</span>
                <strong style={s.statValue}>{Number(statsModal.data.avg || 0).toFixed(1)}</strong>
              </div>
              <div style={s.statTile}>
                <span style={s.statLabel}>Highest</span>
                <strong style={s.statValue}>{statsModal.data.highest}</strong>
              </div>
            </div>

            <div style={s.tableHeader}>Full class list</div>
            <div style={s.searchWrap}>
              <i className="fa-solid fa-magnifying-glass" style={s.searchIcon}></i>
              <input
                style={s.searchInput}
                placeholder="Search student by name, SAT code, or PEN code..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
              />
            </div>
            <div style={s.tableShell}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Student</th>
                    <th style={s.th}>SATS No.</th>
                    <th style={s.th}>Marks</th>
                    <th style={s.th}>Grade</th>
                    <th style={s.th}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStatsStudents.map(student => (
                    <tr key={student.studentId}>
                      <td style={s.td}>{student.name}</td>
                      <td style={s.td}>{student.satCode}</td>
                      <td style={s.td}>
                        {student.uploaded ? (student.isAbsent ? "Absent" : `${student.marksObtained}/${statsModal.data.exam.maxMarks}`) : "-"}
                      </td>
                      <td style={s.td}>{student.grade || "-"}</td>
                      <td style={s.td}>
                        <span style={{
                          ...s.resultPill,
                          ...(student.status === "Pass" ? s.resultPass : student.status === "Fail" ? s.resultFail : s.resultMissing)
                        }}>
                          {student.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {visibleStatsStudents.length === 0 && (
                    <tr>
                      <td style={{...s.td, textAlign: "center", color: "var(--text-muted)", fontWeight: 800}} colSpan="5">
                        No student found for this search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={closeScheduleModal}
        title={isEditing ? "Edit Exam" : `Create Exam${form.examType ? ` inside ${form.examType}` : ""}`}
        subtitle={isEditing ? "Update this exam schedule and marks settings." : "Choose the exam type first, then schedule classes and subjects under it."}
        footer={(
          <div style={{display: 'flex', gap: '12px', width: '100%'}}>
            <button style={s.cancelBtn} onClick={closeScheduleModal}>Cancel</button>
            <button style={s.saveBtn} onClick={handleSave} disabled={savingExam}>
              <i className={`fa-solid ${savingExam ? "fa-circle-notch fa-spin" : isEditing ? "fa-floppy-disk" : "fa-plus-circle"}`} style={{marginRight: '8px'}}></i>
              {savingExam ? "Saving..." : isEditing ? "Update Exam" : `Save ${form.subjects.length > 1 ? `${form.subjects.length} Exams` : "& Schedule Exam"}`}
            </button>
          </div>
        )}
      >
        <div style={s.form}>
          <div style={s.formItem}>
            <label style={s.label}>Exam Type Section</label>
            <select style={s.input} value={form.examType} onChange={e => setForm({ ...form, examType: e.target.value })}>
              <option value="">Select Exam Type</option>
              {examTypes.map(type => <option key={type._id} value={type.name}>{type.name}</option>)}
            </select>
          </div>
          <div style={s.formItem}>
            <label style={s.label}>Examination Title</label>
            <input style={s.input} placeholder="e.g. Quarterly Exam - Mathematics" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div style={s.row}>
            <div style={s.formItem}>
              <label style={s.label}>Assign to Class</label>
              <select style={s.input} value={form.class} onChange={e => setForm({ ...form, class: e.target.value, subjects: [] })}>
                <option value="">Select Class</option>
                {classes.map(c => <option key={c._id} value={c._id}>{c.name}{c.section}</option>)}
              </select>
            </div>
            <div style={s.formItem}>
              <label style={s.label}>{isEditing ? "Subject" : "Subjects"}</label>
              <div style={s.subjectPicker}>
                {!form.class && <div style={s.subjectHint}>Select a class first.</div>}
                {form.class && classSubjects.length === 0 && <div style={s.subjectHint}>No subjects found for this class.</div>}
                {classSubjects.map(sub => {
                  const checked = form.subjects.includes(sub._id);
                  return (
                    <button
                      key={sub._id}
                      type="button"
                      style={{...s.subjectOption, ...(checked ? s.subjectSelected : {})}}
                      onClick={() => toggleSubject(sub._id)}
                    >
                      <span style={{...s.checkbox, ...(checked ? s.checkboxSelected : {})}}>
                        {checked && <i className="fa-solid fa-check"></i>}
                      </span>
                      {sub.name}
                    </button>
                  );
                })}
              </div>
              {selectedSubjectNames.length > 0 && (
                <div style={s.selectedText}>
                  {isEditing ? `Selected: ${selectedSubjectNames[0]}` : `${selectedSubjectNames.length} selected: ${selectedSubjectNames.join(", ")}`}
                </div>
              )}
            </div>
          </div>
          <div style={s.row}>
            <div style={s.formItem}>
              <label style={s.label}>Maximum Marks</label>
              <input type="number" style={s.input} value={form.maxMarks} onChange={e => setForm({ ...form, maxMarks: e.target.value })} />
            </div>
            <div style={s.formItem}>
              <label style={s.label}>Passing Marks</label>
              <input type="number" style={s.input} value={form.passMark} onChange={e => setForm({ ...form, passMark: e.target.value })} />
            </div>
          </div>
          <div style={s.formItem}>
            <label style={s.label}>Examination Date</label>
            <MonthDatePicker
              value={form.date}
              onChange={date => setForm({ ...form, date })}
              inputStyle={s.input}
              labelStyle={{ display: "none" }}
              helperText="Pick the month first, then the exam day."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

const s = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2.5rem" },
  title: { fontSize: "1.75rem", fontWeight: "800", color: "var(--navy)", margin: 0, fontFamily: "var(--font-heading)" },
  sub: { fontSize: "0.9rem", color: "var(--text-muted)", marginTop: "0.4rem" },
  btnPrimary: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "var(--white)", border: "none", padding: "12px 24px", borderRadius: "30px", fontWeight: "700", cursor: "pointer", boxShadow: "var(--shadow-md)" },
  typePanel: { background: "var(--white)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px", marginBottom: "18px", boxShadow: "var(--shadow-sm)", display: "grid", gridTemplateColumns: "1fr minmax(280px, 420px)", gap: "16px", alignItems: "start" },
  panelTitle: { margin: 0, color: "var(--navy)", fontSize: "1.05rem", fontWeight: "900", fontFamily: "var(--font-heading)" },
  panelSub: { margin: "5px 0 0", color: "var(--text-muted)", fontSize: "0.86rem", fontWeight: "600" },
  typeCreate: { display: "flex", gap: "10px", alignItems: "center" },
  launchAllBtn: { border: "none", borderRadius: "10px", background: "var(--gold)", color: "var(--navy-dark)", padding: "12px 14px", fontWeight: "900", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" },
  typeInput: { flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: "10px", border: "1.5px solid var(--border)", fontSize: "0.92rem", background: "var(--white)", color: "var(--text)" },
  typeCreateBtn: { border: "none", borderRadius: "10px", background: "var(--navy)", color: "var(--white)", padding: "12px 14px", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" },
  typeTabs: { gridColumn: "1 / -1", display: "flex", gap: "8px", overflowX: "auto", paddingTop: "2px" },
  typeTab: { border: "1px solid var(--border)", background: "var(--light-bg)", color: "var(--text)", borderRadius: "10px", padding: "9px 12px", fontSize: "0.82rem", fontWeight: "800", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "8px" },
  typeTabActive: { background: "var(--gold-pale)", color: "var(--navy-dark)", borderColor: "var(--gold)" },
  launchDot: { width: "8px", height: "8px", borderRadius: "50%", background: "var(--text-muted)", opacity: 0.55 },
  launchDotOn: { background: "var(--success-text)", opacity: 1 },
  classToolbar: { display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr auto", alignItems: "center", gap: "16px", background: "var(--white)", border: "1px solid var(--border)", borderRadius: "14px", padding: "16px", marginBottom: "24px", boxShadow: "var(--shadow-sm)" },
  classPicker: { display: "flex", flexDirection: "column", gap: "6px" },
  toolbarLabel: { fontSize: "0.7rem", fontWeight: "800", color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.08em" },
  toolbarSelect: { width: "100%", padding: "11px 12px", borderRadius: "10px", border: "1.5px solid var(--border)", fontSize: "0.95rem", fontWeight: "700", color: "var(--navy)", background: "var(--white)" },
  toolbarMeta: { display: "flex", flexDirection: "column", gap: "3px", color: "var(--text-muted)", fontSize: "0.84rem" },
  toolbarBtn: { border: "none", borderRadius: "10px", background: "var(--gold-pale)", color: "var(--navy-dark)", padding: "12px 16px", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" },
  emptyState: { padding: "28px", background: "var(--white)", border: "1px dashed var(--border)", borderRadius: "14px", color: "var(--text-muted)", textAlign: "center", fontWeight: "800", marginBottom: "24px" },
  typeSections: { display: "flex", flexDirection: "column", gap: "24px" },
  typeSection: { display: "flex", flexDirection: "column", gap: "14px" },
  typeSectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" },
  typeTitleRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
  typeSectionTitle: { margin: 0, color: "var(--navy)", fontSize: "1.2rem", fontWeight: "900", fontFamily: "var(--font-heading)" },
  typeSectionSub: { margin: "3px 0 0", color: "var(--text-muted)", fontWeight: "700", fontSize: "0.82rem" },
  typeActions: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" },
  launchPill: { borderRadius: "999px", background: "rgba(100, 116, 139, 0.12)", color: "var(--text-muted)", padding: "5px 9px", fontSize: "0.7rem", fontWeight: "900" },
  launchPillOn: { background: "rgba(22, 163, 74, 0.12)", color: "var(--success-text)" },
  launchBtn: { border: "none", background: "var(--navy)", color: "var(--white)", borderRadius: "10px", padding: "10px 13px", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", boxShadow: "var(--shadow-sm)" },
  unlaunchBtn: { background: "var(--light-bg)", color: "var(--text-muted)", border: "1px solid var(--border)" },
  sectionScheduleBtn: { border: "1px solid var(--border)", background: "var(--white)", color: "var(--navy)", borderRadius: "10px", padding: "10px 13px", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", boxShadow: "var(--shadow-sm)" },
  typeEmpty: { padding: "18px", border: "1px dashed var(--border)", borderRadius: "12px", color: "var(--text-muted)", fontWeight: "800", background: "var(--white)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "2rem" },
  examCard: { background: "var(--white)", padding: "1.5rem", borderRadius: "20px", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", transition: "var(--transition)", cursor: "pointer" },
  examHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" },
  examType: { fontSize: "0.65rem", fontWeight: "800", color: "var(--navy)", background: "var(--light-bg)", padding: "4px 10px", borderRadius: "30px", textTransform: "uppercase", letterSpacing: "0.05em" },
  examDate: { fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: "600" },
  examTitle: { fontSize: "1.15rem", fontWeight: "800", color: "var(--navy)", margin: "0 0 0.75rem 0" },
  examInfo: { fontSize: "0.88rem", color: "var(--text)", margin: "0.35rem 0" },
  examFooter: { marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1.5px solid var(--light-bg)", display: "flex", justifyContent: "space-between", alignItems: "center" },
  passMark: { fontSize: "0.8rem", fontWeight: "700", color: "var(--success-text)", display: "flex", alignItems: "center", gap: "6px" },
  cardActions: { display: "flex", alignItems: "center", gap: "8px" },
  statsBtn: { background: "none", border: "none", color: "var(--navy)", cursor: "pointer", fontWeight: "800", fontSize: "0.85rem", textDecoration: "underline" },
  editBtn: { border: "1px solid var(--border)", background: "var(--white)", color: "var(--navy)", borderRadius: "8px", padding: "8px 10px", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem" },
  deleteBtn: { width: "34px", height: "34px", borderRadius: "8px", border: "1px solid var(--danger-text)", background: "var(--danger-bg)", color: "var(--danger-text)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" },
  loadingBox: { padding: "32px", textAlign: "center", color: "var(--text-muted)", fontWeight: "700" },
  statsWrap: { display: "flex", flexDirection: "column", gap: "18px" },
  uploadBanner: { border: "1px solid var(--border)", borderRadius: "12px", padding: "18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", background: "var(--light-bg)" },
  bannerLabel: { fontSize: "0.7rem", fontWeight: "800", color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" },
  bannerTitle: { fontSize: "1rem", color: "var(--navy)", fontWeight: "800" },
  bannerMeta: { fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" },
  statusPill: { flexShrink: 0, borderRadius: "999px", padding: "8px 12px", fontSize: "0.75rem", fontWeight: "800" },
  statusDone: { background: "rgba(22, 163, 74, 0.12)", color: "var(--success-text)" },
  statusPending: { background: "rgba(220, 38, 38, 0.1)", color: "var(--danger-text)" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" },
  statTile: { border: "1px solid var(--border)", borderRadius: "10px", padding: "14px", background: "var(--white)" },
  statLabel: { display: "block", fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: "800", textTransform: "uppercase", marginBottom: "8px" },
  statValue: { fontSize: "1.35rem", color: "var(--navy)", lineHeight: 1 },
  tableHeader: { fontSize: "0.95rem", fontWeight: "800", color: "var(--navy)", marginTop: "2px" },
  searchWrap: { position: "relative", marginTop: "-6px" },
  searchIcon: { position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "0.85rem" },
  searchInput: { width: "100%", boxSizing: "border-box", padding: "11px 14px 11px 38px", borderRadius: "10px", border: "1.5px solid var(--border)", background: "var(--white)", color: "var(--text)", fontSize: "0.9rem", fontWeight: "600" },
  tableShell: { border: "1px solid var(--border)", borderRadius: "12px", overflow: "auto", maxHeight: "360px" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "680px" },
  th: { textAlign: "left", background: "var(--light-bg)", color: "var(--navy)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", padding: "12px", borderBottom: "1px solid var(--border)" },
  td: { padding: "12px", borderBottom: "1px solid var(--border)", color: "var(--text)", fontSize: "0.86rem", verticalAlign: "middle" },
  resultPill: { borderRadius: "999px", padding: "5px 9px", fontSize: "0.72rem", fontWeight: "800", display: "inline-block" },
  resultPass: { background: "rgba(22, 163, 74, 0.12)", color: "var(--success-text)" },
  resultFail: { background: "rgba(220, 38, 38, 0.1)", color: "var(--danger-text)" },
  resultMissing: { background: "rgba(100, 116, 139, 0.12)", color: "var(--text-muted)" },
  form: { display: "flex", flexDirection: "column", gap: "1.5rem" },
  formItem: { display: "flex", flexDirection: "column", gap: "6px" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" },
  label: { fontSize: "0.7rem", fontWeight: "800", color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.08em" },
  input: { width: "100%", padding: "12px 14px", borderRadius: "10px", border: "1.5px solid var(--border)", fontSize: "0.95rem", boxSizing: "border-box", background: 'var(--white)', fontFamily: 'var(--font-body)' },
  subjectPicker: { border: "1.5px solid var(--border)", borderRadius: "10px", padding: "10px", background: "var(--white)", minHeight: "48px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "190px", overflowY: "auto" },
  subjectOption: { width: "100%", border: "1px solid var(--border)", background: "var(--light-bg)", color: "var(--text)", borderRadius: "8px", padding: "9px 10px", display: "flex", alignItems: "center", gap: "10px", textAlign: "left", fontWeight: "700", cursor: "pointer" },
  subjectSelected: { background: "var(--success-bg)", color: "var(--success-text)", borderColor: "var(--success-text)" },
  checkbox: { width: "18px", height: "18px", borderRadius: "5px", border: "1.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", flexShrink: 0, background: "var(--white)" },
  checkboxSelected: { borderColor: "var(--success-text)", background: "var(--success-text)", color: "var(--white)" },
  subjectHint: { color: "var(--text-muted)", fontWeight: "700", fontSize: "0.85rem", padding: "6px" },
  selectedText: { color: "var(--text-muted)", fontSize: "0.78rem", fontWeight: "700", marginTop: "2px" },
  cancelBtn: { padding: "12px 20px", background: "var(--light-bg)", border: "none", color: "var(--text-muted)", fontWeight: "700", cursor: "pointer", borderRadius: "10px" },
  saveBtn: { flex: 1, padding: "12px 24px", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", borderRadius: "10px", border: "none", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 15px rgba(200,150,12,0.2)", animation: 'shimmer 3s linear infinite' }
};
