<div align="center">
  <h1>📄 ClariDocs AI</h1>
  <p><strong>Lightweight, fully localized intelligent document analysis and semantic search system.</strong></p>
  
  ![Python](https://img.shields.io/badge/python-3.9+-blue.svg)
  ![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi)
  ![Scikit-Learn](https://img.shields.io/badge/scikit--learn-%23F7931E.svg?style=flat&logo=scikit-learn&logoColor=white)
  ![License](https://img.shields.io/badge/license-MIT-green)
</div>

---

ClariDocs AI is designed for high-stakes domains such as law, medicine, and insurance. It automates the tedious task of reading and categorizing dense documents by extracting key summaries, performing deep semantic search, and surfacing critical domain-specific risks—all **without relying on heavy or expensive Large Language Models (LLMs)**.

## ✨ Key Features

- **🧠 Automated Classification:** Instantly classifies documents into `Legal Contract`, `Medical Report`, `Insurance Policy`, or `Research Paper`.
- **✂️ Extractive Summarization:** Uses TF-IDF mathematical scoring to pull the most important "Key Points" and generate a concise summary.
- **🚨 Domain Risk Detection:** Employs precise, rule-based heuristics to flag High, Medium, and Low severity risks (e.g., liability clauses in contracts, critical abnormal findings in medical reports).
- **🔍 Semantic Search:** Search across your document intuitively. Uses cosine similarity to find the most relevant chunks of text matching your natural language query.
- **📁 Universal Parsing:** Natively supports uploading `.TXT`, `.PDF`, and `.DOCX` documents.
- **🔒 Privacy First:** 100% local processing. Your sensitive documents never leave your internal network or device.

## 🛠️ Tech Stack

<details>
<summary>Click to view the technology stack</summary>

**Backend Processing:**
- [Python 3](https://www.python.org/)
- [FastAPI](https://fastapi.tiangolo.com/) (High-performance API framework)
- [Uvicorn](https://www.uvicorn.org/) (ASGI web server)

**Machine Learning & NLP:**
- [Scikit-Learn](https://scikit-learn.org/) (Logistic Regression & TF-IDF Vectorization)
- `joblib` (Model serialization)

**Frontend:**
- Vanilla HTML5 / CSS3 / JavaScript
- No heavy frameworks, 0 dependencies for rendering.
</details>

## 🚀 Getting Started

Follow these steps to get ClariDocs running on your local machine.

### 1. Prerequisites
Ensure you have **Python 3.9+** installed. It is highly recommended to use a virtual environment.

### 2. Install Dependencies
Install all required libraries via `pip`:
```bash
pip install fastapi uvicorn scikit-learn pypdf python-multipart pydantic joblib
```

### 3. Build the Training Dataset & Model
Before launching the server, you need to generate the machine learning model. ClariDocs uses an automated script to fetch data from Hugging Face and arXiv to train its domain classifier.
```bash
python build_training_corpus.py
```
> **Note:** This will download varied text samples and output a `domain_classifier.joblib` model inside the `data/` folder.

### 4. Start the Application
Run the FastAPI application locally.

**Windows Users:** 
If you get an error saying `uvicorn is not recognized`, use the `python -m` prefix:
```bash
python -m uvicorn app:app --reload
```
**Mac / Linux Users:**
```bash
uvicorn app:app --reload
```

### 5. Access the Interface
Open your web browser and navigate to:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

## 🔌 API Endpoints

ClariDocs is built with an API-first approach. You can build your own clients by communicating directly with the backend.

| Method | Endpoint                    | Description                                  |
|--------|-----------------------------|----------------------------------------------|
| `GET`  | `/`                         | Main ClariDocs frontend web interface        |
| `POST` | `/api/analyze`              | Upload a `.pdf`, `.docx`, or `.txt` file for analysis |
| `POST` | `/api/search`               | Perform semantic text search on a document using its ID |
| `GET`  | `/api/demo/{doc_type}`      | Fetch analysis data for sample demo documents |

## 🧪 How It Works

1. **Text Extraction:** Upon upload, PDF and DOCX files are parsed and normalized into raw, clean text strings.
2. **Classification:** A `LogisticRegression` pipeline evaluates the text's TF-IDF feature matrix to categorize it securely.
3. **Chunking & Scoring:** The document is split into 500-character semantic chunks. Each sentence is independently scored by its Term-Frequency weights, allowing the highest-ranked sentences to form the Document Summary.
4. **Risk Heuristics:** Based on the predicted document type, specifically engineered Regular Expressions isolate critical keywords to surface a Risk Report.

## 📚 Dataset Sources

The intelligence of ClariDocs is built entirely off the following real-world curated datasets:
- **Legal:** [`dvgodoy/CUAD`](https://huggingface.co/datasets/dvgodoy/CUAD_v1_Contract_Understanding_clause_classification)
- **Medical:** [`harishnair04/mtsamples`](https://huggingface.co/datasets/harishnair04/mtsamples)
- **Insurance:** [`deccan-ai/insuranceQA-v2`](https://huggingface.co/datasets/deccan-ai/insuranceQA-v2)
- **Research:** Latest papers pulled dynamically via the **[arXiv API](https://arxiv.org/help/api/)**.

---
*Developed by Koushik.*
