package org.pramod.corebackend.enums;

/**
 * Where the PI uploads UCs, SEs and progress reports for a grant. Known
 * agency portals carry their own link; OTHER uses the link the PI pastes.
 */
public enum SubmissionPortal {
    ANRF("https://anrfonline.in"),
    DBT_EPROMIS("https://dbtepromis.nic.in"),
    ICMR_EPMS("https://epms.icmr.org.in"),
    OTHER(null);

    private final String url;

    SubmissionPortal(String url) {
        this.url = url;
    }

    /** Null for OTHER. */
    public String url() {
        return url;
    }
}
