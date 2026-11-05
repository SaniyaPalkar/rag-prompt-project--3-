import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Music, Trash2, UploadCloud, Loader2 } from "lucide-react";
import { getLibrary, deleteDoc, uploadFiles } from "../api";

const KIND = {
  pdf: { label: "PDF", icon: FileText },
  image: { label: "Photo", icon: ImageIcon },
  audio: { label: "Audio", icon: Music },
  text: { label: "Text", icon: FileText },
};

const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function LibraryView({ onChanged }) {
  const fileRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [lectureDate, setLectureDate] = useState("");
  const [dragging, setDragging] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDocs(await getLibrary());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    setUploading(true);
    setNotice(`Processing ${files.length} file(s). This can take a minute...`);
    try {
      const data = await uploadFiles(files, lectureDate || undefined);
      const failed = data.errors || [];
      let msg = `${data.documents?.length || 0} file(s) added.`;
      if (failed.length) msg += ` Failed: ${failed.map((e) => `${e.filename} (${e.error})`).join("; ")}`;
      const notes = (data.documents || []).filter((d) => d.warning).map((d) => `${d.filename}: ${d.warning}`);
      if (notes.length) msg += ` Note: ${notes.join(" ")}`;
      setNotice(msg);
      await refresh();
      onChanged?.();
    } catch (err) {
      setNotice("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Remove "${doc.filename}"? Its passages and graph links are deleted too.`)) return;
    try {
      await deleteDoc(doc.id);
      await refresh();
      onChanged?.();
    } catch (err) {
      setNotice("Delete failed: " + err.message);
    }
  };

  const passages = docs.reduce((sum, d) => sum + (d.chunkCount || 0), 0);

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-xl font-medium">Library</h1>
        <p className="mb-6 mt-1 text-sm text-white/50">
          {docs.length} {docs.length === 1 ? "file" : "files"}, {passages} passages indexed
        </p>

        {/* upload area */}
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!uploading) handleFiles(e.dataTransfer.files);
          }}
          className={`mb-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition ${
            dragging ? "border-violet-300 bg-violet-500/15" : "border-violet-400/40 bg-white/5 hover:bg-white/10"
          }`}
        >
          {uploading ? (
            <Loader2 size={28} className="mb-3 animate-spin text-violet-300" />
          ) : (
            <UploadCloud size={28} className="mb-3 text-violet-300" />
          )}
          <p className="text-sm">{uploading ? "Processing your files..." : "Drop files here or click to choose"}</p>
          <p className="mt-1 text-xs text-white/40">PDFs, notebook photos, audio recordings, .txt and .md</p>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.txt,.md,image/*,audio/*"
            onChange={(e) => {
              const files = [...e.target.files];
              e.target.value = "";
              handleFiles(files);
            }}
          />
        </div>

        <label className="mb-6 flex items-center gap-2 text-xs text-white/50">
          Lecture date for the next upload (optional)
          <input
            type="date"
            value={lectureDate}
            onChange={(e) => setLectureDate(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#1c1c20] px-2 py-1 text-white/80 outline-none [color-scheme:dark]"
          />
        </label>

        {notice && (
          <div className="mb-6 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-sm text-white/80">
            {notice}
          </div>
        )}

        {/* file list */}
        {loading && <p className="text-sm text-white/40">Loading...</p>}
        {error && (
          <p className="text-sm text-red-300">
            {error}. Check that the backend is running on port 5000.
          </p>
        )}
        {!loading && !error && docs.length === 0 && (
          <p className="text-sm text-white/40">Nothing here yet. Upload your first file above.</p>
        )}

        <div className="space-y-2">
          {docs.map((doc) => {
            const { label, icon: Icon } = KIND[doc.kind] || KIND.text;
            return (
              <div
                key={doc.id}
                className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-3 pr-4"
              >
                {doc.kind === "image" ? (
                  <img src={doc.fileUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                    <Icon size={20} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm hover:underline"
                    title={doc.filename}
                  >
                    {doc.filename}
                  </a>
                  <div className="mt-0.5 text-xs text-white/40">
                    {label}
                    {doc.lectureDate ? `, lecture ${doc.lectureDate}` : ""}, {doc.chunkCount} passages,{" "}
                    {doc.conceptCount} concepts, added {fmtDate(doc.uploadedAt)}
                  </div>
                  {doc.conceptCount === 0 && (
                    <div className="mt-0.5 text-xs text-amber-300/80">
                      No graph links for this file (concept extraction failed or found nothing, for example because the
                      model was unavailable). Delete the file and upload it again to rebuild them.
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(doc)}
                  title="Remove from library"
                  className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-red-300"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}