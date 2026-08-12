package com.company.automation.exceptions;

/**
 * Unchecked exception for framework-level failures (bad config, unsupported
 * browser, driver setup problems, etc.) so they are clearly distinguishable
 * from Selenium's own exceptions or plain assertion failures in reports and
 * logs.
 */
public class FrameworkException extends RuntimeException {

    public FrameworkException(String message) {
        super(message);
    }

    public FrameworkException(String message, Throwable cause) {
        super(message, cause);
    }
}
