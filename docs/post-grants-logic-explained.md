## 📬 POST `/api/grants` — How It Works Step by Step

---

### The Flow: Controller → Service → Repository → Database

---

### Step 0️⃣ — Request Arrives

FastAPI (Python scraper) sends a POST request:

```
POST http://localhost:8080/api/grants
Content-Type: application/json

{
  "grantTitle": "NSF AI Research Initiative 2026",
  "grantUrl": "https://www.nsf.gov/grants/ai-research-2026",
  "checksum": "abc123def456",
  ...other fields...
}
```

---

### Step 1️⃣ — Controller Receives It

```java
@PostMapping
public ResponseEntity<GrantResponse> createGrant(@RequestBody GrantRequest request) {
    GrantResponse response = grantService.saveOrUpdateGrant(request);
    return new ResponseEntity<>(response, HttpStatus.CREATED);
}
```

- `@RequestBody` converts JSON → `GrantRequest` Java object
- Calls `grantService.saveOrUpdateGrant(request)`
- Returns `201 CREATED` with the response

---

### Step 2️⃣ — Service: Check if grantUrl already exists

```java
Optional<Grant> existingOpt = grantRepository.findByGrantUrl(request.getGrantUrl());
```

This runs a SQL query like:
```sql
SELECT * FROM grants WHERE grant_url = 'https://www.nsf.gov/grants/ai-research-2026';
```

---

### Step 3️⃣ — Decision: 3 possible outcomes

#### 🟢 Case A: Grant URL does NOT exist → **SAVE as new**

```java
if (existingOpt.isEmpty()) {
    Grant grant = mapToEntity(request);
    Grant saved = grantRepository.save(grant);
    return mapToResponse(saved);
}
```

**What happens:** A brand new row is inserted in the `grants` table.

```
First time scraping this URL → SAVE IT
```

---

#### 🟡 Case B: Grant URL EXISTS + **same checksum** → **DO NOTHING**

```java
if (existing.getChecksum().equals(request.getChecksum())) {
    return mapToResponse(existing);
}
```

**What happens:** Nothing changes in the database. The grant page hasn't changed since last scrape.

```
Same URL + Same Checksum = Page not changed → SKIP
```

---

#### 🔴 Case C: Grant URL EXISTS + **different checksum** → **UPDATE**

```java
updateEntity(existing, request);
existing.setChecksum(request.getChecksum());
existing.setLastScrapedAt(LocalDateTime.now());
Grant updated = grantRepository.save(existing);
return mapToResponse(updated);
```

**What happens:** The existing row is updated with new data because the grant page content has changed.

```
Same URL + Different Checksum = Page changed → UPDATE IT
```

---

### 🔁 Visual Summary

```
POST /api/grants (JSON from FastAPI)
        │
        ▼
   Controller receives request
        │
        ▼
   Service: findByGrantUrl(grantUrl)
        │
        ├── NOT FOUND ──────────► SAVE new grant ──► Return 201
        │
        └── FOUND
              │
              ├── Same Checksum ──► DO NOTHING ──► Return existing data
              │
              └── Different Checksum ──► UPDATE grant ──► Return updated data
```

---

### 🤔 What is "checksum"?

- The **FastAPI Python scraper** scrapes a grant webpage
- It generates a **hash (checksum)** of the page content (like MD5/SHA256)
- This checksum is a fingerprint of the page
- **Same checksum** = page content hasn't changed since last scrape
- **Different checksum** = page content has been modified → need to update our database

**Example:**
| Scrape | Page Content | Checksum | Action |
|--------|-------------|----------|--------|
| 1st time | "Deadline: Sept 2026, Amount: $500K" | `abc123` | **SAVE** (new) |
| 2nd time | "Deadline: Sept 2026, Amount: $500K" | `abc123` | **SKIP** (same) |
| 3rd time | "Deadline: Dec 2026, Amount: $750K" | `xyz789` | **UPDATE** (changed) |

---

### 💡 Why this logic?

The scraper may run **daily or hourly**. Without checksum comparison:
- It would **update the database every time** even if nothing changed
- That's wasteful and unnecessary

With checksum:
- It **only updates when the actual grant page content has changed**
- Saves database writes and keeps `updatedAt` meaningful

