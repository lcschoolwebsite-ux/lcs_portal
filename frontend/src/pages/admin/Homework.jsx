import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import SectionTitle from "../../components/SectionTitle";
import Modal from "../../components/Modal";

const formatClassLabel = cls => [cls?.name, cls?.section].filter(Boolean).join(" ") || "Class";

const formatDate = value => {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

export default function AdminHomework() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editingHomework, setEditingHomework] = useState(null);
  const [editForm, setEditForm] = useState({
    classId: "",
    subjectId: "",
    title: "",
    description: "",
    file: null
  });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewHomework, setViewHomework] = useState(null);
  const [viewState, setViewState] = useState({
    loading: false,
    url: "",
    kind: "",
    fileName: "",
    error: ""
  });

  const subjectsForClass = useMemo(() => {
    if (!selectedClassId) return [];
    return subjects.filter(subject => String(subject.class?._id || subject.class || "") === String(selectedClassId));
  }, [selectedClassId, subjects]);

  const editSubjectsForClass = useMemo(() => {
    if (!editForm.classId) return [];
    return subjects.filter(subject => String(subject.class?._id || subject.class || "") === String(editForm.classId));
  }, [editForm.classId, subjects]);

  const fetchSetup = async () => {
    try {
      const [classRes, subjectRes] = await Promise.all([
        api.get("/classes"),
        api.get("/subjects")
      ]);
      const classList = classRes.data || [];
      const subjectList = subjectRes.data || [];
      setClasses(classList);
      setSubjects(subjectList);

      const nextClassId = selectedClassId || classList[0]?._id || "";
      const classSubjects = subjectList.filter(subject => String(subject.class?._id || subject.class || "") === String(nextClassId));
      setSelectedClassId(nextClassId);
      setSelectedSubjectId(prev => prev && classSubjects.some(subject => String(subject._id) === String(prev)) ? prev : "");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load homework filters.");
    }
  };

  const fetchHomework = async (classId = selectedClassId, subjectId = selectedSubjectId) => {
    if (!classId) {
      setHomework([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (subjectId) params.set("subjectId", subjectId);
      const { data } = await api.get(`/homework/class/${classId}${params.toString() ? `?${params.toString()}` : ""}`);
      setHomework(Array.isArray(data) ? data : []);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to load homework.");
      setHomework([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSetup();
  }, []);

  useEffect(() => {
    fetchHomework();
  }, [selectedClassId, selectedSubjectId]);

  const handleClassChange = value => {
    setSelectedClassId(value);
    const classSubjects = subjects.filter(subject => String(subject.class?._id || subject.class || "") === String(value));
    setSelectedSubjectId(prev => classSubjects.some(subject => String(subject._id) === String(prev)) ? prev : "");
  };

  const handleDelete = async homeworkId => {
    if (!window.confirm("Delete this homework post? This will remove the file too.")) return;
    try {
      await api.delete(`/homework/${homeworkId}`);
      await fetchHomework();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to delete homework.");
    }
  };

  const openView = item => {
    setViewHomework(item);
    setViewState({
      loading: true,
      url: "",
      kind: "",
      fileName: item.fileName || "",
      error: ""
    });
    setViewOpen(true);
  };

  useEffect(() => {
    if (!viewOpen || !viewHomework?._id) {
      setViewState({
        loading: false,
        url: "",
        kind: "",
        fileName: "",
        error: ""
      });
      return undefined;
    }

    let cancelled = false;
    let objectUrl = "";

    const loadPreview = async () => {
      try {
        const response = await api.get(`/homework/${viewHomework._id}/download`, {
          responseType: "blob"
        });
        const blobData = response.data;
        const contentType = response.headers?.["content-type"] || blobData?.type || viewHomework.fileMimeType || "";
        const blob = new Blob([blobData], { type: contentType || "application/octet-stream" });
        objectUrl = window.URL.createObjectURL(blob);

        if (!cancelled) {
          setViewState({
            loading: false,
            url: objectUrl,
            kind: String(contentType || "").startsWith("image/") ? "image" : "file",
            fileName: viewHomework.fileName || "",
            error: ""
          });
        }
      } catch (error) {
        if (!cancelled) {
          setViewState({
            loading: false,
            url: "",
            kind: "",
            fileName: viewHomework.fileName || "",
            error: error.response?.data?.message || "Unable to load homework file."
          });
        }
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [viewHomework, viewOpen]);

  const openEdit = item => {
    setEditingHomework(item);
    setEditError("");
    setEditForm({
      classId: item.classId?._id || item.classId || "",
      subjectId: item.subjectId?._id || item.subjectId || "",
      title: item.title || "",
      description: item.description || "",
      file: null
    });
    setEditOpen(true);
  };

  const handleEditClassChange = value => {
    const classSubjects = subjects.filter(subject => String(subject.class?._id || subject.class || "") === String(value));
    setEditForm(prev => ({
      ...prev,
      classId: value,
      subjectId: classSubjects.some(subject => String(subject._id) === String(prev.subjectId))
        ? prev.subjectId
        : classSubjects[0]?._id || "",
      file: prev.file
    }));
  };

  const handleUpdate = async e => {
    e.preventDefault();
    if (!editingHomework) return;
    if (!editForm.classId || !editForm.subjectId || !editForm.title.trim()) {
      setEditError("Please choose a class, subject, and title.");
      return;
    }

    setSavingEdit(true);
    setEditError("");
    try {
      const formData = new FormData();
      formData.append("classId", editForm.classId);
      formData.append("subjectId", editForm.subjectId);
      formData.append("title", editForm.title.trim());
      formData.append("description", editForm.description.trim());
      if (editForm.file) formData.append("file", editForm.file);

      await api.put(`/homework/${editingHomework._id}`, formData);
      setEditOpen(false);
      setEditingHomework(null);
      await fetchHomework();
    } catch (error) {
      setEditError(error.response?.data?.message || "Failed to update homework.");
    } finally {
      setSavingEdit(false);
    }
  };

  const visibleHomework = useMemo(() => homework, [homework]);

  return (
    <div>
      <SectionTitle title="Homework" subtitle="Review homework across classes and subjects." />

      <div style={s.filterCard}>
        <div style={s.filterRow}>
          <div style={s.field}>
            <label style={s.label}>Class</label>
            <select style={s.input} value={selectedClassId} onChange={e => handleClassChange(e.target.value)}>
              <option value="">Select Class</option>
              {classes.map(cls => (
                <option key={cls._id} value={cls._id}>{formatClassLabel(cls)}</option>
              ))}
            </select>
          </div>

          <div style={s.field}>
            <label style={s.label}>Subject</label>
            <select
              style={s.input}
              value={selectedSubjectId}
              onChange={e => setSelectedSubjectId(e.target.value)}
              disabled={!selectedClassId}
            >
              <option value="">All Subjects</option>
              {subjectsForClass.map(subject => (
                <option key={subject._id} value={subject._id}>{subject.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={s.listHeader}>
        <h3 style={s.sectionTitle}>Homework Posts</h3>
        <div style={s.countPill}>{visibleHomework.length} item{visibleHomework.length === 1 ? "" : "s"}</div>
      </div>

      <div style={s.list}>
        {loading && <div style={s.empty}>Loading homework...</div>}
        {!loading && !selectedClassId && <div style={s.empty}>Select a class to review homework.</div>}
        {!loading && selectedClassId && visibleHomework.length === 0 && <div style={s.empty}>No homework found for this filter.</div>}
        {!loading && visibleHomework.map(item => (
          <article key={item._id} style={s.card}>
            <div style={s.topRow}>
              <div>
                <h3 style={s.title}>{item.title}</h3>
                <div style={s.meta}>
                  <span>{item.subjectId?.name || "Subject"}</span>
                  <span>•</span>
                  <span>{item.classId?.name || formatClassLabel(item.classId)}</span>
                  <span>•</span>
                  <span>{formatDate(item.createdAt)}</span>
                  <span>•</span>
                  <span>{item.uploadedBy?.name || "Teacher"}</span>
                </div>
              </div>
            <div style={s.actions}>
                <button type="button" style={s.viewBtn} onClick={() => openView(item)}>View</button>
                <button type="button" style={s.editBtn} onClick={() => openEdit(item)}>Edit</button>
                <button type="button" style={s.deleteBtn} onClick={() => handleDelete(item._id)}>Delete</button>
              </div>
            </div>

            {item.description && <div style={s.description}>{item.description}</div>}
            <div style={s.footer}>
              <span>{item.fileName || "homework file"}</span>
            </div>
          </article>
        ))}
      </div>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Homework"
        subtitle="Change the homework metadata or replace the file."
        maxWidth="720px"
      >
        <form onSubmit={handleUpdate} style={s.editForm}>
          {editError && <div style={s.errorBox}>{editError}</div>}

          <div style={s.filterRow}>
            <div style={s.field}>
              <label style={s.label}>Class</label>
              <select style={s.input} value={editForm.classId} onChange={e => handleEditClassChange(e.target.value)}>
                {classes.map(cls => (
                  <option key={cls._id} value={cls._id}>{formatClassLabel(cls)}</option>
                ))}
              </select>
            </div>

            <div style={s.field}>
              <label style={s.label}>Subject</label>
              <select style={s.input} value={editForm.subjectId} onChange={e => setEditForm(prev => ({ ...prev, subjectId: e.target.value }))}>
                {editSubjectsForClass.map(subject => (
                  <option key={subject._id} value={subject._id}>{subject.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Title</label>
            <input style={s.input} value={editForm.title} onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))} />
          </div>

          <div style={s.field}>
            <label style={s.label}>Description</label>
            <textarea
              style={{ ...s.input, minHeight: "110px", resize: "vertical" }}
              value={editForm.description}
              onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Replace File</label>
            <input
              style={s.fileInput}
              type="file"
              accept="application/pdf,image/*"
              onChange={e => setEditForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
            />
            <div style={s.helperText}>
              Leave blank to keep the current file.
              {editForm.file ? ` Selected: ${editForm.file.name}` : ""}
            </div>
          </div>

          <button type="submit" style={s.submitBtn} disabled={savingEdit}>
            {savingEdit ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={viewOpen}
        onClose={() => setViewOpen(false)}
        title="View Homework"
        subtitle={viewHomework ? `${viewHomework.title || "Homework"} file preview` : "Homework file preview"}
        maxWidth="760px"
      >
        <div style={s.viewBox}>
          {viewState.loading ? (
            <div style={s.empty}>Loading homework file...</div>
          ) : viewState.error ? (
            <div style={s.errorBox}>{viewState.error}</div>
          ) : viewState.url ? (
            viewState.kind === "image" ? (
              <img src={viewState.url} alt={viewHomework?.title || "Homework preview"} style={s.previewImage} />
            ) : (
              <a href={viewState.url} target="_blank" rel="noreferrer" style={s.previewLink}>
                Open file
              </a>
            )
          ) : (
            <div style={s.empty}>No file available.</div>
          )}
        </div>
      </Modal>
    </div>
  );
}

const s = {
  filterCard: { background: "white", borderRadius: "20px", padding: "20px", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)", marginBottom: "18px" },
  filterRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
  field: { display: "flex", flexDirection: "column", gap: "8px" },
  label: { fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 900, letterSpacing: "0.08em", color: "var(--gold)" },
  input: { width: "100%", border: "1.5px solid var(--border)", borderRadius: "14px", padding: "12px 14px", background: "var(--white)", color: "var(--navy)", fontWeight: 600, boxSizing: "border-box" },
  fileInput: { width: "100%", border: "1.5px dashed var(--border)", borderRadius: "14px", padding: "12px 14px", background: "var(--light-bg)", color: "var(--navy)", fontWeight: 600, boxSizing: "border-box" },
  helperText: { fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600, lineHeight: 1.5 },
  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "14px" },
  sectionTitle: { margin: 0, fontSize: "1.1rem", fontWeight: 900, color: "var(--navy)" },
  countPill: { padding: "8px 12px", borderRadius: "999px", background: "var(--light-bg)", color: "var(--navy)", fontWeight: 800, fontSize: "0.82rem" },
  list: { display: "grid", gap: "14px" },
  empty: { padding: "28px", borderRadius: "18px", border: "1px dashed var(--border)", background: "white", color: "var(--text-muted)", textAlign: "center", fontWeight: 700 },
  card: { background: "white", borderRadius: "20px", border: "1px solid var(--border)", padding: "18px 20px", boxShadow: "var(--shadow-sm)" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" },
  title: { fontSize: "1.02rem", fontWeight: 900, color: "var(--navy)", marginBottom: "6px", marginTop: 0 },
  meta: { fontSize: "0.82rem", color: "var(--text-muted)", fontWeight: 700, display: "flex", gap: "8px", flexWrap: "wrap" },
  description: { marginTop: "12px", color: "var(--navy)", fontWeight: 600, lineHeight: 1.6, whiteSpace: "pre-wrap" },
  footer: { marginTop: "14px", fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 700 },
  actions: { display: "flex", gap: "10px", flexWrap: "wrap" },
  viewBtn: { padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--gold)", background: "white", color: "var(--gold)", fontWeight: 900, cursor: "pointer" },
  editBtn: { padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--navy)", background: "white", color: "var(--navy)", fontWeight: 900, cursor: "pointer" },
  deleteBtn: { padding: "10px 14px", borderRadius: "14px", border: "1px solid var(--danger-text)", background: "white", color: "var(--danger-text)", fontWeight: 900, cursor: "pointer" },
  errorBox: { marginBottom: "16px", padding: "14px 16px", borderRadius: "14px", background: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-text)", fontWeight: 700 },
  editForm: { display: "flex", flexDirection: "column", gap: "16px" },
  submitBtn: { padding: "14px 18px", borderRadius: "16px", border: "none", background: "var(--navy)", color: "var(--gold-light)", fontWeight: 900, cursor: "pointer", alignSelf: "flex-start" },
  viewBox: { display: "flex", flexDirection: "column", gap: "14px" },
  previewImage: { width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: "16px", border: "1px solid var(--border)", background: "var(--light-bg)" },
  previewLink: { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "14px 18px", borderRadius: "16px", background: "var(--navy)", color: "var(--gold-light)", fontWeight: 900, textDecoration: "none", width: "fit-content" }
};
