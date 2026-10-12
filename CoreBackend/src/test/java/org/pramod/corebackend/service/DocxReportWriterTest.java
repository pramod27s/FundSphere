package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.service.DocxReportWriter.Block;
import org.pramod.corebackend.service.DocxReportWriter.Mark;
import org.pramod.corebackend.service.DocxReportWriter.Report;
import org.pramod.corebackend.service.DocxReportWriter.Section;
import org.pramod.corebackend.service.DocxReportWriter.Sentence;
import org.w3c.dom.Document;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.junit.jupiter.api.Assertions.*;

class DocxReportWriterTest {

    private static final Instant CREATED = Instant.parse("2026-10-12T09:30:00Z");

    private static Report report(int unsupported, int placeholders, int confirmed) {
        return new Report("Annual progress report, year 1", "Period covered: 15 Aug 2026 to 14 Aug 2027",
                unsupported, placeholders, confirmed, List.of(
                new Section("Project details", List.of(new Block(null, true, List.of(
                        new Sentence("Project title: Sensors & \"arsenic\" <field> tests", Mark.NORMAL),
                        new Sentence("Total sanctioned: ₹39.27 lakh", Mark.NORMAL))))),
                new Section("Work done during the period", List.of(new Block("Objective 1: To develop a sensor", false, List.of(
                        new Sentence("The prototype was tested in 5 villages.", Mark.NORMAL),
                        new Sentence("It was tested in 12 villages.", Mark.UNSUPPORTED),
                        new Sentence("[Describe the work done.]", Mark.PLACEHOLDER)))))));
    }

    /** Every part of the package, by name. */
    private static Map<String, String> unzip(byte[] docx) throws Exception {
        Map<String, String> parts = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(docx), StandardCharsets.UTF_8)) {
            for (ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                parts.put(entry.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return parts;
    }

    private static Document parse(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        return factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void writesAWellFormedWordPackage() throws Exception {
        Map<String, String> parts = unzip(DocxReportWriter.write(report(1, 1, 0), CREATED));

        assertEquals(List.of("[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "word/_rels/document.xml.rels",
                "word/styles.xml", "word/numbering.xml", "word/header1.xml", "word/document.xml"), List.copyOf(parts.keySet()));
        for (Map.Entry<String, String> part : parts.entrySet()) {
            assertDoesNotThrow(() -> parse(part.getValue()), part.getKey() + " must be well-formed XML");
        }
        assertTrue(parts.get("docProps/core.xml").contains("<dcterms:created xsi:type=\"dcterms:W3CDTF\">2026-10-12T09:30:00Z"));
    }

    @Test
    void saysItIsADraftOnEveryPageAndCountsWhatNeedsFixingAtTheTop() throws Exception {
        Map<String, String> parts = unzip(DocxReportWriter.write(report(1, 1, 0), CREATED));
        String document = parts.get("word/document.xml");

        assertTrue(parts.get("word/header1.xml").contains("DRAFT"));
        assertTrue(parts.get("docProps/core.xml").contains("(draft)</dc:title>"));
        int notice = document.indexOf("1 sentence is not supported by your recorded outputs");
        int title = document.indexOf("Annual progress report, year 1");
        assertTrue(notice > 0 && notice < title, "the count comes before the report itself");
        assertTrue(document.contains("1 place is left for you to fill in"));
        assertTrue(document.contains("<w:headerReference w:type=\"default\" r:id=\"rId3\"/>"));
    }

    @Test
    void marksUnsupportedSentencesRedAndPlaceholdersYellow() throws Exception {
        String document = unzip(DocxReportWriter.write(report(1, 1, 0), CREATED)).get("word/document.xml");

        assertTrue(document.contains("<w:u w:val=\"wave\" w:color=\"C00000\"/></w:rPr><w:t xml:space=\"preserve\">It was tested in 12 villages."));
        assertTrue(document.contains("<w:highlight w:val=\"yellow\"/></w:rPr><w:t xml:space=\"preserve\">[Describe the work done.]"));
        assertTrue(document.contains("<w:r><w:t xml:space=\"preserve\">The prototype was tested in 5 villages.</w:t></w:r>"));
    }

    @Test
    void usesHeadingStylesBulletsAndEscapesText() throws Exception {
        String document = unzip(DocxReportWriter.write(report(0, 0, 0), CREATED)).get("word/document.xml");

        assertTrue(document.contains("<w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t xml:space=\"preserve\">Project details"));
        assertTrue(document.contains("<w:pStyle w:val=\"Heading2\"/></w:pPr><w:r><w:t xml:space=\"preserve\">Objective 1: To develop a sensor"));
        assertEquals(2, document.split("<w:numId w:val=\"1\"/>", -1).length - 1, "one bullet per list sentence");
        assertTrue(document.contains("Sensors &amp; &quot;arsenic&quot; &lt;field&gt; tests"));
        assertTrue(document.contains("₹39.27 lakh"));
        assertTrue(document.contains("Every sentence traces to your recorded outputs"));
    }

    @Test
    void sentencesKeptByThePiAreCounted() throws Exception {
        String document = unzip(DocxReportWriter.write(report(0, 0, 2), CREATED)).get("word/document.xml");
        assertTrue(document.contains("2 sentences were kept as you wrote them."));
    }

    @Test
    void escapingDropsWhatXmlCannotHold() {
        assertEquals("a b c", DocxReportWriter.escape("a\nb\tc"));
        assertEquals("ab", DocxReportWriter.escape("a\u0001b"));
        assertEquals("", DocxReportWriter.escape(null));
    }
}
