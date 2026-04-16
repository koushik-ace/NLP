from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


DATA_DIR = Path(__file__).parent / "data"
CORPUS_PATH = DATA_DIR / "training_corpus.jsonl"
DEMO_PATH = DATA_DIR / "demo_documents.json"

HF_ROWS_URL = "https://datasets-server.huggingface.co/rows"
ARXIV_URL = "https://export.arxiv.org/api/query"


def fetch_json(url: str, max_retries: int = 5) -> dict:
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"Fetch failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying...")
            time.sleep(2 ** attempt)


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text


def build_hf_url(dataset: str, config: str, split: str, offset: int, length: int) -> str:
    params = urllib.parse.urlencode(
        {
            "dataset": dataset,
            "config": config,
            "split": split,
            "offset": offset,
            "length": length,
        }
    )
    return f"{HF_ROWS_URL}?{params}"


def fetch_hf_samples(dataset: str, config: str, split: str, count: int, row_to_text, source_name: str) -> list[dict]:
    records: list[dict] = []
    offset = 0

    while len(records) < count:
      batch_size = min(100, count * 2)
      payload = fetch_json(build_hf_url(dataset, config, split, offset, batch_size))
      rows = payload.get("rows", [])
      if not rows:
          break

      for wrapped in rows:
          row = wrapped["row"]
          text = clean_text(row_to_text(row))
          if len(text) < 120:
              continue
          records.append(
              {
                  "label": source_name,
                  "text": text,
                  "source": dataset,
                  "meta": {
                      "config": config,
                      "split": split,
                  },
              }
          )
          if len(records) >= count:
              break

      offset += len(rows)
      time.sleep(0.1)

    return records


def fetch_arxiv_samples(count: int, max_retries: int = 5) -> list[dict]:
    params = urllib.parse.urlencode(
        {
            "search_query": "cat:cs.AI OR cat:cs.LG OR cat:stat.ML",
            "start": 0,
            "max_results": count,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }
    )
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(f"{ARXIV_URL}?{params}", timeout=45) as response:
                payload = response.read().decode("utf-8")
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"Fetch arxiv failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying...")
            time.sleep(2 ** attempt)


    root = ET.fromstring(payload)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    records: list[dict] = []

    for entry in root.findall("atom:entry", ns):
        title = clean_text(entry.findtext("atom:title", default="", namespaces=ns))
        summary = clean_text(entry.findtext("atom:summary", default="", namespaces=ns))
        text = clean_text(f"{title}. {summary}")
        if len(text) < 120:
            continue
        records.append(
            {
                "label": "research_paper",
                "text": text,
                "source": "arxiv",
                "meta": {"title": title},
            }
        )

    return records


def build_demo_documents(records: list[dict]) -> dict:
    demos: dict[str, dict] = {}
    for label in ("legal_contract", "medical_report", "insurance_policy", "research_paper"):
        label_records = [record for record in records if record["label"] == label]
        label_records.sort(key=lambda record: len(record["text"]), reverse=True)
        chosen = label_records[:4]
        demos[label] = {
            "label": label,
            "title": f"{label.replace('_', ' ').title()} Demo Sample",
            "text": "\n\n".join(record["text"] for record in chosen),
            "sources": [record["source"] for record in chosen],
        }
    return demos


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)

    records: list[dict] = []
    records.extend(
        fetch_hf_samples(
            dataset="dvgodoy/CUAD_v1_Contract_Understanding_clause_classification",
            config="default",
            split="train",
            count=80,
            row_to_text=lambda row: row["clause"],
            source_name="legal_contract",
        )
    )
    records.extend(
        fetch_hf_samples(
            dataset="harishnair04/mtsamples",
            config="default",
            split="train",
            count=80,
            row_to_text=lambda row: row["transcription"],
            source_name="medical_report",
        )
    )
    records.extend(
        fetch_hf_samples(
            dataset="deccan-ai/insuranceQA-v2",
            config="default",
            split="train",
            count=80,
            row_to_text=lambda row: f"{row['input']} {row['output']}",
            source_name="insurance_policy",
        )
    )
    records.extend(fetch_arxiv_samples(80))

    with CORPUS_PATH.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    demo_documents = build_demo_documents(records)
    DEMO_PATH.write_text(json.dumps(demo_documents, indent=2), encoding="utf-8")

    print(f"Saved {len(records)} training rows to {CORPUS_PATH}")
    print(f"Saved demo documents to {DEMO_PATH}")


if __name__ == "__main__":
    main()
