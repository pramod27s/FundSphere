package org.pramod.corebackend.migration;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.enums.PrimaryField;

import java.util.Arrays;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/** The constraint is replaced only when it doesn't name every research field. */
class PrimaryFieldCheckMigrationTest {

    private static String definitionOf(PrimaryField... fields) {
        return "CHECK (((primary_field)::text = ANY ((ARRAY["
                + Arrays.stream(fields).map(f -> "'" + f.name() + "'::character varying").collect(Collectors.joining(", "))
                + "])::text[])))";
    }

    @Test
    void theOriginalEightFieldsAreNotEnough() {
        String original = definitionOf(PrimaryField.ARTIFICIAL_INTELLIGENCE, PrimaryField.HEALTHCARE,
                PrimaryField.EDUCATION, PrimaryField.ENVIRONMENT, PrimaryField.AGRICULTURE,
                PrimaryField.ROBOTICS, PrimaryField.DATA_SCIENCE, PrimaryField.SOCIAL_IMPACT);

        assertFalse(PrimaryFieldCheckMigration.listsEveryValue(original));
    }

    @Test
    void aConstraintWithEveryFieldIsLeftAlone() {
        assertTrue(PrimaryFieldCheckMigration.listsEveryValue(definitionOf(PrimaryField.values())));
    }
}
