package com.company.automation.hooks;

import com.company.automation.driver.DriverFactory;
import com.company.automation.driver.DriverManager;
import com.company.automation.utils.ScreenshotUtils;
import io.cucumber.java.After;
import io.cucumber.java.Before;
import io.cucumber.java.Scenario;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Reusable Cucumber hooks shipped as part of the framework jar.
 *
 * <p>Add this package to the {@code glue} path of your Cucumber runner
 * alongside your own step-definition package(s) and every scenario
 * automatically gets: a fresh WebDriver per scenario, a screenshot attached
 * to the report on failure (picked up by both the Extent adapter and the
 * Allure plugin), and a guaranteed {@code driver.quit()} even if the
 * scenario throws.
 *
 * <pre>{@code
 * @Suite
 * @IncludeEngines("cucumber")
 * @SelectClasspathResource("features")
 * @ConfigurationParameter(key = GLUE_PROPERTY_NAME,
 *         value = "com.company.automation.hooks,com.mycompany.myproject.stepdefinitions")
 * public class RunCucumberTest { }
 * }</pre>
 */
public class Hooks {

    private static final Logger LOG = LoggerFactory.getLogger(Hooks.class);

    @Before(order = 0)
    public void setUp(Scenario scenario) {
        LOG.info("Provisioning WebDriver for scenario: {}", scenario.getName());
        DriverManager.setDriver(DriverFactory.createDriver());
    }

    @After(order = 0)
    public void tearDown(Scenario scenario) {
        try {
            if (scenario.isFailed() && DriverManager.hasDriver()) {
                attachFailureScreenshot(scenario);
            }
        } finally {
            LOG.info("Quitting WebDriver for scenario: {} [{}]", scenario.getName(), scenario.getStatus());
            DriverManager.quitDriver();
        }
    }

    private void attachFailureScreenshot(Scenario scenario) {
        try {
            byte[] screenshot = ScreenshotUtils.capture(DriverManager.getDriver(), scenario.getName());
            if (screenshot.length > 0) {
                scenario.attach(screenshot, "image/png", "Failure screenshot: " + scenario.getName());
            }
            scenario.log("Current URL at failure: " + DriverManager.getDriver().getCurrentUrl());
        } catch (Exception e) {
            LOG.warn("Could not capture/attach failure screenshot: {}", e.getMessage());
        }
    }
}
