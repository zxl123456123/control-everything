"""Local CPU English-to-Chinese translation for news reading."""
from functools import lru_cache
from pathlib import Path
from threading import RLock
import os
import re

import ctranslate2
import sentencepiece

from control_everything.paths import default_profile_dir

MODEL_ROOT = Path(os.environ.get("CONTROL_EVERYTHING_NEWS_MODEL", default_profile_dir() / "news-reader" / "translation-model" / "translate-en_zh-1_9"))
MAX_TOKENS = 160
_lock = RLock()
_translator = None
_tokenizer = None


def _load_model():
    global _translator, _tokenizer
    if _translator is None:
        if not (MODEL_ROOT / "model" / "model.bin").is_file():
            raise RuntimeError("本地翻译模型尚未下载，请先运行 tools/scripts/prepare_news_translation.py")
        tokenizer = sentencepiece.SentencePieceProcessor(
            model_file=str(MODEL_ROOT / "sentencepiece.model")
        )
        translator = ctranslate2.Translator(
            str(MODEL_ROOT / "model"), device="cpu", compute_type="int8",
            inter_threads=1, intra_threads=min(4, os.cpu_count() or 1),
        )
        _tokenizer, _translator = tokenizer, translator
    return _translator, _tokenizer


def _token_chunks(paragraph, tokenizer):
    # Sentence boundaries keep reading context; oversized sentences use every token.
    chunks = []
    for sentence in re.split(r"(?<=[.!?。！？])\s+", paragraph):
        tokens = tokenizer.encode(sentence, out_type=str)
        clauses = re.split(r"(?<=[,;:，；：])\s+", sentence) if len(tokens) > MAX_TOKENS else [sentence]
        for clause in clauses:
            tokens = tokenizer.encode(clause, out_type=str)
            while tokens:
                end = min(len(tokens), MAX_TOKENS)
                if end < len(tokens):
                    # Prefer a word boundary when a clause has no punctuation.
                    boundary = next((index for index in range(end, end // 2, -1)
                                     if tokens[index].startswith("▁")), end)
                    end = boundary
                chunks.append(tokens[:end])
                tokens = tokens[end:]
    return chunks


@lru_cache(maxsize=256)
def _translate_cached(text):
    if not text.strip():
        return text
    translator, tokenizer = _load_model()
    output = []
    for paragraph in re.split(r"(\n+)", text):
        if not paragraph.strip():
            output.append(paragraph)
            continue
        chunks = _token_chunks(paragraph, tokenizer)
        results = translator.translate_batch(
            chunks, beam_size=2, replace_unknowns=True, length_penalty=0.2,
            max_batch_size=512, batch_type="tokens", max_input_length=0,
            max_decoding_length=512, return_end_token=True,
        )
        translated = []
        for result in results:
            tokens = result.hypotheses[0]
            # Never silently accept a translation cut off by the decoder limit.
            if not tokens or tokens[-1] != "</s>":
                raise RuntimeError("这段内容超出本地模型的译文长度，请缩短段落后重试")
            translated.extend(tokens[:-1])
        # Unknown-token replacement can leave SentencePiece's space marker literal.
        output.append(tokenizer.decode(translated).replace("▁", " ").strip())
    return "".join(output)


def translate_texts(texts, source="en", target="zh"):
    """Translate ordered title/body strings without network calls or silent truncation."""
    if source != "en" or target != "zh":
        raise ValueError("本地模型当前仅支持英文翻译为简体中文")
    if not isinstance(texts, (list, tuple)) or len(texts) > 32:
        raise ValueError("每次最多翻译 32 段内容")
    if any(not isinstance(text, str) for text in texts):
        raise ValueError("翻译内容必须是文本")
    if any(len(text) > 6000 for text in texts) or sum(map(len, texts)) > 20000:
        raise ValueError("翻译内容过长，请分批翻译")
    with _lock:
        return [_translate_cached(text) for text in texts]
