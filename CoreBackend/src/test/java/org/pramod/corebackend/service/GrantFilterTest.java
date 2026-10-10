package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class GrantFilterTest {

    private static MultiValueMap<String, String> params(String... keysAndValues) {
        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        for (int i = 0; i < keysAndValues.length; i += 2) {
            params.add(keysAndValues[i], keysAndValues[i + 1]);
        }
        return params;
    }

    @Test
    void noParametersMeansEverythingByRecentUpdate() {
        GrantFilter filter = GrantFilter.from(params("page", "0", "size", "12"));

        assertTrue(filter.includeClosed());
        assertTrue(filter.funders().isEmpty());
        assertTrue(filter.grantTypes().isEmpty());
        assertTrue(filter.fundingRanges().isEmpty());
        assertEquals(GrantFilter.SortOrder.RECENT, filter.sort());
    }

    @Test
    void readsEveryFilterAndIgnoresCase() {
        GrantFilter filter = GrantFilter.from(params(
                "includeClosed", "false",
                "sortBy", "deadline",
                "grantType", "fellowship",
                "grantType", "TRAVEL",
                "applicantType", "EARLY_CAREER",
                "fundingRange", "FROM_5_TO_25_LAKH",
                "deadlineRange", "WITHIN_30_DAYS"));

        assertFalse(filter.includeClosed());
        assertEquals(GrantFilter.SortOrder.DEADLINE, filter.sort());
        assertEquals(Set.of(GrantFilter.GrantKind.FELLOWSHIP, GrantFilter.GrantKind.TRAVEL), filter.grantTypes());
        assertEquals(Set.of(GrantFilter.ApplicantType.EARLY_CAREER), filter.applicantTypes());
        assertEquals(Set.of(GrantFilter.FundingRange.FROM_5_TO_25_LAKH), filter.fundingRanges());
        assertEquals(Set.of(GrantFilter.DeadlineRange.WITHIN_30_DAYS), filter.deadlineRanges());
    }

    @Test
    void agencyNamesWithCommasStayWhole() {
        GrantFilter filter = GrantFilter.from(params(
                "funder", "Department of Biotechnology (DBT), Govt of India",
                "funder", "Vinnova",
                "funder", " "));

        assertEquals(Set.of("Department of Biotechnology (DBT), Govt of India", "Vinnova"), filter.funders());
    }

    @Test
    void unknownValuesAreRejected() {
        assertThrows(ResponseStatusException.class, () -> GrantFilter.from(params("grantType", "SCHOLARSHIP")));
        assertThrows(ResponseStatusException.class, () -> GrantFilter.from(params("sortBy", "match")));
    }
}
