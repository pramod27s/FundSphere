import streamlit as st
from scrape import crawl_site_for_grants

st.title("AI Grant Web Scraper")

url = st.text_input("Enter the website URL")

if st.button("Scrape Grants"):

    if url:
        st.write("Starting crawl...")

        grants = crawl_site_for_grants(url)

        st.success(f"Found {len(grants)} grant pages")

        for grant in grants:
            st.write(grant["url"])

    else:
        st.error("Please enter a valid URL")