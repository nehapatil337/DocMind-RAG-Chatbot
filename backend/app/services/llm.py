import json
import logging
from collections.abc import Iterator

import httpx

from ..config import get_settings

log = logging.getLogger("docmind.llm")
s = get_settings()

SYSTEM_PROMPT = (
    "You are DocMind, a precise assistant that answers questions strictly from the user's "
    "documents. Use ONLY the provided context excerpts. Cite the excerpts you use inline like "
    "[1], [2] (ASCII square brackets only) (matching the numbers in the context). If the answer is not in the context, say "
    "you could not find it in the documents instead of guessing. Be concise, use Markdown "
    "(lists, tables, code blocks) when helpful."
)


class LLMError(RuntimeError):
    pass


def build_messages(question: str, hits: list[dict], history: list[dict]) -> list[dict]:
    if hits:
        ctx = "\n\n".join(
            f"[{i}] (source: {h['filename']}, page {h['page']})\n{h['content']}"
            for i, h in enumerate(hits, 1)
        )
    else:
        ctx = "(no relevant excerpts were found)"
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    msgs += history[-8:]
    msgs.append({"role": "user", "content": f"Context:\n{ctx}\n\nQuestion: {question}"})
    return msgs


def stream_chat(messages: list[dict], model: str | None, temperature: float) -> Iterator[tuple[str, str]]:
    """Yield (model_used, token). Falls through the configured model list on failure."""
    if not s.llm_api_key:
        raise LLMError("No LLM API key configured (set OPENROUTER_API_KEY).")
    candidates = ([model] if model else []) + [m for m in s.model_list if m != model]
    last_err = "no models configured"
    headers = {
        "Authorization": f"Bearer {s.llm_api_key}",
        "Content-Type": "application/json",
        "X-Title": s.app_name,
    }
    for m in candidates:
        got_any = False
        try:
            with httpx.Client(timeout=httpx.Timeout(90, connect=15)) as client:
                with client.stream(
                    "POST",
                    f"{s.llm_base_url}/chat/completions",
                    headers=headers,
                    json={"model": m, "messages": messages, "stream": True, "temperature": temperature},
                ) as r:
                    if r.status_code != 200:
                        last_err = f"{m}: HTTP {r.status_code} {r.read()[:200]!r}"
                        log.warning("llm fallback: %s", last_err)
                        continue
                    for line in r.iter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            ev = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        if ev.get("error"):
                            last_err = f"{m}: {ev['error']}"
                            break
                        delta = (ev.get("choices") or [{}])[0].get("delta", {})
                        tok = delta.get("content")
                        if tok:
                            got_any = True
                            yield m, tok
            if got_any:
                return
        except httpx.HTTPError as e:
            last_err = f"{m}: {e}"
            if got_any:
                return
            log.warning("llm fallback: %s", last_err)
    raise LLMError(f"All models failed. Last error: {last_err}")
