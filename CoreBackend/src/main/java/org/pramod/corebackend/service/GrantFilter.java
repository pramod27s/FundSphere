/**
 * Filters and sort order for the Discovery browse list. They run in the
 * database, so they apply across every page (GET /api/grants?page=&size=).
 *
 * The rules match the Discovery page's filters for AI results
 * (applyFilters in GrantDiscovery.tsx); keep the two in step.
 * Keyword groups are PostgreSQL regular expressions, matched without
 * regard to case (\y is a word boundary).
 */
package org.pramod.corebackend.service;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import org.pramod.corebackend.entity.Grant;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

public record GrantFilter(
        boolean includeClosed,
        Set<String> funders,
        Set<GrantKind> grantTypes,
        Set<ApplicantType> applicantTypes,
        Set<FundingRange> fundingRanges,
        Set<DeadlineRange> deadlineRanges,
        SortOrder sort) {

    /** "Grant type" filter: matched in the title, description, field, grant type and tags. */
    public enum GrantKind {
        RESEARCH("research|project"),
        FELLOWSHIP("fellowship"),
        TRAVEL("travel"),
        EQUIPMENT("equipment|instrument|apparatus|\\ylab(s|oratory|oratories)?\\y");

        private final String pattern;

        GrantKind(String pattern) {
            this.pattern = pattern;
        }
    }

    /** "Applicant type" filter: matched in the eligibility text, description, career stages, field and tags. */
    public enum ApplicantType {
        EARLY_CAREER("early.?career|early.?stage|postdoc|young (researcher|scientist|investigator)|junior"),
        STUDENT("ph\\.?d|m\\.?sc|student|doctoral|graduate"),
        SENIOR("senior|faculty|professor|principal investigator|\\ypi\\y"),
        INDUSTRY("start.?ups?|industry|industrial|compan(y|ies)|\\ysmes?\\y|msmes?|enterprise|commercial");

        private final String pattern;

        ApplicantType(String pattern) {
            this.pattern = pattern;
        }
    }

    /** Funding in rupees (the larger amount, converted); grants with no amount or an unknown currency don't match. */
    public enum FundingRange { UNDER_5_LAKH, FROM_5_TO_25_LAKH, FROM_25_LAKH_TO_1_CRORE, OVER_1_CRORE }

    /** Time left until the deadline; grants with no deadline don't match. */
    public enum DeadlineRange { WITHIN_30_DAYS, IN_1_TO_3_MONTHS, AFTER_3_MONTHS }

    public enum SortOrder {
        /** Most recently updated first. */
        RECENT,
        /** Open deadlines, soonest first; then closed ones; grants with no deadline last. */
        DEADLINE,
        /** Largest amount in rupees first; no amount or unknown currency last. */
        FUNDING
    }

    /** Rupees per unit, as used by the Discovery page. */
    private static final Map<String, BigDecimal> INR_PER_UNIT = Map.of(
            "INR", BigDecimal.ONE,
            "USD", BigDecimal.valueOf(83),
            "EUR", BigDecimal.valueOf(90),
            "GBP", BigDecimal.valueOf(105),
            "AUD", BigDecimal.valueOf(55),
            "CAD", BigDecimal.valueOf(62));

    private static final BigDecimal FIVE_LAKH = BigDecimal.valueOf(500_000);
    private static final BigDecimal TWENTY_FIVE_LAKH = BigDecimal.valueOf(2_500_000);
    private static final BigDecimal ONE_CRORE = BigDecimal.valueOf(10_000_000);

    /**
     * Reads the query parameters: includeClosed (default true), sortBy, and
     * the repeatable funder, grantType, applicantType, fundingRange and
     * deadlineRange. Values are taken whole, so an agency name with a comma
     * stays one value.
     */
    public static GrantFilter from(MultiValueMap<String, String> params) {
        Set<String> funders = new LinkedHashSet<>();
        for (String funder : params.getOrDefault("funder", List.of())) {
            if (funder != null && !funder.isBlank()) {
                funders.add(funder);
            }
        }
        String sortBy = params.getFirst("sortBy");
        return new GrantFilter(
                !"false".equalsIgnoreCase(params.getFirst("includeClosed")),
                funders,
                parseAll(params.get("grantType"), GrantKind.class),
                parseAll(params.get("applicantType"), ApplicantType.class),
                parseAll(params.get("fundingRange"), FundingRange.class),
                parseAll(params.get("deadlineRange"), DeadlineRange.class),
                sortBy == null || sortBy.isBlank() ? SortOrder.RECENT : parse(sortBy, SortOrder.class));
    }

    public Specification<Grant> toSpecification(LocalDateTime now) {
        return (root, query, cb) -> {
            Path<LocalDateTime> deadline = root.get("applicationDeadline");
            List<Predicate> where = new ArrayList<>();

            if (!includeClosed) {
                where.add(cb.or(cb.isNull(deadline), cb.greaterThanOrEqualTo(deadline, now)));
            }
            if (!funders.isEmpty()) {
                where.add(root.get("fundingAgency").in(funders));
            }
            if (!grantTypes.isEmpty()) {
                where.add(anyOf(cb, grantTypes.stream()
                        .map(kind -> textMatches(root, query, cb, kind.pattern,
                                "grantTitle", "description", "field", "grantType"))
                        .toList()));
            }
            if (!applicantTypes.isEmpty()) {
                where.add(anyOf(cb, applicantTypes.stream()
                        .map(type -> textMatches(root, query, cb, type.pattern,
                                "eligibilityCriteria", "description", "targetCareerStages", "field"))
                        .toList()));
            }
            if (!fundingRanges.isEmpty()) {
                Expression<BigDecimal> inr = inrAmount(root, cb);
                where.add(anyOf(cb, fundingRanges.stream().map(range -> switch (range) {
                    case UNDER_5_LAKH -> cb.lessThan(inr, FIVE_LAKH);
                    case FROM_5_TO_25_LAKH -> cb.between(inr, FIVE_LAKH, TWENTY_FIVE_LAKH);
                    case FROM_25_LAKH_TO_1_CRORE -> cb.and(cb.greaterThan(inr, TWENTY_FIVE_LAKH), cb.lessThanOrEqualTo(inr, ONE_CRORE));
                    case OVER_1_CRORE -> cb.greaterThan(inr, ONE_CRORE);
                }).toList()));
            }
            if (!deadlineRanges.isEmpty()) {
                where.add(anyOf(cb, deadlineRanges.stream().map(range -> switch (range) {
                    case WITHIN_30_DAYS -> cb.and(cb.greaterThanOrEqualTo(deadline, now), cb.lessThan(deadline, now.plusDays(30)));
                    case IN_1_TO_3_MONTHS -> cb.and(cb.greaterThanOrEqualTo(deadline, now.plusDays(30)), cb.lessThanOrEqualTo(deadline, now.plusDays(90)));
                    case AFTER_3_MONTHS -> cb.greaterThan(deadline, now.plusDays(90));
                }).toList()));
            }

            // The same specification also builds the page's count query, which can't be ordered.
            if (query.getResultType() == Grant.class) {
                query.orderBy(orderBy(root, cb, now));
            }
            return cb.and(where.toArray(Predicate[]::new));
        };
    }

    private List<Order> orderBy(Root<Grant> root, CriteriaBuilder cb, LocalDateTime now) {
        Path<LocalDateTime> deadline = root.get("applicationDeadline");
        Path<LocalDateTime> updatedAt = root.get("updatedAt");
        Order newestFirst = cb.desc(root.get("id")); // keeps pages stable when values tie
        return switch (sort) {
            case RECENT -> List.of(cb.asc(lastIfNull(cb, updatedAt)), cb.desc(updatedAt), newestFirst);
            case DEADLINE -> List.of(
                    cb.asc(cb.<Integer>selectCase()
                            .when(cb.isNull(deadline), 2)
                            .when(cb.lessThan(deadline, now), 1)
                            .otherwise(0)),
                    cb.asc(deadline),
                    newestFirst);
            case FUNDING -> {
                Expression<BigDecimal> inr = inrAmount(root, cb);
                yield List.of(cb.asc(lastIfNull(cb, inr)), cb.desc(inr), newestFirst);
            }
        };
    }

    /** The larger amount (or the only one) in rupees; null when there's no amount or the currency is unknown. */
    private static Expression<BigDecimal> inrAmount(Root<Grant> root, CriteriaBuilder cb) {
        Expression<BigDecimal> amount = cb.coalesce(root.<BigDecimal>get("fundingAmountMax"), root.<BigDecimal>get("fundingAmountMin"));
        CriteriaBuilder.SimpleCase<String, BigDecimal> rate = cb.selectCase(cb.upper(root.<String>get("fundingCurrency")));
        INR_PER_UNIT.forEach((currency, rupees) -> rate.when(currency, rupees));
        return cb.prod(amount, rate.otherwise(cb.nullLiteral(BigDecimal.class)));
    }

    /** True when the pattern matches any of the text fields or any of the grant's tags. */
    private static Predicate textMatches(Root<Grant> root, CriteriaQuery<?> query, CriteriaBuilder cb,
                                         String pattern, String... fields) {
        List<Predicate> matches = new ArrayList<>();
        for (String field : fields) {
            matches.add(regexMatch(cb, root.<String>get(field), pattern));
        }
        Subquery<Integer> tagMatch = query.subquery(Integer.class);
        Join<Grant, String> tag = tagMatch.correlate(root).join("tags");
        tagMatch.select(cb.literal(1)).where(regexMatch(cb, tag, pattern));
        matches.add(cb.exists(tagMatch));
        return anyOf(cb, matches);
    }

    /** PostgreSQL's case-insensitive regular expression match (the ~* operator). */
    private static Predicate regexMatch(CriteriaBuilder cb, Expression<String> text, String pattern) {
        return cb.isTrue(cb.function("texticregexeq", Boolean.class, text, cb.literal(pattern)));
    }

    private static Expression<Integer> lastIfNull(CriteriaBuilder cb, Expression<?> value) {
        return cb.<Integer>selectCase().when(cb.isNull(value), 1).otherwise(0);
    }

    private static Predicate anyOf(CriteriaBuilder cb, List<Predicate> predicates) {
        return cb.or(predicates.toArray(Predicate[]::new));
    }

    private static <E extends Enum<E>> Set<E> parseAll(List<String> values, Class<E> type) {
        Set<E> parsed = EnumSet.noneOf(type);
        if (values != null) {
            for (String value : values) {
                if (value != null && !value.isBlank()) {
                    parsed.add(parse(value, type));
                }
            }
        }
        return parsed;
    }

    private static <E extends Enum<E>> E parse(String value, Class<E> type) {
        try {
            return Enum.valueOf(type, value.strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(BAD_REQUEST, "Unknown " + type.getSimpleName() + ": " + value);
        }
    }
}
