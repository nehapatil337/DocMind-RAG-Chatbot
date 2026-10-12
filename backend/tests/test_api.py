import json
import time


def test_auth_flow(client):
    r = client.post("/api/auth/register", json={"name": "A", "email": "flow@example.com", "password": "password123"})
    if r.status_code == 409:
        r = client.post("/api/auth/login", json={"email": "flow@example.com", "password": "password123"})
    assert r.status_code in (200, 201)
    token = r.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["email"] == "flow@example.com"
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "flow@example.com", "password": "wrongpass"}).status_code == 401

    # refresh rotates, old refresh token is rejected & revokes family
    old = client.cookies.get("docmind_refresh", path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 200
    client.cookies.set("docmind_refresh", old, path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 401
    client.cookies.clear()

    r = client.post("/api/auth/login", json={"email": "flow@example.com", "password": "password123"})
    assert client.post("/api/auth/logout").status_code == 204
    assert client.post("/api/auth/refresh").status_code == 401


def test_weak_password_and_duplicate(client):
    assert client.post("/api/auth/register", json={"name": "A", "email": "x@example.com", "password": "short"}).status_code == 422
    client.post("/api/auth/register", json={"name": "A", "email": "dup@example.com", "password": "password123"})
    assert client.post("/api/auth/register", json={"name": "A", "email": "dup@example.com", "password": "password123"}).status_code == 409


def _wait_ready(client, h, doc_id):
    for _ in range(50):
        d = client.get(f"/api/documents/{doc_id}", headers=h).json()
        if d["status"] != "processing":
            return d
        time.sleep(0.1)
    raise AssertionError("ingestion timeout")


def test_rag_end_to_end_and_isolation(client, auth):
    h, _ = auth
    text = ("The Apollo project launched in 1969. " * 5 + "\n\n" +
            "Quantum computers use qubits for computation. " * 5).encode()
    r = client.post("/api/documents", headers=h, files=[("files", ("notes.txt", text, "text/plain"))])
    assert r.status_code == 202
    doc = _wait_ready(client, h, r.json()[0]["id"])
    assert doc["status"] == "ready" and doc["chunk_count"] >= 1

    assert client.post("/api/documents", headers=h, files=[("files", ("x.exe", b"abc", "application/x-msdownload"))]).status_code == 415

    hits = client.get("/api/documents/search", params={"q": "qubits computation"}, headers=h).json()
    assert hits and hits[0]["filename"] == "notes.txt"

    conv = client.post("/api/conversations", headers=h, json={"document_ids": [doc["id"]]}).json()
    with client.stream("POST", f"/api/conversations/{conv['id']}/ask", headers=h,
                       json={"question": "What do quantum computers use?"}) as resp:
        body = "".join(resp.iter_text())
    assert "event: sources" in body and "event: token" in body and "event: done" in body
    detail = client.get(f"/api/conversations/{conv['id']}", headers=h).json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["sources"][0]["filename"] == "notes.txt"
    assert detail["title"].startswith("What do quantum")
    assert "Sources" in client.get(f"/api/conversations/{conv['id']}/export", headers=h).text

    # another user cannot see or touch it
    r2 = client.post("/api/auth/register", json={"name": "B", "email": "other-b@example.com", "password": "password123"})
    if r2.status_code == 409:
        r2 = client.post("/api/auth/login", json={"email": "other-b@example.com", "password": "password123"})
    h2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
    assert client.get(f"/api/documents/{doc['id']}", headers=h2).status_code == 404
    assert client.get(f"/api/conversations/{conv['id']}", headers=h2).status_code == 404
    assert client.get("/api/documents/search", params={"q": "qubits"}, headers=h2).json() == []

    assert client.delete(f"/api/documents/{doc['id']}", headers=h).status_code == 204
    assert client.get("/api/documents", headers=h).json() == []
    assert client.delete(f"/api/conversations/{conv['id']}", headers=h).status_code == 204
