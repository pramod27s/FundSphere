## 🔬 Researcher API Sample — Explained Field by Field

Here is the sample:

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

---

### Breakdown by Section:

#### 1️⃣ User Type
| Field | Value | Meaning |
|-------|-------|---------|
| `userType` | `"RESEARCHER"` | This person is a researcher. Allowed values: `RESEARCHER`, `STUDENT`, `NONPROFIT_ORGANIZATION`, `STARTUP_COMPANY`, `PROFESSOR_FACULTY` |

> This tells the system **what kind of user** is registering.

---

#### 2️⃣ Organization / Institution Details
| Field | Value | Meaning |
|-------|-------|---------|
| `institutionName` | `"Indian Institute of Technology Madras"` | The university/org where they work |
| `department` | `"Computer Science and Engineering"` | Their department in that institution |
| `position` | `"PROFESSOR"` | Their role/position. Allowed values: `STUDENT`, `RESEARCH_ASSISTANT`, `PROFESSOR`, `NGO_MEMBER`, `FOUNDER` |

> This tells the system **where they work and their role**.

---

#### 3️⃣ Research / Interest Area
| Field | Value | Meaning |
|-------|-------|---------|
| `primaryField` | `"ARTIFICIAL_INTELLIGENCE"` | Their main research area. Allowed values: `ARTIFICIAL_INTELLIGENCE`, `HEALTHCARE`, `EDUCATION`, `ENVIRONMENT`, `AGRICULTURE`, `ROBOTICS`, `DATA_SCIENCE`, `SOCIAL_IMPACT` |
| `keywords` | `["deep learning", "NLP", "transformer models", "LLM"]` | Specific topics they work on (free text list) |

> This tells the system **what they research** — used for matching grants later.

---

#### 4️⃣ Location Information
| Field | Value | Meaning |
|-------|-------|---------|
| `country` | `"India"` | Their country |
| `state` | `"Tamil Nadu"` | Their state |
| `city` | `"Chennai"` | Their city |

> This tells the system **where they are located** — useful for filtering location-specific grants.

---

#### 5️⃣ Funding Preferences
| Field | Value | Meaning |
|-------|-------|---------|
| `minFundingAmount` | `50000` | Minimum grant amount they're interested in |
| `maxFundingAmount` | `500000` | Maximum grant amount they're looking for |
| `preferredGrantType` | `"RESEARCH_GRANT"` | Type of grant they prefer. Allowed values: `RESEARCH_GRANT`, `TRAVEL_GRANT`, `FELLOWSHIP`, `STARTUP_FUNDING`, `NGO_FUNDING` |

> This tells the system **what kind and size of funding** they want — used to recommend matching grants.

---

#### 6️⃣ Experience / Background
| Field | Value | Meaning |
|-------|-------|---------|
| `yearsOfExperience` | `12` | They have 12 years of research experience |
| `educationLevel` | `"PHD"` | Their highest education. Allowed values: `UNDERGRADUATE`, `MASTERS`, `PHD` |
| `previousGrantsReceived` | `true` | They have received grants before |

> This tells the system **how experienced they are** — some grants require specific experience levels.

---

#### 7️⃣ Notification Preferences
| Field | Value | Meaning |
|-------|-------|---------|
| `emailNotifications` | `true` | They want to receive email alerts |
| `deadlineReminders` | `true` | They want reminders before grant deadlines |
| `weeklyGrantRecommendations` | `true` | They want weekly grant suggestions |

> This tells the system **how to notify them** about new or matching grants.

---

### 🎯 In Simple Terms

This JSON represents a **professor at IIT Madras** who:
- Works in **AI/Deep Learning**
- Is in **Chennai, India**
- Looking for **research grants** between **₹50K – ₹5L**
- Has **12 years experience** with a **PhD**
- Has **received grants before**
- Wants **all notifications turned ON**

