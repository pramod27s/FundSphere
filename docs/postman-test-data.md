## 📬 Postman Test Data for FundSphere APIs

---

### 🔬 RESEARCHER API — `POST http://localhost:8080/api/researchers`

**Headers:** `Content-Type: application/json`

#### Sample 1 — AI Researcher
```json
{
  "userType": "RESEARCHER",
  "institutionName": "Indian Institute of Technology Madras",
  "department": "Computer Science and Engineering",
  "position": "PROFESSOR",
  "primaryField": "ARTIFICIAL_INTELLIGENCE",
  "keywords": ["deep learning", "NLP", "transformer models", "LLM"],
  "country": "India",
  "state": "Tamil Nadu",
  "city": "Chennai",
  "minFundingAmount": 50000,
  "maxFundingAmount": 500000,
  "preferredGrantType": "RESEARCH_GRANT",
  "yearsOfExperience": 12,
  "educationLevel": "PHD",
  "previousGrantsReceived": true,
  "emailNotifications": true,
  "deadlineReminders": true,
  "weeklyGrantRecommendations": true
}
```

#### Sample 2 — Healthcare Student
```json
{
  "userType": "STUDENT",
  "institutionName": "Stanford University",
  "department": "Biomedical Informatics",
  "position": "STUDENT",
  "primaryField": "HEALTHCARE",
  "keywords": ["clinical trials", "drug discovery", "medical imaging"],
  "country": "United States",
  "state": "California",
  "city": "Stanford",
  "minFundingAmount": 10000,
  "maxFundingAmount": 100000,
  "preferredGrantType": "FELLOWSHIP",
  "yearsOfExperience": 2,
  "educationLevel": "MASTERS",
  "previousGrantsReceived": false,
  "emailNotifications": true,
  "deadlineReminders": false,
  "weeklyGrantRecommendations": true
}
```

#### Sample 3 — NGO Environment
```json
{
  "userType": "NONPROFIT_ORGANIZATION",
  "institutionName": "Green Earth Foundation",
  "department": "Environmental Policy",
  "position": "NGO_MEMBER",
  "primaryField": "ENVIRONMENT",
  "keywords": ["climate change", "renewable energy", "carbon footprint", "sustainability"],
  "country": "Germany",
  "state": "Bavaria",
  "city": "Munich",
  "minFundingAmount": 20000,
  "maxFundingAmount": 300000,
  "preferredGrantType": "NGO_FUNDING",
  "yearsOfExperience": 8,
  "educationLevel": "MASTERS",
  "previousGrantsReceived": true,
  "emailNotifications": true,
  "deadlineReminders": true,
  "weeklyGrantRecommendations": false
}
```

#### Sample 4 — Startup Founder
```json
{
  "userType": "STARTUP_COMPANY",
  "institutionName": "AgriTech Solutions Pvt Ltd",
  "department": "Research & Development",
  "position": "FOUNDER",
  "primaryField": "AGRICULTURE",
  "keywords": ["precision farming", "IoT sensors", "crop yield prediction"],
  "country": "India",
  "state": "Karnataka",
  "city": "Bangalore",
  "minFundingAmount": 100000,
  "maxFundingAmount": 1000000,
  "preferredGrantType": "STARTUP_FUNDING",
  "yearsOfExperience": 5,
  "educationLevel": "MASTERS",
  "previousGrantsReceived": false,
  "emailNotifications": true,
  "deadlineReminders": true,
  "weeklyGrantRecommendations": true
}
```

---

### 🔄 RESEARCHER API — `PUT http://localhost:8080/api/researchers/1`

```json
{
  "userType": "RESEARCHER",
  "institutionName": "Indian Institute of Technology Bombay",
  "department": "Electrical Engineering",
  "position": "PROFESSOR",
  "primaryField": "ROBOTICS",
  "keywords": ["autonomous drones", "reinforcement learning", "computer vision"],
  "country": "India",
  "state": "Maharashtra",
  "city": "Mumbai",
  "minFundingAmount": 75000,
  "maxFundingAmount": 600000,
  "preferredGrantType": "RESEARCH_GRANT",
  "yearsOfExperience": 15,
  "educationLevel": "PHD",
  "previousGrantsReceived": true,
  "emailNotifications": true,
  "deadlineReminders": true,
  "weeklyGrantRecommendations": false
}
```

---

### 🔍 RESEARCHER FILTER APIs (GET — no body needed)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `http://localhost:8080/api/researchers` | Get all researchers |
| GET | `http://localhost:8080/api/researchers/1` | Get researcher by ID |
| GET | `http://localhost:8080/api/researchers/filter/user-type/RESEARCHER` | Filter by user type |
| GET | `http://localhost:8080/api/researchers/filter/user-type/STUDENT` | Filter by STUDENT |
| GET | `http://localhost:8080/api/researchers/filter/primary-field/ARTIFICIAL_INTELLIGENCE` | Filter by field |
| GET | `http://localhost:8080/api/researchers/filter/country/India` | Filter by country |
| DELETE | `http://localhost:8080/api/researchers/1` | Delete researcher by ID |

---

---

### 💰 GRANT API — `POST http://localhost:8080/api/grants`

**Headers:** `Content-Type: application/json`

#### Sample 1 — NSF AI Research Grant
```json
{
  "grantTitle": "NSF AI Research Initiative 2026",
  "fundingAgency": "National Science Foundation",
  "programName": "Artificial Intelligence for Society",
  "description": "This grant supports research in foundational AI methods including machine learning, natural language processing, and computer vision with societal impact.",
  "grantUrl": "https://www.nsf.gov/grants/ai-research-2026",
  "applicationDeadline": "2026-09-15T23:59:00",
  "fundingAmountMin": 100000,
  "fundingAmountMax": 500000,
  "fundingCurrency": "USD",
  "eligibleCountries": "United States",
  "eligibleApplicants": "Universities, Research Institutions",
  "institutionType": "Academic",
  "field": "Artificial Intelligence",
  "applicationLink": "https://www.nsf.gov/apply/ai-2026",
  "checksum": "abc123def456ghi789",
  "tags": ["AI", "machine learning", "NLP", "NSF", "research"]
}
```

#### Sample 2 — EU Green Energy Grant
```json
{
  "grantTitle": "Horizon Europe - Green Energy Transition",
  "fundingAgency": "European Commission",
  "programName": "Horizon Europe Cluster 5",
  "description": "Funding for innovative research in renewable energy sources, energy storage, and sustainable power grids across EU member states.",
  "grantUrl": "https://ec.europa.eu/horizon/green-energy-2026",
  "applicationDeadline": "2026-12-01T17:00:00",
  "fundingAmountMin": 200000,
  "fundingAmountMax": 2000000,
  "fundingCurrency": "EUR",
  "eligibleCountries": "EU Member States",
  "eligibleApplicants": "Universities, SMEs, Research Centers",
  "institutionType": "Academic, Industry",
  "field": "Environment",
  "applicationLink": "https://ec.europa.eu/apply/green-energy",
  "checksum": "eu2026greenenergy001hash",
  "tags": ["green energy", "renewable", "EU", "Horizon Europe", "sustainability"]
}
```

#### Sample 3 — WHO Healthcare Grant
```json
{
  "grantTitle": "WHO Global Health Research Fund 2026",
  "fundingAgency": "World Health Organization",
  "programName": "Global Disease Prevention Research",
  "description": "Supports research on infectious disease prevention, vaccine development, and public health infrastructure in low and middle-income countries.",
  "grantUrl": "https://www.who.int/grants/health-research-2026",
  "applicationDeadline": "2026-07-31T23:59:00",
  "fundingAmountMin": 50000,
  "fundingAmountMax": 750000,
  "fundingCurrency": "USD",
  "eligibleCountries": "Global",
  "eligibleApplicants": "Research Institutions, NGOs, Universities",
  "institutionType": "Academic, Non-Profit",
  "field": "Healthcare",
  "applicationLink": "https://www.who.int/apply/health-2026",
  "checksum": "who2026healthresearchhash",
  "tags": ["healthcare", "WHO", "vaccine", "public health", "global"]
}
```

#### Sample 4 — Indian Agri-Tech Grant
```json
{
  "grantTitle": "ICAR Smart Agriculture Innovation Grant",
  "fundingAgency": "Indian Council of Agricultural Research",
  "programName": "Digital Agriculture Programme",
  "description": "Funding for startups and research institutions developing IoT-based precision farming, drone-based crop monitoring, and AI-powered yield prediction systems.",
  "grantUrl": "https://icar.gov.in/grants/smart-agriculture-2026",
  "applicationDeadline": "2026-11-30T18:00:00",
  "fundingAmountMin": 500000,
  "fundingAmountMax": 5000000,
  "fundingCurrency": "INR",
  "eligibleCountries": "India",
  "eligibleApplicants": "Startups, Agricultural Universities, Research Labs",
  "institutionType": "Academic, Startup",
  "field": "Agriculture",
  "applicationLink": "https://icar.gov.in/apply/smart-agri-2026",
  "checksum": "icar2026smartagrihash123",
  "tags": ["agriculture", "IoT", "precision farming", "India", "ICAR", "startup"]
}
```

---

### 🔄 GRANT API — `PUT http://localhost:8080/api/grants/1`

```json
{
  "grantTitle": "NSF AI Research Initiative 2026 - Extended",
  "fundingAgency": "National Science Foundation",
  "programName": "AI for Society - Phase 2",
  "description": "Extended funding round for AI research focusing on large language models, explainable AI, and AI safety.",
  "grantUrl": "https://www.nsf.gov/grants/ai-research-2026",
  "applicationDeadline": "2026-11-30T23:59:00",
  "fundingAmountMin": 150000,
  "fundingAmountMax": 750000,
  "fundingCurrency": "USD",
  "eligibleCountries": "United States",
  "eligibleApplicants": "Universities, Research Institutions, National Labs",
  "institutionType": "Academic",
  "field": "Artificial Intelligence",
  "applicationLink": "https://www.nsf.gov/apply/ai-2026-phase2",
  "checksum": "updatedchecksum999xyz",
  "tags": ["AI", "LLM", "explainable AI", "AI safety", "NSF"]
}
```

---

### 🔍 GRANT APIs (GET/DELETE — no body needed)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `http://localhost:8080/api/grants` | Get all grants |
| GET | `http://localhost:8080/api/grants/1` | Get grant by ID |
| GET | `http://localhost:8080/api/grants/search?grantUrl=https://www.nsf.gov/grants/ai-research-2026` | Search grant by URL |
| DELETE | `http://localhost:8080/api/grants/1` | Delete grant by ID |

---

### 🧪 Checksum Test Scenario (POST twice to test save-or-update logic)

**Step 1 — POST with original checksum** → Should create new record
```json
{
  "grantTitle": "Test Checksum Grant",
  "fundingAgency": "Test Agency",
  "programName": "Test Program",
  "description": "Testing checksum logic",
  "grantUrl": "https://example.com/test-grant",
  "applicationDeadline": "2026-12-31T23:59:00",
  "fundingAmountMin": 1000,
  "fundingAmountMax": 5000,
  "fundingCurrency": "USD",
  "eligibleCountries": "Global",
  "eligibleApplicants": "Anyone",
  "institutionType": "Any",
  "field": "Data Science",
  "applicationLink": "https://example.com/apply",
  "checksum": "original_checksum_abc",
  "tags": ["test"]
}
```

**Step 2 — POST same URL, same checksum** → Should return existing record (no update)
> Send the exact same JSON again. Response should have same `updatedAt`.

**Step 3 — POST same URL, different checksum** → Should update the record
```json
{
  "grantTitle": "Test Checksum Grant - UPDATED",
  "fundingAgency": "Test Agency Updated",
  "programName": "Test Program V2",
  "description": "Checksum changed so this should trigger an update",
  "grantUrl": "https://example.com/test-grant",
  "applicationDeadline": "2027-03-31T23:59:00",
  "fundingAmountMin": 2000,
  "fundingAmountMax": 10000,
  "fundingCurrency": "USD",
  "eligibleCountries": "Global",
  "eligibleApplicants": "Anyone",
  "institutionType": "Any",
  "field": "Data Science",
  "applicationLink": "https://example.com/apply-v2",
  "checksum": "new_different_checksum_xyz",
  "tags": ["test", "updated"]
}
```
> Response should have updated `grantTitle`, new `checksum`, and a newer `updatedAt` timestamp.

