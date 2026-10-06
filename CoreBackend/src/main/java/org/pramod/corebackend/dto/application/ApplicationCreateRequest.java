package org.pramod.corebackend.dto.application;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

/**
 * POST body for /api/applications.
 *
 * With grantId: starts an application for a grant in FundSphere; title,
 * agency, link and deadline are copied from the grant unless given here.
 * Without grantId: a call outside FundSphere, and title is required.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ApplicationCreateRequest {
    private Long grantId;
    private String title;
    private String agency;
    private String callUrl;
    private LocalDate deadline;
    private String notes;
}
