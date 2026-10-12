/**
 * Writes a progress-report draft (4.4) as a Word document (.docx) the PI can
 * finish in Word and submit. Plain WordprocessingML in a zip, written with
 * the JDK alone, like IcsCalendarWriter: no document library needed.
 *
 * The document says it's a draft twice over: a "DRAFT" line in the page
 * header of every page, and a notice at the top with the result of the
 * unsupported-claim check (how many sentences aren't supported by the
 * recorded outputs, and how many places are left to fill in). In the text,
 * unsupported sentences are red with a wavy underline, as in the editor, and
 * places to fill in are highlighted yellow. A4 pages; headings use Word's own
 * heading styles, so the navigation pane and a table of contents work.
 */
package org.pramod.corebackend.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class DocxReportWriter {

    public enum Mark {
        NORMAL,
        /** Not supported by the records it cites, and not kept by the PI. */
        UNSUPPORTED,
        /** An instruction in [brackets] for the PI to replace. */
        PLACEHOLDER
    }

    public record Sentence(String text, Mark mark) {
    }

    public record Block(String heading, boolean list, List<Sentence> sentences) {
    }

    public record Section(String heading, List<Block> blocks) {
    }

    /** confirmed: unsupported sentences the PI checked and kept. */
    public record Report(String title, String subtitle, int unsupported, int placeholders, int confirmed,
                         List<Section> sections) {
    }

    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
    private static final String XML_DECLARATION = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n";
    private static final String RED = "C00000";

    private DocxReportWriter() {
    }

    public static byte[] write(Report report, Instant created) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            put(zip, "[Content_Types].xml", contentTypes());
            put(zip, "_rels/.rels", packageRelationships());
            put(zip, "docProps/core.xml", coreProperties(report.title(), created));
            put(zip, "word/_rels/document.xml.rels", documentRelationships());
            put(zip, "word/styles.xml", styles());
            put(zip, "word/numbering.xml", numbering());
            put(zip, "word/header1.xml", header());
            put(zip, "word/document.xml", document(report));
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return bytes.toByteArray();
    }

    // ------------------------------------------------------------------
    // The document
    // ------------------------------------------------------------------

    private static String document(Report report) {
        StringBuilder body = new StringBuilder();
        body.append(notice("DRAFT written by FundSphere from your recorded outputs. Check every line before you submit it.",
                "FFF4E5", true));
        if (report.unsupported() > 0) {
            body.append(notice(count(report.unsupported(), "sentence is", "sentences are")
                    + " not supported by your recorded outputs. They are shown in red with a wavy underline: "
                    + "correct or delete them before you submit.", "FDECEA", false));
        } else {
            String kept = report.confirmed() > 0
                    ? " " + count(report.confirmed(), "sentence was", "sentences were") + " kept as you wrote "
                    + (report.confirmed() == 1 ? "it" : "them") + "."
                    : "";
            body.append(notice("Every sentence traces to your recorded outputs, objectives or grant details." + kept,
                    "E8F5E9", false));
        }
        if (report.placeholders() > 0) {
            body.append(notice(count(report.placeholders(), "place is", "places are")
                    + " left for you to fill in, highlighted in yellow.", "FFFDE7", false));
        }

        body.append(paragraph("Title", run(report.title(), Mark.NORMAL)));
        if (report.subtitle() != null && !report.subtitle().isBlank()) {
            body.append("<w:p><w:r><w:rPr><w:i/><w:color w:val=\"595959\"/></w:rPr>")
                    .append(text(report.subtitle())).append("</w:r></w:p>");
        }
        for (Section section : report.sections()) {
            body.append(paragraph("Heading1", run(section.heading(), Mark.NORMAL)));
            for (Block block : section.blocks()) {
                if (block.heading() != null && !block.heading().isBlank()) {
                    body.append(paragraph("Heading2", run(block.heading(), Mark.NORMAL)));
                }
                if (block.list()) {
                    for (Sentence sentence : block.sentences()) {
                        body.append("<w:p><w:pPr><w:pStyle w:val=\"ListParagraph\"/>")
                                .append("<w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"1\"/></w:numPr></w:pPr>")
                                .append(run(sentence.text(), sentence.mark())).append("</w:p>");
                    }
                } else if (!block.sentences().isEmpty()) {
                    StringBuilder runs = new StringBuilder();
                    for (int i = 0; i < block.sentences().size(); i++) {
                        Sentence sentence = block.sentences().get(i);
                        if (i > 0) {
                            runs.append(run(" ", Mark.NORMAL));
                        }
                        runs.append(run(sentence.text(), sentence.mark()));
                    }
                    body.append("<w:p>").append(runs).append("</w:p>");
                }
            }
        }

        return XML_DECLARATION
                + "<w:document xmlns:w=\"" + W + "\" xmlns:r=\"" + R + "\"><w:body>"
                + body
                + "<w:sectPr><w:headerReference w:type=\"default\" r:id=\"rId3\"/>"
                + "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>"
                + "<w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\" w:header=\"708\" "
                + "w:footer=\"708\" w:gutter=\"0\"/></w:sectPr>"
                + "</w:body></w:document>";
    }

    /** A shaded line for the notice at the top. */
    private static String notice(String message, String fill, boolean bold) {
        return "<w:p><w:pPr><w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"" + fill + "\"/>"
                + "<w:spacing w:after=\"60\"/></w:pPr><w:r>" + (bold ? "<w:rPr><w:b/></w:rPr>" : "")
                + text(message) + "</w:r></w:p>";
    }

    private static String paragraph(String style, String runs) {
        return "<w:p><w:pPr><w:pStyle w:val=\"" + style + "\"/></w:pPr>" + runs + "</w:p>";
    }

    private static String run(String value, Mark mark) {
        String properties = switch (mark) {
            case NORMAL -> "";
            case UNSUPPORTED -> "<w:rPr><w:color w:val=\"" + RED + "\"/><w:u w:val=\"wave\" w:color=\"" + RED + "\"/></w:rPr>";
            case PLACEHOLDER -> "<w:rPr><w:i/><w:highlight w:val=\"yellow\"/></w:rPr>";
        };
        return "<w:r>" + properties + text(value) + "</w:r>";
    }

    private static String text(String value) {
        return "<w:t xml:space=\"preserve\">" + escape(value) + "</w:t>";
    }

    private static String count(int n, String one, String many) {
        return n + " " + (n == 1 ? one : many);
    }

    /** XML-escapes text, folds line breaks into spaces and drops characters XML can't hold. */
    static String escape(String value) {
        if (value == null) {
            return "";
        }
        StringBuilder out = new StringBuilder(value.length());
        value.codePoints().forEach(cp -> {
            switch (cp) {
                case '&' -> out.append("&amp;");
                case '<' -> out.append("&lt;");
                case '>' -> out.append("&gt;");
                case '"' -> out.append("&quot;");
                case '\'' -> out.append("&apos;");
                case '\n', '\r', '\t' -> out.append(' ');
                default -> {
                    boolean allowed = cp >= 0x20 && cp != 0xFFFE && cp != 0xFFFF && (cp < 0xD800 || cp > 0xDFFF);
                    if (allowed) {
                        out.appendCodePoint(cp);
                    }
                }
            }
        });
        return out.toString();
    }

    // ------------------------------------------------------------------
    // Package parts
    // ------------------------------------------------------------------

    private static String contentTypes() {
        String main = "application/vnd.openxmlformats-officedocument.wordprocessingml.";
        return XML_DECLARATION
                + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                + "<Override PartName=\"/word/document.xml\" ContentType=\"" + main + "document.main+xml\"/>"
                + "<Override PartName=\"/word/styles.xml\" ContentType=\"" + main + "styles+xml\"/>"
                + "<Override PartName=\"/word/numbering.xml\" ContentType=\"" + main + "numbering+xml\"/>"
                + "<Override PartName=\"/word/header1.xml\" ContentType=\"" + main + "header+xml\"/>"
                + "<Override PartName=\"/docProps/core.xml\" "
                + "ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>"
                + "</Types>";
    }

    private static String packageRelationships() {
        return XML_DECLARATION
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"" + REL + "officeDocument\" Target=\"word/document.xml\"/>"
                + "<Relationship Id=\"rId2\" "
                + "Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" "
                + "Target=\"docProps/core.xml\"/>"
                + "</Relationships>";
    }

    private static String documentRelationships() {
        return XML_DECLARATION
                + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                + "<Relationship Id=\"rId1\" Type=\"" + REL + "styles\" Target=\"styles.xml\"/>"
                + "<Relationship Id=\"rId2\" Type=\"" + REL + "numbering\" Target=\"numbering.xml\"/>"
                + "<Relationship Id=\"rId3\" Type=\"" + REL + "header\" Target=\"header1.xml\"/>"
                + "</Relationships>";
    }

    private static String coreProperties(String title, Instant created) {
        return XML_DECLARATION
                + "<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" "
                + "xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" "
                + "xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">"
                + "<dc:title>" + escape(title) + " (draft)</dc:title>"
                + "<dc:creator>FundSphere</dc:creator>"
                + "<cp:keywords>Draft</cp:keywords>"
                + "<dcterms:created xsi:type=\"dcterms:W3CDTF\">" + created.truncatedTo(ChronoUnit.SECONDS) + "</dcterms:created>"
                + "</cp:coreProperties>";
    }

    private static String styles() {
        return XML_DECLARATION
                + "<w:styles xmlns:w=\"" + W + "\">"
                + "<w:docDefaults><w:rPrDefault><w:rPr>"
                + "<w:rFonts w:ascii=\"Calibri\" w:hAnsi=\"Calibri\" w:eastAsia=\"Calibri\" w:cs=\"Calibri\"/>"
                + "<w:sz w:val=\"22\"/><w:szCs w:val=\"22\"/><w:lang w:val=\"en-IN\"/></w:rPr></w:rPrDefault>"
                + "<w:pPrDefault><w:pPr><w:spacing w:after=\"120\" w:line=\"276\" w:lineRule=\"auto\"/></w:pPr>"
                + "</w:pPrDefault></w:docDefaults>"
                + "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/></w:style>"
                + "<w:style w:type=\"paragraph\" w:styleId=\"Title\"><w:name w:val=\"Title\"/><w:basedOn w:val=\"Normal\"/>"
                + "<w:next w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:before=\"240\" w:after=\"60\"/></w:pPr>"
                + "<w:rPr><w:b/><w:sz w:val=\"36\"/><w:szCs w:val=\"36\"/></w:rPr></w:style>"
                + heading("Heading1", "heading 1", 0, 28, 360)
                + heading("Heading2", "heading 2", 1, 24, 200)
                + "<w:style w:type=\"paragraph\" w:styleId=\"ListParagraph\"><w:name w:val=\"List Paragraph\"/>"
                + "<w:basedOn w:val=\"Normal\"/><w:qFormat/><w:pPr><w:spacing w:after=\"60\"/><w:ind w:left=\"720\"/>"
                + "</w:pPr></w:style>"
                + "<w:style w:type=\"paragraph\" w:styleId=\"Header\"><w:name w:val=\"header\"/><w:basedOn w:val=\"Normal\"/>"
                + "</w:style>"
                + "</w:styles>";
    }

    private static String heading(String id, String name, int level, int halfPoints, int spaceBefore) {
        return "<w:style w:type=\"paragraph\" w:styleId=\"" + id + "\"><w:name w:val=\"" + name + "\"/>"
                + "<w:basedOn w:val=\"Normal\"/><w:next w:val=\"Normal\"/><w:qFormat/>"
                + "<w:pPr><w:keepNext/><w:spacing w:before=\"" + spaceBefore + "\" w:after=\"80\"/>"
                + "<w:outlineLvl w:val=\"" + level + "\"/></w:pPr>"
                + "<w:rPr><w:b/><w:color w:val=\"1F3864\"/><w:sz w:val=\"" + halfPoints + "\"/>"
                + "<w:szCs w:val=\"" + halfPoints + "\"/></w:rPr></w:style>";
    }

    private static String numbering() {
        return XML_DECLARATION
                + "<w:numbering xmlns:w=\"" + W + "\">"
                + "<w:abstractNum w:abstractNumId=\"0\"><w:multiLevelType w:val=\"singleLevel\"/>"
                + "<w:lvl w:ilvl=\"0\"><w:start w:val=\"1\"/><w:numFmt w:val=\"bullet\"/><w:lvlText w:val=\"•\"/>"
                + "<w:lvlJc w:val=\"left\"/><w:pPr><w:ind w:left=\"720\" w:hanging=\"360\"/></w:pPr></w:lvl>"
                + "</w:abstractNum>"
                + "<w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num>"
                + "</w:numbering>";
    }

    private static String header() {
        return XML_DECLARATION
                + "<w:hdr xmlns:w=\"" + W + "\"><w:p><w:pPr><w:pStyle w:val=\"Header\"/><w:jc w:val=\"right\"/></w:pPr>"
                + "<w:r><w:rPr><w:b/><w:color w:val=\"" + RED + "\"/><w:sz w:val=\"18\"/></w:rPr>"
                + text("DRAFT · check every line before you submit it") + "</w:r></w:p></w:hdr>";
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
