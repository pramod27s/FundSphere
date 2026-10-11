/**
 * Keeps a grant's stored deadlines in step with ComplianceRules when its
 * dates or reporting profile change (4.2), without losing what the PI did:
 *   - an event the rules still call for keeps its status, submission date
 *     and, if the PI moved it, its due date; its title and period are refreshed;
 *   - an event the rules no longer call for is removed, unless it was
 *     already submitted (that stays as history);
 *   - new events are added as pending;
 *   - deadlines the PI added by hand are never touched.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.enums.ComplianceEventOrigin;
import org.pramod.corebackend.enums.ComplianceEventStatus;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ComplianceSchedule {

    private ComplianceSchedule() {
    }

    /** Brings the grant's events in line with the rules for its current dates and profile. */
    public static void sync(Award award) {
        sync(award, ComplianceRules.plan(award.getReportingProfile(), award.getStartDate(), award.getEndDate()));
    }

    static void sync(Award award, List<ComplianceRules.PlannedEvent> planned) {
        List<ComplianceEvent> events = award.getEvents();
        Map<String, ComplianceRules.PlannedEvent> byKey = new HashMap<>();
        for (ComplianceRules.PlannedEvent event : planned) {
            byKey.put(event.ruleKey(), event);
        }

        events.removeIf(event -> event.getOrigin() == ComplianceEventOrigin.RULE
                && !byKey.containsKey(event.getRuleKey())
                && event.getStatus() != ComplianceEventStatus.SUBMITTED);

        Map<String, ComplianceEvent> existing = new HashMap<>();
        for (ComplianceEvent event : events) {
            if (event.getOrigin() == ComplianceEventOrigin.RULE) {
                existing.put(event.getRuleKey(), event);
            }
        }

        for (ComplianceRules.PlannedEvent plan : planned) {
            ComplianceEvent event = existing.get(plan.ruleKey());
            if (event == null) {
                events.add(ComplianceEvent.builder()
                        .award(award)
                        .type(plan.type())
                        .ruleKey(plan.ruleKey())
                        .title(plan.title())
                        .periodStart(plan.periodStart())
                        .periodEnd(plan.periodEnd())
                        .dueDate(plan.dueDate())
                        .origin(ComplianceEventOrigin.RULE)
                        .status(ComplianceEventStatus.PENDING)
                        .basis(plan.basis())
                        .build());
                continue;
            }
            event.setType(plan.type());
            event.setTitle(plan.title());
            event.setPeriodStart(plan.periodStart());
            event.setPeriodEnd(plan.periodEnd());
            event.setBasis(plan.basis());
            if (!event.isDueDateEdited()) {
                event.setDueDate(plan.dueDate());
            }
        }
    }

    /** The due date the rules give this event, or null if they no longer call for it (or it was added by hand). */
    public static LocalDate ruleDueDate(Award award, ComplianceEvent event) {
        if (event.getOrigin() != ComplianceEventOrigin.RULE) {
            return null;
        }
        return ComplianceRules.plan(award.getReportingProfile(), award.getStartDate(), award.getEndDate()).stream()
                .filter(plan -> plan.ruleKey().equals(event.getRuleKey()))
                .map(ComplianceRules.PlannedEvent::dueDate)
                .findFirst()
                .orElse(null);
    }
}
