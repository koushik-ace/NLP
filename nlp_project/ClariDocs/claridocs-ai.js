let uploadedFile = null;
let selectedDocType = "legal_contract";
let currentReport = null;
let currentDocumentId = null;
let processingTimers = [];

const DOC_TYPE_LABELS = {
  legal_contract: "Legal Contract",
  medical_report: "Medical Report",
  insurance_policy: "Insurance Policy",
  research_paper: "Research Paper"
};

const ALLOWED_EXT = [".pdf", ".docx", ".txt"];
const MAX_SIZE_MB = 50;

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");
const analyzeBtn = document.getElementById("analyze-btn");
const uploadProgress = document.getElementById("upload-progress");
const progressFill = document.getElementById("progress-fill");
const progressPct = document.getElementById("progress-pct");
const progressStatus = document.getElementById("progress-status");
const progressSpeed = document.getElementById("progress-speed");
const uploadError = document.getElementById("upload-error");
const errorText = document.getElementById("error-text");
const sampleDemoBtn = document.getElementById("sample-demo-btn");
const sampleDemoNote = document.getElementById("sample-demo-note");
const selectedTypeHint = document.getElementById("selected-type-hint");
const docTypeButtons = Array.from(document.querySelectorAll(".doc-type-button"));
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const searchBtn = document.getElementById("search-btn");
const themeToggle = document.getElementById("theme-toggle");
const themeToggleLabel = document.getElementById("theme-toggle-label");
const themeToggleIndicator = document.getElementById("theme-toggle-indicator");

const summaryText = document.getElementById("summary-text");
const resultsFilename = document.getElementById("results-filename");
const resultsDocType = document.getElementById("results-doc-type");
const analysisTypeLabel = document.getElementById("analysis-type-label");
const clarityScoreValue = document.getElementById("clarity-score-value");
const keypointsCount = document.getElementById("keypoints-count");
const keypointsList = document.getElementById("keypoints-list");
const riskCount = document.getElementById("risk-count");
const riskLevels = document.getElementById("risk-levels");
const riskList = document.getElementById("risk-list");
const keywordsCount = document.getElementById("keywords-count");
const keywordsCloud = document.getElementById("keywords-cloud");
const previewText = document.getElementById("preview-text");
const riskDonut = document.getElementById("risk-donut");
const riskTotalCount = document.getElementById("risk-total-count");
const riskLegendHigh = document.getElementById("risk-legend-high");
const riskLegendMedium = document.getElementById("risk-legend-medium");
const riskLegendLow = document.getElementById("risk-legend-low");
const confidenceMeterValue = document.getElementById("confidence-meter-value");
const confidenceMeterFill = document.getElementById("confidence-meter-fill");
const confidenceNote = document.getElementById("confidence-note");
const snapshotTags = document.getElementById("snapshot-tags");

const navLinks = document.getElementById("nav-links");
document.getElementById("hamburger").addEventListener("click", () => {
  navLinks.classList.toggle("open");
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => navLinks.classList.remove("open"));
});

window.addEventListener("scroll", () => {
  const nav = document.getElementById("navbar");
  nav.style.boxShadow = window.scrollY > 30 ? "0 2px 24px rgba(14,15,26,.12)" : "";
  document.getElementById("scroll-top-btn").classList.toggle("visible", window.scrollY > 400);
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".fade-in-up").forEach((element) => observer.observe(element));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showToast(message, icon = "AI") {
  const toast = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = message;
  document.getElementById("toast-icon").textContent = icon;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function showError(message) {
  errorText.textContent = message;
  uploadError.style.display = "flex";
  window.setTimeout(() => {
    uploadError.style.display = "none";
  }, 4500);
}

function scrollToUpload() {
  document.getElementById("upload-section").scrollIntoView({ behavior: "smooth" });
}

function setAnalyzeReady(isReady) {
  analyzeBtn.disabled = !isReady;
  analyzeBtn.style.opacity = isReady ? "1" : ".5";
  analyzeBtn.style.cursor = isReady ? "pointer" : "not-allowed";
}

function setTheme(theme) {
  if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
    themeToggleLabel.textContent = "Light Mode";
    themeToggleIndicator.textContent = "L";
  } else {
    document.body.removeAttribute("data-theme");
    themeToggleLabel.textContent = "Dark Mode";
    themeToggleIndicator.textContent = "D";
  }
  localStorage.setItem("claridocs-theme", theme);
}

function setDocumentType(type) {
  selectedDocType = type;
  docTypeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.docType === type);
  });
  selectedTypeHint.textContent = `Results adapt to ${DOC_TYPE_LABELS[type]}`;
  sampleDemoNote.textContent = `Loads a real ${DOC_TYPE_LABELS[type]} sample and starts analysis instantly.`;
}

function updateUploadCard(filename, sizeBytes) {
  const ext = filename.split(".").pop().toLowerCase();
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
  document.getElementById("file-name").textContent = filename;
  document.getElementById("file-size").textContent = `${sizeMB} MB`;
  document.getElementById("file-icon").textContent = ext === "pdf" ? "PDF" : ext === "docx" ? "DOC" : "TXT";
  uploadProgress.style.display = "block";
}

function simulateUpload(onComplete) {
  let percent = 0;
  const speeds = ["2.1 MB/s", "3.4 MB/s", "4.2 MB/s", "5.0 MB/s", "4.8 MB/s"];
  let speedIndex = 0;

  progressStatus.textContent = "Uploading...";
  progressFill.style.width = "0%";
  progressPct.textContent = "0%";

  const interval = window.setInterval(() => {
    percent += Math.random() * 14 + 4;
    if (percent >= 100) {
      percent = 100;
      window.clearInterval(interval);
      onComplete();
    }

    progressFill.style.width = `${percent}%`;
    progressPct.textContent = `${Math.round(percent)}%`;
    progressSpeed.textContent = speeds[speedIndex % speeds.length];
    speedIndex += 1;
  }, 160);
}

function fillDemoUploadState(filename) {
  updateUploadCard(filename, 1024 * 1024 * 1.8);
  progressFill.style.width = "100%";
  progressPct.textContent = "100%";
  progressStatus.textContent = "Demo loaded";
  progressSpeed.textContent = "Instant launch";
  setAnalyzeReady(true);
}

function resetProcessingSteps() {
  const icons = ["UP", "AI", "!", "TXT", "OK"];
  for (let index = 1; index <= 5; index += 1) {
    const step = document.getElementById(`step-${index}`);
    step.classList.remove("active", "done");
    step.querySelector(".step-icon").textContent = icons[index - 1];
  }
  document.getElementById("processing-msg").textContent = "Our AI is carefully reading your document.";
}

function clearProcessingTimers() {
  processingTimers.forEach((timer) => window.clearTimeout(timer));
  processingTimers = [];
}

function animateProcessing(docTypeLabel, demoMode) {
  clearProcessingTimers();
  resetProcessingSteps();

  const messages = [
    "Extracting document text and metadata...",
    `Classifying ${docTypeLabel.toLowerCase()} structure...`,
    "Scanning for risks, anomalies, and notable signals...",
    "Generating summary, keywords, and key points...",
    "Preparing search index and presentation-ready results..."
  ];

  const delays = demoMode ? [200, 900, 1550, 2200, 2850] : [600, 1400, 2300, 3300, 4100];
  const completions = demoMode ? [700, 1350, 2050, 2700, 3400] : [1200, 2100, 3100, 4000, 5000];

  const activate = (index) => {
    const step = document.getElementById(`step-${index}`);
    step.classList.add("active");
    document.getElementById("processing-msg").textContent = messages[index - 1];
  };

  const complete = (index) => {
    const step = document.getElementById(`step-${index}`);
    step.classList.remove("active");
    step.classList.add("done");
    step.querySelector(".step-icon").textContent = "OK";
  };

  [1, 2, 3, 4, 5].forEach((step) => {
    processingTimers.push(window.setTimeout(() => activate(step), delays[step - 1]));
    processingTimers.push(window.setTimeout(() => complete(step), completions[step - 1]));
  });

  return demoMode ? 3900 : 5600;
}

function buildRiskDonut(breakdown) {
  const total = breakdown.high + breakdown.medium + breakdown.low || 1;
  const highStop = (breakdown.high / total) * 100;
  const mediumStop = highStop + (breakdown.medium / total) * 100;

  riskDonut.style.background = `conic-gradient(#f43f6e 0 ${highStop}%, #f59e0b ${highStop}% ${mediumStop}%, #10b981 ${mediumStop}% 100%)`;
  riskTotalCount.textContent = total;
  riskLegendHigh.textContent = breakdown.high;
  riskLegendMedium.textContent = breakdown.medium;
  riskLegendLow.textContent = breakdown.low;
  riskCount.textContent = pluralize(total, "flag");
}

function renderList(container, items) {
  container.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderTags(container, items) {
  const classes = ["tag-blue", "tag-violet", "tag-teal", "tag-rose", "tag-amber"];
  container.innerHTML = items.map((item, index) => (
    `<span class="tag ${classes[index % classes.length]}">${escapeHtml(item)}</span>`
  )).join("");
}

function renderRiskLevels(items) {
  const severityClass = { high: "risk-high", medium: "risk-medium", low: "risk-low" };
  const severityLabel = { high: "HIGH", medium: "MEDIUM", low: "LOW" };
  riskLevels.innerHTML = items.map((item) => (
    `<div class="risk-level ${severityClass[item.severity]}">${severityLabel[item.severity]} - ${escapeHtml(item.title)}</div>`
  )).join("");
}

function animateConfidence(target) {
  confidenceMeterFill.style.width = "0%";
  confidenceMeterValue.textContent = "0%";
  window.requestAnimationFrame(() => {
    confidenceMeterFill.style.width = `${target}%`;
  });

  const start = performance.now();
  const duration = 1200;

  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    confidenceMeterValue.textContent = `${Math.round(target * progress)}%`;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
}

function renderSearchResults(results) {
  if (!results || results.length === 0) {
    searchResults.innerHTML = '<div class="search-empty">No relevant passage matched that query. Try a different phrase from the document.</div>';
    return;
  }

  searchResults.innerHTML = results.map((result) => `
    <div class="search-result-item">
      <div class="search-result-head">
        <span>Match ${result.rank}</span>
        <span>${result.score}% relevance</span>
      </div>
      <div class="search-result-body">${escapeHtml(result.snippet)}</div>
    </div>
  `).join("");
}

function renderAnalysis(report) {
  currentReport = report;
  currentDocumentId = report.document_id;

  summaryText.textContent = report.summary;
  resultsDocType.textContent = report.predicted_type_label;
  analysisTypeLabel.textContent = report.predicted_type_label;
  clarityScoreValue.textContent = `${report.clarity_score}%`;
  keypointsCount.textContent = pluralize(report.key_points.length, "point");
  keywordsCount.textContent = pluralize(report.keywords.length, "term");
  confidenceNote.textContent = `Classifier confidence is ${report.classifier_confidence}% for ${report.predicted_type_label}. Search is now available across ${report.chunk_count} indexed sections.`;
  previewText.textContent = report.preview_text;

  resultsFilename.innerHTML = `Document: ${escapeHtml(report.filename)} &nbsp;·&nbsp; ${escapeHtml(report.predicted_type_label)} &nbsp;·&nbsp; <span style="color:#16a34a">Real Analysis Complete</span>`;

  renderList(keypointsList, report.key_points);
  renderList(riskList, report.risk_notes);
  renderTags(keywordsCloud, report.keywords);
  renderTags(snapshotTags, report.snapshot_tags);
  renderRiskLevels(report.risks);
  buildRiskDonut(report.risk_breakdown);
  renderSearchResults([]);
  animateConfidence(report.classifier_confidence);

  searchInput.value = "";
  searchResults.innerHTML = '<div class="search-empty">Ask about the analyzed document and the backend will return the closest matching excerpts.</div>';
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Request failed.");
  }
  return payload;
}

async function beginAnalysis(requestPromiseFactory, options = {}) {
  const processingSection = document.getElementById("processing-section");
  const resultsSection = document.getElementById("results-section");
  document.getElementById("upload-section").style.display = "none";
  resultsSection.classList.remove("active");
  processingSection.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });

  const animationMs = animateProcessing(DOC_TYPE_LABELS[selectedDocType], !!options.demoMode);

  try {
    const [report] = await Promise.all([requestPromiseFactory(), wait(animationMs)]);
    processingSection.classList.remove("active");
    renderAnalysis(report);
    resultsSection.classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.querySelectorAll("#results-section .fade-in-up").forEach((element) => element.classList.add("visible"));
    showToast("Real analysis complete. Results are ready.", "AI");
  } catch (error) {
    processingSection.classList.remove("active");
    document.getElementById("upload-section").style.display = "block";
    showError(error.message || "Analysis failed.");
  }
}

async function analyzeUploadedFile() {
  if (!uploadedFile) {
    showError("Choose a file first or run a sample demo.");
    return;
  }

  await beginAnalysis(async () => {
    const formData = new FormData();
    formData.append("file", uploadedFile);
    formData.append("preferred_type", selectedDocType);
    const response = await fetch("/api/analyze", { method: "POST", body: formData });
    return parseResponse(response);
  });
}

async function runSampleDemo() {
  fillDemoUploadState(`${DOC_TYPE_LABELS[selectedDocType].replace(/\s+/g, "_")}_demo.txt`);
  showToast(`Launching ${DOC_TYPE_LABELS[selectedDocType]} demo.`, "GO");

  await beginAnalysis(async () => {
    const response = await fetch(`/api/demo/${selectedDocType}`);
    return parseResponse(response);
  }, { demoMode: true });
}

async function searchDocument(event) {
  event.preventDefault();
  if (!currentDocumentId) {
    showError("Analyze a document first, then search it.");
    return;
  }

  const query = searchInput.value.trim();
  if (!query) {
    showError("Enter something to search for.");
    return;
  }

  searchBtn.disabled = true;
  searchBtn.style.opacity = ".7";

  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: currentDocumentId, query })
    });
    const payload = await parseResponse(response);
    renderSearchResults(payload.results);
  } catch (error) {
    showError(error.message || "Search failed.");
  } finally {
    searchBtn.disabled = false;
    searchBtn.style.opacity = "1";
  }
}

function exportCurrentReport() {
  if (!currentReport) {
    showError("No report available yet.");
    return;
  }

  const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${currentReport.filename.replace(/\.[^.]+$/, "")}-report.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("Report exported.", "OK");
}

function copyPreviewText() {
  const text = previewText.innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Extracted text copied to clipboard.", "OK");
  }).catch(() => {
    showToast("Copy failed. Please select the text manually.", "!");
  });
}

function resetApp() {
  clearProcessingTimers();
  currentReport = null;
  currentDocumentId = null;
  uploadedFile = null;
  fileInput.value = "";
  uploadProgress.style.display = "none";
  progressFill.style.width = "0%";
  progressPct.textContent = "0%";
  progressStatus.textContent = "Uploading...";
  progressSpeed.textContent = "-";
  uploadError.style.display = "none";
  document.getElementById("processing-section").classList.remove("active");
  document.getElementById("results-section").classList.remove("active");
  document.getElementById("upload-section").style.display = "block";
  setAnalyzeReady(false);
  resetProcessingSteps();
  renderSearchResults([]);
  setTimeout(scrollToUpload, 100);
}

function validateFile(file) {
  const ext = `.${file.name.split(".").pop().toLowerCase()}`;
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error(`Unsupported file type "${ext}". Upload a PDF, DOCX, or TXT file.`);
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`);
  }
}

function handleFile(file) {
  uploadError.style.display = "none";
  try {
    validateFile(file);
  } catch (error) {
    showError(error.message);
    return;
  }

  uploadedFile = file;
  updateUploadCard(file.name, file.size);
  simulateUpload(() => {
    setAnalyzeReady(true);
    progressStatus.textContent = "Ready to analyze";
    progressSpeed.textContent = "";
    showToast("File uploaded. Click Analyze to run the model.", "OK");
  });
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("drag-over");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag-over");
  if (event.dataTransfer.files[0]) {
    handleFile(event.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) {
    handleFile(fileInput.files[0]);
  }
});

browseBtn.addEventListener("click", () => fileInput.click());
analyzeBtn.addEventListener("click", analyzeUploadedFile);
sampleDemoBtn.addEventListener("click", runSampleDemo);
searchForm.addEventListener("submit", searchDocument);

docTypeButtons.forEach((button) => {
  button.addEventListener("click", () => setDocumentType(button.dataset.docType));
});

themeToggle.addEventListener("click", () => {
  const isDark = document.body.getAttribute("data-theme") === "dark";
  setTheme(isDark ? "light" : "dark");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    resetApp();
  }
});

setTheme(localStorage.getItem("claridocs-theme") === "dark" ? "dark" : "light");
setAnalyzeReady(false);
setDocumentType(selectedDocType);
resetProcessingSteps();

window.scrollToUpload = scrollToUpload;
window.showToast = showToast;
window.copyPreviewText = copyPreviewText;
window.resetApp = resetApp;
window.exportCurrentReport = exportCurrentReport;
