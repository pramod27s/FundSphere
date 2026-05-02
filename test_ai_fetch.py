import json
import urllib.request

url = "http://localhost:8080/api/researchers/me/matches"

headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer <some token>"
}

print("Running...")
