package com.company.automation.reporting;

import io.cucumber.plugin.EventListener;
import io.cucumber.plugin.event.EventPublisher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

/**
 * Works around a real limitation in {@code extentreports-cucumber7-adapter}:
 * the value of {@code extent.reporter.spark.config} (see
 * {@code extent.properties}) is resolved as a {@link File} relative to the
 * JVM's working directory - never from the classpath - even though the XML
 * itself ships inside {@code src/main/resources} (i.e. inside this
 * framework's jar). Left alone, {@code ExtentCucumberAdapter} logs a
 * {@code FileNotFoundException} and silently falls back to Extent's default,
 * unbranded Spark theme.
 *
 * <p>Cucumber constructs plugins in the order they're listed in
 * {@code cucumber.plugin}, so registering this ahead of
 * {@code ExtentCucumberAdapter} lets it copy the classpath resource onto
 * disk first, at exactly the relative path {@code extent.properties}
 * already points at. This keeps the framework's "no manual setup" promise
 * for any project that imports it as a dependency, not just this repo's own
 * sample suite.
 */
public class ExtentConfigBootstrap implements EventListener {

    private static final Logger LOG = LoggerFactory.getLogger(ExtentConfigBootstrap.class);
    private static final String CONFIG_FILE_NAME = "extent-spark-config.xml";

    public ExtentConfigBootstrap() {
        materializeConfigFile();
    }

    @Override
    public void setEventPublisher(EventPublisher publisher) {
        // No events to observe - all the work happens in the constructor,
        // before ExtentCucumberAdapter (registered immediately after this
        // plugin) triggers ExtentService's static initialisation.
    }

    private void materializeConfigFile() {
        File target = new File(CONFIG_FILE_NAME);
        if (target.exists()) {
            return;
        }
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(CONFIG_FILE_NAME)) {
            if (in == null) {
                LOG.warn("{} not found on classpath - Extent Spark report will use default styling", CONFIG_FILE_NAME);
                return;
            }
            Files.copy(in, target.toPath());
        } catch (IOException e) {
            LOG.warn("Could not write {} to the working directory - Extent Spark report will use default styling", CONFIG_FILE_NAME, e);
        }
    }
}
