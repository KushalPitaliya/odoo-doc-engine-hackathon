console.log("📢 Dashboard Loaded");

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".docx"];
const presignUrlAPI = "https://f3zo249fq3.execute-api.us-east-1.amazonaws.com/generate-presigned-url";
const textractResultsAPI = "https://f3zo249fq3.execute-api.us-east-1.amazonaws.com/documents";
const downloadAPI = "https://f3zo249fq3.execute-api.us-east-1.amazonaws.com/download";
const deleteAPI = "https://f3zo249fq3.execute-api.us-east-1.amazonaws.com/delete";

let categoryFilter = "";

async function uploadDocument() {
  const fileInput = document.getElementById("fileInput");
  const nameInput = document.getElementById("customName");
  const status = document.getElementById("uploadStatus");

  if (!fileInput.files.length) {
    status.textContent = "⚠️ Please select a file.";
    return;
  }

  const file = fileInput.files[0];
  const extension = "." + file.name.split(".").pop().toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    status.textContent = `❌ File type ${extension} not allowed.`;
    return;
  }

  const customName = encodeURIComponent(nameInput.value.trim());

  try {
    status.textContent = "🔄 Requesting upload URL...";
    const queryParams = `?ext=${extension}&content_type=${encodeURIComponent(file.type)}${customName ? `&name=${customName}` : ''}`;
    const response = await fetch(`${presignUrlAPI}${queryParams}`);
    if (!response.ok) throw new Error("❌ Failed to get presigned URL");

    const data = await response.json();
    if (!data.upload_url) throw new Error("❌ Missing upload_url in API response");

    status.textContent = "⬆️ Uploading to S3...";
    const uploadRes = await fetch(data.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });

    if (!uploadRes.ok) throw new Error("❌ S3 upload failed");

    status.textContent = `✅ File uploaded. Processing... Please wait 15–30 seconds.`;
    fileInput.value = "";
    nameInput.value = "";
    setTimeout(() => loadDocuments(), 3000);
  } catch (err) {
    console.error("Upload error:", err);
    status.textContent = "❌ Upload failed. Check console.";
  }
}

async function loadDocuments(searchTerm = "") {
  const container = document.getElementById("documents");
  container.innerHTML = "🔄 Loading extracted data...";

  let url = textractResultsAPI;
  if (searchTerm) {
    url += `?name=${encodeURIComponent(searchTerm.toLowerCase())}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("❌ Failed to fetch document data");

    const docs = await res.json();
    if (!Array.isArray(docs) || docs.length === 0) {
      container.innerHTML = "⚠️ No documents found.";
      return;
    }

    // ✅ Debug output
    console.log("Filtering by category:", categoryFilter);
    console.log("All categories found:", docs.map(d => d.Category));

    // ✅ Filter with case-insensitive match
    const filteredDocs = docs.filter(doc => {
      return !categoryFilter || (doc.Category || "").toLowerCase() === categoryFilter.toLowerCase();
    });

    container.innerHTML = "";

    for (const doc of filteredDocs) {
      const displayName = doc.DisplayName || doc.DocumentName?.split("/").pop();
      const summary = doc.Summary || doc.ExtractedText?.split('\n').slice(0, 3).join('\n') || "No summary available.";
      const fullText = doc.ExtractedText || "No extracted text.";
      const timestamp = doc.UploadTimestamp || "N/A";
      const fileType = doc.FileType || "";
      const fileKey = doc.DocumentName;
      const category = doc.Category || "Uncategorized";

      let icon = "📄";
      if (fileType.includes("jpg") || fileType.includes("png")) icon = "🖼️";
      else if (fileType.includes("doc")) icon = "📝";

      const div = document.createElement("div");
      div.className = "document-card fade-in";
      div.innerHTML = `
        <h3>${icon} ${displayName}</h3>
        <div class="category-badge">Category: ${category}</div>
        <pre><strong>🧩 Summary:</strong>\n${summary}</pre>
        <details>
          <summary>📖 View full text & metadata</summary>
          <pre><strong>🕒 Uploaded:</strong> ${timestamp}\n\n<strong>📄 Full Text:</strong>\n${fullText}</pre>
        </details>
        <button onclick="downloadFile('${fileKey}')">📥 Download</button>
        <button onclick="deleteFile('${fileKey}', this)">🗑️ Delete</button>
      `;
      container.appendChild(div);
    }

  } catch (err) {
    console.error("Dashboard load error:", err);
    container.innerHTML = "❌ Failed to load documents.";
  }
}


function searchDocuments() {
  const input = document.getElementById("searchInput");
  const searchTerm = input.value.trim();
  loadDocuments(searchTerm);
}
function filterDocuments() {
  const select = document.getElementById("categoryFilter");
  categoryFilter = select.value;
  const searchTerm = document.getElementById("searchInput")?.value.trim() || "";
  loadDocuments(searchTerm);
}

function downloadFile(fileName) {
  const url = `${downloadAPI}?filename=${encodeURIComponent(fileName)}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      const downloadUrl = data.downloadUrl;
      window.open(downloadUrl, "_blank");
    })
    .catch(err => {
      console.error("Download error:", err);
      alert("❌ Failed to download file.");
    });
}
function showLoader(show) {
  const loader = document.getElementById("loader");
  loader.style.display = show ? "flex" : "none";
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}


function deleteFile(fileName, btn) {
  if (!fileName) {
    alert("❌ Missing filename.");
    return;
  }

  if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;

  const url = `${deleteAPI}?filename=${encodeURIComponent(fileName)}`;

  fetch(url, { method: "DELETE" })
    .then(async res => {
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Delete failed");
      }
      return res.json();
    })
    .then(data => {
      console.log("Delete success:", data);
      btn.closest(".document-card")?.remove();
      alert("🗑️ File deleted successfully.");
    })
    .catch(err => {
      console.error("Delete error:", err);
      alert("❌ Failed to delete file. Check console.");
    });
}

document.addEventListener("click", function (e) {
  if (e.target.tagName.toLowerCase() === "summary") {
    document.querySelectorAll("details").forEach((d) => {
      if (d !== e.target.parentNode) d.removeAttribute("open");
    });
  }
});

window.onload = function () {
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
  }
  loadDocuments();
};
