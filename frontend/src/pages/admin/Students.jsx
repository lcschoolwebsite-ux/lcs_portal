import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import Table from "../../components/Table";
import Modal from "../../components/Modal";

export default function Students() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [addClassId, setAddClassId] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 1 });
  const [allowTeacherStudentCreation, setAllowTeacherStudentCreation] = useState(true);
  const [savingPermission, setSavingPermission] = useState(false);
  const [selectedFilterClassCount, setSelectedFilterClassCount] = useState(null);
  const [selectedAddClassCount, setSelectedAddClassCount] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef(null);
  
  const [form, setForm] = useState({
    name: "", dob: "", fatherName: "", motherName: "", mobile: "", alternateMobile: "", email: "", address: "",
    satCode: "", penCode: "", class: ""
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, cRes, settingsRes] = await Promise.all([
        api.get("/students", { params: { search, classId: classFilter, page, limit: 30, sortOrder } }),
        api.get("/classes"),
        api.get("/settings/student-registration")
      ]);
      setStudents(sRes.data.data || sRes.data);
      setPagination(sRes.data.pagination || { page: 1, limit: sRes.data.length, total: sRes.data.length, totalPages: 1 });
      setClasses(cRes.data);
      setAllowTeacherStudentCreation(Boolean(settingsRes.data.allowTeacherStudentCreation));
    } catch (e) {
      console.error("Error fetching students", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = (classId = addClassId) => {
    setIsEditing(false);
    setForm({ name: "", dob: "", fatherName: "", motherName: "", mobile: "", alternateMobile: "", email: "", address: "", satCode: "", penCode: "", class: classId || "" });
    setIsModalOpen(true);
  };

  useEffect(() => { fetchData(); }, [search, classFilter, page, sortOrder]);

  useEffect(() => { setPage(1); }, [search, classFilter, sortOrder]);

  useEffect(() => {
    const fetchFilterClassCount = async () => {
      if (!classFilter) {
        setSelectedFilterClassCount(null);
        return;
      }

      try {
        const { data } = await api.get("/students", {
          params: { classId: classFilter, page: 1, limit: 1 }
        });
        setSelectedFilterClassCount(data.pagination?.total ?? (data.data || data).length);
      } catch (e) {
        console.error("Error fetching filtered class count", e);
        setSelectedFilterClassCount(null);
      }
    };

    fetchFilterClassCount();
  }, [classFilter]);

  useEffect(() => {
    const fetchAddClassCount = async () => {
      if (!addClassId) {
        setSelectedAddClassCount(null);
        return;
      }

      try {
        const { data } = await api.get("/students", {
          params: { classId: addClassId, page: 1, limit: 1 }
        });
        setSelectedAddClassCount(data.pagination?.total ?? (data.data || data).length);
      } catch (e) {
        console.error("Error fetching selected class count", e);
        setSelectedAddClassCount(null);
      }
    };

    fetchAddClassCount();
  }, [addClassId]);

  const selectedFilterClass = classes.find(c => c._id === classFilter);
  const selectedAddClass = classes.find(c => c._id === addClassId);

  useEffect(() => {
    if (searchParams.get("action") === "add" && classes.length > 0) {
      setIsEditing(false);
      setForm({ name: "", dob: "", fatherName: "", motherName: "", mobile: "", alternateMobile: "", email: "", address: "", satCode: "", penCode: "", class: classes[0]?._id || "" });
      setIsModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, classes, setSearchParams]);

  const handleOpenEdit = (s) => {
    setIsEditing(true);
    setSelectedStudent(s);
    setPhotoMessage("");
    setPhotoError("");
    setForm({
      name: s.name || "", 
      dob: s.dob || "", 
      fatherName: s.fatherName || "", 
      motherName: s.motherName || "",
      mobile: s.mobile || "", 
      alternateMobile: s.alternateMobile || "",
      email: s.email || "", 
      address: s.address || "", 
      satCode: s.satCode || "", 
      penCode: s.penCode || "", 
      class: s.class?._id || ""
    });
    setIsModalOpen(true);
  };

  const updateStudentInList = (updatedStudent) => {
    setSelectedStudent(updatedStudent);
    setStudents(prev => prev.map(student => student._id === updatedStudent._id ? updatedStudent : student));
  };

  const handleSave = async () => {
    try {
      if (isEditing) {
        await api.put(`/students/${selectedStudent._id}`, form);
        alert("Student updated successfully!");
      } else {
        await api.post("/students", form);
        alert("Student registered successfully!");
      }
      setIsModalOpen(false);
      fetchData();
    } catch (e) {
      alert(e.response?.data?.message || "Operation failed");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this student permanently?")) return;
    try {
      await api.delete(`/students/${id}`);
      fetchData();
    } catch (e) {
      alert("Delete failed");
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedStudent) return;

    setPhotoMessage("");
    setPhotoError("");

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Photo must be 2 MB or smaller.");
      event.target.value = "";
      return;
    }

    const payload = new FormData();
    payload.append("photo", file);

    setPhotoUploading(true);
    try {
      const { data } = await api.post(`/students/${selectedStudent._id}/photo`, payload, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (data.student) updateStudentInList(data.student);
      setPhotoMessage("Student photo updated.");
    } catch (e) {
      setPhotoError(e.response?.data?.message || "Unable to upload photo.");
    } finally {
      setPhotoUploading(false);
      event.target.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    if (!selectedStudent?.photoUrl) return;
    if (!window.confirm("Remove this student's photo?")) return;

    setPhotoMessage("");
    setPhotoError("");
    setPhotoUploading(true);
    try {
      const { data } = await api.delete(`/students/${selectedStudent._id}/photo`);
      if (data.student) updateStudentInList(data.student);
      setPhotoMessage("Student photo removed.");
    } catch (e) {
      setPhotoError(e.response?.data?.message || "Unable to remove photo.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleToggleTeacherCreate = async () => {
    const nextValue = !allowTeacherStudentCreation;
    setAllowTeacherStudentCreation(nextValue);
    setSavingPermission(true);
    try {
      const { data } = await api.put("/settings/student-registration", {
        allowTeacherStudentCreation: nextValue
      });
      setAllowTeacherStudentCreation(Boolean(data.allowTeacherStudentCreation));
    } catch (e) {
      setAllowTeacherStudentCreation(!nextValue);
      alert(e.response?.data?.message || "Permission update failed");
    } finally {
      setSavingPermission(false);
    }
  };

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Student Database</h1>
          <p style={s.sub}>View and search all registered students.</p>
        </div>
        <div style={s.headerActions}>
          <button
            type="button"
            style={{...s.permissionBtn, ...(allowTeacherStudentCreation ? s.permissionOn : s.permissionOff)}}
            onClick={handleToggleTeacherCreate}
            disabled={savingPermission}
          >
            <i className={`fa-solid ${allowTeacherStudentCreation ? "fa-user-check" : "fa-user-lock"}`}></i>
            {savingPermission ? "Saving..." : allowTeacherStudentCreation ? "Teachers Can Add" : "Teachers Blocked"}
          </button>
        </div>
      </div>

      <div style={s.classAddBar}>
        <div>
          <div style={s.classAddTitle}>Add Student By Class</div>
          <div style={s.classAddSub}>Select one of the created classes, then register a student directly into that class.</div>
          {selectedAddClass && selectedAddClassCount !== null && (
            <div style={s.countBadge}>
              {selectedAddClass.name} - {selectedAddClass.section}: {selectedAddClassCount} students
            </div>
          )}
        </div>
        <div style={s.classAddActions}>
          <select style={s.classAddSelect} value={addClassId} onChange={e => setAddClassId(e.target.value)}>
            <option value="">Select Class</option>
            {classes.map(c => (
              <option key={c._id} value={c._id}>{c.name} - {c.section}</option>
            ))}
          </select>
          <button
            type="button"
            style={{...s.btnPrimary, ...(!addClassId ? s.btnDisabled : {})}}
            onClick={() => handleOpenCreate(addClassId)}
            disabled={!addClassId}
          >
            <i className="fa-solid fa-user-plus" style={{marginRight: '8px'}}></i> Add To Selected Class
          </button>
        </div>
      </div>

      <div style={s.filters}>
        <div style={s.searchWrap}>
          <i className="fa-solid fa-search" style={s.searchIcon}></i>
          <input style={s.searchInput} placeholder="Search by name, SATS no. or mobile..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select style={s.select} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => (
            <option key={c._id} value={c._id}>{c.name} - {c.section}</option>
          ))}
        </select>
        <button
          type="button"
          style={s.sortBtn}
          onClick={() => setSortOrder(current => current === "asc" ? "desc" : "asc")}
        >
          <i className={`fa-solid ${sortOrder === "asc" ? "fa-arrow-down-a-z" : "fa-arrow-down-z-a"}`}></i>
          {sortOrder === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>

      <div style={s.metaRow}>
        {selectedFilterClass ? (
          <div style={s.countBadge}>
            {selectedFilterClass.name} - {selectedFilterClass.section}: {selectedFilterClassCount ?? 0} students
          </div>
        ) : (
          <div style={s.countHint}>Select a class to see its total student count.</div>
        )}
      </div>

      <Table
        loading={loading}
        pagination={pagination}
        onPageChange={setPage}
        headers={["Name", "SATS No.", "Class", "Mobile", "Parent Name", "Status", "Actions"]}
        data={students}
        renderRow={(stRow) => (
          <>
            <td style={st.td}>
              <div style={st.profileFlex}>
                <div style={st.avatar}>
                  {stRow.photoUrl ? (
                    <img src={stRow.photoUrl} alt={stRow.name || "Student"} style={st.avatarImg} />
                  ) : (
                    stRow.name?.[0] || "S"
                  )}
                </div>
                <div>
                  <div style={st.name}>{stRow.name}</div>
                  <div style={st.email}>{stRow.email || "No email"}</div>
                </div>
              </div>
            </td>
            <td style={st.td}>{stRow.satCode}</td>
            <td style={st.td}>{stRow.class?.name}{stRow.class?.section}</td>
            <td style={st.td}>
              <div>{stRow.mobile}</div>
              {stRow.alternateMobile && <div style={st.subText}>{stRow.alternateMobile}</div>}
            </td>
            <td style={st.td}>{stRow.fatherName}</td>
            <td style={st.td}>
              <span style={{ ...st.badge, background: stRow.isActive ? "var(--success-bg)" : "var(--danger-bg)", color: stRow.isActive ? "var(--success-text)" : "var(--danger-text)" }}>
                {stRow.isActive ? "Active" : "Inactive"}
              </span>
            </td>
            <td style={st.td}>
              <div style={{display: 'flex', gap: '8px'}}>
                <button style={st.actionBtn} onClick={() => handleOpenEdit(stRow)}><i className="fa-solid fa-pen"></i> Edit</button>
                <button style={{...st.actionBtn, color: 'var(--danger-text)', borderColor: 'var(--danger-text)'}} onClick={() => handleDelete(stRow._id)}>
                  <i className="fa-solid fa-trash"></i> Delete
                </button>
              </div>
            </td>
          </>
        )}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? "Edit Student Profile" : "Register New Student"}
        maxWidth="800px"
        footer={(
          <div style={{display: 'flex', gap: '12px', width: '100%'}}>
            <button style={st.cancelBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button style={st.saveBtn} onClick={handleSave}>
              <i className="fa-solid fa-floppy-disk" style={{marginRight: '8px'}}></i> {isEditing ? "Save Changes" : "Register Student"}
            </button>
          </div>
        )}
      >
        <div style={st.formGrid}>
          {isEditing && (
            <div style={st.photoPanel}>
              <div style={st.photoPreview}>
                {selectedStudent?.photoUrl ? (
                  <img src={selectedStudent.photoUrl} alt={selectedStudent.name || "Student"} style={st.photoImg} />
                ) : (
                  <div style={st.photoAvatar}>{selectedStudent?.name?.[0] || "S"}</div>
                )}
              </div>
              <div style={st.photoMeta}>
                <div style={st.photoTitle}>Student Photo</div>
                <div style={st.photoHint}>Upload JPG, PNG, or WebP up to 2 MB.</div>
                <div style={st.photoActions}>
                  <button type="button" style={st.photoBtn} onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
                    <i className={`fa-solid ${photoUploading ? "fa-circle-notch fa-spin" : "fa-camera"}`}></i>
                    {selectedStudent?.photoUrl ? "Change Photo" : "Add Photo"}
                  </button>
                  {selectedStudent?.photoUrl && (
                    <button type="button" style={st.removePhotoBtn} onClick={handleRemovePhoto} disabled={photoUploading}>
                      <i className="fa-solid fa-xmark"></i> Remove Photo
                    </button>
                  )}
                </div>
                {photoMessage && <div style={st.photoSuccess}>{photoMessage}</div>}
                {photoError && <div style={st.photoError}>{photoError}</div>}
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={st.fileInput} />
              </div>
            </div>
          )}

          {/* Section 1: Basic Info */}
          <div style={st.sectionTitle}>1. Basic Information</div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Student Name *</label>
              <input style={st.input} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Full legal name" />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Date of Birth (Optional)</label>
              <input style={st.input} value={form.dob} onChange={e => setForm({...form, dob: e.target.value})} placeholder="ddmmyyyy" />
            </div>
          </div>

          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Email Address (Optional)</label>
              <input style={st.input} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="student@email.com" />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Mobile Number *</label>
              <input style={st.input} value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} placeholder="+91" />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Second Mobile Number (Optional)</label>
              <input style={st.input} value={form.alternateMobile} onChange={e => setForm({...form, alternateMobile: e.target.value})} placeholder="+91" />
            </div>
          </div>

          {/* Section 2: Academic Info */}
          <div style={st.sectionTitle}>2. Academic Details</div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Assigned Class</label>
              <select style={st.input} value={form.class} onChange={e => setForm({...form, class: e.target.value})}>
                <option value="">Select Class</option>
                {classes.map(c => <option key={c._id} value={c._id}>{c.name} - {c.section}</option>)}
              </select>
            </div>
          </div>

          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>SATS No. *</label>
              <input style={st.input} value={form.satCode} onChange={e => setForm({...form, satCode: e.target.value})} />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>PEN Code (Optional)</label>
              <input style={st.input} value={form.penCode} onChange={e => setForm({...form, penCode: e.target.value})} />
            </div>
          </div>

          {/* Section 3: Parent Info */}
          <div style={st.sectionTitle}>3. Parent & Address Details</div>
          <div style={st.row}>
            <div style={st.formItem}>
              <label style={st.label}>Father's Name *</label>
              <input style={st.input} value={form.fatherName} onChange={e => setForm({...form, fatherName: e.target.value})} />
            </div>
            <div style={st.formItem}>
              <label style={st.label}>Mother's Name *</label>
              <input style={st.input} value={form.motherName} onChange={e => setForm({...form, motherName: e.target.value})} />
            </div>
          </div>

          <div style={st.formItem}>
            <label style={st.label}>Residential Address (Optional)</label>
            <textarea style={{...st.input, minHeight: '80px'}} value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full address..." />
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
  headerActions: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  btnPrimary: { background: "linear-gradient(135deg, var(--navy), var(--navy-dark))", color: "var(--white)", border: "none", padding: "12px 24px", borderRadius: "30px", fontWeight: "700", cursor: "pointer", boxShadow: "var(--shadow-md)" },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed", boxShadow: "none" },
  permissionBtn: { border: "1px solid var(--border)", padding: "12px 18px", borderRadius: "30px", fontWeight: "800", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", transition: "var(--transition)" },
  permissionOn: { background: "var(--success-bg)", color: "var(--success-text)", borderColor: "var(--success-text)" },
  permissionOff: { background: "var(--danger-bg)", color: "var(--danger-text)", borderColor: "var(--danger-text)" },
  classAddBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", padding: "16px 18px", marginBottom: "1.5rem", border: "1px solid var(--border)", borderRadius: "12px", background: "linear-gradient(135deg, rgba(10, 45, 75, 0.04), rgba(200, 150, 12, 0.08))" },
  classAddTitle: { fontSize: "0.95rem", fontWeight: "800", color: "var(--navy)" },
  classAddSub: { fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "4px" },
  countBadge: { marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "999px", background: "rgba(10, 45, 75, 0.08)", color: "var(--navy)", fontSize: "0.82rem", fontWeight: "800" },
  classAddActions: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" },
  classAddSelect: { minWidth: "220px", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontWeight: "700", color: "var(--navy)" },
  filters: { display: "flex", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap" },
  searchWrap: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' },
  searchInput: { width: '100%', padding: "0.75rem 1rem 0.75rem 42px", borderRadius: "10px", border: "1px solid var(--border)", fontSize: "0.95rem" },
  select: { padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)", background: "#fff", cursor: "pointer" },
  sortBtn: { display: "inline-flex", alignItems: "center", gap: "8px", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--white)", color: "var(--navy)", cursor: "pointer", fontWeight: "800" },
  metaRow: { marginBottom: "1.5rem" },
  countHint: { fontSize: "0.84rem", color: "var(--text-muted)", fontWeight: "600" }
};

const st = {
  td: { padding: "1rem", fontSize: "0.9rem", color: "var(--text)", borderBottom: "1px solid var(--border)" },
  profileFlex: { display: "flex", alignItems: "center", gap: "0.75rem" },
  avatar: { width: "34px", height: "34px", borderRadius: "50%", background: "var(--gold-pale)", color: "var(--navy-dark)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700", fontSize: "0.8rem", overflow: "hidden", flex: "0 0 auto" },
  avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  name: { fontWeight: "600", color: "var(--navy)" },
  email: { fontSize: "0.75rem", color: "var(--text-muted)" },
  subText: { fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "3px" },
  badge: { padding: "4px 10px", borderRadius: "20px", fontSize: "0.7rem", fontWeight: "800", textTransform: "uppercase" },
  actionBtn: { background: "var(--white)", border: "1.5px solid var(--navy)", padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem", color: "var(--navy)", fontWeight: "700", display: 'flex', alignItems: 'center', gap: '4px' },
  cancelBtn: { padding: "12px 20px", background: "var(--light-bg)", border: "none", color: "var(--text-muted)", fontWeight: "700", cursor: "pointer", borderRadius: "10px" },
  saveBtn: { flex: 1, padding: "12px 24px", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", borderRadius: "10px", border: "none", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 15px rgba(200,150,12,0.2)", animation: 'shimmer 3s linear infinite' },
  formGrid: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  photoPanel: { display: "flex", alignItems: "center", gap: "18px", background: "var(--light-bg)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px" },
  photoPreview: { width: "92px", height: "92px", borderRadius: "50%", background: "var(--white)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", border: "3px solid var(--gold)", overflow: "hidden" },
  photoImg: { width: "100%", height: "100%", objectFit: "cover" },
  photoAvatar: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, var(--gold), var(--gold-light))", color: "var(--navy-dark)", fontSize: "2rem", fontWeight: "900" },
  photoMeta: { flex: 1, minWidth: 0 },
  photoTitle: { color: "var(--navy)", fontWeight: "900", fontSize: "1rem", marginBottom: "4px" },
  photoHint: { color: "var(--text-muted)", fontWeight: "700", fontSize: "0.78rem", marginBottom: "12px" },
  photoActions: { display: "flex", flexWrap: "wrap", gap: "10px" },
  photoBtn: { padding: "9px 14px", borderRadius: "9px", border: "none", background: "var(--navy)", color: "var(--white)", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px" },
  removePhotoBtn: { padding: "9px 14px", borderRadius: "9px", border: "1px solid var(--danger-text)", background: "var(--danger-bg)", color: "var(--danger-text)", fontWeight: "800", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px" },
  fileInput: { display: "none" },
  photoSuccess: { display: "inline-block", marginTop: "10px", background: "var(--success-bg)", color: "var(--success-text)", padding: "6px 10px", borderRadius: "8px", fontSize: "0.76rem", fontWeight: "800" },
  photoError: { display: "inline-block", marginTop: "10px", background: "var(--danger-bg)", color: "var(--danger-text)", padding: "6px 10px", borderRadius: "8px", fontSize: "0.76rem", fontWeight: "800" },
  sectionTitle: { fontSize: "0.85rem", fontWeight: "800", color: "var(--navy)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginTop: "8px", textTransform: "uppercase", letterSpacing: "0.05em" },
  formItem: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  label: { fontSize: "0.75rem", color: "var(--gold)", fontWeight: "800", textTransform: "uppercase", letterSpacing: '0.05em' },
  input: { padding: "0.75rem", borderRadius: "8px", border: "1.5px solid var(--border)", fontSize: "0.95rem", width: '100%', boxSizing: 'border-box', background: 'var(--white)', fontFamily: 'var(--font-body)' }
};
