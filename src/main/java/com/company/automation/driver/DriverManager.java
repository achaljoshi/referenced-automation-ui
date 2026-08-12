package com.company.automation.driver;

import org.openqa.selenium.WebDriver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Thread-safe holder for the {@link WebDriver} instance of the currently
 * executing scenario. Backed by a {@link ThreadLocal} so parallel Cucumber
 * execution (see {@code cucumber.execution.parallel.enabled} in
 * junit-platform.properties) never leaks a driver across threads.
 *
 * <p>Step definitions - in this framework or in any consuming project - call
 * {@link #getDriver()} to get the WebDriver for the current scenario. The
 * driver's create/quit lifecycle itself is owned by
 * {@code com.company.automation.hooks.Hooks}.
 */
public final class DriverManager {

    private static final Logger LOG = LoggerFactory.getLogger(DriverManager.class);
    private static final ThreadLocal<WebDriver> DRIVER_THREAD_LOCAL = new ThreadLocal<>();

    private DriverManager() {
    }

    public static WebDriver getDriver() {
        WebDriver driver = DRIVER_THREAD_LOCAL.get();
        if (driver == null) {
            throw new IllegalStateException(
                    "No WebDriver bound to the current thread. Make sure com.company.automation.hooks.Hooks "
                            + "is on the Cucumber glue path (glue = {\"com.company.automation.hooks\", ...}).");
        }
        return driver;
    }

    public static void setDriver(WebDriver driver) {
        DRIVER_THREAD_LOCAL.set(driver);
    }

    public static boolean hasDriver() {
        return DRIVER_THREAD_LOCAL.get() != null;
    }

    public static void quitDriver() {
        WebDriver driver = DRIVER_THREAD_LOCAL.get();
        if (driver != null) {
            try {
                driver.quit();
            } catch (Exception e) {
                LOG.warn("Error while quitting WebDriver: {}", e.getMessage());
            } finally {
                DRIVER_THREAD_LOCAL.remove();
            }
        }
    }
}
