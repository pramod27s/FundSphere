package org.pramod.corebackend.dto.application;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body for asking a question about an application's guidelines. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GuidelineQuestionRequest {
    private String question;
}
