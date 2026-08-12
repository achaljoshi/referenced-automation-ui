package com.company.automation.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Central configuration reader for the framework and for any project that
 * imports this jar as a Maven dependency.
 *
 * <p>Resolution order (highest priority first):
 * <ol>
 *     <li>JVM system property, e.g. {@code -Dbrowser=firefox}</li>
 *     <li>OS environment variable of the same name (upper-cased, dots -&gt; underscores)</li>
 *     <li>{@code config/config-<env>.properties} on the classpath (env-specific overrides)</li>
 *     <li>{@code config/config.properties} on the classpath (defaults)</li>
 * </ol>
 *
 * <p>The active environment is selected with {@code -Denv=qa} (default {@code qa}).
 * Consuming projects can ship their own {@code config/config-<env>.properties} on
 * their classpath and it will be picked up the same way - no framework code change
 * required.
 */
public final class ConfigReader {

    private static final Logger LOG = LoggerFactory.getLogger(ConfigReader.class);
    private static final String BASE_CONFIG = "config/config.properties";
    private static final Properties PROPERTIES = new Properties();

    static {
        load(BASE_CONFIG);
        String env = System.getProperty("env", System.getenv("ENV") != null ? System.getenv("ENV") : "qa");
        load("config/config-" + env + ".properties");
        LOG.info("ConfigReader initialised for env='{}'", env);
    }

    private ConfigReader() {
    }

    private static void load(String classpathResource) {
        try (InputStream in = Thread.currentThread().getContextClassLoader().getResourceAsStream(classpathResource)) {
            if (in == null) {
                LOG.debug("Config resource '{}' not found on classpath - skipping.", classpathResource);
                return;
            }
            Properties fileProps = new Properties();
            fileProps.load(in);
            PROPERTIES.putAll(fileProps);
            LOG.debug("Loaded {} properties from '{}'", fileProps.size(), classpathResource);
        } catch (IOException e) {
            LOG.warn("Failed to load config resource '{}': {}", classpathResource, e.getMessage());
        }
    }

    /**
     * Returns the value for {@code key}, honouring the system property / env
     * var override rules described in the class javadoc. Returns {@code null}
     * if the key is not set anywhere.
     */
    public static String get(String key) {
        String systemProperty = System.getProperty(key);
        if (systemProperty != null && !systemProperty.isBlank()) {
            return systemProperty;
        }
        String envVar = System.getenv(key.toUpperCase().replace('.', '_'));
        if (envVar != null && !envVar.isBlank()) {
            return envVar;
        }
        return PROPERTIES.getProperty(key);
    }

    public static String get(String key, String defaultValue) {
        String value = get(key);
        return value != null ? value : defaultValue;
    }

    public static int getInt(String key, int defaultValue) {
        String value = get(key);
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            LOG.warn("Config key '{}' = '{}' is not a valid int, using default {}", key, value, defaultValue);
            return defaultValue;
        }
    }

    public static boolean getBoolean(String key, boolean defaultValue) {
        String value = get(key);
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return Boolean.parseBoolean(value.trim());
    }

    public static String baseUrl() {
        return get("base.url", "https://www.saucedemo.com/");
    }

    public static String browser() {
        return get("browser", "chrome");
    }

    public static boolean headless() {
        return getBoolean("headless", true);
    }

    public static String remoteGridUrl() {
        return get("grid.url", "");
    }

    public static boolean isRemoteExecution() {
        String url = remoteGridUrl();
        return url != null && !url.isBlank();
    }

    public static long implicitWaitSeconds() {
        return getInt("implicit.wait.seconds", 5);
    }

    public static long explicitWaitSeconds() {
        return getInt("explicit.wait.seconds", 15);
    }

    public static long pageLoadTimeoutSeconds() {
        return getInt("pageload.timeout.seconds", 30);
    }
}
