from __future__ import annotations

import io
import json
import re
import uuid
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import joblib
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pypdf import PdfReader
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import linear_kernel
from sklearn.pipeline import Pipeline


BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
CORPUS_PATH = DATA_DIR / "training_corpus.jsonl"
DEMO_PATH = DATA_DIR / "demo_documents.json"
MODEL_PATH = DATA_DIR / "domain_classifier.joblib"
INDEX_HTML = BASE_DIR / "claridocs-ai.html"
APP_JS = BASE_DIR / "claridocs-ai.js"

LABEL_META = {
    "legal_contract": {
        "display": "Legal Contract",
        "keywords": ["agreement", "termination", "liability", "indemnity", "renewal"],
    },
    "medical_report": {
        "display": "Medical Report",
        "keywords": ["patient", "diagnosis", "assessment", "medication", "follow-up"],
    },
    "insurance_policy": {
        "display": "Insurance Policy",
        "keywords": ["coverage", "deductible", "premium", "claim", "exclusion"],
    },
    "research_paper": {
        "display": "Research Paper",
        "keywords": ["study", "method", "results", "dataset", "limitations"],
    },
}

RISK_RULES = {
    "legal_contract": [
        ("high", "Termination clause needs review", r"\bterminate|termination|cancel\b", "Termination language appears in the uploaded contract and may affect notice or exit rights."),
        ("medium", "Liability language detected", r"\bliability|damages|limitation of liability\b", "Liability wording is present and should be checked for caps, carve-outs, or ambiguity."),
        ("medium", "Auto-renewal language detected", r"\bauto(?:matic)? renewal|renew(?:s|al)\b", "Renewal wording is present and can create timing or obligation risk if missed."),
        ("low", "Arbitration or governing-law clause found", r"\barbitration|governing law|jurisdiction\b", "Dispute-resolution wording was detected and may affect venue or procedure."),
    ],
    "medical_report": [
        ("high", "Elevated clinical concern detected", r"\belevated|abnormal|critical|acute\b", "The report contains language that may indicate an acute or abnormal finding."),
        ("medium", "Follow-up action required", r"\bfollow-?up|repeat|reassess|monitor\b", "The report references follow-up or monitoring steps that should not be overlooked."),
        ("medium", "Medication plan mentioned", r"\bmedication|dosage|dose|therapy\b", "Medication-related language is present and may require verification."),
        ("low", "History or symptom details present", r"\bhistory|symptom|complaint\b", "Clinical history content was detected and may warrant contextual review."),
    ],
    "insurance_policy": [
        ("high", "Coverage exclusion detected", r"\bexclude|exclusion|not covered\b", "Exclusion language appears in the document and may narrow available coverage."),
        ("high", "Waiting period or condition detected", r"\bwaiting period|subject to|condition precedent\b", "Conditions or waiting periods may affect when benefits begin."),
        ("medium", "Deductible or limit language found", r"\bdeductible|limit|sublimit|cap\b", "Financial limits are present and should be checked carefully."),
        ("low", "Claims procedure wording detected", r"\bclaim|notice of loss|proof of loss\b", "Claims-handling language is present and may impact deadlines or documentation."),
    ],
    "research_paper": [
        ("medium", "Limitations section detected", r"\blimitation|future work|out-of-domain\b", "The paper includes limitation language that may narrow how broadly the findings apply."),
        ("medium", "Small sample or benchmark focus detected", r"\bsample size|benchmark|dataset\b", "The text references datasets or benchmarks that may constrain generalization."),
        ("low", "Statistical results mentioned", r"\baccuracy|f1|precision|recall|significant\b", "Results and metrics are present and may need closer methodological review."),
        ("low", "Method section language detected", r"\bmethod|approach|architecture|experiment\b", "Methodological content was detected and may be useful for technical review."),
    ],
}

DOCUMENT_STORE: dict[str, dict] = {}
MODEL: Pipeline | None = None

app = FastAPI(title="ClariDocs AI")


class SearchRequest(BaseModel):
    document_id: str
    query: str


def read_training_corpus() -> list[dict]:
    if not CORPUS_PATH.exists():
        raise RuntimeError("Training corpus not found. Run build_training_corpus.py first.")
    return [json.loads(line) for line in CORPUS_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]


def train_or_load_model() -> Pipeline:
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)

    corpus = read_training_corpus()
    texts = [row["text"] for row in corpus]
    labels = [row["label"] for row in corpus]

    pipeline = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    stop_words="english",
                    ngram_range=(1, 2),
                    min_df=2,
                    max_features=20000,
                    sublinear_tf=True,
                ),
            ),
            ("clf", LogisticRegression(max_iter=2000)),
        ]
    )
    pipeline.fit(texts, labels)
    joblib.dump(pipeline, MODEL_PATH)
    return pipeline


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def split_sentences(text: str) -> list[str]:
    rough = re.split(r"(?<=[\.\?\!])\s+|\n+", text)
    return [normalize_text(sentence) for sentence in rough if len(normalize_text(sentence)) > 35]


def chunk_text(text: str, max_chars: int = 550) -> list[str]:
    sentences = split_sentences(text)
    if not sentences:
        return [text[:max_chars]]

    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if len(current) + len(sentence) + 1 > max_chars and current:
            chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip()

    if current:
        chunks.append(current.strip())
    return chunks


def summarize_text(text: str, limit: int = 3) -> str:
    sentences = split_sentences(text)[:40]
    if not sentences:
        return normalize_text(text)[:500]
    if len(sentences) <= limit:
        return " ".join(sentences)

    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(sentences)
    scores = matrix.sum(axis=1).A1
    top_indices = sorted(range(len(sentences)), key=lambda idx: scores[idx], reverse=True)[:limit]
    ordered = sorted(top_indices)
    return " ".join(sentences[idx] for idx in ordered)


def extract_key_points(text: str, limit: int = 5) -> list[str]:
    sentences = split_sentences(text)[:60]
    if not sentences:
        return [normalize_text(text)[:220]]

    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(sentences)
    scores = matrix.sum(axis=1).A1
    ranked = sorted(range(len(sentences)), key=lambda idx: scores[idx], reverse=True)[:limit]
    return [sentences[idx] for idx in sorted(ranked)]


def extract_keywords(text: str, predicted_label: str, limit: int = 12) -> list[str]:
    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        max_features=64,
    )
    matrix = vectorizer.fit_transform([text[:12000]])
    scores = matrix.toarray()[0]
    features = vectorizer.get_feature_names_out()
    ranked = sorted(zip(features, scores), key=lambda pair: pair[1], reverse=True)

    keywords = list(dict.fromkeys(LABEL_META[predicted_label]["keywords"]))
    for term, _ in ranked:
        cleaned = term.strip()
        if len(cleaned) < 4:
            continue
        if cleaned in ENGLISH_STOP_WORDS:
            continue
        if cleaned not in keywords:
            keywords.append(cleaned)
        if len(keywords) >= limit:
            break
    return keywords[:limit]


def detect_risks(text: str, predicted_label: str) -> tuple[list[dict], list[str], dict]:
    lowered = text.lower()
    matches: list[dict] = []
    notes: list[str] = []
    breakdown = {"high": 0, "medium": 0, "low": 0}

    for severity, title, pattern, note in RISK_RULES[predicted_label]:
        if re.search(pattern, lowered, flags=re.IGNORECASE):
            matches.append({"severity": severity, "title": title})
            notes.append(note)
            breakdown[severity] += 1

    if not matches:
        matches.append({"severity": "low", "title": "No obvious high-risk trigger words were detected"})
        notes.append("The analysis did not surface a strong rule-based warning, but the document should still be reviewed manually.")
        breakdown["low"] += 1

    return matches[:4], notes[:4], breakdown


def compute_clarity_score(text: str, key_points: list[str], risk_breakdown: dict, confidence: float) -> int:
    avg_sentence = max(1, int(sum(len(point.split()) for point in key_points) / max(1, len(key_points))))
    readability_component = max(55, 100 - min(avg_sentence, 35))
    risk_penalty = risk_breakdown["high"] * 9 + risk_breakdown["medium"] * 4
    confidence_boost = int(confidence * 12)
    return max(52, min(98, readability_component - risk_penalty + confidence_boost))


def parse_docx_bytes(payload: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        xml_payload = archive.read("word/document.xml")

    root = ET.fromstring(xml_payload)
    parts: list[str] = []
    for element in root.iter():
        if element.tag.endswith("}t") and element.text:
            parts.append(element.text)
        if element.tag.endswith("}p"):
            parts.append("\n")
    return normalize_text(" ".join(parts))


def parse_pdf_bytes(payload: bytes) -> str:
    reader = PdfReader(io.BytesIO(payload))
    parts = [page.extract_text() or "" for page in reader.pages]
    return normalize_text("\n".join(parts))


def extract_text(filename: str, payload: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return parse_pdf_bytes(payload)
    if suffix == ".docx":
        return parse_docx_bytes(payload)
    if suffix == ".txt":
        return normalize_text(payload.decode("utf-8", errors="ignore"))
    raise HTTPException(status_code=400, detail="Unsupported file type. Upload a PDF, DOCX, or TXT file.")


def predict_document_type(text: str) -> tuple[str, float, dict]:
    global MODEL
    if MODEL is None:
        MODEL = train_or_load_model()
    probabilities = MODEL.predict_proba([text])[0]
    labels = list(MODEL.classes_)
    ranked = sorted(zip(labels, probabilities), key=lambda pair: pair[1], reverse=True)
    predicted_label, score = ranked[0]
    return predicted_label, float(score), {label: float(prob) for label, prob in ranked}


def analyze_document(text: str, filename: str) -> dict:
    predicted_label, confidence, probabilities = predict_document_type(text)
    key_points = extract_key_points(text)
    risks, risk_notes, risk_breakdown = detect_risks(text, predicted_label)
    summary = summarize_text(text)
    keywords = extract_keywords(text, predicted_label)
    chunks = chunk_text(text)
    clarity_score = compute_clarity_score(text, key_points, risk_breakdown, confidence)

    document_id = str(uuid.uuid4())
    DOCUMENT_STORE[document_id] = {
        "text": text,
        "chunks": chunks,
        "filename": filename,
        "label": predicted_label,
    }

    return {
        "document_id": document_id,
        "filename": filename,
        "predicted_type": predicted_label,
        "predicted_type_label": LABEL_META[predicted_label]["display"],
        "classifier_confidence": int(round(confidence * 100)),
        "probabilities": probabilities,
        "summary": summary,
        "key_points": key_points,
        "keywords": keywords,
        "risks": risks,
        "risk_notes": risk_notes,
        "risk_breakdown": risk_breakdown,
        "clarity_score": clarity_score,
        "preview_text": text[:5000],
        "snapshot_tags": LABEL_META[predicted_label]["keywords"][:3],
        "chunk_count": len(chunks),
    }


def search_document(document_id: str, query: str) -> list[dict]:
    stored = DOCUMENT_STORE.get(document_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Document not found. Analyze a file first.")

    query = normalize_text(query)
    if not query:
        return []

    chunks = stored["chunks"]
    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(chunks + [query])
    similarities = linear_kernel(matrix[-1], matrix[:-1]).flatten()
    ranked = sorted(enumerate(similarities), key=lambda item: item[1], reverse=True)[:5]

    return [
        {
            "rank": index + 1,
            "score": round(float(score) * 100, 1),
            "snippet": chunks[idx],
        }
        for index, (idx, score) in enumerate(ranked)
        if score > 0
    ]


@app.on_event("startup")
def startup() -> None:
    global MODEL
    MODEL = train_or_load_model()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(INDEX_HTML)


@app.get("/claridocs-ai.js")
def app_js() -> FileResponse:
    return FileResponse(APP_JS, media_type="application/javascript")


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), preferred_type: str = Form("")) -> dict:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    text = extract_text(file.filename or "document", payload)
    if len(text) < 80:
        raise HTTPException(status_code=400, detail="Could not extract enough text from the uploaded file.")

    analysis = analyze_document(text, file.filename or "document")
    analysis["preferred_type"] = preferred_type
    return analysis


@app.get("/api/demo/{doc_type}")
def demo(doc_type: str) -> dict:
    if not DEMO_PATH.exists():
        raise HTTPException(status_code=500, detail="Demo dataset not found. Run build_training_corpus.py first.")

    demo_documents = json.loads(DEMO_PATH.read_text(encoding="utf-8"))
    if doc_type not in demo_documents:
        raise HTTPException(status_code=404, detail="Unknown demo document type.")

    payload = demo_documents[doc_type]
    return analyze_document(payload["text"], f"{payload['title'].replace(' ', '_')}.txt")


@app.post("/api/search")
def search(request: SearchRequest) -> dict:
    return {"results": search_document(request.document_id, request.query)}
