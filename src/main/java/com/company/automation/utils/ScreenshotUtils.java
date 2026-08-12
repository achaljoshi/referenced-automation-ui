package com.company.automation.utils;

import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Screenshot capture helper. Returns raw PNG bytes so callers can attach
 * them directly to Cucumber's {@code Scenario.attach(...)} - which both the
 * Extent adapter and the Allure plugin pick up automatically - and also
 * persists a copy under {@code target/screenshots} for anyone who wants a
 * plain file (e.g. to paste into a Slack message or a bug report).
 */
public final class ScreenshotUtils {

    private static final Logger LOG = LoggerFactory.getLogger(ScreenshotUtils.class);
    private static final Path SCREENSHOT_DIR = Paths.get("target", "screenshots");
    private static final DateTimeFormatter TIMESTAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS");

    private ScreenshotUtils() {
    }

    public static byte[] capture(WebDriver driver, String scenarioName) {
        if (!(driver instanceof TakesScreenshot)) {
            LOG.warn("Current WebDriver does not support screenshots.");
            return new byte[0];
        }
        byte[] screenshot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.BYTES);
        persistToDisk(screenshot, scenarioName);
        return screenshot;
    }

    private static void persistToDisk(byte[] screenshot, String scenarioName) {
        try {
            Files.createDirectories(SCREENSHOT_DIR);
            String safeName = scenarioName == null ? "scenario" : scenarioName.replaceAll("[^a-zA-Z0-9-_]", "_");
            String fileName = safeName + "_" + LocalDateTime.now().format(TIMESTAMP) + ".png";
            Path target = SCREENSHOT_DIR.resolve(fileName);
            Files.write(target, screenshot);
            LOG.info("Screenshot saved: {}", target.toAbsolutePath());
        } catch (IOException e) {
            LOG.warn("Could not persist screenshot to disk: {}", e.getMessage());
        }
    }

    public static File captureToFile(WebDriver driver) {
        if (!(driver instanceof TakesScreenshot)) {
            LOG.warn("Current WebDriver does not support screenshots.");
            return null;
        }
        return ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
    }
}
