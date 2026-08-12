package com.company.automation.driver;

/**
 * Browsers the framework knows how to spin up. Add a case here (and in
 * {@link DriverFactory}) to support another browser - everything else
 * (config, hooks, reporting) keeps working unchanged.
 */
public enum BrowserType {
    CHROME,
    FIREFOX,
    EDGE;

    public static BrowserType fromString(String value) {
        if (value == null || value.isBlank()) {
            return CHROME;
        }
        try {
            return BrowserType.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "Unsupported browser '" + value + "'. Supported values: chrome, firefox, edge.", e);
        }
    }
}
